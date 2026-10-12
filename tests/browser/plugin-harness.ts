import EbookPlus, { EbookView } from '../../src/main';
import { TFile } from './obsidian-mock';
const file = new TFile('Books/Garden.epub');
const files = new Map<string, any>([[file.path, file]]);
const notes: { path: string; body: string }[] = [];
const events: Record<string, Function> = {};
const app: any = {
  vault: {
    getName: () => 'Test Vault',
    readBinary: async () => (await fetch('/book.epub')).arrayBuffer(),
    getAbstractFileByPath: (path: string) => files.get(path),
    on: (name: string, fn: Function) => { events[name] = fn; },
    createFolder: async (path: string) => { files.set(path, { path }); },
    create: async (path: string, body: string) => { const f = new TFile(path); files.set(path, f); notes.push({ path, body }); return f; }
  },
  workspace: {
    on: () => {},
    getLeavesOfType: (type: string) => type === 'ebook-plus-reader' ? [leaf] : [],
    getLeaf: () => ({ openFile: async () => {} }),
    getActiveViewOfType: () => view
  }
};
const leaf: any = { app };
const plugin = new EbookPlus(app, {} as any);
const view = new EbookView(leaf, plugin); leaf.view = view; view.file = file as any;
async function boot() { await plugin.onload(); await view.onLoadFile(file as any); document.body.dataset.ready = 'true'; }
Object.assign(window, { pluginTest: {
  plugin, view, notes, events, file,
  reopen: async () => { await view.onUnloadFile(); await view.onLoadFile(file as any); },
  embed: (source: string) => { const el = document.querySelector('#embed')!; (plugin as any).handlers.ebook(source, el); }
} });
void boot().catch(e => { document.body.dataset.error = String(e); });
