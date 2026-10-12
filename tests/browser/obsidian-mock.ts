// Minimal public-API adapter for browser integration tests. This does not replace
// testing in the Obsidian desktop/mobile hosts; it exercises our complete UI.
function create(this: HTMLElement, tag: string, options: any = {}) {
  if (typeof options === 'string') options = { cls: options };
  const el = document.createElement(tag);
  if (options.cls) el.className = options.cls;
  if (options.text) el.textContent = options.text;
  for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, String(value));
  for (const key of ['type', 'value', 'href', 'placeholder']) if (options[key]) el.setAttribute(key, options[key]);
  this.append(el); return el;
}
Object.assign(HTMLElement.prototype, {
  createEl: create,
  createDiv(this: HTMLElement, options: any) { return create.call(this, 'div', options); },
  createSpan(this: HTMLElement, options: any) { return create.call(this, 'span', options); },
  empty(this: HTMLElement) { this.replaceChildren(); },
  addClass(this: HTMLElement, ...classes: string[]) { this.classList.add(...classes); },
  setText(this: HTMLElement, text: string) { this.textContent = text; }
});
export class TFile {
  extension: string; basename: string; name: string;
  constructor(public path: string) { this.name = path.split('/').pop()!; this.extension = this.name.split('.').pop()!; this.basename = this.name.replace(/\.[^.]+$/, ''); }
}
export const Platform = { isDesktopApp: true };
export const normalizePath = (s: string) => s.replace(/\\/g, '/');
export class Plugin {
  app: any;
  saved: any;
  handlers: Record<string, Function> = {};
  commands: any[] = [];
  constructor(app: any) { this.app = app; }
  loadData() { return this.saved; }
  async saveData(data: any) { this.saved = structuredClone(data); }
  registerView(_name: string, _factory: any) {}
  registerExtensions() {}
  addSettingTab() {}
  registerObsidianProtocolHandler(name: string, handler: Function) { this.handlers[name] = handler; }
  registerEvent() {}
  registerDomEvent(el: EventTarget, type: string, fn: EventListener, options?: boolean) { el.addEventListener(type, fn, options); }
  addCommand(command: any) { this.commands.push(command); }
  registerMarkdownCodeBlockProcessor(name: string, handler: Function) { this.handlers[name] = handler; }
}
export class FileView {
  app: any; contentEl: HTMLElement; file?: TFile;
  constructor(public leaf: any) { this.app = leaf.app; this.contentEl = document.querySelector('#plugin')!; }
  registerDomEvent(el: EventTarget, type: string, fn: EventListener, options?: boolean) { el.addEventListener(type, fn, options); }
  setEphemeralState() {}
}
export class MarkdownView {}
export class WorkspaceLeaf {}
export class Modal {
  containerEl = document.createElement('dialog');
  titleEl = document.createElement('h2');
  contentEl = document.createElement('div');
  constructor(public app: any) { this.containerEl.append(this.titleEl, this.contentEl); }
  open() { document.body.append(this.containerEl); this.onOpen(); this.containerEl.showModal(); }
  close() { this.containerEl.close(); this.containerEl.remove(); this.onClose(); }
  onOpen() {}
  onClose() {}
}
export class Notice {
  el = document.createElement('div');
  constructor(text: string) { this.el.textContent = text; document.querySelector('#notices')!.append(this.el); }
  hide() { this.el.remove(); }
  setMessage(content: Node) { this.el.replaceChildren(content); }
}
export class PluginSettingTab {}
export class Setting {}
