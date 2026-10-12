# Ebook Plus for Obsidian

An EPUB reader that connects book passages to your Markdown notes, inspired by PDF++.

## Install

1. Download or build `dist/ebook-plus-0.2.0.zip`.
2. Extract its `ebook-plus` folder into `<vault>/.obsidian/plugins/`.
3. Reload Obsidian and enable **Ebook Plus** under Community plugins.
4. Add an EPUB to the vault and click it. If another plugin handles EPUBs, disable that handler first.

This is an initial development release, not yet published in the community plugin directory.

For BRAT, create a `0.2.0` GitHub prerelease and attach `main.js`, `manifest.json`, and `styles.css` individually from `dist/ebook-plus/`, alongside `LICENSE` and `THIRD_PARTY_NOTICES.md`. The ZIP is optional for manual installation. BRAT does not install from the ZIP. To upgrade manually, replace those three plugin files and retain `data.json`; existing highlights and positions are preserved.

## Reading and annotation

- Choose **Pages** or **Scroll** in the top-left dropdown. Pages has labeled Previous page / Next page buttons; arrow keys and Page Up / Page Down work in the book and when the reading area is focused. Scroll mode supports wheel, trackpad, touch and a scrollbar, loading adjacent chapters as you read. Switching modes keeps your location. Search finds up to 200 passages throughout the book.
- Choose light, sepia or dark and use A− / A+ to change type size. The last reading location is saved.
- Select text, choose a color, then Highlight or Comment. Click Annotations to jump to, edit, copy or delete an annotation. Deletion offers Undo for ten seconds.
- Bookmark saves the current visible location. Selection and current location are distinct: Copy link uses the selected passage when one is selected.
- Copy quote saves the selection as a persistent highlight, then produces a colored EPUB callout containing an ordinary vault link to that exact annotation. Copying an existing highlight preserves its ID, color and comment. Copy link also saves selected text; with no selection it copies the current reading location. Insert in note lets you select an already-open Markdown note.
- Export creates a new note containing all annotations; it never overwrites an existing note.
- The annotation panel's **Copy callout** produces ordinary editable Markdown with the annotation color. Existing `ebook` code-block embeds from 0.1.0 still render, but are no longer the primary copy workflow.
- Enable optional Vim navigation in settings: h/k previous, j/l next, y copy quote.
- Commands are available from Obsidian's command palette while an ebook pane is active.

### Colored callouts and templates

The default copy format resembles PDF++'s colored callouts:

```markdown
> [!EPUB|yellow] [[Books/My book.epub#ebook=BOOK_ID&annotation=HIGHLIGHT_ID&cfi=ENCODED_CFI&color=yellow|My book, Chapter 3]]
> The selected passage.
```

This example uses placeholders; Copy quote generates the actual IDs and encoded CFI. The file link gives Obsidian a backlink and opens the matching saved highlight. The CFI is a fallback when annotation data is unavailable. Links also resolve through the persistent book ID after a rename while the plugin is enabled. Yellow, green, blue, pink and purple callouts are styled by the plugin in reading mode and Live Preview. Their Markdown text and color are snapshots: editing a saved highlight later does not rewrite pasted notes.

In settings, **Link display template** controls the title, and **Quote template** controls the copied Markdown. Supported placeholders: `{{file.basename}}`, `{{file.path}}`, `{{location}}`, `{{color}}` / `{{colorName}}`, `{{calloutType}}`, `{{linkWithDisplay}}` / `{{link}}`, `{{display}}`, `{{text}}`, `{{comment}}`, and `{{commentBlock}}` (a complete quoted comment). Display templates support the file/location/color variables. Templates substitute these values; they do not evaluate JavaScript expressions. Use `EPUB` as the callout type for the included color styling. Reset copy templates restores defaults.

Locations describe the current chapter and, in Pages mode, its current layout page. These labels are informational: the link anchors to text, so changing font size or reading mode does not rely on the page label remaining the same.

## MOBI, AZW/AZW3 and other formats

On desktop, install [Calibre](https://calibre-ebook.com/) and set its `ebook-convert` executable in plugin settings if it is not on PATH. On Windows the usual location is `C:\Program Files\Calibre2\ebook-convert.exe`.

Enable Obsidian's **Files and links → Detect all file extensions** if necessary to see these files. Right-click a MOBI, AZW, AZW3, AZW4, FB2, LIT or RTF file in the vault and choose **Convert to EPUB with Calibre**. A new EPUB is created beside the original, with a unique name. Calibre runs without a shell and conversion times out after three minutes. DRM-protected files are not supported. AZW3 is the usual extension for the format sometimes called “AZ3”.

Native EPUB reading is designed for desktop and mobile. Conversion requires desktop and a separate Calibre installation. Mobile behavior still needs on-device verification.

## Storage and links

Annotations, comments, book IDs, reading positions and preferences are stored in `.obsidian/plugins/ebook-plus/data.json`. Back up/sync this file alongside your books. Changes in multiple open panes are shared; simultaneous edits on different devices require your sync tool's conflict resolution.

New quote links use `[[file.epub#ebook=…&annotation=…&cfi=…&color=…|label]]`. Filenames containing characters reserved by wikilinks use a Markdown link instead. Legacy `obsidian://ebook-plus?vault=…&book=…&file=…&cfi=…` links remain supported, including local clicks on old “Open passage” links. Passage navigation waits for the reader to finish loading. The persistent book ID survives file and folder renames while the plugin is enabled. The file path is a fallback when opening a link without its original plugin data. Exported vault links follow Obsidian's own link-update settings. Moving books while the plugin is disabled, replacing an EPUB with a different edition, or deleting plugin data can invalidate anchors. EPUB CFIs identify text locations, not stable printed page numbers.

You do not need to paste into a note to keep a highlight. Highlight, Comment and Copy quote save it in plugin data immediately. Deleting a pasted quote does not delete its highlight, and deleting a highlight does not delete the pasted Markdown. Back up `data.json`; annotations are not written inside the EPUB archive.

Book scripts, forms, frames and remote resources are blocked. External links inside the ebook are disabled in this first version. The EPUB archive is never changed. Large or malformed books may not render; search currently retains loaded chapters in memory. EPUB 2/3 reflowable books are the primary target; complex fixed-layout, RTL and multimedia books need broader compatibility testing.

## Relationship to PDF++

This implements the central reading → highlighting → linked notes workflow, not all PDF++ features. Annotations are stored by Ebook Plus and shown in its reader. Arbitrary incoming backlinks do not automatically create highlights. Native backlink overlays, hover passage previews, rectangular image excerpts, write-back into EPUB, annotation interchange and full PDF++ shortcut/custom-template parity are not implemented.

PDF++ is a separate project by [Ryota Ushio](https://github.com/RyotaUshio/obsidian-pdf-plus). No PDF++ source code is included. Ebook Plus is an independent project and is not affiliated with or endorsed by PDF++ or Obsidian. See [the implementation plan](PLAN.md) for references and scope.

## License and attribution

Maintained by **UndefeatedOrca**. Ebook Plus code is licensed under [MIT](LICENSE). Dependencies retain their own licenses; their notices are collected in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and included in the release ZIP. JSZip is used under its MIT license option. Calibre is a separately installed application and is not redistributed here.

The notice generator includes licenses embedded in READMEs and source headers as well as root license files. [Supplemental notices](licenses/) record provenance for packages that omit a standalone license file. In particular, marks-pane declares MIT and credits Fred Chasen in its package metadata; its supplemental notice includes the standard MIT text and author attribution without inventing an upstream copyright year. Packaging fails if a production dependency lacks collected license text or a specially handled dependency changes version without review.

For GitHub releases, publish the complete ZIP with its license and notice files and mark this initial release as a prerelease. Actual Obsidian host validation is still pending; see [TESTING.md](TESTING.md).

## Development

```sh
npm ci
npm test
npm run test:browser
npm run test:conversion
npm run build
npm run package
npm run test:notices
```

`npm run dev` watches source files. Copy `main.js`, `manifest.json` and `styles.css` into a development vault's plugin folder to test in Obsidian. `npm run package` produces a folder and ZIP under `dist/`.

Build tooling requires Node.js 22.12+ or 24+. Browser tests use installed Microsoft Edge by default (`playwright.config.ts`); use a Playwright Chromium installation and remove `channel` for other environments. Conversion tests require Calibre on PATH or `CALIBRE_PATH` pointing to its executable. Tests generate an original two-chapter EPUB fixture; no third-party book text is included. The browser integration harness adapts public Obsidian APIs and does not constitute testing inside the Obsidian app.

The EPUB engine is pinned to epub.js 0.3.93. Its XML parser dependency is overridden to the patched 0.9.12 release; browser rendering uses the browser's DOM APIs. Runtime dependency license texts are included in `THIRD_PARTY_NOTICES.md` and the distribution.
