import { readFile, readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const reviewedVersions = { isarray: '1.0.0', pako: '1.0.11', 'path-webpack': '0.0.3', 'marks-pane': '1.0.9', jszip: '3.10.2', '@types/localforage': '0.0.34' };
const supplemental = name => new URL(`../licenses/${name}`, import.meta.url);
const normalize = text => text.replace(/\r\n/g, '\n').trim();

export async function noticeForPackage(dir, pkg) {
  const json = JSON.parse(await readFile(`${dir}/package.json`, 'utf8'));
  if (json.version !== pkg.version) throw new Error(`Installed version differs from lockfile: ${json.name}`);
  if (reviewedVersions[json.name] && reviewedVersions[json.name] !== json.version) {
    throw new Error(`Review special license handling for ${json.name}@${json.version} before packaging.`);
  }
  // A dependency stub with no runtime code or type declarations to bundle.
  if (json.name === '@types/localforage') return '';
  let text = `\n## ${json.name} ${json.version}\n\nLicense: ${json.license || pkg.license || 'See package'}\n`;
  const notices = [];
  if (json.name === 'jszip') {
    const source = normalize(await readFile(`${dir}/LICENSE.markdown`, 'utf8'));
    const start = source.indexOf('The MIT License\n');
    const end = source.indexOf('\nGPL version 3\n');
    if (start < 0 || end <= start) throw new Error('JSZip license format changed; review required.');
    text += '\nEbook Plus uses JSZip under its MIT license option, not its alternative GPL license.\n';
    notices.push(source.slice(start, end));
  } else {
    const files = (await readdir(dir, { withFileTypes: true }))
      .filter(f => f.isFile() && /^(licen[cs]e|copying|copyright|notice)(\.|$)/i.test(f.name))
      .map(f => f.name).sort();
    for (const file of files) notices.push(await readFile(`${dir}/${file}`, 'utf8'));
  }
  if (json.name === 'isarray') {
    const readme = normalize(await readFile(`${dir}/README.md`, 'utf8'));
    const section = readme.match(/^## License\n([\s\S]+)$/m);
    if (!section) throw new Error('isarray README license section not found.');
    notices.push(section[1]);
  }
  if (json.name === 'pako') {
    const source = normalize(await readFile(`${dir}/lib/zlib/deflate.js`, 'utf8'));
    const header = source.match(/\/\/ \(C\) 1995-2013[\s\S]+?\/\/ 3\. This notice may not be removed or altered from any source distribution\./);
    if (!header) throw new Error('pako embedded zlib notice not found.');
    notices.push('Embedded zlib implementation (from lib/zlib/deflate.js):\n\n' + header[0].replace(/^\/\/ ?/gm, ''));
  }
  if (json.name === 'path-webpack') notices.push(await readFile(supplemental('path-webpack-NOTICE.txt'), 'utf8'));
  if (json.name === 'marks-pane') {
    if (json.license !== 'MIT' || json.author !== 'Fred Chasen') throw new Error('marks-pane license metadata changed; review required.');
    notices.push(await readFile(supplemental('marks-pane-NOTICE.txt'), 'utf8'));
  }
  if (!notices.length) throw new Error(`No license text collected for ${json.name}@${json.version}; add a reviewed notice before packaging.`);
  return text + '\n' + notices.map(normalize).join('\n\n') + '\n';
}

export async function generateNotices() {
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  let text = '# Third-party notices\n\nNotices for the production dependency tree used by Ebook Plus (some dependencies may be removed during bundling). Each dependency retains its own license; the root MIT license covers Ebook Plus code. PDF++ code and Calibre binaries are not included. JSZip is used under its MIT option. The @types/localforage metadata-only stub is excluded because it contributes no bundled code.\n';
  for (const [dir, pkg] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (!dir || pkg.dev) continue;
    text += await noticeForPackage(dir, pkg);
  }
  await writeFile('THIRD_PARTY_NOTICES.md', text);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await generateNotices();
