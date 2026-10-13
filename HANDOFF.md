# Upgrade completed — 2026-10-12

Resumed at the user's request. The five requested areas are implemented in v0.3.0:

- EPUB callout colors compatible with old/new theme color conventions.
- Zoom retains the top visible text anchor and pixel offset; user navigation cancels delayed restoration.
- Hover/click annotation bubbles with saved comment, copy/edit controls, and Show in list scrolling to the selected card.
- Vertical screenful paging, explicit location reporting, current-position resize handling, stable selection toolbar height, and disabled competing browser scroll anchoring.
- Highlight-specific linked mentions from Obsidian metadata, opening note at source line.

Verification: build passed, 20 model tests passed, 13 browser tests passed, 7 notice/package checks passed. Two browser tests were rerun after final bubble cleanup edits and passed. Package: dist/ebook-plus-0.3.0.zip; individual release files in dist/ebook-plus/. No GitHub publication or git commit was performed.

Changes remain in the working tree. The generated fixture was restored to HEAD because only ZIP timestamps changed. No ongoing test process remains.

Remaining compatibility limits are documented in README.md and TESTING.md: actual Obsidian desktop/mobile host verification, broad publisher/fixed-layout/RTL corpus, zoom alignment at chapter scroll boundaries, and linked-note text previews. Backlinks refresh when opening a bubble; they are not live-updated while it remains open. Legacy external protocol URLs are not indexed as linked mentions.
