import { FileView, MarkdownView, Modal, Notice, Platform, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import { Annotation, BookRecord, COLORS, Color, CONVERTIBLE, Data, DEFAULTS, hydrate, isCfi, passageUrl, passageLink, parsePassage, PassageTarget, ReadingMode, quoteMarkdown, safeFolder } from './model';
import { Reader } from './reader';
import { highlightBacklinks } from './backlinks';

const VIEW = 'ebook-plus-reader';
function fail(error: unknown): void { console.error('Ebook Plus:', error); new Notice(error instanceof Error ? error.message : String(error), 8000); }
function action(parent: HTMLElement, label: string, run: () => unknown): HTMLButtonElement {
  const b = parent.createEl('button', { text: label, attr: { 'aria-label': label } });
  b.addEventListener('click', () => { Promise.resolve().then(run).catch(fail); });
  return b;
}
class TextDialog extends Modal {
  constructor(app: App, private titleText: string, private value: string, private submit: (text: string) => Promise<void>) { super(app); }
  onOpen(): void {
    this.titleEl.setText(this.titleText);
    const input = this.contentEl.createEl('textarea', { cls: 'ebook-comment', attr: { 'aria-label': this.titleText } });
    input.value = this.value;
    action(this.contentEl, 'Save', async () => { await this.submit(input.value.trim()); this.close(); });
    input.focus();
  }
  onClose(): void { this.contentEl.empty(); }
}

export default class EbookPlus extends Plugin {
  data!: Data;
  private writes: Promise<void> = Promise.resolve();
  async onload(): Promise<void> {
    this.data = hydrate(await this.loadData());
    this.registerView(VIEW, leaf => new EbookView(leaf, this));
    this.registerExtensions(['epub'], VIEW);
    this.addSettingTab(new EbookSettings(this.app, this));
    this.registerObsidianProtocolHandler('ebook-plus', params => {
      if (params.vault && params.vault !== this.app.vault.getName()) return;
      void this.openPassage({ book: params.book, file: params.file, cfi: params.cfi, annotation: params.annotation }).catch(fail);
    });
    // Handle note clicks locally, including legacy protocol links, without an
    // operating-system protocol round trip. Native link opening is also handled
    // by FileView.setEphemeralState (keyboard navigation and other plugins).
    this.registerDomEvent(document, 'click', event => {
      const el = event.target as Element;
      const anchor = el.closest?.('a[data-href], a[href]');
      const href = anchor?.getAttribute('data-href') ?? anchor?.getAttribute('href');
      if (!href) return;
      try {
        let target: PassageTarget | undefined;
        if (href.startsWith('obsidian://ebook-plus?')) {
          const params = new URL(href).searchParams;
          if (params.get('vault') && params.get('vault') !== this.app.vault.getName()) return;
          target = { book: params.get('book') ?? undefined, file: params.get('file') ?? undefined, cfi: params.get('cfi') ?? undefined };
        } else {
          const hash = href.indexOf('#');
          if (hash < 0 || !href.slice(hash).startsWith('#ebook=')) return;
          target = parsePassage(href.slice(hash));
          if (target) target.file = decodeURIComponent(href.slice(0, hash));
        }
        if (!target) return;
        event.preventDefault(); event.stopImmediatePropagation();
        void this.openPassage(target, event.ctrlKey || event.metaKey).catch(fail);
      } catch (error) { event.preventDefault(); fail(error); }
    }, true);
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      let changed = false;
      for (const book of Object.values(this.data.books)) {
        if (book.path === oldPath || book.path.startsWith(oldPath + '/')) {
          book.path = file.path + book.path.slice(oldPath.length); changed = true;
        }
      }
      if (changed) void this.persist().catch(fail);
    }));
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && CONVERTIBLE.includes(file.extension.toLowerCase()) && Platform.isDesktopApp) {
        menu.addItem(item => item.setTitle('Convert to EPUB with Calibre').setIcon('book-open').onClick(() => { void this.convert(file).catch(fail); }));
      }
    }));
    const commands: [string, string, (v: EbookView) => unknown][] = [
      ['highlight', 'Highlight selected ebook text', v => v.annotate()],
      ['copy-quote', 'Copy selected ebook quote', v => v.copyQuote()],
      ['copy-link', 'Copy ebook passage link', v => v.copyLink()],
      ['bookmark', 'Bookmark current ebook location', v => v.bookmark()],
      ['export', 'Export ebook annotations to a note', v => v.exportNotes()],
      ['next', 'Next ebook page', v => v.reader?.next()],
      ['previous', 'Previous ebook page', v => v.reader?.prev()]
    ];
    for (const [id, name, run] of commands) this.addCommand({ id, name, checkCallback: checking => {
      const view = this.app.workspace.getActiveViewOfType(EbookView);
      if (!view?.reader?.rendition) return false;
      if (!checking) Promise.resolve().then(() => run(view)).catch(fail);
      return true;
    } });
    this.registerMarkdownCodeBlockProcessor('ebook', (source, el) => {
      try {
        const ref = JSON.parse(source);
        const book = this.data.books[ref.book];
        const a = book?.annotations.find(a => a.id === ref.annotation);
        if (!book || !a) throw new Error('Annotation not found. It may have been deleted or plugin data has not synced.');
        const quote = el.createEl('blockquote', { cls: 'ebook-embed' });
        quote.createEl('p', { text: a.text || 'Bookmark' });
        if (a.comment) quote.createEl('p', { text: a.comment, cls: 'ebook-muted' });
        const link = quote.createEl('a', { text: `Open passage · ${book.path}`, href: passageUrl(this.app.vault.getName(), book, a.cfi) });
        link.onclick = event => { event.preventDefault(); void this.openPassage({ book: book.id, annotation: a.id, cfi: a.cfi }).catch(fail); };
      } catch (e) { el.createEl('p', { text: `Ebook Plus: ${e instanceof Error ? e.message : e}` }); }
    });
  }
  async openPassage(target: PassageTarget, newTab = false): Promise<void> {
    if (target.cfi && !isCfi(target.cfi)) throw new Error('Invalid EPUB passage link.');
    const record = target.book ? this.data.books[target.book] : undefined;
    const path = record?.path ?? target.file ?? '';
    const file = this.app.vault.getAbstractFileByPath(path) ?? this.app.metadataCache.getFirstLinkpathDest(path, '');
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'epub') throw new Error('Linked EPUB not found in this vault.');
    const existing = !newTab && this.app.workspace.getLeavesOfType(VIEW).find(leaf => leaf.view instanceof EbookView && leaf.view.file?.path === file.path);
    const leaf = existing || this.app.workspace.getLeaf('tab');
    if (!existing) {
      await leaf.openFile(file);
      await leaf.loadIfDeferred?.();
      if (!(leaf.view instanceof EbookView)) await leaf.setViewState({ type: VIEW, state: { file: file.path }, active: true });
    }
    if (!(leaf.view instanceof EbookView)) throw new Error('Could not open the Ebook Plus reader.');
    await this.app.workspace.revealLeaf(leaf);
    await leaf.view.openTarget(target);
  }
  persist(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.data));
    const next = this.writes.catch(() => {}).then(() => this.saveData(snapshot));
    this.writes = next;
    return next;
  }
  record(file: TFile): BookRecord {
    let record = Object.values(this.data.books).find(b => b.path === file.path);
    if (!record) { record = { id: crypto.randomUUID(), path: file.path, annotations: [] }; this.data.books[record.id] = record; }
    return record;
  }
  refresh(book: BookRecord): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) {
      const view = leaf.view;
      if (view instanceof EbookView && view.record?.id === book.id) view.syncAnnotations();
    }
  }
  async createNote(name: string, body: string): Promise<TFile> {
    const folder = safeFolder(this.data.settings.notesFolder);
    let path = '';
    for (const part of folder.split('/').filter(Boolean)) {
      path = path ? `${path}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(path)) await this.app.vault.createFolder(path);
    }
    const base = `${folder ? folder + '/' : ''}${name.replace(/[\\/:*?"<>|#\[\]]/g, '-')}`;
    let output = `${base}.md`, i = 2;
    while (this.app.vault.getAbstractFileByPath(output)) output = `${base} ${i++}.md`;
    return this.app.vault.create(normalizePath(output), body);
  }
  async convert(file: TFile): Promise<void> {
    if (!Platform.isDesktopApp) throw new Error('Calibre conversion is available on desktop only.');
    const input = this.app.vault.adapter;
    if (!('getFullPath' in input)) throw new Error('Conversion requires a local vault.');
    const { convertBook } = await import('./convert');
    new Notice(`Converting ${file.name}…`);
    const bytes = await convertBook((input as { getFullPath(path: string): string }).getFullPath(file.path), file.extension, this.data.settings.calibre);
    const base = file.path.replace(/\.[^.]+$/, '');
    let output = `${base}.epub`, i = 2;
    while (this.app.vault.getAbstractFileByPath(output)) output = `${base} ${i++}.epub`;
    const converted = await this.app.vault.createBinary(output, bytes);
    await this.app.workspace.getLeaf('tab').openFile(converted);
    new Notice('Conversion complete. The original ebook was preserved.');
  }
}

export class EbookView extends FileView {
  reader?: Reader;
  record?: BookRecord;
  private generation = 0;
  private searchGeneration = 0;
  private selected?: { cfi: string; text: string };
  private position?: string;
  private color: Color = 'yellow';
  private status!: HTMLElement;
  private panel!: HTMLElement;
  private selectionLabel!: HTMLElement;
  private drawn: Annotation[] = [];
  private resize?: ResizeObserver;
  private saveTimer?: number;
  private panelMode: 'chapters' | 'annotations' | 'search' = 'chapters';
  private loading: Promise<void> = Promise.resolve();
  private ready = false;
  private pendingTarget?: PassageTarget;
  private bubble?: HTMLElement;
  private bubbleId?: string;
  private bubblePinned = false;
  private bubbleTimer?: ReturnType<typeof setTimeout>;
  constructor(leaf: WorkspaceLeaf, readonly plugin: EbookPlus) {
    super(leaf);
    this.registerDomEvent(this.contentEl, 'keydown', event => this.keydown(event));
    this.registerDomEvent(this.contentEl.ownerDocument, 'keydown', event => { if (event.key === 'Escape') this.closeBubble(); });
    this.registerDomEvent(this.contentEl.ownerDocument, 'pointerdown', event => {
      if (this.bubble && !this.bubble.contains(event.target as Node)) this.closeBubble();
    });
    this.registerDomEvent(this.contentEl, 'scroll', event => {
      if (!(event.target as Element).closest?.('.ebook-panel')) this.closeBubble();
    }, true);
  }
  getViewType(): string { return VIEW; }
  getDisplayText(): string { return this.file?.basename ?? 'Ebook Plus'; }
  getIcon(): string { return 'book-open'; }
  async onLoadFile(file: TFile): Promise<void> {
    this.loading = this.loadBook(file);
    await this.loading;
  }
  setEphemeralState(state: unknown): void {
    super.setEphemeralState(state);
    const subpath = (state as { subpath?: string } | undefined)?.subpath;
    if (!subpath) return;
    try {
      const target = parsePassage(subpath);
      if (target) {
        if (this.ready) void this.openTarget(target).catch(fail);
        else this.pendingTarget = target;
      }
    } catch (error) { fail(error); }
  }
  private async loadBook(file: TFile): Promise<void> {
    await this.release();
    const generation = ++this.generation;
    this.record = this.plugin.record(file);
    this.position = this.record.position;
    this.panelMode = 'chapters';
    this.contentEl.empty(); this.contentEl.addClass('ebook-plus');
    const bar = this.contentEl.createDiv('ebook-toolbar');
    const mode = this.plugin.data.settings.readingMode;
    const modeSelect = bar.createEl('select', { attr: { 'aria-label': 'Reading mode' } });
    modeSelect.createEl('option', { value: 'paginated', text: 'Pages' });
    modeSelect.createEl('option', { value: 'scrolled', text: 'Scroll' });
    modeSelect.value = mode;
    modeSelect.onchange = () => { modeSelect.disabled = true; void this.changeMode(modeSelect.value as ReadingMode).catch(fail); };
    action(bar, mode === 'paginated' ? '← Previous page' : '↑ Back', () => this.reader?.prev());
    action(bar, mode === 'paginated' ? 'Next page →' : 'Forward ↓', () => this.reader?.next());
    action(bar, 'Chapters', () => { this.panelMode = 'chapters'; this.chapters(); });
    action(bar, 'Annotations', () => { this.panelMode = 'annotations'; this.annotations(); });
    action(bar, 'Search', () => this.searchPanel());
    action(bar, 'Bookmark', () => this.bookmark());
    action(bar, 'Export', () => this.exportNotes());
    const theme = bar.createEl('select', { attr: { 'aria-label': 'Reader theme' } });
    for (const name of ['light', 'sepia', 'dark']) theme.createEl('option', { value: name, text: name });
    theme.value = this.plugin.data.settings.theme;
    theme.onchange = () => { this.plugin.data.settings.theme = theme.value as typeof this.plugin.data.settings.theme; void this.applyStyle().then(() => this.plugin.persist()).catch(fail); };
    action(bar, 'A−', () => this.font(-10)); action(bar, 'A+', () => this.font(10));
    const selection = this.contentEl.createDiv('ebook-selection');
    this.selectionLabel = selection.createSpan({ text: 'Select text in the book to highlight or quote it.' });
    const colors = selection.createEl('select', { attr: { 'aria-label': 'Highlight color' } });
    for (const key of Object.keys(COLORS)) colors.createEl('option', { text: key, value: key });
    colors.value = this.color;
    colors.onchange = () => { this.color = colors.value as Color; };
    action(selection, 'Highlight', () => this.annotate());
    action(selection, 'Comment', () => this.annotate(true));
    action(selection, 'Copy quote', () => this.copyQuote());
    action(selection, 'Copy link', () => this.copyLink());
    action(selection, 'Insert in note', () => this.insertQuote());
    const body = this.contentEl.createDiv('ebook-body');
    this.panel = body.createDiv('ebook-panel');
    this.panel.setAttribute('aria-label', 'Book navigation');
    const host = body.createDiv('ebook-pages');
    host.setAttribute('tabindex', '0');
    host.setAttribute('aria-label', mode === 'scrolled' ? 'Book text. Scroll to read.' : 'Book text. Use Previous page, Next page, or arrow keys.');
    this.contentEl.createDiv({ cls: 'ebook-help', text: mode === 'scrolled' ? 'Scroll with your wheel, trackpad, or touch. Chapters load as you read.' : 'Use Previous page / Next page, ← / →, or Page Up / Page Down to read.' });
    this.status = this.contentEl.createDiv({ cls: 'ebook-status', text: 'Opening EPUB…' });
    this.status.setAttribute('role', 'status');
    try {
      const bytes = await this.app.vault.readBinary(file);
      if (generation !== this.generation) return;
      const reader = this.reader = new Reader(bytes);
      await reader.mount(host, {
        selected: (cfi, text) => { this.selected = { cfi, text }; this.selectionLabel.setText(`${text.slice(0, 90)}${text.length > 90 ? '…' : ''}`); },
        relocated: (cfi, label) => {
          if (generation !== this.generation || !this.record) return;
          if (this.position !== cfi) { this.selected = undefined; this.selectionLabel.setText('Select text in the book to highlight or quote it.'); }
          this.position = cfi; this.record.position = cfi; this.status.setText(label);
          window.clearTimeout(this.saveTimer);
          this.saveTimer = window.setTimeout(() => { void this.plugin.persist().catch(fail); }, 600);
        },
        keydown: event => this.keydown(event),
        annotation: (a, x, y, pinned) => this.showAnnotation(a, x, y, pinned),
        dismissAnnotation: force => this.dismissBubble(force)
      }, this.position, mode, this.plugin.data.settings);
      if (generation !== this.generation) return;
      this.contentEl.dataset.theme = this.plugin.data.settings.theme;
      this.syncAnnotations(); this.chapters();
      this.ready = true;
      if (this.pendingTarget) {
        const target = this.pendingTarget; this.pendingTarget = undefined;
        await this.revealTarget(target);
      }
      let width = host.clientWidth, height = host.clientHeight;
      this.resize = new ResizeObserver(() => {
        if (host.clientWidth && host.clientHeight && (width !== host.clientWidth || height !== host.clientHeight)) {
          width = host.clientWidth; height = host.clientHeight;
          reader.resize(width, height);
        }
      });
      this.resize.observe(host);
    } catch (e) { if (generation === this.generation) { this.status.setText(`Could not fully open EPUB: ${e instanceof Error ? e.message : e}`); fail(e); } }
  }
  private async changeMode(mode: ReadingMode): Promise<void> {
    this.plugin.data.settings.readingMode = mode;
    await this.plugin.persist();
    if (this.file) await this.onLoadFile(this.file);
  }
  private async applyStyle(): Promise<void> { await this.reader?.restyle(this.plugin.data.settings.theme, this.plugin.data.settings.fontSize); this.contentEl.dataset.theme = this.plugin.data.settings.theme; }
  private async font(delta: number): Promise<void> { const s = this.plugin.data.settings; s.fontSize = Math.max(70, Math.min(200, s.fontSize + delta)); await this.applyStyle(); await this.plugin.persist(); }
  private keydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
    const vim = this.plugin.data.settings.vim;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (vim && ['j', 'l'].includes(e.key))) { e.preventDefault(); void this.reader?.next().catch(fail); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (vim && ['k', 'h'].includes(e.key))) { e.preventDefault(); void this.reader?.prev().catch(fail); }
    if (vim && e.key === 'y') { e.preventDefault(); void this.copyQuote().catch(fail); }
  }
  async go(cfi: string): Promise<void> {
    await this.loading;
    if (!this.reader?.rendition || !this.ready) throw new Error('The ebook is not ready. Try reopening it.');
    await this.reader.rendition.display(cfi);
  }
  async openTarget(target: PassageTarget): Promise<void> { await this.loading; await this.revealTarget(target); }
  private async revealTarget(target: PassageTarget): Promise<void> {
    const annotation = this.record?.annotations.find(a => a.id === target.annotation);
    const cfi = annotation?.cfi ?? target.cfi;
    if (!cfi) throw new Error('This saved annotation no longer exists and the link has no fallback location.');
    if (!this.reader?.rendition || !this.ready) throw new Error('The ebook is not ready. Try reopening it.');
    await this.reader.rendition.display(cfi);
    if (annotation) this.focusAnnotation(annotation);
  }
  private draft(): Annotation {
    if (!this.selected) throw new Error('Select a passage in the ebook first.');
    return { id: crypto.randomUUID(), ...this.selected, color: this.color, comment: '', kind: 'highlight', created: new Date().toISOString(), location: this.status.textContent ?? undefined };
  }
  async annotate(comment = false): Promise<void> {
    const draft = this.draft();
    const record = this.record!;
    const save = async (text: string) => {
      const existing = record.annotations.find(a => a.cfi === draft.cfi && a.kind === 'highlight');
      if (existing) { existing.color = draft.color; if (comment) existing.comment = text; }
      else record.annotations.push({ ...draft, comment: text });
      await this.plugin.persist(); this.plugin.refresh(record);
    };
    if (comment) new TextDialog(this.app, 'Passage comment', record.annotations.find(a => a.cfi === draft.cfi)?.comment ?? '', save).open();
    else await save('');
  }
  async bookmark(): Promise<void> {
    if (!this.position || !this.record) throw new Error('Wait for the book to open.');
    if (this.record.annotations.some(a => a.kind === 'bookmark' && a.cfi === this.position)) { new Notice('This location is already bookmarked.'); return; }
    this.record.annotations.push({ id: crypto.randomUUID(), cfi: this.position, text: this.status.textContent ?? 'Bookmark', comment: '', color: this.color, kind: 'bookmark', created: new Date().toISOString() });
    await this.plugin.persist(); this.plugin.refresh(this.record); new Notice('Bookmark saved.');
  }
  private markdown(a: Annotation): string { return quoteMarkdown(this.app.vault.getName(), this.record!, a, this.plugin.data.settings.callouts, this.plugin.data.settings); }
  private async saveSelection(): Promise<Annotation> {
    const draft = this.draft();
    const record = this.record!;
    let annotation = record.annotations.find(a => a.kind === 'highlight' && a.cfi === draft.cfi);
    if (!annotation) { annotation = draft; record.annotations.push(annotation); }
    // An existing annotation keeps its color, comment and identity when copied.
    await this.plugin.persist(); this.plugin.refresh(record);
    return annotation;
  }
  async copyQuote(a?: Annotation): Promise<void> { await navigator.clipboard.writeText(this.markdown(a ?? await this.saveSelection())); new Notice('Quote and saved passage link copied.'); }
  async copyLink(): Promise<void> {
    const cfi = this.selected?.cfi ?? this.position;
    if (!cfi || !this.record) throw new Error('Wait for the book to open.');
    if (this.selected) await navigator.clipboard.writeText(passageLink(this.record, await this.saveSelection()));
    else await navigator.clipboard.writeText(`[Open passage](${passageUrl(this.app.vault.getName(), this.record, cfi)})`);
    new Notice('Passage link copied.');
  }
  private async insertQuote(): Promise<void> {
    const markdown = this.markdown(await this.saveSelection());
    const notes = this.app.workspace.getLeavesOfType('markdown').filter(l => l.view instanceof MarkdownView);
    if (!notes.length) throw new Error('Open a Markdown note in another pane first.');
    // Let the user choose the destination instead of guessing among open notes.
    const modal = new Modal(this.app); modal.titleEl.setText('Insert quote into an open note');
    for (const leaf of notes) { const view = leaf.view as MarkdownView; action(modal.contentEl, view.file?.path ?? 'Untitled', () => { view.editor.replaceSelection(markdown + '\n'); modal.close(); }); }
    modal.open();
  }
  syncAnnotations(): void {
    this.closeBubble();
    for (const a of this.drawn) this.reader?.remove(a);
    this.drawn = this.record?.annotations.map(a => ({ ...a })) ?? [];
    for (const a of this.drawn) {
      try { this.reader?.highlight(a, () => {}); } catch (e) { console.warn('Unresolved ebook annotation', a.id, e); }
    }
    if (this.panelMode === 'annotations') this.annotations();
  }
  private closeBubble(): void { clearTimeout(this.bubbleTimer); this.bubbleTimer = undefined; this.bubble?.remove(); this.bubble = undefined; this.bubbleId = undefined; this.bubblePinned = false; }
  private dismissBubble(force: boolean): void {
    if (force) { this.closeBubble(); return; }
    if (this.bubblePinned || this.bubbleTimer) return;
    this.bubbleTimer = setTimeout(() => { this.bubbleTimer = undefined; if (!this.bubble?.matches(':hover')) this.closeBubble(); }, 350);
  }
  private focusAnnotation(a: Annotation): void {
    this.panelMode = 'annotations'; this.annotations();
    const card = Array.from(this.panel.querySelectorAll<HTMLElement>('.ebook-card')).find(el => el.dataset.annotation === a.id);
    if (card) {
      card.addClass('ebook-card-active');
      // Scroll only the sidebar; scrollIntoView can move the entire reader pane.
      this.panel.scrollTop += card.getBoundingClientRect().top - this.panel.getBoundingClientRect().top - 12;
    }
  }
  private showAnnotation(a: Annotation, x: number, y: number, pinned: boolean): void {
    clearTimeout(this.bubbleTimer); this.bubbleTimer = undefined;
    if (this.bubbleId === a.id) { this.bubblePinned ||= pinned; return; }
    if (this.bubblePinned && !pinned) return;
    this.closeBubble(); this.bubbleId = a.id; this.bubblePinned = pinned;
    const bubble = this.bubble = this.contentEl.ownerDocument.body.createDiv('ebook-annotation-bubble');
    bubble.setAttribute('role', 'dialog'); bubble.setAttribute('aria-label', 'Ebook annotation');
    bubble.style.borderColor = COLORS[a.color];
    bubble.createEl('strong', { text: `${a.color} highlight` });
    action(bubble, 'Close annotation', () => this.closeBubble()).addClass('ebook-bubble-close');
    bubble.createEl('blockquote', { text: a.text });
    bubble.createEl('p', { text: a.comment || 'No comment yet.', cls: 'ebook-bubble-comment' });
    const controls = bubble.createDiv('ebook-card-actions');
    action(controls, 'Copy link', () => navigator.clipboard.writeText(passageLink(this.record!, a)));
    action(controls, 'Copy quote', () => this.copyQuote(a));
    action(controls, 'Show in list', () => this.focusAnnotation(a));
    action(controls, 'Edit comment', () => {
      const record = this.record!; this.closeBubble();
      new TextDialog(this.app, 'Edit annotation comment', a.comment, async comment => {
        const saved = record.annotations.find(item => item.id === a.id);
        if (saved) saved.comment = comment;
        await this.plugin.persist(); this.plugin.refresh(record);
      }).open();
    });
    const backlinks = highlightBacklinks(this.app, this.record!, a);
    bubble.createEl('h4', { text: `Linked mentions (${backlinks.length})` });
    if (!backlinks.length) bubble.createEl('p', { text: 'Paste a copied highlight link or callout into a note to see it here.', cls: 'ebook-muted' });
    for (const hit of backlinks) action(bubble, `${hit.file.path} · line ${hit.line + 1}`, async () => {
      this.closeBubble();
      await this.app.workspace.getLeaf('tab').openFile(hit.file, { eState: { line: hit.line } });
    }).addClass('ebook-backlink');
    const win = this.contentEl.ownerDocument.defaultView!;
    bubble.style.left = `${Math.max(8, Math.min(x, win.innerWidth - bubble.offsetWidth - 8))}px`;
    bubble.style.top = `${Math.max(8, Math.min(y + 16, win.innerHeight - bubble.offsetHeight - 8))}px`;
    bubble.addEventListener('mouseleave', () => { if (!this.bubblePinned) this.closeBubble(); });
    bubble.addEventListener('mouseenter', () => { clearTimeout(this.bubbleTimer); this.bubbleTimer = undefined; });
  }
  private chapters(): void {
    this.panel.empty(); this.panel.createEl('h3', { text: 'Contents' });
    const walk = (items: { label: string; href: string; subitems?: unknown[] }[], depth = 0) => {
      for (const item of items) {
        const b = action(this.panel, `${'　'.repeat(depth)}${item.label.trim()}`, () => this.reader?.rendition?.display(item.href)); b.addClass('ebook-chapter');
        if (item.subitems) walk(item.subitems as typeof items, depth + 1);
      }
    };
    walk(this.reader?.book.navigation?.toc ?? []);
    if (!this.reader?.book.navigation?.toc.length) this.panel.createEl('p', { text: 'This book has no table of contents.' });
  }
  private annotations(): void {
    this.panel.empty(); this.panel.createEl('h3', { text: 'Annotations' });
    this.panel.createEl('p', { cls: 'ebook-muted', text: 'Saved in Ebook Plus data.json, independently of your notes. Copying a quote also saves its highlight.' });
    if (!this.record?.annotations.length) this.panel.createEl('p', { text: 'Select a passage and choose Highlight or Comment. Bookmarks appear here too.' });
    for (const a of this.record?.annotations ?? []) {
      const card = this.panel.createDiv('ebook-card'); card.dataset.annotation = a.id; card.style.borderInlineStartColor = COLORS[a.color];
      action(card, `${a.kind === 'bookmark' ? '🔖 ' : ''}${a.text.slice(0, 160)}`, () => this.go(a.cfi)).addClass('ebook-excerpt');
      if (a.comment) card.createEl('p', { text: a.comment });
      const controls = card.createDiv('ebook-card-actions');
      action(controls, 'Copy', () => this.copyQuote(a));
      action(controls, 'Copy callout', async () => { await navigator.clipboard.writeText(quoteMarkdown(this.app.vault.getName(), this.record!, a, true, this.plugin.data.settings)); new Notice('Colored callout copied.'); });
      action(controls, 'Edit', () => {
        const record = this.record!;
        new TextDialog(this.app, 'Edit annotation comment', a.comment, async comment => { a.comment = comment; await this.plugin.persist(); this.plugin.refresh(record); }).open();
      });
      action(controls, 'Delete', async () => {
        const record = this.record!;
        record.annotations = record.annotations.filter(item => item.id !== a.id);
        await this.plugin.persist(); this.plugin.refresh(record);
        const notice = new Notice('', 10000);
        const content = document.createDocumentFragment(); content.append('Annotation deleted. ');
        const undo = document.createElement('button'); undo.textContent = 'Undo';
        undo.onclick = () => { record.annotations.push(a); void this.plugin.persist().then(() => this.plugin.refresh(record)).catch(fail); notice.hide(); };
        content.append(undo); notice.setMessage(content);
      });
    }
  }
  private searchPanel(): void {
    this.panelMode = 'search'; this.panel.empty();
    const input = this.panel.createEl('input', { type: 'search', placeholder: 'Search this book', attr: { 'aria-label': 'Search this book' } });
    const results = this.panel.createDiv();
    const search = async () => {
      const query = input.value.trim(); if (query.length < 2) { results.setText('Enter at least two characters.'); return; }
      const generation = ++this.searchGeneration;
      results.setText('Searching…');
      const hits = await this.reader?.search(query, () => generation !== this.searchGeneration || this.panelMode !== 'search');
      if (generation !== this.searchGeneration || this.panelMode !== 'search') return;
      results.empty(); results.createEl('p', { text: `${hits?.length ?? 0} results${hits?.length === 200 ? ' (first 200)' : ''}` });
      for (const hit of hits ?? []) action(results, hit.excerpt, () => this.go(hit.cfi)).addClass('ebook-search-result');
    };
    action(this.panel, 'Find', search);
    input.onkeydown = e => { if (e.key === 'Enter') void search().catch(fail); };
    input.focus();
  }
  async exportNotes(): Promise<void> {
    if (!this.record?.annotations.length) throw new Error('Add highlights or bookmarks before exporting.');
    const body = `# ${this.file?.basename ?? 'Ebook'} — annotations\n\n` + this.record.annotations.map(a => this.markdown(a)).join('\n');
    const note = await this.plugin.createNote(`${this.file?.basename ?? 'Ebook'} annotations`, body);
    await this.app.workspace.getLeaf('tab').openFile(note);
  }
  private async release(): Promise<void> {
    this.closeBubble();
    if (this.ready && this.record) this.record.position = this.reader?.currentCfi() ?? this.record.position;
    this.ready = false;
    ++this.generation; ++this.searchGeneration; window.clearTimeout(this.saveTimer);
    this.resize?.disconnect(); this.resize = undefined;
    this.reader?.destroy(); this.reader = undefined;
    this.selected = undefined; this.drawn = [];
    if (this.record) await this.plugin.persist();
  }
  async onUnloadFile(): Promise<void> { await this.release(); }
  async onClose(): Promise<void> { await this.release(); }
}

class EbookSettings extends PluginSettingTab {
  constructor(app: App, private plugin: EbookPlus) { super(app, plugin); }
  display(): void {
    this.containerEl.empty(); const s = this.plugin.data.settings;
    new Setting(this.containerEl).setName('Quote callouts').setDesc('Export quotes as Obsidian callouts.').addToggle(t => t.setValue(s.callouts).onChange(async value => { s.callouts = value; await this.plugin.persist(); }));
    new Setting(this.containerEl).setName('Link display template').setDesc('Placeholders: {{file.basename}}, {{location}}, {{color}}. EPUB locations use chapters, not fixed printed pages.').addText(t => t.setValue(s.displayTemplate).onChange(async value => { s.displayTemplate = value.trim() || DEFAULTS.displayTemplate; await this.plugin.persist(); }));
    new Setting(this.containerEl).setName('Quote template').setDesc('Placeholders: {{linkWithDisplay}}, {{quoteBlock}} (nested passage, including paragraph breaks), {{text}}, {{comment}}, {{commentBlock}}, {{color}}, {{calloutType}}, {{file.basename}}, {{location}}. Use [!EPUB|{{color}}] for color. Templates substitute values; they do not execute JavaScript.').addTextArea(t => t.setValue(s.quoteTemplate).onChange(async value => { s.quoteTemplate = value.trim() ? value : DEFAULTS.quoteTemplate; await this.plugin.persist(); }));
    new Setting(this.containerEl).setName('Reset copy templates').addButton(b => b.setButtonText('Restore defaults').onClick(async () => { s.quoteTemplate = DEFAULTS.quoteTemplate; s.displayTemplate = DEFAULTS.displayTemplate; await this.plugin.persist(); this.display(); }));
    new Setting(this.containerEl).setName('Vim navigation').setDesc('Inside the book: h/k previous, j/l next, y copy quote. Arrow keys always work.').addToggle(t => t.setValue(s.vim).onChange(async value => { s.vim = value; await this.plugin.persist(); }));
    new Setting(this.containerEl).setName('Annotation notes folder').addText(t => t.setValue(s.notesFolder).onChange(async value => { try { s.notesFolder = safeFolder(value); await this.plugin.persist(); } catch (e) { fail(e); } }));
    if (Platform.isDesktopApp) new Setting(this.containerEl).setName('Calibre executable').setDesc('Path to ebook-convert, or ebook-convert if available on PATH. Right-click a MOBI/AZW/AZW3/FB2 file in the vault to convert it.').addText(t => t.setValue(s.calibre).onChange(async value => { s.calibre = value.trim() || 'ebook-convert'; await this.plugin.persist(); }));
  }
}
