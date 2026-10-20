const { chromium } = require('C:/Users/李/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => message.type() === 'error' && errors.push(message.text()));
  page.setDefaultTimeout(10000);
  const freshContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const freshPage = await freshContext.newPage();
  await freshPage.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await freshPage.getByRole('heading', { name: '先分好这个月的余粮' }).waitFor();
  if (await freshPage.locator('.transaction-row,.wish-card').count()) throw new Error('fresh install contains seeded records');
  await freshContext.close();
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await page.addInitScript(({ key }) => {
    localStorage.setItem('fanfan-youyu-app-v4', JSON.stringify({
      onboarded: true,
      pools: { food: 300, happy: 100, emergency: 50, savings: 20 },
      monthBudget: 450,
      monthSavings: 20,
      currentSavingsAllocation: 20,
      nextMonthBudget: 450,
      ratios: { savings: 10, food: 60, emergency: 10, happy: 20 },
      emergencyCarryLimit: 100,
      transactions: [{ id: 1, date: key, pool: 'food', meal: 'breakfast', title: '食堂', amount: -10, health: 'good' }],
      wishes: [{ id: 10, icon: '🎁', title: '健身卡', condition: '坚持运动', target: 100, locked: 20 }],
      completedWishes: [], archivedWishes: [], wishReserve: 30, wishTransfers: [], monthlyHistory: []
    }));
  }, { key });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: /饮食池/ }).click();
  await page.getByRole('button', { name: `删除食堂` }).click();
  await page.getByRole('heading', { name: '确认删除这笔记录？' }).waitFor();
  await page.getByRole('button', { name: '取消' }).click();
  if (await page.getByText('早餐 · 食堂').count() !== 1) throw new Error('cancelled deletion removed the row');
  await page.getByRole('button', { name: `删除食堂` }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  if (await page.getByText('早餐 · 食堂').count()) throw new Error('confirmed deletion kept the row');
  const storedAfterDelete = await page.evaluate(() => JSON.parse(localStorage.getItem('fanfan-youyu-app-v4')));
  if (storedAfterDelete.pools.food !== 310 || storedAfterDelete.transactions.length !== 0) throw new Error('transaction delete did not update row and balance together');

  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '愿望', exact: true }).click();
  await page.locator('.wish-main').click();
  await page.getByRole('button', { name: /池内待分配/ }).click();
  await page.getByRole('spinbutton', { name: '这次为愿望存入' }).fill('30');
  await page.getByRole('button', { name: '确认存入并锁定' }).click();
  if (!(await page.locator('.wish-card').innerText()).includes('¥50.00 已锁定')) throw new Error('wish funding did not update card progress');
  const card = page.locator('.wish-card');
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + 25, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
  await page.getByRole('button', { name: '删除愿望' }).click();
  await page.getByRole('heading', { name: /确认删除「健身卡」/ }).waitFor();
  await page.getByRole('button', { name: '取消' }).click();
  if (await page.getByText('健身卡', { exact: true }).count() !== 1) throw new Error('wish delete cancellation failed');

  await page.getByRole('button', { name: '设置' }).click();
  if (await page.getByText('深色模式', { exact: true }).count()) throw new Error('dark mode setting remains');
  if (await page.getByText('储蓄完成音效', { exact: true }).count()) throw new Error('sound setting remains');
  await page.getByRole('button', { name: /月度回顾/ }).click();
  if (await page.locator('.month-picker button').count() !== 12) throw new Error('monthly picker does not expose 12 months');
  await page.locator('.month-picker button').nth(3).click();
  await page.getByRole('button', { name: '补充这个月' }).click();
  await page.getByText('饮食支出', { exact: true }).waitFor();
  await page.getByText('本月储蓄', { exact: true }).waitFor();
  await page.getByText('应急结转到下月', { exact: true }).waitFor();

  const metrics = await page.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth }));
  if (metrics.body > metrics.viewport) throw new Error(`horizontal overflow: ${metrics.body}`);
  await page.screenshot({ path: 'C:/Users/李/Desktop/饭饭有余/Android-V1.3-自动复测.png', fullPage: true });
  console.log(JSON.stringify({ errors, deleteFlow: 'ok', wishFlow: 'ok', monthlyFlow: 'ok', metrics }, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
