const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const key = 'fanfan-youyu-app-v5-android-clean';
const backupKey = `${key}-rolling-backups`;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });

    await page.locator('.onboard-budget input').fill('1000');
    await page.getByRole('button', { name: '开始饭饭有余' }).click();
    await page.locator('.today-hero').waitFor();

    const initialBackups = await page.evaluate(backupKey => JSON.parse(localStorage.getItem(backupKey) || '[]'), backupKey);
    assert.equal(initialBackups.length, 1);
    assert.equal(initialBackups[0].data.monthBudget, 1000);

    await page.locator('.meal-item').first().click();
    await page.locator('.transaction-sheet .amount-field input').fill('12');
    await page.locator('.transaction-sheet .text-field input').fill('自动备份恢复测试');
    await page.getByRole('button', { name: '确认记账', exact: true }).click();
    await page.locator('.transaction-sheet').waitFor({ state: 'detached' });

    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: /备份与恢复/ }).click();
    await page.getByRole('heading', { name: '备份与恢复' }).waitFor();
    await page.getByText('本机自动保留最近 5 份账本', { exact: true }).waitFor();

    const restoreButton = page.getByRole('button', { name: /一键恢复最近自动备份/ });
    assert.equal(await restoreButton.isEnabled(), true);
    await restoreButton.click();
    await page.locator('.toast').filter({ hasText: '已恢复最近自动备份' }).waitFor();

    const state = await page.evaluate(({ key, backupKey }) => ({
      live: JSON.parse(localStorage.getItem(key)),
      backups: JSON.parse(localStorage.getItem(backupKey) || '[]')
    }), { key, backupKey });
    assert.equal(state.live.transactions.length, 0);
    assert.equal(state.backups[0].reason, 'before-rolling-restore');
    assert.equal(state.backups[0].data.transactions.at(-1).title, '自动备份恢复测试');

    console.log('PASS: automatic rolling backup is visible, one-click restore works, and pre-restore data is retained');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
