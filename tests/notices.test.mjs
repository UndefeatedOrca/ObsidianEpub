import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { noticeForPackage } from '../scripts/notices.mjs';

const versions = { isarray: '1.0.0', pako: '1.0.11', 'path-webpack': '0.0.3', 'marks-pane': '1.0.9', jszip: '3.10.2' };
for (const [name, expected] of Object.entries({
  isarray: ['Copyright (c) 2013 Julian Gruber', 'Permission is hereby granted'],
  pako: ['Jean-loup Gailly and Mark Adler', '3. This notice may not be removed', 'Vitaly Puzrin'],
  'path-webpack': ['Copyright Node.js contributors', 'Copyright Joyent, Inc.', 'v7.0.0/LICENSE'],
  'marks-pane': ['Author attribution: Fred Chasen', 'Permission is hereby granted', 'not a verbatim upstream copyright notice'],
  jszip: ['uses JSZip under its MIT license option', 'Copyright (c) 2009-2016 Stuart Knightley']
})) {
  test(`${name}: includes the required collected notice`, async () => {
    const text = await noticeForPackage(`node_modules/${name}`, { version: versions[name] });
    for (const phrase of expected) assert.ok(text.includes(phrase), `Missing ${phrase}`);
    if (name === 'jszip') assert.ok(!text.includes('GNU GENERAL PUBLIC LICENSE'));
  });
}

test('refuses packages without license text and upgrades needing review', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ebook-notices-test-'));
  const file = join(dir, 'package.json');
  try {
    await writeFile(file, JSON.stringify({ name: 'unreviewed-package', version: '1.0.0', license: 'MIT' }));
    await assert.rejects(noticeForPackage(dir, { version: '1.0.0' }), /No license text collected/);
    await writeFile(file, JSON.stringify({ name: 'marks-pane', version: '2.0.0', license: 'MIT', author: 'Fred Chasen' }));
    await assert.rejects(noticeForPackage(dir, { version: '2.0.0' }), /Review special license handling/);
    await assert.rejects(noticeForPackage(dir, { version: '1.0.9' }), /differs from lockfile/);
  } finally { await unlink(file); await rmdir(dir); }
});

test('release ZIP includes the current license, author and complete notices', async () => {
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  const zip = await JSZip.loadAsync(await readFile(`dist/ebook-plus-${manifest.version}.zip`));
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'manifest.json', 'main.js', 'styles.css']) {
    assert.equal(await zip.file(`ebook-plus/${file}`).async('string'), await readFile(file, 'utf8'));
  }
  const notices = await zip.file('ebook-plus/THIRD_PARTY_NOTICES.md').async('string');
  for (const name of Object.keys(versions)) assert.ok(notices.includes(`## ${name} ${versions[name]}`));
  assert.equal(manifest.author, 'UndefeatedOrca');
});
