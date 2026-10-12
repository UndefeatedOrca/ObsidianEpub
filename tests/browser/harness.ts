import { Reader } from '../../src/reader';
import { Annotation } from '../../src/model';
const host = document.querySelector('#reader') as HTMLElement;
const state = { selected: undefined as { cfi: string; text: string } | undefined, position: '', label: '' };
let reader: Reader;
async function open(position?: string) {
  reader?.destroy();
  reader = new Reader(await (await fetch('/book.epub')).arrayBuffer());
  await reader.mount(host, {
    selected: (cfi, text) => { state.selected = { cfi, text }; },
    relocated: (cfi, label) => { state.position = cfi; state.label = label; },
    keydown: () => {}
  }, position);
  reader.style('sepia', 110);
}
Object.assign(window, {
  testReader: {
    open, state,
    search: (query: string) => reader.search(query, () => false),
    go: (cfi: string) => reader.rendition!.display(cfi),
    highlight: (a: Annotation) => reader.highlight(a, () => {}),
    remove: (a: Annotation) => reader.remove(a),
    textAt: async (cfi: string) => (await reader.book.getRange(cfi)).toString(),
    next: () => reader.rendition!.next(),
    style: () => reader.style('dark', 140),
    malformed: async () => {
      const invalid = new Reader(new TextEncoder().encode('not an EPUB').buffer);
      try { await invalid.mount(document.createElement('div'), { selected() {}, relocated() {}, keydown() {} }); return 'unexpected success'; }
      catch (e) { return String(e); }
      finally { invalid.destroy(); }
    }
  }
});
void open().then(() => { document.body.dataset.ready = 'true'; }).catch(error => { document.body.dataset.error = String(error); });
