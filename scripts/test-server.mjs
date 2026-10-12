import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
await build({ entryPoints: ['tests/browser/harness.ts'], bundle: true, outfile: 'tests/browser/.build.js', format: 'iife', platform: 'browser' });
await build({ entryPoints: ['tests/browser/plugin-harness.ts'], bundle: true, outfile: 'tests/browser/.plugin.js', format: 'iife', platform: 'browser', alias: { obsidian: './tests/browser/obsidian-mock.ts' }, external: ['child_process', 'fs/promises', 'os', 'path'] });
const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Ebook Plus reader test</title></head><body style="margin:0;background:#f6f0e3"><div id="reader" style="width:900px;height:650px"></div><script src="/bundle.js"></script></body></html>`;
http.createServer(async (req, res) => {
  const files = { '/bundle.js': ['tests/browser/.build.js', 'text/javascript'], '/plugin.js': ['tests/browser/.plugin.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/book.epub': ['tests/fixtures/garden.epub', 'application/epub+zip'] };
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
  if (req.url === '/plugin') {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><html><head><meta charset="utf-8"/><link rel="stylesheet" href="/styles.css"/><style>:root{font-family:system-ui;--background-secondary:#f3f2ef;--background-modifier-border:#ddd9d2;--text-muted:#70695f;--background-modifier-hover:#ece7df}body{margin:0;color:#332e27}button,select,input{font:inherit;border:1px solid #dedbd5;border-radius:5px;padding:5px 9px;background:white;color:inherit;cursor:pointer}#plugin{height:760px;width:1100px}dialog{border:1px solid #ddd;border-radius:12px;padding:24px}</style></head><body><div id="plugin"></div><div id="notices"></div><div id="embed"></div><script src="/plugin.js"></script></body></html>`); return;
  }
  const file = files[req.url];
  if (!file) { res.writeHead(404); res.end(); return; }
  try { res.setHeader('Content-Type', file[1]); res.end(await readFile(file[0])); }
  catch { res.writeHead(500); res.end(); }
}).listen(4173, '127.0.0.1');
