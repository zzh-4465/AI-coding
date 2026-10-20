const { chromium } = require('C:/Users/李/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  const out = 'C:/Users/李/.codex/visualizations/2026/08/24/01a03395-9f22-7ba3-87f6-8978c35f240c';
  page.setDefaultTimeout(10000);
  page.on('console', message => message.type() === 'error' && errors.push(`console: ${message.text()}`));
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  const settle = () => page.waitForTimeout(250);

  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.locator('.onboard-budget input').fill('1800.55');
  if (await page.locator('.onboard-budget input').inputValue() !== '1800.55') throw new Error('monthly budget rejected decimals');
  const savingsRatio = page.getByRole('spinbutton', { name: '储蓄池比例' });
  await savingsRatio.fill('');
  if (await savingsRatio.inputValue() !== '') throw new Error('ratio input forced a zero while editing');
  await savingsRatio.fill('20');
  await page.getByRole('button', { name: '开始饭饭有余' }).click();
  await settle();

  await page.locator('.global-pet-button').click(); await page.getByRole('button', { name: /一句话记账和图片记账/ }).click();
  await page.getByRole('button', { name: '食堂', exact: true }).click();
  const titleInput = page.locator('.transaction-sheet .text-field input');
  if (await titleInput.inputValue() !== '食堂') throw new Error('quick description choice did not fill input');
  await titleInput.fill('食堂二楼');
  await page.locator('.transaction-sheet .amount-field input').fill('12.35');
  await page.getByRole('button', { name: '不健康', exact: true }).click();
  await page.getByRole('button', { name: '确认记账' }).click();
  await page.getByRole('button', { name: /饮食池/ }).click();
  await page.getByText('剩余天数', { exact: true }).waitFor();
  if (await page.getByText('计算方式', { exact: true }).count()) throw new Error('food pool still exposes the formula label');
  await page.getByText('预算有余', { exact: true }).waitFor();
  if (await page.locator('.calendar-empty').count() !== 5) throw new Error('August calendar is not aligned to Saturday');
  const badRow = page.locator('.transaction-row.health-bad', { hasText: '食堂二楼' });
  await badRow.waitFor();

  await page.getByRole('button', { name: '8月23日' }).click();
  await page.getByRole('button', { name: '补记一笔' }).click();
  await page.locator('.transaction-sheet .amount-field input').fill('130.25');
  await page.getByRole('button', { name: '加餐', exact: true }).click();
  await page.getByRole('button', { name: '水果', exact: true }).click();
  await page.getByRole('button', { name: '不健康', exact: true }).click();
  await page.getByRole('button', { name: '确认记账' }).click();
  await page.getByText('2026.08.23 · 不健康', { exact: true }).waitFor();
  if (!await page.getByRole('button', { name: '8月23日' }).evaluate(element => element.classList.contains('filled-danger'))) {
    throw new Error('food calendar did not classify an over-budget day');
  }
  await page.screenshot({ path: `${out}/fanfan-v03-food.png`, fullPage: true });

  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '账本' }).click();
  await page.getByRole('button', { name: '月度回顾' }).click();
  await page.getByText('2026 年 7 月', { exact: true }).click();
  await page.getByRole('heading', { name: '2026 年 7 月总结' }).waitFor();
  await page.screenshot({ path: `${out}/fanfan-v03-monthly-review.png`, fullPage: true });
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '查看8月20日' }).click();
  await page.getByRole('button', { name: '补记一笔' }).click();
  await page.locator('.transaction-sheet .amount-field input').fill('9.80');
  await page.getByRole('button', { name: '食堂', exact: true }).click();
  await page.getByRole('button', { name: '确认记账' }).click();
  const backfilledRow = page.locator('.transaction-row', { hasText: '食堂' }).first();
  await backfilledRow.waitFor();
  const backfilledText = await backfilledRow.innerText();
  if (!backfilledText.includes('2026.08.20') || !backfilledText.includes('健康')) {
    throw new Error(`historical backfill used the wrong date or health: ${backfilledText}`);
  }

  await page.getByRole('button', { name: '今日' }).click();
  await page.getByRole('button', { name: /愿望小铺/ }).click();
  if (await page.getByText('愿望金额可以解锁', { exact: false }).count()) throw new Error('wish rule note remains in the detail view');
  await page.getByRole('button', { name: /从小余仓转入/ }).click();
  await page.locator('.wish-transfer-sheet .amount-field input').fill('5.55');
  await page.getByRole('button', { name: '确认转入' }).click();
  await page.locator('.wish-funding-history article').first().getByText('+¥5.55', { exact: true }).waitFor();
  await page.getByRole('button', { name: /从小余仓转入/ }).click();
  await page.getByText(/小余仓可用 ¥74\.51/).waitFor();
  await page.getByRole('button', { name: '关闭' }).click();
  await page.screenshot({ path: `${out}/fanfan-v03-wish-funding.png`, fullPage: true });

  await page.getByRole('button', { name: '返回' }).click();
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: /本月预算/ }).click();
  await page.locator('.budget-sheet .onboard-budget input').fill('1900.75');
  await page.getByRole('button', { name: '保存预算方案' }).click();
  await page.getByText('¥1900.75', { exact: true }).waitFor();

  const metrics = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    bodyWidth: document.body.scrollWidth,
    calendarButtons: document.querySelectorAll('.calendar-grid button').length,
    emptyCalendarCells: document.querySelectorAll('.calendar-empty').length
  }));
  if (metrics.bodyWidth > metrics.viewport[0]) throw new Error(`horizontal overflow: ${metrics.bodyWidth}`);
  console.log(JSON.stringify({ errors, metrics }, null, 2));
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
