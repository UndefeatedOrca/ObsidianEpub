import { describe, expect, it } from 'vitest';
import { emptyData, hydrate, passageUrl, quoteMarkdown, safeFolder, embedSource, Annotation, BookRecord } from '../src/model';
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
    expect(markdown).toContain('> [!quote]');
    expect(markdown).toContain('> A \\[quote\\]\n> second line');
    expect(markdown).toContain('> My thought\n> continued');
    expect(markdown).toContain('Books/A%20%231%20&%20B.epub');
    expect(markdown).toContain('obsidian://ebook-plus?');
    expect(quoteMarkdown('vault', book, a, false)).not.toContain('[!quote]');
  });
  it('embeds by annotation identity instead of embedding book HTML', () => {
    expect(embedSource(book, a)).toContain('"annotation": "a"');
    expect(embedSource(book, a)).not.toContain(a.text);
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
