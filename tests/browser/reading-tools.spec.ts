import { test, expect } from '@playwright/test';

test('footnotes preview locally, across chapters and outside the spine without navigating', async ({ page }) => {
  const errors: string[] = [], remote: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().includes('example.invalid')) remote.push(r.url()); });
  await page.goto('/plugin'); await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  const frame = page.frameLocator('iframe').first();
  const initial = await page.evaluate(() => (window as any).pluginTest.view.reader.currentCfi());
  const bubble = page.getByRole('dialog', { name: 'Book footnote' });
  await frame.locator('#same-note').hover();
  await expect(bubble).toContainText('A local footnote.');
  await expect(bubble.locator('em')).toHaveText('local');
  await expect(bubble).toContainText('Second paragraph.');
  await expect(bubble).not.toContainText('Return');
  await page.mouse.move(10, 10); await expect(bubble).toHaveCount(0);
  for (const [id, text] of [['same-note','A local footnote.'],['cross-note','A cross-chapter endnote.'],['archive-note','A note outside the reading spine.'],['legacy-note','A legacy footnote.'],['missing-note','could not be found']]) {
    await frame.locator('#' + id).click();
    await expect(bubble).toContainText(text);
    await expect(bubble.locator('script,img,iframe,a,style')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).pluginTest.view.reader.currentCfi())).toBe(initial);
    await page.getByRole('button', { name: 'Close footnote' }).click();
    await expect(bubble).toHaveCount(0);
  }
  await frame.locator('#same-note').focus(); await page.keyboard.press('Enter');
  await expect(bubble).toContainText('A local footnote.');
  await page.keyboard.press('Escape'); await expect(bubble).toHaveCount(0);
  await expect(frame.locator('#same-note')).toBeFocused();
  await frame.locator('#ordinary-link').click();
  await expect(frame.locator('h1')).toHaveText('Following a thought');
  expect(errors).toEqual([]); expect(remote).toEqual([]);
  expect(await page.evaluate(() => (window as any).BAD_NOTE)).toBeUndefined();
});

test('typography applies, persists across chapters/reopen, and resets publisher styling', async ({ page }) => {
  await page.goto('/plugin'); await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Typography', exact: true }).click();
  await page.getByRole('combobox', { name: 'Font family', exact: true }).selectOption('sans');
  await page.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('130');
  await page.getByRole('combobox', { name: 'Line spacing', exact: true }).selectOption('2');
  await page.getByRole('combobox', { name: 'Paragraph spacing', exact: true }).selectOption('1.5');
  await page.getByRole('combobox', { name: 'Side margins', exact: true }).selectOption('24');
  await page.getByRole('combobox', { name: 'Maximum text width', exact: true }).selectOption('640');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const frame = page.frameLocator('iframe').first();
  const verify = async () => {
    await expect(frame.locator('#lead')).toHaveCSS('font-family', 'Arial, sans-serif');
    await expect(frame.locator('body')).toHaveCSS('max-width', '640px');
    await expect(frame.locator('body')).toHaveCSS('padding-left', '24px');
    const values = await frame.locator('#lead').evaluate(el => { const css = getComputedStyle(el); return { line: parseFloat(css.lineHeight) / parseFloat(css.fontSize), margin: parseFloat(css.marginBottom) / parseFloat(css.fontSize) }; });
    expect(values.line).toBeCloseTo(2, 1); expect(values.margin).toBeCloseTo(1.5, 1);
  };
  await verify();
  await page.getByRole('button', { name: '2. Following a thought' }).click(); await verify();
  await page.evaluate(() => (window as any).pluginTest.reopen()); await verify();
  expect(await page.evaluate(() => (window as any).pluginTest.plugin.saved.settings.fontFamily)).toBe('sans');
  await page.getByRole('button', { name: 'Typography', exact: true }).click();
  await page.getByRole('button', { name: 'Reset typography', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(frame.locator('#lead')).toHaveCSS('font-family', 'Georgia, serif');
  await expect(frame.locator('body')).not.toHaveCSS('max-width', '640px');
});

test('typography reflow retains the top passage while changing width, spacing and font', async ({ page }) => {
  await page.goto('/plugin'); await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('combobox', { name: 'Reading mode' }).selectOption('scrolled');
  await expect.poll(() => page.evaluate(() => (window as any).pluginTest.view.ready)).toBe(true);
  await page.evaluate(() => {
    const el = document.querySelector('.epub-container')!, frame = document.querySelector('iframe')!;
    const p = frame.contentDocument!.querySelectorAll('p')[4];
    const range = frame.contentDocument!.createRange(); range.setStart(p.firstChild!, 0); range.setEnd(p.firstChild!, 1);
    (window as any).typeAnchor = { range, frame };
    el.scrollTop += range.getBoundingClientRect().top + frame.getBoundingClientRect().top - el.getBoundingClientRect().top - 2;
  });
  await page.getByRole('button', { name: 'Typography', exact: true }).click();
  for (const [name, value] of [['Font family','sans'],['Line spacing','2'],['Paragraph spacing','1.5'],['Side margins','40'],['Maximum text width','640']]) {
    await page.getByRole('combobox', { name, exact: true }).selectOption(value);
    await page.waitForTimeout(350);
    const offset = await page.evaluate(() => {
      const { range, frame } = (window as any).typeAnchor;
      return range.getBoundingClientRect().top + frame.getBoundingClientRect().top - document.querySelector('.epub-container')!.getBoundingClientRect().top;
    });
    expect(Math.abs(offset - 2)).toBeLessThan(2);
  }
});
