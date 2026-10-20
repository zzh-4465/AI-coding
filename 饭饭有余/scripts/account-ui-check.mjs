import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createAccountService, SCHEMA } from '../server/accounts.mjs';

const require = createRequire(import.meta.url);
const { PGlite } = createRequire(new URL('../server/package.json', import.meta.url))('@electric-sql/pglite');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const db = new PGlite();
await db.exec(SCHEMA);
const mailbox = [];
const service = createAccountService(db, { mailer: { configured: true, send: async mail => { mailbox.push(mail); } } });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
const guestKey = 'fanfan-youyu-app-v5-android-clean';
const sessionKey = 'fanfan-account-session-v1';
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
async function connectPage(target) {
  await target.route('**/api/account/**', async route => {
    const request = route.request();
    const headers = request.headers();
    try {
      const result = await service.handle({ url: new URL(request.url()).pathname, method: request.method(), headers, socket: { remoteAddress: 'ui-test' } }, async () => request.postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    } catch (error) {
      await route.fulfill({ status: error.status || 500, contentType: 'application/json', body: JSON.stringify({ error: error.message }) });
    }
  });
}
async function openAccount() {
  if (await page.locator('.account-sheet').isVisible()) return;
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByText('账号与云备份', { exact: true }).click();
  await page.getByRole('heading', { name: '账号与云备份' }).waitFor();
}
async function login(username, register = false, password = 'test-password-2026') {
  if (register) await page.getByRole('button', { name: '还没有账号，去注册' }).click();
  await page.getByLabel(/^用户名/).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  if (register) await page.getByLabel('昵称', { exact: true }).fill(username);
  await page.getByRole('button', { name: register ? '注册并登录' : '登录', exact: true }).click();
  await page.getByRole('button', { name: '账号与云备份 · 恢复账本' }).waitFor();
  await page.getByRole('button', { name: '账号与云备份 · 恢复账本' }).click();
  await page.getByRole('button', { name: '刷新云端状态' }).waitFor();
  await page.waitForFunction(() => document.querySelector('.account-cloud') && !document.querySelector('.account-cloud').textContent.includes('尚未获取'));
}
try {
  await connectPage(page);
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/');
  await page.locator('.onboard-budget input').fill('1000');
  await page.getByRole('button', { name: '开始饭饭有余' }).click();
  await page.locator('.today-hero').waitFor();
  const original = await page.evaluate(key => localStorage.getItem(key), guestKey);
  await openAccount();
  await login('alice_ui', true);
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), guestKey), JSON.parse(original));
  await page.getByRole('button', { name: '复制此设备的游客账本' }).click();
  await page.locator('.today-hero').waitFor();
  await openAccount();
  await page.getByRole('button', { name: '备份当前账本' }).click();
  await page.getByRole('status').filter({ hasText: '云端备份已更新' }).waitFor();
  const alice = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), sessionKey);
  const aliceKey = `${guestKey}-user-${alice.user.id}`;
  await page.getByLabel('昵称', { exact: true }).fill('小余');
  await page.getByRole('button', { name: '嫩芽', exact: true }).click();
  await page.getByRole('button', { name: '保存资料' }).click();
  await page.getByRole('status').filter({ hasText: '个人资料已保存' }).waitFor();
  await page.getByLabel('验证邮箱', { exact: true }).fill('alice-ui@example.com');
  await page.getByLabel('当前账号密码', { exact: true }).fill('test-password-2026');
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  await page.getByLabel('邮箱验证码', { exact: true }).waitFor();
  const bindingCode = mailbox.at(-1).text.match(/\b\d{8}\b/)[0];
  await page.getByLabel('邮箱验证码', { exact: true }).fill(bindingCode);
  await page.getByRole('button', { name: '验证并绑定邮箱', exact: true }).click();
  await page.getByText('alice-ui@example.com', { exact: true }).waitFor();
  await mkdir('docs/verification', { recursive: true });
  await page.screenshot({ path: 'docs/verification/account-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await Promise.all([page.waitForNavigation(), page.getByRole('button', { name: '退出登录', exact: true }).click()]);
  await page.locator('.today-hero').waitFor();
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), guestKey), JSON.parse(original));
  await openAccount();
  await page.getByRole('button', { name: '忘记密码？通过邮箱找回', exact: true }).click();
  await page.getByLabel('验证邮箱', { exact: true }).fill('alice-ui@example.com');
  // Advance only the persisted send throttle for this integration test.
  await db.query('DELETE FROM fanfan_mail_limits');
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  await page.getByLabel('邮箱验证码', { exact: true }).waitFor();
  const resetCode = mailbox.at(-1).text.match(/\b\d{8}\b/)[0];
  await page.getByLabel('邮箱验证码', { exact: true }).fill(resetCode);
  await page.getByLabel('新密码', { exact: true }).fill('changed-password-2026');
  await page.getByLabel('确认新密码', { exact: true }).fill('changed-password-2026');
  await page.getByRole('button', { name: '确认重置密码', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '密码已重置' }).waitFor();
  await login('bobby_ui', true);
  const bob = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), sessionKey);
  assert.notEqual(bob.user.id, alice.user.id);
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key))?.onboarded, `${guestKey}-user-${bob.user.id}`), false);
  await Promise.all([page.waitForNavigation(), page.getByRole('button', { name: '退出登录', exact: true }).click()]);
  await page.locator('.today-hero').waitFor();
  // Emulate a new device by removing only Alice's local ledger, retaining the cloud DB.
  await page.evaluate(key => localStorage.removeItem(key), aliceKey);
  await openAccount();
  await login('alice-ui@example.com', false, 'changed-password-2026');
  await page.getByRole('button', { name: '恢复云端备份', exact: true }).click();
  await page.locator('.today-hero').waitFor();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).monthBudget, aliceKey), 1000);
  assert.ok(await page.evaluate(key => localStorage.getItem(`${key}-before-restore`), aliceKey));
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), guestKey), JSON.parse(original));
  await openAccount();
  await page.getByRole('button', { name: '注销账号', exact: true }).click();
  await page.getByLabel('输入密码确认').fill('changed-password-2026');
  await Promise.all([page.waitForNavigation(), page.getByRole('button', { name: '永久注销账号', exact: true }).click()]);
  await page.locator('.today-hero').waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), aliceKey), null);
  assert.equal(await page.evaluate(key => localStorage.getItem(`${key}-before-restore`), aliceKey), null);
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), guestKey), JSON.parse(original));
  assert.ok(await page.evaluate(key => localStorage.getItem(key), `${guestKey}-user-${bob.user.id}`));
  // A switch in another tab must reload this tab into the new identity's own ledger.
  const secondPage = await page.context().newPage();
  await connectPage(secondPage);
  await secondPage.goto(process.env.APP_URL || 'http://127.0.0.1:5173/');
  await secondPage.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: sessionKey, value: bob });
  await page.getByRole('button', { name: '账号与云备份 · 恢复账本' }).waitFor();
  assert.equal(await page.locator('.today-hero').count(), 0);
  await secondPage.close();
  assert.deepEqual(errors, []);
  console.log('PASS: email binding, password reset, original identity retained, guest preservation, account isolation, cloud restore, deletion and cross-tab switching; mobile layout checked');
} finally { await browser.close(); await db.close(); }
