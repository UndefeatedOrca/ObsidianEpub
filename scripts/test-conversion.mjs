import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import JSZip from 'jszip';
await mkdir('.conversion-results', { recursive: true });
await build({ entryPoints: ['src/convert.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: '.conversion-results/convert.cjs' });
const { convertBook } = await import('../.conversion-results/convert.cjs');
const executable = process.env.CALIBRE_PATH || 'ebook-convert';
for (const format of ['mobi', 'azw3']) {
  const source = path.resolve(`.conversion-results/Garden & ideas.${format}`);
  await promisify(execFile)(executable, [path.resolve('tests/fixtures/garden.epub'), source], { windowsHide: true, timeout: 180000 });
  const bytes = await convertBook(source, format, executable);
  const zip = await JSZip.loadAsync(bytes);
  if (await zip.file('mimetype')?.async('string') !== 'application/epub+zip') throw new Error(`Invalid converted ${format}`);
  await writeFile(`.conversion-results/from-${format}.epub`, Buffer.from(bytes));
  console.log(`${format.toUpperCase()} → EPUB passed (${bytes.byteLength} bytes)`);
}
try { await convertBook('/no-file.txt', 'txt', executable); throw new Error('Expected rejection'); }
catch (e) { if (!e.message.includes('Unsupported')) throw e; }
console.log('Unsupported format rejection passed.');
