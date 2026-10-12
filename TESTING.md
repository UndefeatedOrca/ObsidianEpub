# Verification for 0.1.0

Verified on Windows on October 12, 2026.

| Check | Result |
| --- | --- |
| TypeScript strict typecheck and bundled plugin build | Passed |
| Model tests | 14 passed |
| Browser tests in headless Microsoft Edge | 3 passed |
| Calibre 6.1 MOBI → EPUB round trip | Passed |
| Calibre 6.1 AZW3 → EPUB round trip | Passed |
| Unsupported conversion format rejection | Passed |
| npm dependency audit after updates | 0 reported vulnerabilities |
| Distribution folder and ZIP generation | Passed |
| Attribution regression checks and packaged notice comparison | 7 passed |

Browser tests render a real, locally generated, two-chapter EPUB. They cover CSS loading, text selection and exact CFI round trips, highlight drawing/removal/restoration, chapter search, theme changes, blocked script execution and remote images, and malformed archive errors. A public-API Obsidian adapter also exercises the actual plugin UI: comment creation, persistence/reopening, bookmarks, export without overwrite, text embeds, rename handling, and deletion undo.

Conversion tests invoke the actual installed Calibre executable with paths containing spaces and `&`, then inspect the produced EPUB archives. They generate their own MOBI/AZW3 inputs from the original test EPUB.

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
