const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.APP_URL || 'http://localhost:5173');
    await page.locator('.onboard-budget input').fill('2000'); await page.getByRole('button', { name: '开始饭饭有余', exact: true }).click();
    const pet = page.locator('.global-pet-button'); const beforePosition = await pet.boundingBox();
    await pet.hover(); await page.mouse.down(); await page.mouse.move(beforePosition.x - 120, beforePosition.y - 130, { steps: 8 }); await page.mouse.up();
    assert.equal(await page.locator('.sheet-backdrop').count(), 0, 'drag must not open a sheet');
    const afterPosition = await pet.boundingBox(); assert.ok(afterPosition.x < beforePosition.x - 40);
    await page.reload(); const savedPosition = await pet.boundingBox(); assert.ok(Math.abs(savedPosition.x - afterPosition.x) < 2);
    await pet.click(); await page.getByRole('button', { name: /一句话记账和图片记账/ }).click();
    assert.equal(await page.locator('.voice-capture').count(), 0);
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('fanfan-youyu-app-v5-android-clean')));
    await page.route('**/api/ai/parse', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ events: [
      { intent: 'expense', amount: 15, pool: 'food', meal: 'lunch', note: '午饭' },
      { intent: 'create_wish', title: '耳机', amount: 600 },
      { intent: 'fund_wish', wishTitle: '耳机', amount: 100, source: 'happy' }
    ], unresolved: [] }) }));
    await page.locator('.quick-entry-input textarea').fill('午饭15元，建一个预算600元的耳机愿望，再给它存100元');
    await page.locator('.ai-consent input').check(); await page.getByRole('button', { name: /用AI识别并拆分/ }).click();
    await page.locator('.wish-deposit').waitFor();
    assert.equal(await page.locator('.ai-event-card').count(), 3);
    await page.getByRole('button', { name: '确认并保存 3 项', exact: true }).click();
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('fanfan-youyu-app-v5-android-clean')));
    assert.equal(after.pools.food, before.pools.food - 15); assert.equal(after.pools.happy, before.pools.happy - 100);
    assert.equal(after.wishes[0].title, '耳机'); assert.equal(after.wishes[0].locked, 100);
    assert.equal(after.wishTransfers[0].wishId, after.wishes[0].id); assert.equal(after.transactions.length, 1);
    await pet.click(); await page.getByRole('button', { name: /一句话记账和图片记账/ }).click();
    await page.route('**/api/ai/parse', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ events: [{ intent: 'fund_wish', amount: 999, wishTitle: '耳机', source: 'happy' }], unresolved: [] }) }));
    await page.locator('.quick-entry-input textarea').fill('给耳机存999元'); await page.getByRole('button', { name: /用AI识别并拆分/ }).click();
    await page.getByRole('alert').waitFor(); assert.equal(await page.getByRole('button', { name: '确认并保存 1 项', exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log('PASS: draggable pet with persistence and click separation, text/image entry, mixed wish actions, insufficient funds guard');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
