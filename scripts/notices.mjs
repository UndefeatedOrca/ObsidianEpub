import { readFile, readdir, writeFile } from 'node:fs/promises';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
let text = '# Third-party notices\n\nEbook Plus bundles the following runtime dependencies. PDF++ code is not included.\n';
for (const [dir, pkg] of Object.entries(lock.packages)) {
  if (!dir || pkg.dev) continue;
  const json = JSON.parse(await readFile(`${dir}/package.json`, 'utf8'));
  text += `\n## ${json.name} ${json.version}\n\nLicense: ${json.license || pkg.license || 'See package'}\n`;
  for (const file of (await readdir(dir)).filter(f => /^(licen[cs]e|copying|copyright|notice)(\.|$)/i.test(f))) {
    try { text += `\n${await readFile(`${dir}/${file}`, 'utf8')}\n`; } catch {}
  }
}
await writeFile('THIRD_PARTY_NOTICES.md', text);
