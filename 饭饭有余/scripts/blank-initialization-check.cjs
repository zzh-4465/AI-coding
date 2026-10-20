const { chromium } = require('C:/Users/李/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '先分好这个月的余粮' }).waitFor();

  if (await page.locator('.transaction-row,.wish-card,.memory-card').count()) {
    throw new Error('空白初始版中存在流水或愿望数据');
  }

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fanfan-youyu-app-v5-android-clean')));
  if (stored.onboarded !== false) throw new Error('首次打开没有进入预算设置');
  if (Object.values(stored.pools).some(value => value !== 0)) throw new Error('初始资金池余额不为零');
  if (stored.transactions.length || stored.wishes.length || stored.completedWishes.length || stored.archivedWishes.length || stored.monthlyHistory.length) {
    throw new Error('初始数据并非完全空白');
  }

  console.log(JSON.stringify({ onboarding: true, pools: stored.pools, transactions: 0, wishes: 0, history: 0 }));
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
