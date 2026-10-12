export const COLORS = { yellow: '#f6d365', green: '#86d9a0', blue: '#85bdf5', pink: '#f6a4ca', purple: '#baa2ef' } as const;
export type Color = keyof typeof COLORS;
export interface Annotation {
  id: string; cfi: string; text: string; comment: string; color: Color;
  kind: 'highlight' | 'bookmark'; created: string;
}
export interface BookRecord { id: string; path: string; position?: string; annotations: Annotation[] }
export interface Settings { fontSize: number; theme: 'light' | 'dark' | 'sepia'; vim: boolean; calibre: string; notesFolder: string; callouts: boolean }
export interface Data { version: 1; settings: Settings; books: Record<string, BookRecord> }
export const DEFAULTS: Settings = { fontSize: 110, theme: 'sepia', vim: false, calibre: 'ebook-convert', notesFolder: 'Ebook notes', callouts: true };
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
  }
  for (const [id, b] of Object.entries(data.books ?? {})) {
    if (!b || b.id !== id || typeof b.path !== 'string' || !Array.isArray(b.annotations)) throw new Error('Invalid Ebook Plus annotation data; restore data.json from backup.');
    result.books[id] = { ...b, position: isCfi(b.position) ? b.position : undefined, annotations: b.annotations.filter(a => a && typeof a.id === 'string' && isCfi(a.cfi) && typeof a.text === 'string' && typeof a.comment === 'string' && Object.prototype.hasOwnProperty.call(COLORS, a.color) && ['highlight', 'bookmark'].includes(a.kind)) };
  }
  return result;
}
export function passageUrl(vault: string, book: BookRecord, cfi: string): string {
  return `obsidian://ebook-plus?${new URLSearchParams({ vault, book: book.id, file: book.path, cfi })}`;
}
export function escapeMarkdown(s: string): string { return s.replace(/[\\`*_[\]<>#|!]/g, '\\$&'); }
export function quoteMarkdown(vault: string, book: BookRecord, a: Annotation, callout: boolean): string {
  const title = escapeMarkdown(book.path.split('/').pop()!.replace(/\.epub$/i, ''));
  const body = escapeMarkdown(a.text || 'Bookmark').split(/\r?\n/).map(l => `> ${l}`).join('\n');
  const comment = a.comment ? `\n>\n${escapeMarkdown(a.comment).split(/\r?\n/).map(l => `> ${l}`).join('\n')}` : '';
  const fileLink = `[${title}](<${encodeURI(book.path).replace(/#/g, '%23').replace(/\?/g, '%3F')}>)`;
  return `${callout ? `> [!quote] ${title}\n` : ''}${body}${comment}\n>\n> [Open passage](${passageUrl(vault, book, a.cfi)}) · ${fileLink}\n`;
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
