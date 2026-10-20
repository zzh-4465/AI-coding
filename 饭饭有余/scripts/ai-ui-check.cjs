const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-18T12:00:00+08:00') });
    await page.route('**/api/ai/parse', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        events: [
          { intent: 'expense', amount: 2, date: '2026-10-18', pool: 'food', meal: 'breakfast', note: '香蕉', evidence: '早上饭堂吃香蕉2块' },
          { intent: 'expense', amount: 15, date: '2026-10-18', pool: 'food', meal: 'lunch', note: '西亚吃面', evidence: '中午西亚吃面花15元' },
          { intent: 'expense', amount: 299, date: '2026-10-18', pool: 'happy', meal: null, note: 'KTV消费', evidence: '晚上KTV花了299' }
        ],
        unresolved: [{ text: '还买了个小水果', reason: '没有金额' }]
      })
    }));
    await page.route('**/api/ai/report', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ summary: '本月账本已有清晰记录。', findings: [{ title: '娱乐消费', evidence: '小余仓支出299元', level: 'notice' }], suggestions: ['继续在确认后再入账。'] })
    }));
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await page.locator('.onboard-budget input').fill('100');
    await page.getByRole('button', { name: '开始饭饭有余' }).click();
    await page.locator('.global-pet-button').click(); await page.getByRole('button', { name: /一句话记账和图片记账/ }).click();
    await page.locator('.quick-entry-input textarea').fill('早上饭堂吃香蕉2块，中午西亚吃面15元，还买了个小水果，晚上KTV花了299');
    await page.locator('.ai-consent input').check();
    await page.getByRole('button', { name: /用AI识别并拆分/ }).click();
    await page.locator('.ai-event-card').nth(2).waitFor();
    assert.equal(await page.locator('.ai-event-card').count(), 3);
    assert.equal(await page.locator('.ai-unresolved').getByText(/小水果/).count(), 1);
    fs.mkdirSync('docs/verification', { recursive: true });
    await page.screenshot({ path: 'docs/verification/ai-multi-entry.png', fullPage: true });
    await page.getByRole('button', { name: /确认并保存 3 项/ }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fanfan-youyu-app-v5-android-clean')).transactions.slice(0, 3));
    assert.deepEqual(saved.map(item => [item.pool, item.amount, item.title]), [['food', -2, '香蕉'], ['food', -15, '西亚吃面'], ['happy', -299, 'KTV消费']]);
    const happyBalance = await page.evaluate(() => JSON.parse(localStorage.getItem('fanfan-youyu-app-v5-android-clean')).pools.happy);
    assert.ok(happyBalance < 0, `AI expense should allow a negative pool balance, got ${happyBalance}`);
    await page.locator('.month-callout').click();
    await page.getByRole('button', { name: '生成AI分析' }).click();
    await page.getByText('本月账本已有清晰记录。').waitFor();
    await page.screenshot({ path: 'docs/verification/ai-month-report.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: AI multi-entry confirmation, unresolved fragments, atomic save, and monthly report');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
