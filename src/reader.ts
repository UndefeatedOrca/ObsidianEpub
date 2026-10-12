import ePub, { Book, Rendition, Contents } from 'epubjs';
import type { Location } from 'epubjs/types/rendition';
import type Section from 'epubjs/types/section';
import { Annotation, COLORS } from './model';

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
}
export class Reader {
  book: Book;
  rendition?: Rendition;
  private destroyed = false;
  private readonly opening: Promise<unknown>;
  constructor(bytes: ArrayBuffer) {
    this.book = ePub({ replacements: 'blobUrl' });
    this.book.spine.hooks.content.register((doc: Document) => secureDocument(doc));
    // Calling open explicitly preserves rejection for malformed archives. The
    // library's constructor only emits an event and leaves opened pending.
    this.opening = this.book.open(bytes, 'binary');
    this.opening.catch(() => {});
  }
  async mount(host: HTMLElement, callbacks: ReaderCallbacks, position?: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([this.opening, this.book.opened, this.book.ready]),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('EPUB loading timed out. The archive may be incomplete or unsupported.')), 30000); })
      ]);
    } finally { clearTimeout(timer); }
    if (this.destroyed) return;
    this.rendition = this.book.renderTo(host, { width: '100%', height: '100%', spread: 'none', allowScriptedContent: false });
    this.rendition.on('selected', (cfi: string, contents: Contents) => {
      const text = contents.window.getSelection()?.toString().trim();
      if (text) callbacks.selected(cfi, text);
    });
    this.rendition.on('relocated', (location: Location) => {
      const part = location.start;
      callbacks.relocated(part.cfi, `Chapter ${part.index + 1} · page ${part.displayed.page} of ${part.displayed.total}`);
    });
    this.rendition.on('keydown', callbacks.keydown);
    this.rendition.hooks.content.register((contents: Contents) => {
      contents.document.addEventListener('click', e => {
        const anchor = (e.target as Element)?.closest?.('a');
        if (anchor && /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(anchor.getAttribute('href') ?? '')) {
          e.preventDefault(); e.stopImmediatePropagation();
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
  style(theme: string, fontSize: number): void {
    const palettes: Record<string, [string, string]> = { light: ['#ffffff', '#242424'], dark: ['#202124', '#ece7de'], sepia: ['#f6f0e3', '#3f3529'] };
    const [background, color] = palettes[theme] ?? palettes.sepia;
    this.rendition?.themes.default({ body: { background: `${background} !important`, color: `${color} !important`, 'line-height': '1.7 !important' }, a: { color: 'inherit !important' } });
    this.rendition?.themes.fontSize(`${fontSize}%`);
  }
  highlight(a: Annotation, clicked: () => void): void {
    if (a.kind === 'highlight') this.rendition?.annotations.highlight(a.cfi, { id: a.id }, clicked, 'ebook-highlight', { fill: COLORS[a.color], 'fill-opacity': '0.35', 'mix-blend-mode': 'multiply' });
  }
  remove(a: Annotation): void { if (a.kind === 'highlight') this.rendition?.annotations.remove(a.cfi, 'highlight'); }
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
  destroy(): void { this.destroyed = true; this.book.destroy(); }
}
