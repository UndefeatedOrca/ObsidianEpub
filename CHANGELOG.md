# Changelog

## 0.2.0

- Added persistent Pages / Scroll reading modes, labeled paging controls, keyboard navigation from the reading area, and navigation hints.
- Added native EPUB passage links with book ID, annotation ID, CFI fallback and color metadata. Passage opening waits for file loading and handles deferred views. Legacy Open passage protocol links remain supported.
- Copy quote and Copy link on a selection now save a persistent highlight before copying. Repeated copying reuses the highlight and keeps its color/comment.
- Added `[!EPUB|color]` callouts and configurable quote/display templates inspired by PDF++ documentation. Templates use named substitutions, not JavaScript execution.
- Replaced the primary code-block copy action with Copy callout; existing code-block embeds still render.
- Preserved the version-1 data schema and 0.1.0 highlights. Documented storage, link behavior, and BRAT release assets.

## 0.1.0

- Initial EPUB reader, annotations, bookmarks, search, protocol links, Markdown export and optional Calibre conversion.
