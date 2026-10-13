export const COLORS = { yellow: '#f6d365', green: '#86d9a0', blue: '#85bdf5', pink: '#f6a4ca', purple: '#baa2ef' } as const;
export type Color = keyof typeof COLORS;
export interface Annotation {
  id: string; cfi: string; text: string; comment: string; color: Color;
  kind: 'highlight' | 'bookmark'; created: string; location?: string;
}
export interface BookRecord { id: string; path: string; position?: string; annotations: Annotation[] }
export type ReadingMode = 'paginated' | 'scrolled';
export interface Settings { fontSize: number; theme: 'light' | 'dark' | 'sepia'; vim: boolean; calibre: string; notesFolder: string; callouts: boolean; readingMode: ReadingMode; quoteTemplate: string; displayTemplate: string }
export interface Data { version: 1; settings: Settings; books: Record<string, BookRecord> }
const LEGACY_QUOTE_TEMPLATE = '> [!EPUB|{{color}}] {{linkWithDisplay}}\n> {{text}}\n{{commentBlock}}';
export const DEFAULTS: Settings = { fontSize: 110, theme: 'sepia', vim: false, calibre: 'ebook-convert', notesFolder: 'Ebook notes', callouts: true, readingMode: 'paginated', quoteTemplate: '> [!EPUB|{{color}}] {{linkWithDisplay}}\n{{quoteBlock}}\n{{commentBlock}}', displayTemplate: '{{file.basename}}, {{location}}' };
export function emptyData(): Data { return { version: 1, settings: { ...DEFAULTS }, books: {} }; }
export function isCfi(value: unknown): value is string { return typeof value === 'string' && /^epubcfi\(.+\)$/.test(value) && value.length < 8192; }
export function hydrate(raw: unknown): Data {
  const result = emptyData();
  if (!raw || typeof raw !== 'object') return result;
  const data = raw as Partial<Data>;
  if (data.version !== undefined && data.version !== 1) throw new Error('Unsupported Ebook Plus data version. Update the plugin before opening it.');
  const s = data.settings;
  if (s) {
    if (Number.isFinite(s.fontSize)) result.settings.fontSize = Math.max(70, Math.min(200, s.fontSize));
    if (['light', 'dark', 'sepia'].includes(s.theme)) result.settings.theme = s.theme;
    if (typeof s.vim === 'boolean') result.settings.vim = s.vim;
    if (typeof s.callouts === 'boolean') result.settings.callouts = s.callouts;
    if (typeof s.calibre === 'string') result.settings.calibre = s.calibre;
    if (typeof s.notesFolder === 'string') result.settings.notesFolder = s.notesFolder;
    if (s.readingMode === 'paginated' || s.readingMode === 'scrolled') result.settings.readingMode = s.readingMode;
    if (typeof s.quoteTemplate === 'string' && s.quoteTemplate.trim()) result.settings.quoteTemplate = s.quoteTemplate.replace(/\r\n/g, '\n') === LEGACY_QUOTE_TEMPLATE ? DEFAULTS.quoteTemplate : s.quoteTemplate;
    if (typeof s.displayTemplate === 'string' && s.displayTemplate.trim()) result.settings.displayTemplate = s.displayTemplate;
  }
  for (const [id, b] of Object.entries(data.books ?? {})) {
    if (!b || b.id !== id || typeof b.path !== 'string' || !Array.isArray(b.annotations)) throw new Error('Invalid Ebook Plus annotation data; restore data.json from backup.');
    result.books[id] = { ...b, position: isCfi(b.position) ? b.position : undefined, annotations: b.annotations.filter(a => a && typeof a.id === 'string' && isCfi(a.cfi) && typeof a.text === 'string' && typeof a.comment === 'string' && Object.prototype.hasOwnProperty.call(COLORS, a.color) && ['highlight', 'bookmark'].includes(a.kind)) };
  }
  return result;
}
export function passageUrl(vault: string, book: BookRecord, cfi: string): string {
  return `obsidian://ebook-plus?${new URLSearchParams({ vault, book: book.id, file: book.path, cfi })}`.replace(/\+/g, '%20');
}
export interface PassageTarget { book?: string; annotation?: string; cfi?: string; color?: Color; file?: string }
export function parsePassage(subpath: string): PassageTarget | undefined {
  const query = subpath.replace(/^#/, '');
  const params = new URLSearchParams(query);
  if (!params.has('ebook') && !params.has('cfi') && !params.has('annotation')) return;
  const cfi = params.get('cfi') ?? undefined;
  if (cfi && !isCfi(cfi)) throw new Error('Invalid EPUB passage link.');
  const color = params.get('color');
  return { book: params.get('ebook') ?? params.get('book') ?? undefined, annotation: params.get('annotation') ?? undefined, cfi, color: color && Object.prototype.hasOwnProperty.call(COLORS, color) ? color as Color : undefined };
}
function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, key) => values[key] ?? whole);
}
export function passageLink(book: BookRecord, a: Annotation, display?: string): string {
  const fragment = new URLSearchParams({ ebook: book.id, annotation: a.id, cfi: a.cfi, color: a.color }).toString().replace(/\+/g, '%20');
  const label = (display ?? `${book.path.split('/').pop()!.replace(/\.epub$/i, '')}, ${a.location || 'passage'}`).replace(/[\r\n|\[\]]/g, ' ');
  if (/[#|\[\]]/.test(book.path)) return `[${escapeMarkdown(label)}](<${encodeURI(book.path).replace(/#/g, '%23').replace(/\?/g, '%3F')}#${fragment}>)`;
  return `[[${book.path}#${fragment}|${label}]]`;
}
export function escapeMarkdown(s: string): string { return s.replace(/[\\`*_[\]<>#|!]/g, '\\$&'); }
export function quoteMarkdown(_vault: string, book: BookRecord, a: Annotation, callout: boolean, settings: Pick<Settings, 'quoteTemplate' | 'displayTemplate'> = DEFAULTS): string {
  const values: Record<string, string> = { 'file.basename': book.path.split('/').pop()!.replace(/\.epub$/i, ''), 'file.path': book.path, location: a.location || 'passage', color: a.color, colorName: a.color, calloutType: 'EPUB' };
  const display = renderTemplate(settings.displayTemplate, values);
  const link = passageLink(book, a, display);
  const passage = escapeMarkdown(a.text || 'Bookmark').replace(/\r\n?/g, '\n');
  const text = passage.replace(/\n/g, '\n> ');
  const quoteBlock = passage.split('\n').map(line => line ? `> > ${line}` : '> >').join('\n');
  const comment = escapeMarkdown(a.comment).replace(/\r?\n/g, '\n> ');
  return renderTemplate(callout ? settings.quoteTemplate : '> {{text}}\n>\n> {{linkWithDisplay}}\n{{commentBlock}}', { ...values, display, linkWithDisplay: link, link, text, quoteBlock, comment, commentBlock: a.comment ? `>\n> ${comment}\n` : '' }).trimEnd() + '\n';
}
export function embedSource(book: BookRecord, a: Annotation): string {
  return '```ebook\n' + JSON.stringify({ book: book.id, annotation: a.id }, null, 2) + '\n```';
}
export function safeFolder(value: string): string {
  const parts = value.replace(/\\/g, '/').split('/').filter(Boolean);
  if (/^[\/\\]/.test(value) || parts.some(p => p === '..' || p === '.' || /[:*?"<>|]/.test(p))) throw new Error('Choose a relative folder inside your vault.');
  return parts.join('/');
}
export const CONVERTIBLE = ['mobi', 'azw', 'azw3', 'azw4', 'fb2', 'lit', 'rtf'];
