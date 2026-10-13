import { test, expect } from '@playwright/test';
test('plugin UI: annotate, comment, restore, export, embed, rename and undo', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/plugin');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  const frame = page.frameLocator('iframe').first();
  await expect(frame.locator('h1')).toHaveText('A place to begin');
  await frame.locator('#lead').evaluate(el => {
    const r = el.ownerDocument.createRange(); r.setStart(el.firstChild!, 0); r.setEnd(el.firstChild!, el.textContent!.length);
    const selection = el.ownerDocument.defaultView!.getSelection()!; selection.removeAllRanges(); selection.addRange(r);
    el.ownerDocument.dispatchEvent(new Event('selectionchange'));
  });
  await expect(page.locator('.ebook-selection > span')).toContainText('Every idea begins');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await page.getByRole('textbox', { name: 'Passage comment' }).fill('Connect this to my research.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Annotations', exact: true }).click();
  await expect(page.locator('.ebook-card')).toHaveCount(1);
  await expect(page.locator('.ebook-card')).toContainText('Connect this to my research.');
  await expect(page.locator('svg .ebook-highlight')).toHaveCount(1);
  await page.evaluate(() => (window as any).pluginTest.reopen());
  await page.getByRole('button', { name: 'Annotations', exact: true }).click();
  await expect(page.locator('.ebook-card')).toHaveCount(1);
  await expect(page.locator('svg .ebook-highlight')).toHaveCount(1);
  await page.getByRole('button', { name: 'Bookmark', exact: true }).click();
  await expect(page.locator('.ebook-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.notes.length)).toBe(2);
  const note = await page.evaluate(() => (window as any).pluginTest.notes[1]);
  expect(note.body).toContain('Connect this to my research.');
  expect(note.body).toContain('[[Books/Garden.epub#ebook=');
  expect(note.body).toContain('[!EPUB|yellow]');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.notes.length)).toBe(3);
  expect(await page.evaluate(() => (window as any).pluginTest.notes[2].path)).not.toBe(note.path);
  await page.evaluate(() => {
    const t = (window as any).pluginTest; const b = t.view.record;
    t.embed(JSON.stringify({ book: b.id, annotation: b.annotations[0].id }));
    t.file.path = 'Moved/Garden.epub'; t.events.rename(t.file, 'Books/Garden.epub');
  });
  await expect(page.locator('#embed')).toContainText('Every idea begins');
  expect(await page.evaluate(() => (window as any).pluginTest.view.record.path)).toBe('Moved/Garden.epub');
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await expect(page.locator('.ebook-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.ebook-card')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/plugin.png' });
  expect(errors).toEqual([]);
});

test('page controls and scroll mode move real text and preserve saved highlights', async ({ page }) => {
  await page.goto('/plugin');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  const initial = await page.evaluate(() => (window as any).pluginTest.view.record.position);
  await page.getByRole('button', { name: 'Next page →', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.view.record.position)).not.toBe(initial);
  await page.getByRole('button', { name: '← Previous page', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.view.record.position)).toBe(initial);
  await page.getByRole('combobox', { name: 'Reading mode' }).selectOption('scrolled');
  const scroll = page.locator('.ebook-pages .epub-container');
  await expect.poll(() => scroll.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.locator('.ebook-pages').hover();
  await page.mouse.wheel(0, 700);
  await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  const scrolled = await page.evaluate(() => (window as any).pluginTest.view.reader.currentCfi());
  expect(scrolled).not.toBe(initial);
  await page.getByRole('combobox', { name: 'Reading mode' }).selectOption('paginated');
  await expect(page.getByRole('button', { name: 'Next page →' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.view.ready)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.view.record.position)).not.toBe(initial);
  expect(await page.evaluate(() => (window as any).pluginTest.plugin.saved.settings.readingMode)).toBe('paginated');
  expect(scrolled).toContain('epubcfi(');
  await page.screenshot({ path: 'test-results/navigation.png' });
});

test('copy quote saves a colored highlight; native and legacy links navigate back', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/plugin');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.frameLocator('iframe').first().locator('#lead').evaluate(el => {
    const range = el.ownerDocument.createRange(); range.setStart(el.firstChild!, 0); range.setEnd(el.firstChild!, el.textContent!.length);
    const selection = el.ownerDocument.defaultView!.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    el.ownerDocument.dispatchEvent(new Event('selectionchange'));
  });
  await expect(page.locator('.ebook-selection > span')).toContainText('Every idea begins');
  await page.getByRole('combobox', { name: 'Highlight color' }).selectOption('green');
  await page.getByRole('button', { name: 'Copy quote', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.view.record.annotations.length)).toBe(1);
  const markdown = await page.evaluate(() => navigator.clipboard.readText());
  expect(markdown).toContain('> [!EPUB|green] [[Books/Garden.epub#ebook=');
  expect(markdown).toContain('color=green');
  expect(markdown).not.toContain('```');
  await page.getByRole('button', { name: 'Copy quote', exact: true }).click();
  expect(await page.evaluate(() => (window as any).pluginTest.view.record.annotations.length)).toBe(1);
  const href = markdown.match(/\[\[([^|]+)\|/)![1];
  await page.evaluate(href => {
    const link = document.createElement('a'); link.textContent = 'Native passage'; link.href = href; link.dataset.href = href;
    document.querySelector('#embed')!.append(link);
  }, href);
  await page.getByRole('button', { name: '2. Following a thought' }).click();
  await expect(page.frameLocator('iframe').first().locator('h1')).toHaveText('Following a thought');
  await page.getByRole('link', { name: 'Native passage' }).click();
  await expect(page.frameLocator('iframe').first().locator('#lead')).toHaveText('Every idea begins with a small act of attention.');
  await expect(page.locator('svg .ebook-highlight')).toHaveCount(1);
  await page.evaluate(async () => {
    const t = (window as any).pluginTest; const a = t.view.record.annotations[0];
    await t.view.reader.rendition.display('two.xhtml');
    const link = document.createElement('a'); link.textContent = 'Legacy Open passage';
    link.href = 'obsidian://ebook-plus?' + new URLSearchParams({ vault: 'Test Vault', book: t.view.record.id, file: t.file.path, cfi: a.cfi });
    document.querySelector('#embed')!.append(link);
  });
  await page.getByRole('link', { name: 'Legacy Open passage' }).click();
  await expect(page.frameLocator('iframe').first().locator('#lead')).toHaveText('Every idea begins with a small act of attention.');
  // Obsidian can deliver a native link's fragment before asynchronous file load
  // finishes. Exercise the public FileView hook during that exact interval.
  await page.evaluate(async href => {
    const t = (window as any).pluginTest;
    await t.view.reader.rendition.display('two.xhtml');
    const opening = t.view.onLoadFile(t.file);
    t.view.setEphemeralState({ subpath: '#' + href.split('#')[1] });
    await opening;
  }, href);
  await expect(page.frameLocator('iframe').first().locator('#lead')).toHaveText('Every idea begins with a small act of attention.');
  const color = await page.evaluate(() => (window as any).pluginTest.view.record.annotations[0].color);
  expect(color).toBe('green');
});

test('external protocol opening waits for a deferred reader before navigating', async ({ page }) => {
  await page.goto('/plugin');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(async () => {
    const t = (window as any).pluginTest;
    const hits = await t.view.reader.search('living conversation', () => false);
    const leaf = t.view.leaf;
    t.plugin.app.workspace.getLeavesOfType = () => [];
    leaf.view = {};
    leaf.openFile = async () => {
      // Model a deferred Obsidian leaf: openFile resolves before view loading.
      const original = t.view.app.vault.readBinary;
      t.view.app.vault.readBinary = async () => { await new Promise(r => setTimeout(r, 150)); return original(); };
      void t.view.onLoadFile(t.file);
    };
    leaf.loadIfDeferred = async () => { leaf.view = t.view; };
    t.plugin.handlers['ebook-plus']({ vault: 'Test Vault', file: t.file.path, book: t.view.record.id, cfi: hits[0].cfi });
  });
  await expect(page.frameLocator('iframe').first().locator('#lead')).toHaveText('Connections turn a collection of notes into a living conversation.');
  await expect(page.locator('#notices')).not.toContainText('not ready');
});
