import { Annotation, BookRecord, COLORS, Color, DEFAULTS, isCfi, quoteMarkdown } from './model';

const START = '<!-- ebook-annotation:';
const END = '<!-- /ebook-annotation -->';
export interface AnnotationBlock { annotation: Annotation; start: number; end: number; line: number }
export function companionHeader(book: BookRecord): string {
  return `---\nebook: ${JSON.stringify('[[' + book.path + ']]')}\nebook-id: ${JSON.stringify(book.id)}\n---\n\n# Annotations\n\n`;
}
export function companionBookId(source: string): string | undefined {
  const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const value = front?.match(/^ebook-id:\s*(.+)$/m)?.[1]?.trim();
  if (!value) return;
  try { return value.startsWith('"') ? JSON.parse(value) : value; } catch { return; }
}
export function companionBookPath(source: string): string | undefined {
  const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const value = front?.match(/^ebook:\s*(.+)$/m)?.[1]?.trim();
  if (!value) return;
  try {
    const link: string = value.startsWith('"') ? JSON.parse(value) : value.replace(/^'|'$/g, '');
    return link.match(/^\[\[([^|]+)(?:\|[^\]]*)?\]\]$/)?.[1];
  } catch { return; }
}
export function annotationBlock(book: BookRecord, a: Annotation): string {
  const meta = { id: a.id, cfi: a.cfi, kind: a.kind, created: a.created, location: a.location };
  return `${START}${encodeURIComponent(JSON.stringify(meta))} -->\n${quoteMarkdown('', book, a, true, DEFAULTS)}${END}`;
}
function plain(text: string): string { return text.replace(/\\([\\`*_[\]<>#|!])/g, '$1'); }
export function readAnnotations(source: string): AnnotationBlock[] {
  const result: AnnotationBlock[] = [];
  let cursor = 0;
  while (true) {
    const start = source.indexOf(START, cursor); if (start < 0) break;
    const metaEnd = source.indexOf(' -->', start);
    const end = source.indexOf(END, metaEnd);
    if (metaEnd < 0 || end < 0 || source.indexOf(START, start + START.length) >= 0 && source.indexOf(START, start + START.length) < end) throw new Error('An annotation block is incomplete. Finish editing its markers before changing it in the reader.');
    const meta = JSON.parse(decodeURIComponent(source.slice(start + START.length, metaEnd)));
    if (typeof meta.id !== 'string' || !/^[\w-]+$/.test(meta.id) || !isCfi(meta.cfi) || !['highlight','bookmark'].includes(meta.kind) || typeof meta.created !== 'string') throw new Error('Invalid annotation metadata.');
    if (result.some(b => b.annotation.id === meta.id)) throw new Error('Duplicate annotation ID in the book note.');
    const lines = source.slice(metaEnd + 4, end).trim().split(/\r?\n/);
    const color = lines.shift()?.match(/^>\s*\[!EPUB\|([a-z]+)\]/i)?.[1]?.toLowerCase();
    if (!color || !(color in COLORS)) throw new Error('Use an EPUB callout with a supported color inside each annotation block.');
    const quote: string[] = [], comment: string[] = [];
    let commenting = false;
    for (const line of lines) {
      if (!commenting && /^>\s?>/.test(line)) quote.push(plain(line.replace(/^>\s?> ?/, '')));
      else {
        if (!/^>(?: |$)/.test(line)) throw new Error('Keep annotation text inside its callout; put other prose outside its markers.');
        if (!commenting && /^>\s*$/.test(line)) { commenting = true; continue; }
        commenting = true; comment.push(plain(line.replace(/^> ?/, '')));
      }
    }
    result.push({ annotation: { ...meta, color: color as Color, text: quote.join('\n'), comment: comment.join('\n') }, start, end: end + END.length, line: source.slice(0, start).split('\n').length - 1 });
    cursor = end + END.length;
  }
  return result;
}
const equal = (a?: Annotation, b?: Annotation) => a === b || (!!a && !!b && (['id', 'cfi', 'text', 'comment', 'color', 'kind', 'created', 'location'] as const).every(key => a[key] === b[key]));
export function mergeAnnotations(source: string, book: BookRecord, baseline: Annotation[], desired: Annotation[]): string {
  if (companionBookId(source) !== book.id) throw new Error('This note is not associated with this book.');
  const blocks = readAnnotations(source);
  const changes = new Set([...baseline, ...desired].map(a => a.id).filter(id => !equal(baseline.find(a => a.id === id), desired.find(a => a.id === id))));
  let result = source;
  for (const id of changes) {
    const before = baseline.find(a => a.id === id), after = desired.find(a => a.id === id), current = blocks.find(b => b.annotation.id === id)?.annotation;
    if (!equal(before, current) && !equal(after, current)) throw new Error('This annotation changed in the note. Review the latest text and try again.');
  }
  for (const block of [...blocks].reverse()) if (changes.has(block.annotation.id)) {
    const after = desired.find(a => a.id === block.annotation.id);
    result = result.slice(0, block.start) + (after ? annotationBlock(book, after) : '') + result.slice(block.end);
  }
  for (const a of desired) if (changes.has(a.id) && !blocks.some(b => b.annotation.id === a.id)) result += `\n\n${annotationBlock(book, a)}\n`;
  return result;
}
