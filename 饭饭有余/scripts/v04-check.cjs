const { chromium } = require('C:/Users/李/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  const out = 'C:/Users/李/.codex/visualizations/2026/08/24/01a03395-9f22-7ba3-87f6-8978c35f240c';
  page.setDefaultTimeout(10000);
  page.on('console', message => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', error => errors.push(error.message));
  const settle = () => page.waitForTimeout(250);
  const setRatios = async values => {
    for (const [name, value] of Object.entries(values)) await page.getByRole('spinbutton', { name: `${name}比例` }).fill(String(value));
  };

  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '开始饭饭有余' }).click();
  await page.getByRole('button', { name: '设置' }).click();

  await page.getByRole('button', { name: /调整当前余额/ }).click();
  await page.getByRole('spinbutton', { name: '饮食池当前余额' }).fill('248');
  await page.getByRole('spinbutton', { name: '小余仓当前余额' }).fill('0');
  await page.getByRole('spinbutton', { name: '应急必备池当前余额' }).fill('0');
  const savingsBalance = page.getByRole('spinbutton', { name: '储蓄池当前余额' });
  await savingsBalance.fill('100');
  if (await page.getByRole('button', { name: '保存当前余额' }).isEnabled()) throw new Error('savings balance could be reduced');
  await savingsBalance.fill('360');
  await settle();
  await page.screenshot({ path: `${out}/fanfan-v05-balances.png` });
  await page.getByRole('button', { name: '保存当前余额' }).click();
  await page.getByRole('button', { name: '今日' }).click();
  const foodAfterReset = await page.getByRole('button', { name: /饮食池/ }).innerText();
  const happyAfterReset = await page.getByRole('button', { name: /小余仓/ }).innerText();
  if (!foodAfterReset.includes('¥248.00') || !happyAfterReset.includes('¥0.00')) throw new Error(`manual balance adjustment failed: ${foodAfterReset} / ${happyAfterReset}`);

  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: /增加预算/ }).click();
  await page.locator('.budget-sheet .onboard-budget input').fill('52');
  await setRatios({ 储蓄池: 0, 饮食池: 50, 应急必备池: 0, 小余仓: 50 });
  await page.getByRole('button', { name: '确认增加预算' }).click();
  await page.getByRole('button', { name: '今日' }).click();
  if (!(await page.getByRole('button', { name: /饮食池/ }).innerText()).includes('¥274.00')) throw new Error('added budget did not increment food pool');
  if (!(await page.getByRole('button', { name: /小余仓/ }).innerText()).includes('¥26.00')) throw new Error('added budget did not increment small warehouse');

  await page.getByRole('button', { name: '愿望', exact: true }).click();
  const firstWrap = page.locator('.wish-swipe-wrap').first();
  const wishBox = await firstWrap.locator('.wish-card').boundingBox();
  await page.mouse.move(wishBox.x + wishBox.width - 15, wishBox.y + wishBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(wishBox.x + 35, wishBox.y + wishBox.height / 2, { steps: 6 });
  await page.mouse.up();
  await firstWrap.getByRole('button', { name: '归档愿望' }).click();
  await page.getByText('暂时收起的愿望', { exact: true }).waitFor();
  if (await page.getByText('已经实现的愿望', { exact: true }).count()) throw new Error('archived wish appears as completed');
  if (!(await page.locator('.wish-total').innerText()).includes('¥100.00')) throw new Error('archiving changed total wish funds');

  await page.locator('.wish-main', { hasText: '去吃一次甜品' }).click();
  await page.getByRole('heading', { name: '为「去吃一次甜品」攒一点' }).waitFor();
  await page.getByRole('spinbutton', { name: '这次为愿望存入' }).fill('5');
  await page.getByRole('button', { name: '确认存入并锁定' }).click();
  if (!(await page.locator('.wish-total').innerText()).includes('¥100.00')) throw new Error('reassigning reserve changed total wish funds');
  await page.locator('.wish-main', { hasText: '去吃一次甜品' }).click();
  await page.getByRole('button', { name: '提取', exact: true }).click();
  await page.getByRole('spinbutton', { name: '这次从愿望释放' }).fill('2');
  await page.getByRole('button', { name: '确认提取' }).click();
  if (!(await page.locator('.wish-total').innerText()).includes('¥100.00')) throw new Error('withdrawing to wish reserve changed total wish funds');

  await page.locator('.wish-main', { hasText: '买一本喜欢的书' }).click();
  await page.locator('.memory-note textarea').fill('今天终于把喜欢的书带回家了。');
  await page.locator('.photo-picker input').setInputFiles('C:/Users/李/Desktop/饭饭有余/ui草图.png');
  await page.getByRole('button', { name: '确认兑换并收藏' }).click();
  const memoryCard = page.locator('.memory-card', { hasText: '买一本喜欢的书' });
  await memoryCard.getByText(/2026\.08\.24/).waitFor();
  await memoryCard.click();
  await page.getByText('今天终于把喜欢的书带回家了。', { exact: true }).waitFor();
  await page.locator('.memory-photo').waitFor();
  await page.getByRole('button', { name: '关闭' }).click();
  await page.screenshot({ path: `${out}/fanfan-v04-wishes.png`, fullPage: true });

  await page.getByRole('button', { name: '今日' }).click();
  await page.locator('.global-pet-button').click(); await page.getByRole('button', { name: /一句话记账和图片记账/ }).click();
  await page.getByRole('button', { name: '小余仓', exact: true }).click();
  await page.locator('.transaction-sheet .amount-field input').fill('10');
  await page.getByRole('button', { name: '娱乐', exact: true }).click();
  await page.getByRole('button', { name: '确认记账' }).click();
  await page.getByRole('button', { name: /小余仓/ }).click();
  await page.getByText('本月支出', { exact: true }).waitFor();
  const happyMetrics = await page.locator('.pool-metrics').innerText();
  if (!happyMetrics.includes('¥10.00') || happyMetrics.includes('¥240.00')) throw new Error(`small warehouse metrics are stale: ${happyMetrics}`);
  await page.getByRole('button', { name: '返回' }).click();

  await page.getByRole('button', { name: '账本' }).click();
  await page.getByRole('button', { name: '跳到8月23日' }).click();
  await page.getByRole('button', { name: '补记 23 日' }).click();
  await page.locator('.transaction-sheet .amount-field input').fill('8.8');
  await page.getByRole('button', { name: '食堂', exact: true }).click();
  await page.getByRole('button', { name: '确认记账' }).click();
  await page.getByText('8 月 24 日', { exact: true }).waitFor();
  await page.getByText('8 月 23 日', { exact: true }).waitFor();
  if (await page.getByText('全部流水', { exact: true }).count() !== 1) throw new Error('ledger is not in all-records mode');
  await page.screenshot({ path: `${out}/fanfan-v04-ledger.png`, fullPage: true });

  await page.getByRole('button', { name: '设置' }).click();
  if (await page.getByText('健康标签', { exact: true }).count()) throw new Error('non-interactive health setting remains');
  await page.getByRole('button', { name: /备份与恢复/ }).click();
  await page.getByText('保存备份文件', { exact: true }).waitFor();
  await page.getByText('从备份恢复', { exact: true }).waitFor();
  await page.screenshot({ path: `${out}/fanfan-v04-backup.png`, fullPage: true });

  const metrics = await page.evaluate(() => ({ viewportWidth: innerWidth, bodyWidth: document.body.scrollWidth }));
  if (metrics.bodyWidth > metrics.viewportWidth) throw new Error(`horizontal overflow: ${metrics.bodyWidth}`);

  const legacyPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await legacyPage.addInitScript(() => localStorage.setItem('fanfan-youyu-prototype-v2', JSON.stringify({
    onboarded: true,
    pools: { food: 100, happy: 75, emergency: 20, savings: 30 },
    wishes: [],
    transactions: [],
    completedWishes: [{ id: 9, icon: '🎬', title: '旧版归档愿望', locked: 20, status: 'archived', completedAt: '2026-08-20' }]
  })));
  await legacyPage.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await legacyPage.getByRole('button', { name: '愿望', exact: true }).click();
  await legacyPage.getByText('旧版归档愿望', { exact: true }).waitFor();
  if (!(await legacyPage.locator('.wish-total').innerText()).includes('¥20.00')) throw new Error('legacy archived money was not migrated to wish reserve');
  if (await legacyPage.getByText('已经实现的愿望', { exact: true }).count()) throw new Error('legacy archive remained in completed wishes');
  await legacyPage.getByRole('button', { name: '今日', exact: true }).click();
  if (!(await legacyPage.getByRole('button', { name: /小余仓/ }).innerText()).includes('¥55.00')) throw new Error('legacy wish reserve was not removed from small warehouse');
  console.log(JSON.stringify({ errors, metrics }, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
