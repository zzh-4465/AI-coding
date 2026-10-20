const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(8000);
    page.on('dialog', dialog => dialog.accept('测试归档'));
    await page.goto(process.env.APP_URL || 'http://localhost:5173');
    await page.locator('.onboard-budget input').fill('1800');
    await page.getByRole('button', { name: '开始饭饭有余', exact: true }).click();
    await page.evaluate(() => {
      const key = 'fanfan-youyu-app-v5-android-clean', data = JSON.parse(localStorage.getItem(key));
      data.wishes = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, title: `测试愿望${index + 1}`, icon: '🎁', condition: '测试', target: 500, locked: index === 0 ? 20 : 0 }));
      data.wishReserve = 30;
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload(); await page.getByRole('button', { name: '愿望', exact: true }).click();
    const client = await page.context().newCDPSession(page);
    const swipe = async (card, dx, dy = 0) => {
      const box = await card.boundingBox();
      const x = dx < 0 ? box.x + box.width - 20 : Math.max(35, box.x + 100), y = box.y + box.height / 2;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step / 8, y: y + dy * step / 8 }] });
        await page.waitForTimeout(25);
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(250);
    };
    const first = page.locator('.wish-card').first();
    await swipe(first, -130);
    await page.waitForTimeout(250);
    assert.match(await first.getAttribute('class'), /revealed/);
    assert.equal(await page.locator('.sheet-backdrop').count(), 0, 'swipe must not open wish details');
    await swipe(first, 100);
    assert.doesNotMatch(await first.getAttribute('class'), /revealed/);
    await swipe(first, -120);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.wish-card')).transform === 'matrix(1, 0, 0, 1, -116, 0)');
    await page.locator('.wish-swipe-wrap').first().getByRole('button', { name: '归档愿望' }).tap();
    await page.locator('.archived-wishes').getByText('测试愿望1', { exact: true }).waitFor();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fanfan-youyu-app-v5-android-clean')));
    assert.equal(saved.wishReserve, 50, 'archiving returns locked money to reserve');
    await swipe(page.locator('.wish-card').first(), -120);
    await page.locator('.wish-swipe-wrap').first().getByRole('button', { name: '删除愿望' }).tap();
    await page.getByRole('button', { name: '确认删除', exact: true }).tap();
    assert.equal(await page.locator('.wish-card').count(), 8);
    await page.locator('.wish-main').first().tap();
    await page.locator('.wish-editor').waitFor();
    await page.evaluate(() => window.fanfanGoBack());
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await swipe(page.locator('.wish-card').nth(1), 0, -100);
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(() => window.scrollY) > scrollBefore, 'vertical swipe must still scroll');
    assert.equal(await page.locator('.wish-card.revealed').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: real touch reveal/close, no accidental detail opening, archive refund, delete confirmation, tap and vertical scrolling');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
