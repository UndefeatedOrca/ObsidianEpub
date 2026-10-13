import type { Book, Contents } from 'epubjs';
import type Section from 'epubjs/types/section';

function tokens(el: Element, attribute: string): string[] { return (el.getAttribute(attribute) ?? '').toLowerCase().split(/\s+/); }
function noteTarget(el: Element): boolean {
  return tokens(el, 'epub:type').some(t => ['footnote', 'endnote', 'note'].includes(t)) || tokens(el, 'role').some(t => ['doc-footnote', 'doc-endnote'].includes(t));
}
export function isNoteReference(anchor: Element): boolean {
  if (tokens(anchor, 'epub:type').includes('backlink') || tokens(anchor, 'role').includes('doc-backlink')) return false;
  const href = anchor.getAttribute('href') ?? '';
  if (!href.includes('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href.trim())) return false;
  if (tokens(anchor, 'epub:type').includes('noteref') || tokens(anchor, 'role').includes('doc-noteref') || /(?:^|\s)(?:noteref|footnote-ref|endnote-ref|fn-ref)(?:\s|$)/i.test(anchor.getAttribute('class') ?? '')) return true;
  // Common EPUB 2 conventions, without treating every superscript link as a note.
  if (/#(?:fn|footnote|endnote|note)[-_]?\d/i.test(href)) return true;
  if (href.startsWith('#')) {
    try { const target = anchor.ownerDocument.getElementById(decodeURIComponent(href.slice(1))); return !!target && noteTarget(target); } catch { return false; }
  }
  return false;
}
export interface NoteContent { title: string; element?: Element; error?: string }
export async function resolveNote(book: Book, contents: Contents, anchor: Element): Promise<NoteContent> {
  const title = `Note ${anchor.textContent?.trim() || ''}`.trim();
  try {
    const current = book.spine.get(contents.sectionIndex);
    const base = new URL(current.url, 'https://ebook.invalid/');
    const target = new URL(anchor.getAttribute('href')!, base);
    if (target.origin !== base.origin || !target.hash) throw new Error('Note target is not inside this book.');
    const id = decodeURIComponent(target.hash.slice(1));
    let doc: Document;
    if (target.pathname === base.pathname) doc = contents.document;
    else {
      let section: Section | undefined;
      book.spine.each((item: Section) => { if (new URL(item.url, base).pathname === target.pathname) section = item; });
      if (section) { await section.load(book.load.bind(book)); doc = section.document; }
      else {
        const allowed = Object.values(book.packaging.manifest).some(item => /^(application\/xhtml\+xml|text\/html)$/.test(item.type) && new URL(book.resolve(item.href), base).pathname === target.pathname);
        if (!allowed) throw new Error('Note document is missing from this book.');
        doc = await book.load(target.pathname) as Document;
      }
    }
    let element = doc.getElementById(id) ?? Array.from(doc.querySelectorAll('[name]')).find(e => e.getAttribute('name') === id);
    if (!element) throw new Error('The linked footnote could not be found.');
    // Old books often put an empty named anchor at the start of a paragraph.
    if (element.localName === 'a' && !noteTarget(element)) {
      const parent = element.parentElement;
      element = parent && !['body', 'html'].includes(parent.localName) ? parent : element.nextElementSibling ?? element;
    }
    return { title, element };
  } catch (error) { return { title, error: error instanceof Error ? error.message : 'Could not read this note.' }; }
}

// Rebuild a small formatting-only subtree. Never insert publisher HTML/styles,
// links, event handlers or resource URLs into the Obsidian document.
export function noteFragment(source: Element, doc: Document): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  const allowed = new Set(['p','br','em','i','strong','b','sub','sup','ul','ol','li','blockquote','code','pre','cite','span','div','table','tbody','tr','td','th']);
  const walk = (node: Node, parent: Node) => {
    if (node.nodeType === 3) { parent.appendChild(doc.createTextNode(node.textContent ?? '')); return; }
    if (node.nodeType !== 1) return;
    const el = node as Element, tag = el.localName.toLowerCase();
    if (['script','style','iframe','object','embed','form','input','button','link','meta','svg'].includes(tag) || tokens(el, 'epub:type').includes('backlink') || tokens(el, 'role').includes('doc-backlink')) return;
    if (tag === 'img') { const alt = el.getAttribute('alt'); if (alt) parent.appendChild(doc.createTextNode(`[${alt}]`)); return; }
    const next = allowed.has(tag) ? doc.createElement(tag) : parent;
    if (next !== parent) parent.appendChild(next);
    for (const child of Array.from(node.childNodes)) walk(child, next);
  };
  walk(source, fragment); return fragment;
}
