const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const key = 'fanfan-youyu-app-v5-android-clean';
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const alerts = [];
    page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.accept(); });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.locator('.onboard-budget input').fill('1000');
    await page.getByRole('button', { name: '开始饭饭有余' }).click();
    await page.locator('.today-hero').waitFor();
    const original = await page.evaluate(key => localStorage.getItem(key), key);
    await page.evaluate(key => localStorage.setItem(key, '{broken'), key);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.recovery-screen').waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{broken');
    const invalid = JSON.parse(original);
    invalid.pools.food = 'not-a-number';
    await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
    await page.waitForTimeout(100);
    assert.ok(alerts.some(message => message.includes('资金池')));
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{broken');
    await page.locator('input[type=file]').setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(original) });
    await page.locator('.today-hero').waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(`${key}-before-restore`), key), '{broken');
    const beforeQuota = await page.evaluate(key => localStorage.getItem(key), key);
    await page.evaluate(key => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('full', 'QuotaExceededError'); return original.call(this, name, value); };
    }, key);
    await page.locator('.meal-item').first().click();
    await page.locator('.transaction-sheet .amount-field input').fill('1');
    await page.locator('.transaction-sheet .text-field input').fill('保存失败演练');
    await page.getByRole('button', { name: '确认记账', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), beforeQuota);
    console.log('PASS: corrupt data preserved, invalid backup rejected, restore snapshot retained, quota failure visible');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
