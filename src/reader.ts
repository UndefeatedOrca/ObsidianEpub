import ePub, { Book, Rendition, Contents, EpubCFI } from 'epubjs';
import type { Location } from 'epubjs/types/rendition';
import type Section from 'epubjs/types/section';
import { Annotation, COLORS, ReadingMode, Typography, TYPOGRAPHY, FONTS } from './model';
import { isNoteReference, resolveNote, NoteContent } from './footnotes';

// Sandboxed EPUB frames cannot execute scripts. CSP also prevents remote tracking
// resources and document forms; local archive resources are rewritten to blob URLs.
export function secureDocument(doc: Document): void {
  doc.querySelectorAll('script,object,embed,iframe,form,base,meta[http-equiv]').forEach(e => e.remove());
  doc.querySelectorAll('*').forEach(e => {
    for (const attr of Array.from(e.attributes)) {
      if (/^on/i.test(attr.name) || /^(?:javascript|vbscript):/i.test(attr.value.trim()) ||
          (/^(?:src|srcset|poster|data|xlink:href)$/i.test(attr.name) && /(?:https?:|\/\/)/i.test(attr.value))) e.removeAttribute(attr.name);
    }
  });
  const csp = doc.createElementNS('http://www.w3.org/1999/xhtml', 'meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  csp.setAttribute('content', "default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob:; font-src blob: data:; media-src blob: data:; script-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'");
  doc.querySelector('head')?.prepend(csp);
}
export interface ReaderCallbacks {
  selected(cfi: string, text: string): void;
  relocated(cfi: string, label: string): void;
  keydown(event: KeyboardEvent): void;
  annotation?(annotation: Annotation, x: number, y: number, pinned: boolean): void;
  dismissAnnotation?(force: boolean): void;
  footnote?(note: NoteContent, x: number, y: number, pinned: boolean, reference: Element): void;
}
export class Reader {
  book: Book;
  rendition?: Rendition;
  private destroyed = false;
  private host?: HTMLElement;
  private marks = new Map<string, Annotation>();
  private callbacks?: ReaderCallbacks;
  private styleQueue: Promise<void> = Promise.resolve();
  private interaction = 0;
  private cleanup = new AbortController();
  private hoverTimer?: ReturnType<typeof setTimeout>;
  private mode: ReadingMode = 'paginated';
  private typography: Typography = { ...TYPOGRAPHY };
  private noteRequest = 0;
  private readonly opening: Promise<unknown>;
  constructor(bytes: ArrayBuffer) {
    this.book = ePub({ replacements: 'blobUrl' });
    this.book.spine.hooks.content.register((doc: Document) => secureDocument(doc));
    // Calling open explicitly preserves rejection for malformed archives. The
    // library's constructor only emits an event and leaves opened pending.
    this.opening = this.book.open(bytes, 'binary');
    this.opening.catch(() => {});
  }
  async mount(host: HTMLElement, callbacks: ReaderCallbacks, position?: string, mode: ReadingMode = 'paginated', appearance: { theme: string; fontSize: number } & Partial<Typography> = { theme: 'sepia', fontSize: 110 }): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([this.opening, this.book.opened, this.book.ready]),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('EPUB loading timed out. The archive may be incomplete or unsupported.')), 30000); })
      ]);
    } finally { clearTimeout(timer); }
    if (this.destroyed) return;
    this.host = host; this.callbacks = callbacks; this.mode = mode;
    const interrupted = () => { this.interaction++; this.noteRequest++; clearTimeout(this.hoverTimer); callbacks.dismissAnnotation?.(true); };
    for (const name of ['wheel', 'touchstart', 'pointerdown']) host.addEventListener(name, interrupted, { capture: true, passive: true, signal: this.cleanup.signal });
    host.addEventListener('scroll', () => { this.noteRequest++; clearTimeout(this.hoverTimer); callbacks.dismissAnnotation?.(true); }, { capture: true, signal: this.cleanup.signal });
    this.rendition = this.book.renderTo(host, { width: '100%', height: '100%', spread: 'none', allowScriptedContent: false,
      flow: 'scrolled-doc', manager: mode === 'scrolled' ? 'continuous' : 'default', overflow: mode === 'scrolled' ? 'auto' : 'hidden' });
    this.style(appearance.theme, appearance.fontSize, { ...TYPOGRAPHY, ...appearance });
    this.rendition.on('selected', (cfi: string, contents: Contents) => {
      const text = contents.window.getSelection()?.toString().trim();
      if (text) callbacks.selected(cfi, text);
    });
    this.rendition.on('relocated', (location: Location) => {
      const part = location.start;
      callbacks.relocated(part.cfi, mode === 'scrolled' ? `Chapter ${part.index + 1} · scroll to read` : `Chapter ${part.index + 1} · page ${part.displayed.page} of ${part.displayed.total}`);
    });
    this.rendition.on('keydown', callbacks.keydown);
    this.rendition.on('displayed', interrupted);
    this.rendition.hooks.content.register((contents: Contents) => {
      contents.document.documentElement.style.setProperty('overflow-anchor', 'none');
      this.applyTypography(contents);
      const showNote = async (anchor: Element, pinned: boolean) => {
        const request = ++this.noteRequest;
        const note = await resolveNote(this.book, contents, anchor);
        if (this.destroyed || request !== this.noteRequest || !anchor.isConnected || (!pinned && !anchor.matches(':hover'))) return;
        const frame = contents.window.frameElement?.getBoundingClientRect(), rect = anchor.getBoundingClientRect();
        if (frame) callbacks.footnote?.(note, frame.left + rect.left, frame.top + rect.bottom, pinned, anchor);
      };
      for (const name of ['wheel', 'touchstart', 'pointerdown', 'keydown']) contents.document.addEventListener(name, interrupted, { capture: true, passive: true });
      const hit = (e: MouseEvent, pinned: boolean) => {
        clearTimeout(this.hoverTimer);
        const anchor = (e.target as Element)?.closest?.('a[href]');
        if (anchor && isNoteReference(anchor)) {
          if (!pinned) this.hoverTimer = setTimeout(() => { void showNote(anchor, false); }, 180);
          return;
        }
        if (contents.window.getSelection()?.toString()) return;
        const frame = contents.window.frameElement?.getBoundingClientRect();
        if (!frame) return;
        for (const a of this.marks.values()) {
          try {
            if (a.kind !== 'highlight' || new EpubCFI(a.cfi).spinePos !== contents.sectionIndex) continue;
            const range = contents.range(a.cfi);
            if (!Array.from(range.getClientRects()).some(r => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)) continue;
            const show = () => { if (!this.destroyed) this.callbacks?.annotation?.(a, frame.left + e.clientX, frame.top + e.clientY, pinned); };
            if (pinned) show(); else this.hoverTimer = setTimeout(show, 180);
            return;
          } catch { /* A stale CFI must not prevent reading other highlights. */ }
        }
        callbacks.dismissAnnotation?.(pinned);
      };
      contents.document.addEventListener('mousemove', e => hit(e, false));
      contents.document.addEventListener('mouseleave', () => { clearTimeout(this.hoverTimer); callbacks.dismissAnnotation?.(false); });
      contents.document.addEventListener('click', e => hit(e, true));
      contents.document.addEventListener('click', e => {
        const anchor = (e.target as Element)?.closest?.('a');
        if (anchor && isNoteReference(anchor)) {
          e.preventDefault(); e.stopImmediatePropagation(); clearTimeout(this.hoverTimer);
          void showNote(anchor, true); return;
        }
        if (anchor && /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test((anchor.getAttribute('href') ?? '').trim())) {
          e.preventDefault(); e.stopImmediatePropagation();
          return;
        }
        if (anchor?.hasAttribute('href')) {
          // The sandbox removes publisher base elements. Resolve links against
          // the archive chapter, never the host window's URL.
          try {
            const base = new URL(this.book.spine.get(contents.sectionIndex).url, 'https://ebook.invalid/');
            const target = new URL(anchor.getAttribute('href')!, base);
            let section: Section | undefined;
            this.book.spine.each((item: Section) => { if (new URL(item.url, base).pathname === target.pathname) section = item; });
            if (section) {
              e.preventDefault(); e.stopImmediatePropagation();
              void this.rendition?.display(section.href + decodeURIComponent(target.hash)).catch(error => console.warn('Could not open ebook link', error));
            }
          } catch { e.preventDefault(); }
        }
      }, true);
    });
    try { await this.rendition.display(position); }
    catch (error) {
      if (!position) throw error;
      await this.rendition.display();
      // Report the fallback while allowing the caller to finish setting up UI.
      callbacks.relocated(this.rendition.location.start.cfi, 'Saved passage unavailable — opened at the beginning');
    }
  }
  private applyTypography(contents: Contents): void {
    const doc = contents.document, t = this.typography;
    let style = doc.getElementById('ebook-plus-typography');
    if (!style) { style = doc.createElement('style'); style.id = 'ebook-plus-typography'; doc.head.appendChild(style); }
    const font = FONTS[t.fontFamily];
    style.textContent = `body, body p, body li { line-height: ${t.lineHeight} !important; }
      ${font ? `body, body p, body li, body div, body span { font-family: ${font} !important; }` : ''}
      ${t.paragraphSpacing >= 0 ? `body p { margin-top: 0 !important; margin-bottom: ${t.paragraphSpacing}em !important; }` : ''}
      ${t.pageMargin >= 0 ? `body { padding-left: ${t.pageMargin}px !important; padding-right: ${t.pageMargin}px !important; }` : ''}
      ${t.textWidth > 0 ? `body { box-sizing: border-box !important; width: 100% !important; max-width: ${t.textWidth}px !important; margin-left: auto !important; margin-right: auto !important; }` : ''}`;
  }
  style(theme: string, fontSize: number, typography: Typography = this.typography): void {
    this.typography = { ...typography };
    const palettes: Record<string, [string, string]> = { light: ['#ffffff', '#242424'], dark: ['#202124', '#ece7de'], sepia: ['#f6f0e3', '#3f3529'] };
    const [background, color] = palettes[theme] ?? palettes.sepia;
    this.rendition?.themes.default({ body: { background: `${background} !important`, color: `${color} !important` }, a: { color: 'inherit !important' } });
    this.rendition?.themes.fontSize(`${fontSize}%`);
    for (const contents of this.rendition?.getContents() as unknown as Contents[] ?? []) this.applyTypography(contents);
  }
  highlight(a: Annotation, clicked: () => void): void {
    this.marks.set(a.id, a);
    if (a.kind === 'highlight') this.rendition?.annotations.highlight(a.cfi, { id: a.id }, clicked, 'ebook-highlight', { fill: COLORS[a.color], 'fill-opacity': '0.35', 'mix-blend-mode': 'multiply' });
  }
  remove(a: Annotation): void { this.marks.delete(a.id); if (a.kind === 'highlight') this.rendition?.annotations.remove(a.cfi, 'highlight'); }
  private get scroller(): HTMLElement | undefined { return this.host?.querySelector<HTMLElement>('.epub-container') ?? undefined; }
  cancelNotePreview(): void { this.noteRequest++; }
  async next(): Promise<void> { await this.step(1); }
  async prev(): Promise<void> { await this.step(-1); }
  private async step(direction: number): Promise<void> {
    this.interaction++;
    const el = this.scroller;
    if (!el || !this.rendition) return;
    const before = el.scrollTop;
    el.scrollTop += direction * el.clientHeight;
    if (Math.abs(el.scrollTop - before) < 1) {
      const previous = this.currentCfi();
      await (direction > 0 ? this.rendition.next() : this.rendition.prev());
      if (this.mode === 'paginated' && direction < 0 && previous !== this.currentCfi()) el.scrollTop = el.scrollHeight - el.clientHeight;
    }
    this.rendition.reportLocation();
  }
  resize(width: number, height: number): void {
    this.interaction++;
    // epub.js accepts a third argument at runtime; its declaration omits it.
    const resize = this.rendition?.resize.bind(this.rendition) as ((w: number, h: number, cfi?: string) => void) | undefined;
    resize?.(width, height, this.currentCfi());
  }
  private topAnchor(): { range: Range; offset: number; frame: Element } | undefined {
    const top = this.scroller?.getBoundingClientRect().top;
    if (top === undefined) return;
    for (const contents of this.rendition?.getContents() as unknown as Contents[] ?? []) {
      const frame = contents.window.frameElement;
      if (!frame) continue;
      const frameTop = frame.getBoundingClientRect().top;
      const walker = contents.document.createTreeWalker(contents.document.body, 4);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = contents.document.createRange(); range.selectNodeContents(node);
        if (!Array.from(range.getClientRects()).some(r => r.bottom + frameTop > top && r.top + frameTop < top + 100)) continue;
        // Find the first visible character, retaining its pixel offset from the viewport.
        let lo = 0, hi = node.textContent.length - 1;
        while (lo < hi) {
          const mid = Math.floor((lo + hi) / 2); range.setStart(node, mid); range.setEnd(node, mid + 1);
          if (range.getBoundingClientRect().bottom + frameTop <= top) lo = mid + 1; else hi = mid;
        }
        range.setStart(node, lo); range.setEnd(node, lo + 1);
        return { range, frame, offset: range.getBoundingClientRect().top + frameTop - top };
      }
    }
  }
  restyle(theme: string, fontSize: number, typography: Typography = this.typography): Promise<void> {
    typography = { ...typography };
    this.styleQueue = this.styleQueue.catch(() => {}).then(async () => {
      if (this.destroyed) return;
      const anchor = this.topAnchor();
      const interaction = this.interaction;
      this.style(theme, fontSize, typography);
      // Let iframe measurement and the renderer's layout queue settle before a
      // single correction. Never repeatedly fight the user's scroll position.
      await new Promise(resolve => setTimeout(resolve, 120));
      if (!this.destroyed && interaction === this.interaction && anchor && this.scroller && anchor.frame.isConnected) {
        this.scroller.scrollTop += anchor.range.getBoundingClientRect().top + anchor.frame.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top - anchor.offset;
        this.rendition?.reportLocation();
      }
    });
    return this.styleQueue;
  }
  currentCfi(): string | undefined {
    // Read the viewport directly: relocated is debounced during scrolling.
    // epub.js's declaration incorrectly describes this as DisplayedLocation.
    const location = this.rendition?.currentLocation() as unknown as Location | undefined;
    return location?.start?.cfi;
  }
  async search(query: string, cancelled: () => boolean): Promise<{ cfi: string; excerpt: string }[]> {
    const results: { cfi: string; excerpt: string }[] = [];
    const sections: Section[] = [];
    this.book.spine.each((section: Section) => sections.push(section));
    for (const section of sections) {
      if (cancelled() || this.destroyed) break;
      // Keep loaded sections alive: a displayed chapter may be using the same DOM.
      await section.load(this.book.load.bind(this.book));
      // epub.js 0.3's declaration says Element[], but find() returns these records.
      results.push(...section.find(query) as unknown as { cfi: string; excerpt: string }[]);
      if (results.length >= 200) break;
    }
    return results.slice(0, 200);
  }
  destroy(): void { this.destroyed = true; clearTimeout(this.hoverTimer); this.cleanup.abort(); this.marks.clear(); this.book.destroy(); }
}
