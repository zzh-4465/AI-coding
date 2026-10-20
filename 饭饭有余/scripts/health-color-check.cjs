const { chromium } = require('C:/Users/李/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  const out = 'C:/Users/李/.codex/visualizations/2026/08/24/01a03395-9f22-7ba3-87f6-8978c35f240c/fanfan-v05-health-colors.png';
  await page.addInitScript(() => localStorage.setItem('fanfan-youyu-prototype-v2', JSON.stringify({
    onboarded: true,
    pools: { food: 900, happy: 100, emergency: 100, savings: 300 },
    wishes: [],
    transactions: [
      { id: 1, date: '2026-08-24', pool: 'food', meal: 'breakfast', title: '食堂早餐', amount: -7, health: 'good' },
      { id: 2, date: '2026-08-24', pool: 'food', meal: 'lunch', title: '普通午餐', amount: -12, health: 'normal' },
      { id: 3, date: '2026-08-24', pool: 'food', meal: 'dinner', title: '偶尔炸鸡', amount: -18, health: 'bad' }
    ]
  })));
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '账本', exact: true }).click();
  await page.waitForTimeout(350);

  const colors = await page.locator('.transaction-row[class*="health-"]').evaluateAll(rows => rows.map(row => ({
    className: row.className,
    background: getComputedStyle(row).backgroundColor,
    image: getComputedStyle(row).backgroundImage,
    shadow: getComputedStyle(row).boxShadow
  })));
  if (colors.length !== 3) throw new Error(`expected 3 health rows, got ${colors.length}`);
  if (colors.some(item => item.image !== 'none')) throw new Error(`health gradient remains: ${JSON.stringify(colors)}`);
  if (new Set(colors.map(item => item.shadow)).size !== 3) throw new Error('health indicator colors are not distinct');
  await page.screenshot({ path: out, fullPage: true });
  console.log(JSON.stringify(colors, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
