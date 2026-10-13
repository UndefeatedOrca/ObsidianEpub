import type { App, TFile } from 'obsidian';
import { Annotation, BookRecord, parsePassage } from './model';

export interface HighlightBacklink { file: TFile; line: number }

// Public metadata cache only: links in fenced code and ordinary whole-book links
// do not become annotation backlinks. Stable book IDs survive ebook renames.
export function highlightBacklinks(app: App, book: BookRecord, annotation: Annotation): HighlightBacklink[] {
  const result: HighlightBacklink[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    for (const link of [...cache?.links ?? [], ...cache?.embeds ?? []]) {
      try {
        const hash = link.link.indexOf('#');
        if (hash < 0) continue;
        const target = parsePassage(link.link.slice(hash));
        if (!target) continue;
        const sameBook = target.book ? target.book === book.id : app.metadataCache.getFirstLinkpathDest(decodeURIComponent(link.link.slice(0, hash)), file.path)?.path === book.path;
        if (!sameBook || (target.annotation ? target.annotation !== annotation.id : target.cfi !== annotation.cfi)) continue;
        const line = link.position.start.line;
        if (!result.some(hit => hit.file.path === file.path && hit.line === line)) result.push({ file, line });
      } catch { /* Ignore malformed links in notes. */ }
    }
  }
  return result.sort((a, b) => a.file.path.localeCompare(b.file.path) || a.line - b.line);
}
