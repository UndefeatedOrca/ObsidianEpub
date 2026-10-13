# Verification for 0.5.0

Verified on Windows on October 13, 2026.

| Check | Result |
| --- | --- |
| TypeScript strict typecheck and bundled plugin build | Passed |
| Model tests | 27 passed |
| Browser tests in headless Microsoft Edge | 18 passed |
| Calibre 6.1 MOBI → EPUB round trip | Passed |
| Calibre 6.1 AZW3 → EPUB round trip | Passed |
| Unsupported conversion format rejection | Passed |
| Dependency audit | Previously verified for 0.2.0; dependencies unchanged |
| Distribution folder and ZIP generation | Passed |
| Attribution regression checks and packaged notice comparison | 7 passed |

Browser tests render a real, locally generated, two-chapter EPUB. They cover CSS loading, text selection and exact CFI round trips, highlight drawing/removal/restoration, chapter search, theme changes, blocked script execution and remote images, and malformed archive errors. A public-API Obsidian adapter also exercises the actual plugin UI: comment creation, persistence/reopening, bookmarks, export without overwrite, text embeds, rename handling, and deletion undo.

Conversion tests invoke the actual installed Calibre executable with paths containing spaces and `&`, then inspect the produced EPUB archives. They generate their own MOBI/AZW3 inputs from the original test EPUB.

The 0.2.0 additions verify page buttons, actual wheel scrolling, mode persistence, native colored callout links, legacy protocol clicks, highlight creation/deduplication on copy, saved color preservation, opening during file load, and deferred-reader protocol navigation. Calibre conversion was verified in 0.1.0; the conversion implementation is unchanged. The template/data tests verify migration defaults and exact annotation preservation from 0.1.0 data.

The 0.3.0 additions test top-passage pixel alignment after repeated zoom in both modes; cancellation of delayed alignment when the user scrolls; chapter-boundary paging in both directions; real iframe hover/click annotation bubbles; sidebar focus without moving the reader; backlink note/line navigation; distinct callout backgrounds with both legacy and current theme color conventions; and scroll stability after idle and selection-toolbar updates. Model tests cover stable-ID backlink matching, exact-CFI fallback, encoded paths, duplicate mentions, wrong-book/annotation rejection, and refreshed cache contents. These checks use an original reflowable book, not a broad publisher corpus.

The 0.3.1 model checks verify nested passage formatting, multi-paragraph/CRLF text, comment separation, empty comments, migration of the prior default template, and preservation of custom templates. Build and package attribution checks were rerun.

The 0.4.0 checks cover Markdown annotation round trips, paragraph/comment separation, conflict rejection, preservation of unrelated prose and edits, invalid/duplicate markers, callout-color edits, deletion, automatic companion creation, existing-file collision handling, companion renames, note switching, and source-line opening. Model tests confirm the merge logic against concurrent same-annotation and unrelated-annotation edits. Reader/browser regression tests use the new storage model. No migration is implemented.

The 0.5.0 tests add local/cross-chapter/non-spine footnotes, missing targets, older reference conventions, hover and keyboard interactions, focus restoration, no navigation on preview, safe formatting without active resources, and ordinary internal-link navigation. Typography checks cover all controls, persistence across chapter changes/reopening, publisher-style reset, and top-passage pixel alignment after font, spacing, margin and width changes. The generated EPUB fixture now includes notes and has deterministic ZIP timestamps.

## Host validation still needed

This has not been tested inside the actual Obsidian desktop or mobile app. Before a public release, install the packaged plugin in a disposable vault and verify:

1. Opening EPUB files from the vault explorer and restoring them after restarting Obsidian.
2. Highlight/comment creation, two simultaneous views of a book, deleting and undoing a highlight.
3. Opening copied passage links from notes and from outside Obsidian, including after a file or parent folder rename.
4. Inserting a quote into an open note, ordinary vault backlinks, and rendering `ebook` code blocks in Live Preview and reading mode.
5. Right-click conversion on desktop with “Detect all file extensions” enabled.
6. Mobile selection handles, touch controls, rotation, narrow panes and sync behavior.
7. A broader book corpus: EPUB 2 navigation, images/fonts, fixed layout, RTL, long books and unusual publisher markup.

The development release documents these limits in README.md; no claim of complete PDF++ parity or community-store approval is made.
