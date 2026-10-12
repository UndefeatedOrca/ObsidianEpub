# Ebook Plus for Obsidian

An EPUB reader that connects book passages to your Markdown notes, inspired by PDF++.

## Install

1. Download or build `dist/ebook-plus-0.1.0.zip`.
2. Extract its `ebook-plus` folder into `<vault>/.obsidian/plugins/`.
3. Reload Obsidian and enable **Ebook Plus** under Community plugins.
4. Add an EPUB to the vault and click it. If another plugin handles EPUBs, disable that handler first.

This is an initial development release, not yet published in the community plugin directory.

## Reading and annotation

- Navigate with Chapters, arrow buttons or arrow keys inside the book. Search finds up to 200 passages throughout the book.
- Choose light, sepia or dark and use A− / A+ to change type size. The last reading location is saved.
- Select text, choose a color, then Highlight or Comment. Click Annotations to jump to, edit, copy or delete an annotation. Deletion offers Undo for ten seconds.
- Bookmark saves the current visible location. Selection and current location are distinct: Copy link uses the selected passage when one is selected.
- Copy quote produces a Markdown quote or callout with a passage link and a regular vault file link for backlinks. Insert in note lets you select an already-open Markdown note.
- Export creates a new note containing all annotations; it never overwrites an existing note.
- Embed copies an `ebook` code block that displays a saved quotation/comment and a passage link in reading mode or Live Preview. This is a text excerpt embed, not a live book viewport.
- Enable optional Vim navigation in settings: h/k previous, j/l next, y copy quote.
- Commands are available from Obsidian's command palette while an ebook pane is active.

## MOBI, AZW/AZW3 and other formats

On desktop, install [Calibre](https://calibre-ebook.com/) and set its `ebook-convert` executable in plugin settings if it is not on PATH. On Windows the usual location is `C:\Program Files\Calibre2\ebook-convert.exe`.

Enable Obsidian's **Files and links → Detect all file extensions** if necessary to see these files. Right-click a MOBI, AZW, AZW3, AZW4, FB2, LIT or RTF file in the vault and choose **Convert to EPUB with Calibre**. A new EPUB is created beside the original, with a unique name. Calibre runs without a shell and conversion times out after three minutes. DRM-protected files are not supported. AZW3 is the usual extension for the format sometimes called “AZ3”.

Native EPUB reading is designed for desktop and mobile. Conversion requires desktop and a separate Calibre installation. Mobile behavior still needs on-device verification.

## Storage and links

Annotations, comments, book IDs, reading positions and preferences are stored in `.obsidian/plugins/ebook-plus/data.json`. Back up/sync this file alongside your books. Changes in multiple open panes are shared; simultaneous edits on different devices require your sync tool's conflict resolution.

Links use `obsidian://ebook-plus?vault=…&book=…&file=…&cfi=…`. The persistent book ID survives file and folder renames while the plugin is enabled. The file path is a fallback when opening a link without its original plugin data. Exported normal vault links follow Obsidian's own link-update settings. Moving books while the plugin is disabled, replacing an EPUB with a different edition, or deleting plugin data can invalidate anchors. EPUB CFIs identify text locations, not stable printed page numbers.

Book scripts, forms, frames and remote resources are blocked. External links inside the ebook are disabled in this first version. The EPUB archive is never changed. Large or malformed books may not render; search currently retains loaded chapters in memory. EPUB 2/3 reflowable books are the primary target; complex fixed-layout, RTL and multimedia books need broader compatibility testing.

## Relationship to PDF++

This implements the central reading → highlighting → linked notes workflow, not all PDF++ features. Annotations are stored by Ebook Plus and shown in its reader. Arbitrary incoming backlinks do not automatically create highlights. Native backlink overlays, hover passage previews, rectangular image excerpts, write-back into EPUB, annotation interchange and full PDF++ shortcut/custom-template parity are not implemented.

PDF++ is a separate project by Ryota Ushio. No PDF++ source code is included. See [the implementation plan](PLAN.md) for references and scope.

## Development

```sh
npm ci
npm test
npm run test:browser
npm run test:conversion
npm run build
npm run package
```

`npm run dev` watches source files. Copy `main.js`, `manifest.json` and `styles.css` into a development vault's plugin folder to test in Obsidian. `npm run package` produces a folder and ZIP under `dist/`.

Build tooling requires Node.js 22.12+ or 24+. Browser tests use installed Microsoft Edge by default (`playwright.config.ts`); use a Playwright Chromium installation and remove `channel` for other environments. Conversion tests require Calibre on PATH or `CALIBRE_PATH` pointing to its executable. Tests generate an original two-chapter EPUB fixture; no third-party book text is included. The browser integration harness adapts public Obsidian APIs and does not constitute testing inside the Obsidian app.

The EPUB engine is pinned to epub.js 0.3.93. Its XML parser dependency is overridden to the patched 0.9.12 release; browser rendering uses the browser's DOM APIs. Runtime dependency license texts are included in `THIRD_PARTY_NOTICES.md` and the distribution.
