const { chromium } = require('C:/Users/李/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => message.type() === 'error' && errors.push(message.text()));
  await page.addInitScript(() => {
    localStorage.setItem('fanfan-youyu-prototype-v2', JSON.stringify({
      onboarded: true,
      pools: { food: 100, happy: 20, emergency: 0, savings: 0 },
      wishes: [{ id: 1, icon: '🎁', title: '成都之行', condition: '好好表现', target: 100, locked: 10 }],
      wishReserve: 5,
      wishTransfers: [],
      transactions: [],
      completedWishes: [],
      archivedWishes: []
    }));
  });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '愿望', exact: true }).click();

  await page.getByRole('button', { name: '存入愿望池' }).click();
  await page.getByRole('heading', { name: '存入愿望池' }).waitFor();
  await page.getByRole('spinbutton', { name: '这次存入' }).fill('7');
  await page.getByRole('button', { name: '确认存入愿望池' }).click();
  if (!(await page.locator('.wish-total').innerText()).includes('待分配 ¥12.00')) throw new Error('unassigned wish reserve was not updated');

  await page.locator('.wish-main').click();
  await page.getByRole('button', { name: /池内待分配/ }).click();
  await page.getByRole('spinbutton', { name: '这次为愿望存入' }).fill('20');
  await page.getByText(/余额不足，还差 ¥8.00/).waitFor();
  if (await page.getByRole('button', { name: '确认存入并锁定' }).isEnabled()) throw new Error('insufficient reserve did not disable submit');
  await page.screenshot({ path: 'C:/Users/李/.codex/visualizations/2026/08/24/01a03395-9f22-7ba3-87f6-8978c35f240c/wish-funding-source-warning.png', fullPage: true });
  await page.getByRole('button', { name: /小余仓/ }).click();
  await page.getByRole('spinbutton', { name: '这次为愿望存入' }).fill('3');
  await page.getByRole('textbox', { name: '这次为什么奖励自己（选填）' }).fill('按计划完成了本周学习任务');
  await page.getByRole('button', { name: '确认存入并锁定' }).click();
  if (!(await page.locator('.wish-card').innerText()).includes('¥13.00 已锁定')) throw new Error('direct wish deposit did not lock funds');
  await page.locator('.wish-main').click();
  await page.getByRole('button', { name: /存入历史/ }).click();
  await page.getByText('按计划完成了本周学习任务').waitFor();
  await page.locator('.wish-editor .icon-button').click();
  await page.getByRole('button', { name: '存入愿望池' }).click();
  await page.locator('.wish-transfer-sheet select').selectOption('1');
  await page.getByRole('button', { name: /外部支持/ }).click();
  await page.getByRole('spinbutton', { name: '这次存入' }).fill('20');
  await page.getByRole('textbox', { name: '给这次存入写句话（选填）' }).fill('妈妈奖励我坚持完成了目标');
  await page.getByRole('button', { name: '确认存入并锁定' }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fanfan-youyu-prototype-v2')));
  if (stored.pools.happy !== 10) throw new Error('external support incorrectly reduced happy pool');
  if (stored.wishes[0].locked !== 33) throw new Error('external support did not increase locked wish funds');
  if (stored.wishTransfers[0].source !== 'external') throw new Error('external source was not recorded');
  await page.locator('.wish-main').click();
  await page.getByRole('button', { name: /存入历史/ }).click();
  await page.getByText('妈妈奖励我坚持完成了目标').waitFor();
  await page.getByText(/2026.08.24 · 外部支持/).waitFor();
  await page.screenshot({ path: 'C:/Users/李/.codex/visualizations/2026/08/24/01a03395-9f22-7ba3-87f6-8978c35f240c/wish-funding-result.png', fullPage: true });

  console.log(JSON.stringify({ errors, reserveFlow: 'ok', sourceWarning: 'ok', directLock: 'ok', depositNoteHistory: 'ok', externalSupport: 'ok' }));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
