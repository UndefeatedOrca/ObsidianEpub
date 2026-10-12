# Ebook Plus implementation plan

Repository initialized before implementation. EPUB is the native format; EPUB CFI anchors replace PDF page/selection coordinates.

1. Build an Obsidian FileView using epub.js, with chapter navigation, search, reading position, themes and typography.
2. Add persisted color highlights, comments, bookmarks, annotation navigation and deletion. Store these in plugin data without modifying books.
3. Connect passages to notes through vault-aware protocol links, Markdown quotes/callouts and annotation export. Include a normal vault file link for Obsidian backlinks. Provide passage embeds through an `ebook` code block.
4. Offer optional desktop import of DRM-free MOBI/AZW/AZW3 through an installed Calibre converter; do not pretend EPUB rendering supports Kindle formats natively.
5. Test persistence helpers, anchors, export, conversion validation and actual EPUB rendering; build installable artifacts and document installation and limitations.

## Scope

Inspired by PDF++ reading/annotation workflows, not a claim of full feature parity. PDF editing, OCR, PDF page geometry and PDF-specific internals do not translate to reflowable ebooks. Start with stable public Obsidian APIs. Advanced backlink overlays, hover previews, native Kindle decoding and writing annotations into EPUB archives are future work.

## Implementation status

All five implementation steps are complete for the 0.1.0 development release. See TESTING.md for executed checks and host-validation gaps. The installable folder and ZIP are generated under `dist/`. Calibre MOBI and AZW3 conversion were exercised locally; other listed conversion formats depend on Calibre and have not each been tested.

## References

- https://github.com/RyotaUshio/obsidian-pdf-plus
- https://ryotaushio.github.io/obsidian-pdf-plus/annotating-pdfs.html
- https://github.com/futurepress/epub.js
- https://docs.obsidian.md/Plugins/User+interface/Views
