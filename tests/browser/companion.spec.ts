import { test, expect } from '@playwright/test';

test('companion Markdown is authoritative, editable, and opens at the annotation', async ({ page }) => {
  await page.goto('/plugin');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.frameLocator('iframe').first().locator('#lead').evaluate(el => {
    const range = el.ownerDocument.createRange(); range.setStart(el.firstChild!, 0); range.setEnd(el.firstChild!, el.textContent!.length);
    const sel = el.ownerDocument.defaultView!.getSelection()!; sel.removeAllRanges(); sel.addRange(range);
    el.ownerDocument.dispatchEvent(new Event('selectionchange'));
  });
  await expect(page.locator('.ebook-selection > span')).toContainText('Every idea begins');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await page.getByRole('textbox', { name: 'Passage comment' }).fill('Reader comment.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.notes[0].body)).toContain('Reader comment.');
  const state = await page.evaluate(() => {
    const t = (window as any).pluginTest;
    return { note: t.notes[0], json: t.plugin.saved.books[t.view.record.id] };
  });
  expect(state.note.path).toBe('Books/Garden.md');
  expect(state.note.body).toContain('> > Every idea begins');
  expect(state.json.annotations).toEqual([]);
  await page.evaluate(() => {
    const t = (window as any).pluginTest;
    t.notes[0].body = t.notes[0].body.replace('Reader comment.', 'Changed in Markdown.').replace('[!EPUB|yellow]', '[!EPUB|pink]') + '\nPersonal prose stays here.\n';
    t.events.modify(t.plugin.app.vault.getAbstractFileByPath(t.notes[0].path));
  });
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.view.record.annotations[0].comment)).toBe('Changed in Markdown.');
  expect(await page.evaluate(() => (window as any).pluginTest.view.record.annotations[0].color)).toBe('pink');
  await page.getByRole('button', { name: 'Annotations', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Edit annotation comment' }).fill('Back from reader.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.notes[0].body)).toContain('Back from reader.');
  expect(await page.evaluate(() => (window as any).pluginTest.notes[0].body)).toContain('Personal prose stays here.');
  await page.evaluate(async () => {
    const t = (window as any).pluginTest;
    t.view.leaf.openFile = async (file: any, options: any) => { t.opened = { path: file.path, line: options.eState.line }; };
    await t.plugin.openBookNote(t.view.record, t.view.record.annotations[0]);
  });
  const opened = await page.evaluate(() => (window as any).pluginTest.opened);
  expect(opened.path).toBe('Books/Garden.md'); expect(opened.line).toBeGreaterThan(4);
  await page.evaluate(async () => {
    const t = (window as any).pluginTest;
    t.notes[0].body = t.notes[0].body.replace(/<!-- ebook-annotation:[\s\S]*?<!-- \/ebook-annotation -->/, '');
    t.events.modify(t.plugin.app.vault.getAbstractFileByPath(t.notes[0].path));
  });
  await expect(page.locator('svg .ebook-highlight')).toHaveCount(0);
  await page.evaluate(() => (window as any).pluginTest.reopen());
  expect(await page.evaluate(() => (window as any).pluginTest.view.record.annotations)).toEqual([]);
});

test('existing same-title notes are preserved and renaming the companion retains association', async ({ page }) => {
  await page.goto('/plugin');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  const result = await page.evaluate(async () => {
    const t = (window as any).pluginTest;
    await t.plugin.app.vault.create('Books/Other.md', 'Unrelated personal note.');
    const book = { id: 'another-book', path: 'Books/Other.epub', annotations: [] };
    t.plugin.data.books[book.id] = book;
    await t.plugin.loadAnnotations(book);
    return { path: (book as any).notePath, original: t.notes.find((n: any) => n.path === 'Books/Other.md').body };
  });
  expect(result.original).toBe('Unrelated personal note.');
  expect(result.path).toBe('Books/Other - annotations 2.md');
  await page.evaluate(async () => {
    const t = (window as any).pluginTest;
    const note = t.plugin.app.vault.getAbstractFileByPath(t.view.record.notePath);
    await t.plugin.app.vault.rename(note, 'Books/My reading notes.md');
    await t.reopen();
  });
  expect(await page.evaluate(() => (window as any).pluginTest.view.record.notePath)).toBe('Books/My reading notes.md');
  const opened = await page.evaluate(async () => {
    const t = (window as any).pluginTest;
    t.plugin.app.workspace.getActiveFile = () => t.plugin.app.vault.getAbstractFileByPath(t.view.record.notePath);
    t.view.leaf.openFile = async (file: any) => { t.openedPath = file.path; };
    await t.plugin.switchCompanion();
    return t.openedPath;
  });
  expect(opened).toBe('Books/Garden.epub');
});
