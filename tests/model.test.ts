import { describe, expect, it } from 'vitest';
import { emptyData, hydrate, passageUrl, passageLink, parsePassage, quoteMarkdown, safeFolder, embedSource, Annotation, BookRecord, DEFAULTS } from '../src/model';
const cfi = 'epubcfi(/6/2[ch1]!/4/2/1:0,/1:0,/1:19)';
const a: Annotation = { id: 'a', cfi, text: 'A [quote]\nsecond line', comment: 'My thought\ncontinued', kind: 'highlight', color: 'yellow', created: '2026-10-12' };
const book: BookRecord = { id: 'stable-id', path: 'Books/A #1 & B.epub', annotations: [a] };
describe('durable passage links and notes', () => {
  it('round trips Unicode and reserved characters through a protocol URL', () => {
    const url = new URL(passageUrl('My vault & 日本語', book, cfi));
    expect(url.searchParams.get('file')).toBe(book.path);
    expect(url.searchParams.get('vault')).toBe('My vault & 日本語');
    expect(url.searchParams.get('cfi')).toBe(cfi);
    expect(url.searchParams.get('book')).toBe('stable-id');
  });
  it('keeps book identity after renames and serializes persisted data', () => {
    const data = emptyData(); data.books[book.id] = structuredClone(book);
    data.books[book.id].path = 'Moved/Book.epub';
    const restored = hydrate(JSON.parse(JSON.stringify(data)));
    expect(restored.books[book.id].annotations[0]).toEqual(a);
    expect(new URL(passageUrl('v', restored.books[book.id], cfi)).searchParams.get('book')).toBe(book.id);
  });
  it('exports quoted lines, comments, exact anchors and ordinary file backlinks', () => {
    const markdown = quoteMarkdown('vault', book, a, true);
    expect(markdown).toContain('> [!EPUB|yellow]');
    expect(markdown).toContain('> A \\[quote\\]\n> second line');
    expect(markdown).toContain('> My thought\n> continued');
    expect(markdown).toContain('Books/A%20%231%20&%20B.epub');
    expect(markdown).toContain('annotation=a');
    expect(quoteMarkdown('vault', book, a, false)).not.toContain('[!EPUB');
  });
  it('embeds by annotation identity instead of embedding book HTML', () => {
    expect(embedSource(book, a)).toContain('"annotation": "a"');
    expect(embedSource(book, a)).not.toContain(a.text);
  });
  it('round trips a native wikilink to a saved colored highlight', () => {
    const link = passageLink({ ...book, path: 'Books/A & B.epub' }, { ...a, color: 'pink' });
    expect(link).toMatch(/^\[\[Books\/A & B.epub#/);
    const target = parsePassage(link.split('#')[1].split('|')[0]);
    expect(target).toMatchObject({ book: book.id, annotation: a.id, cfi, color: 'pink' });
  });
  it('supports custom copy templates without evaluating code', () => {
    const result = quoteMarkdown('v', book, a, true, { displayTemplate: '{{file.basename}} — {{location}}', quoteTemplate: '> [!{{calloutType}}|{{colorName}}] {{linkWithDisplay}}\n> {{text}}\n{{commentBlock}}\n{{globalThis.alert(1)}}' });
    expect(result).toContain('[!EPUB|yellow]');
    expect(result).toContain('{{globalThis.alert(1)}}');
    expect(result).toContain('annotation=a');
  });
  it('adds defaults when loading 0.1.0 data without changing annotations', () => {
    const data = hydrate({ version: 1, settings: { callouts: false }, books: { [book.id]: book } });
    expect(data.settings.readingMode).toBe('paginated');
    expect(data.settings.quoteTemplate).toBe(DEFAULTS.quoteTemplate);
    expect(data.books[book.id].annotations).toEqual([a]);
  });
});
describe('data validation', () => {
  it('applies defaults and clamps typography', () => {
    expect(hydrate(null)).toEqual(emptyData());
    expect(hydrate({ settings: { fontSize: 999 } }).settings.fontSize).toBe(200);
  });
  it('rejects future schemas rather than overwriting them', () => { expect(() => hydrate({ version: 2 })).toThrow('Unsupported'); });
  it('rejects corrupted book records', () => { expect(() => hydrate({ books: { wrong: book } })).toThrow('Invalid'); });
  it('discards invalid annotations on load', () => {
    expect(hydrate({ books: { [book.id]: { ...book, annotations: [{ ...a, cfi: 'javascript:alert(1)' }] } } }).books[book.id].annotations).toEqual([]);
  });
  it.each(['../outside', 'notes/../../outside', 'C:\\notes', '/absolute', 'notes/*'])('rejects unsafe notes directory %s', path => { expect(() => safeFolder(path)).toThrow(); });
  it('normalizes safe relative folders', () => { expect(safeFolder('Reading\\Notes')).toBe('Reading/Notes'); expect(safeFolder('')).toBe(''); });
});
