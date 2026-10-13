# Current state — v0.4.0, 2026-10-13

Companion Markdown annotation storage implemented at user request; no migration.

- Opening an EPUB creates same-basename Markdown companion beside it, with collision-safe alternate naming.
- Annotation callouts carry stable IDs/CFIs in HTML comment markers. Markdown is authoritative; active annotation bodies are omitted from plugin data snapshots.
- Reader saves use Vault.process and a per-annotation three-way comparison, preserving unrelated prose/changes and refusing conflicting edits.
- Note edits refresh the reader after a 350ms debounce. Callout color, nested passage and outer comment are editable. Deleting marked blocks removes annotations.
- Open book note toolbar button, EPUB context-menu action, Open annotation note bubble action, and Switch between ebook and book note command. No explorer modifier-click interception.
- Note renames update associations. Stable IDs/properties permit recovery from a renamed companion when book identity/path matches. Missing notes are not silently recreated.
- Prior JSON annotations are retained as legacyAnnotations when a book is opened; they are not migrated/displayed.

Release: dist/ebook-plus-0.4.0.zip and individual assets in dist/ebook-plus/.
Build, 26 model tests, 15 browser tests, and 7 license/package checks. Browser tests use actual EPUB rendering with an Obsidian API adapter, not the actual host app. Host desktop/mobile and multi-device sync validation remain outstanding.

No GitHub publication or git commit performed. Source edits remain in the working tree. README.md explains storage format, editable sections, conflicts, commands, and limitations.

## v0.5.0 — Footnotes and typography

Added semantic/common legacy foot/endnote previews for current chapter, other chapters and manifest HTML outside the spine. Click/tap/Enter pins, hover previews, Escape/close restores reference focus. Formatting-only DOM reconstruction keeps untrusted scripts/styles/links/resources out of the parent document. Internal links now resolve relative to the archive chapter.

Typography dialog provides publisher/serif/sans/mono font, size, line/paragraph spacing, side margins, max width and reset. Preferences persist and use existing top-anchor preservation. Tests: 27 model, 18 browser; build and package checks. Release dist/ebook-plus-0.5.0.zip. EPUB fixture intentionally changed with note examples; do not restore the old fixture. No publication/commit performed. Actual Obsidian-host/mobile testing remains outstanding.
