const { chromium } = require('C:/Users/李/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const current = new Date();
  const today = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
  const remainingDays = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate() - current.getDate() + 1;

  await page.addInitScript(({ today, remainingDays }) => {
    localStorage.setItem('fanfan-youyu-app-v5-android-clean', JSON.stringify({
      dataVersion: 5,
      onboarded: true,
      pools: { food: 20 * remainingDays, happy: 50, emergency: 0, savings: 0 },
      monthBudget: 20 * remainingDays + 50,
      transactions: [],
      wishes: [],
      completedWishes: [],
      archivedWishes: [],
      wishTransfers: [],
      monthlyHistory: []
    }));
  }, { today, remainingDays });

  await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
  await page.locator('.global-pet-button').waitFor();
  await page.locator('.global-pet-button').click(); await page.getByRole('button', { name: /一句话记账和图片记账/ }).click();
  await page.locator('.transaction-sheet .amount-field input').fill('18');
  await page.locator('.transaction-sheet .text-field input').fill('今天的饭');
  await page.getByRole('button', { name: '确认记账' }).click();

  const budget = await page.locator('.hero-money span').innerText();
  const remaining = await page.locator('.hero-foot span').first().innerText();
  const status = await page.locator('.hero-top').innerText();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fanfan-youyu-app-v5-android-clean')));
  const savedBudget = stored.dailyFoodBudgets[today];

  if (!budget.includes('¥20.00')) throw new Error(`今日预算发生变化：${budget}`);
  if (!remaining.includes('¥2.00')) throw new Error(`今日剩余不正确：${remaining}`);
  if (status.includes('帮忙')) throw new Error(`18/20 被误判为超支：${status}`);
  if (Math.abs(savedBudget - 20) > 0.001) throw new Error(`预算快照未正确保存：${savedBudget}`);

  console.log(JSON.stringify({ dailyBudget: budget, remaining, status, savedBudget }, null, 2));
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
