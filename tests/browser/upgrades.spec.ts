import { test, expect } from '@playwright/test';

for (const mode of ['paginated', 'scrolled']) test(`zoom preserves the top passage in ${mode} mode`, async ({ page }) => {
  await page.goto('/plugin');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  if (mode === 'scrolled') await page.getByRole('combobox', { name: 'Reading mode' }).selectOption(mode);
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.view.ready)).toBe(true);
  await page.evaluate(() => {
    const scroller = document.querySelector('.epub-container')!;
    const frame = document.querySelector('iframe')!;
    const p = frame.contentDocument!.querySelectorAll('p')[4];
    const r = frame.contentDocument!.createRange(); r.setStart(p.firstChild!, 0); r.setEnd(p.firstChild!, 1);
    (window as any).anchor = { r, frame };
    scroller.scrollTop += r.getBoundingClientRect().top + frame.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 2;
  });
  const offset = () => page.evaluate(() => {
    const { r, frame } = (window as any).anchor;
    return r.getBoundingClientRect().top + frame.getBoundingClientRect().top - document.querySelector('.epub-container')!.getBoundingClientRect().top;
  });
  await expect.poll(offset).toBeCloseTo(2, 0);
  for (const name of ['A+', 'A+', 'A−']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(350);
    expect(Math.abs(await offset() - 2)).toBeLessThan(2);
  }
  await page.waitForTimeout(700);
  expect(Math.abs(await offset() - 2)).toBeLessThan(2);
});

test('highlight hover/click bubble, sidebar focus, and note backlink navigation', async ({ page }) => {
  await page.goto('/plugin');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(async () => {
    const t = (window as any).pluginTest;
    const contents = t.view.reader.rendition.getContents()[0];
    const p = contents.document.querySelector('#lead');
    const range = contents.document.createRange(); range.setStart(p.firstChild!, 0); range.setEnd(p.firstChild!, p.textContent.length);
    const a = { id: 'bubble-test', cfi: contents.cfiFromRange(range), text: p.textContent, comment: 'A saved personal comment.', color: 'green', kind: 'highlight', created: '2026-10-12' };
    t.view.record.annotations = Array.from({ length: 15 }, (_, i) => ({ ...a, id: 'bookmark-' + i, kind: 'bookmark', text: 'Earlier bookmark ' + i })).concat(a);
    t.view.syncAnnotations();
    await t.plugin.app.vault.create('Research.md', 'A note\n\n[[Books/Garden.epub#ebook=' + t.view.record.id + '&annotation=bubble-test|My source]]');
    t.view.leaf.openFile = async (file: any, options: any) => { t.openedNote = { path: file.path, options }; };
  });
  const lead = page.frameLocator('iframe').first().locator('#lead');
  await lead.hover({ position: { x: 15, y: 15 } });
  const bubble = page.getByRole('dialog', { name: 'Ebook annotation' });
  await expect(bubble).toContainText('A saved personal comment.');
  await expect(bubble).toContainText('Linked mentions (1)');
  await page.mouse.move(10, 10);
  await expect(bubble).toHaveCount(0);
  await lead.click({ position: { x: 15, y: 15 } });
  await expect(bubble).toBeVisible();
  await bubble.getByRole('button', { name: 'Show in list' }).click();
  await expect(page.locator('.ebook-card-active')).toContainText('Every idea begins');
  const inside = await page.locator('.ebook-card-active').evaluate(el => {
    const panel = el.parentElement!.getBoundingClientRect(); const r = el.getBoundingClientRect();
    return r.top >= panel.top && r.top < panel.bottom;
  });
  expect(inside).toBe(true);
  await bubble.getByRole('button', { name: 'Research.md · line 3' }).click();
  expect(await page.evaluate(() => (window as any).pluginTest.openedNote)).toEqual({ path: 'Research.md', options: { eState: { line: 2 } } });
  await lead.click({ position: { x: 15, y: 15 } });
  await expect(bubble).toBeVisible();
  await page.frameLocator('iframe').first().locator('body').press('Escape');
  await expect(bubble).toHaveCount(0);
});

test('callout colors render distinctly under old and new theme conventions', async ({ page }) => {
  await page.goto('/plugin');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  for (const themeColor of ['rgb(var(--callout-color))', 'var(--callout-color)']) {
    const colors = await page.evaluate(themeColor => {
      const style = document.createElement('style'); style.textContent = `.callout { background-color: ${themeColor}; }`; document.head.append(style);
      const colors = ['yellow', 'green', 'blue', 'pink', 'purple'].map(color => {
        const el = document.createElement('div'); el.className = 'callout'; el.dataset.callout = 'epub'; el.dataset.calloutMetadata = color;
        document.body.append(el); const result = getComputedStyle(el).backgroundColor; el.remove(); return result;
      }); style.remove(); return colors;
    }, themeColor);
    expect(new Set(colors).size).toBe(5);
    expect(colors.every(color => color !== 'rgba(0, 0, 0, 0)')).toBe(true);
  }
});

test('scroll does not snap back after idle or selection toolbar updates', async ({ page }) => {
  await page.goto('/plugin');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('combobox', { name: 'Reading mode' }).selectOption('scrolled');
  const scroller = page.locator('.epub-container');
  await expect.poll(() => scroller.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  let previous = 0;
  for (let i = 0; i < 3; i++) {
    await page.locator('.ebook-pages').hover(); await page.mouse.wheel(0, 280); await page.waitForTimeout(250);
    const current = await scroller.evaluate(el => el.scrollTop);
    expect(current).toBeGreaterThan(previous + 100);
    await page.waitForTimeout(700);
    expect(await scroller.evaluate(el => el.scrollTop)).toBeCloseTo(current, 0);
    previous = current;
  }
  const height = await page.locator('.ebook-pages').evaluate(el => el.clientHeight);
  await page.frameLocator('iframe').first().locator('p').nth(4).evaluate(el => {
    const range = el.ownerDocument.createRange(); range.selectNodeContents(el);
    const selection = el.ownerDocument.defaultView!.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    el.ownerDocument.dispatchEvent(new Event('selectionchange'));
  });
  await page.waitForTimeout(700);
  expect(await page.locator('.ebook-pages').evaluate(el => el.clientHeight)).toBe(height);
  expect(await scroller.evaluate(el => el.scrollTop)).toBeCloseTo(previous, 0);
});

test('page controls cross chapter boundaries in both directions', async ({ page }) => {
  await page.goto('/plugin');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.evaluate(() => { const el = document.querySelector('.epub-container')!; el.scrollTop = el.scrollHeight; });
  await page.getByRole('button', { name: 'Next page →' }).click();
  await expect(page.frameLocator('iframe').first().locator('h1')).toHaveText('Following a thought');
  await page.getByRole('button', { name: '← Previous page' }).click();
  await expect(page.frameLocator('iframe').first().locator('h1')).toHaveText('A place to begin');
  expect(await page.locator('.epub-container').evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2);
});

test('user scrolling during zoom cancels delayed anchor restoration', async ({ page }) => {
  await page.goto('/plugin');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('combobox', { name: 'Reading mode' }).selectOption('scrolled');
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.view.ready)).toBe(true);
  const position = await page.evaluate(async () => {
    const t = (window as any).pluginTest; const el = document.querySelector('.epub-container')!;
    el.scrollTop = 450;
    const styling = t.view.reader.restyle('sepia', 150);
    await new Promise(resolve => setTimeout(resolve, 40));
    // A wheel input is delivered to the EPUB document while reflow settles.
    document.querySelector('iframe')!.contentDocument!.dispatchEvent(new WheelEvent('wheel', { deltaY: 200 }));
    el.scrollTop += 200;
    const intended = el.scrollTop;
    await styling;
    return { intended, actual: el.scrollTop };
  });
  expect(position.actual).toBeCloseTo(position.intended, 0);
});
