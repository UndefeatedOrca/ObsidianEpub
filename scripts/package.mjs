import { mkdir, copyFile, readFile } from 'node:fs/promises';
import JSZip from 'jszip';
await mkdir('dist/ebook-plus', { recursive: true });
const zip = new JSZip();
for (const file of ['main.js', 'manifest.json', 'styles.css', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await copyFile(file, `dist/ebook-plus/${file}`);
  zip.file(`ebook-plus/${file}`, await readFile(file));
}
const { writeFile } = await import('node:fs/promises');
await writeFile('dist/ebook-plus-0.1.0.zip', await zip.generateAsync({ type: 'nodebuffer' }));
console.log('Packaged dist/ebook-plus and dist/ebook-plus-0.1.0.zip');
