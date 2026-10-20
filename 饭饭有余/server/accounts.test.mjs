import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA, createAccountService } from './accounts.mjs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const ledger = () => ({
  dataVersion: 7, onboarded: true, pools: { food: 560, happy: 100, emergency: 140, savings: 200 },
  monthBudget: 1000, monthSavings: 200, currentSavingsAllocation: 200, nextMonthBudget: 0,
  emergencyCarryLimit: 100, wishReserve: 0, ratios: { food: 56, happy: 10, emergency: 14, savings: 20 },
  transactions: [], wishes: [], completedWishes: [], archivedWishes: [], wishTransfers: [], monthlyHistory: [], dailyFoodBudgets: {}
});

test('account lifecycle, isolation, durable sessions and atomic backup revisions on PostgreSQL', async t => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  let time = Date.now();
  const service = createAccountService(db, { clock: () => time });
  let peer = 0;
  const call = (path, body, token, ip = `test-${++peer}`) => service.handle({
    method: body === undefined ? 'GET' : 'POST', url: `/api/account/${path}`,
    headers: token ? { authorization: `Bearer ${token}` } : {}, socket: { remoteAddress: ip }
  }, async () => body);
  const password = 'test-password-2026';
  let alice, bob;
  try {
    await t.test('registration hashes passwords, lowercases usernames and rejects duplicates', async () => {
      alice = await call('register', { username: 'Alice', password, nickname: '饭团甲' });
      bob = await call('register', { username: 'bobby', password });
      assert.equal(alice.user.username, 'alice');
      assert.equal(alice.user.password_hash, undefined);
      assert.match(alice.token, /^[A-Za-z0-9_-]{43}$/);
      const stored = (await db.query('SELECT password_hash FROM fanfan_users WHERE id=$1', [alice.user.id])).rows[0];
      assert.notEqual(stored.password_hash, password);
      await assert.rejects(call('register', { username: 'alice', password }), { status: 409 });
      await assert.rejects(call('register', { username: 'short', password: '123' }), { status: 400 });
    });
    await t.test('login requires correct password; sessions survive service restart and store token hashes', async () => {
      await assert.rejects(call('login', { username: 'alice', password: 'wrong-password' }), { status: 401 });
      await assert.rejects(call('login', { username: 'nobody', password }), { status: 401 });
      const logged = await call('login', { username: 'alice', password });
      const restarted = createAccountService(db);
      const result = await restarted.authenticate({ headers: { authorization: `Bearer ${logged.token}` } });
      assert.equal(result.user.id, alice.user.id);
      assert.notEqual(result.tokenHash, logged.token);
      await assert.rejects(call('me'), { status: 401 });
    });
    await t.test('profile edits and backup access are scoped to authenticated identity', async () => {
      await call('profile', { nickname: '新名字', avatar: 'leaf', userId: bob.user.id }, alice.token);
      assert.equal((await call('me', undefined, alice.token)).user.nickname, '新名字');
      assert.equal((await call('me', undefined, bob.token)).user.nickname, 'bobby');
      assert.equal((await call('backup', undefined, alice.token)).backup, null);
      const saved = await call('backup', { revision: 0, data: ledger(), userId: bob.user.id }, alice.token);
      assert.equal(saved.revision, 1);
      assert.equal((await call('backup', undefined, bob.token)).backup, null);
      assert.deepEqual((await call('backup', undefined, alice.token)).backup.data, ledger());
    });
    await t.test('stale and simultaneous writes cannot silently overwrite cloud data', async () => {
      await assert.rejects(call('backup', { revision: 0, data: ledger() }, alice.token), { status: 409 });
      const outcomes = await Promise.allSettled([
        call('backup', { revision: 1, data: { ...ledger(), monthBudget: 1100 } }, alice.token),
        call('backup', { revision: 1, data: { ...ledger(), monthBudget: 1200 } }, alice.token)
      ]);
      assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
      assert.equal(outcomes.find(item => item.status === 'rejected').reason.status, 409);
      assert.equal((await call('backup', undefined, alice.token)).backup.revision, 2);
    });
    await t.test('corrupt snapshots cannot replace a good backup', async () => {
      for (const data of [null, { ...ledger(), pools: { food: 'bad' } }, { ...ledger(), transactions: [{ id: 1, amount: -1, pool: 'food', title: 'bad date', date: '2026-02-30' }] }, { ...ledger(), wishes: 'bad' }, { ...ledger(), dataVersion: 99 }, { ...ledger(), note: 'a'.repeat(2 * 1024 * 1024) }]) {
        await assert.rejects(call('backup', { revision: 2, data }, alice.token), { status: 400 });
      }
      assert.equal((await call('backup', undefined, alice.token)).backup.revision, 2);
    });
    await t.test('logout revokes the session immediately', async () => {
      const session = await call('login', { username: 'alice', password });
      await call('logout', {}, session.token);
      await assert.rejects(call('me', undefined, session.token), { status: 401 });
      assert.equal((await call('me', undefined, alice.token)).user.id, alice.user.id);
    });
    await t.test('password confirmation gates deletion; deletion cascades sessions and backups', async () => {
      await assert.rejects(call('delete', { password: 'wrong' }, alice.token), { status: 403 });
      await call('delete', { password }, alice.token);
      await assert.rejects(call('me', undefined, alice.token), { status: 401 });
      assert.equal((await db.query('SELECT * FROM fanfan_backups WHERE user_id=$1', [alice.user.id])).rows.length, 0);
      assert.equal((await db.query('SELECT * FROM fanfan_sessions WHERE user_id=$1', [alice.user.id])).rows.length, 0);
      assert.equal((await call('me', undefined, bob.token)).user.id, bob.user.id);
    });
    await t.test('sessions expire and login attempts are bounded', async () => {
      time += 31 * 86400000;
      await assert.rejects(call('me', undefined, bob.token), { status: 401 });
      for (let i = 0; i < 15; i++) await assert.rejects(call('login', { username: 'unknown_user', password }), { status: 401 });
      await assert.rejects(call('login', { username: 'unknown_user', password }), { status: 429 });
    });
    await t.test('unconfigured account service fails closed', async () => {
      const empty = createAccountService(null);
      await assert.rejects(empty.handle({ url: '/api/account/me', headers: {} }, async () => ({})), { status: 503 });
    });
  } finally { await db.close(); }
});

test('HTTP routes preserve offline mode and enforce account CORS headers', async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./ai-proxy.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0', AI_PROXY_HOST: '127.0.0.1', DATABASE_URL: '', ARK_API_KEY: '', AI_ALLOWED_ORIGINS: 'http://localhost:5173' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server startup timeout')), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`server exited: ${code}`)); });
      child.stdout.on('data', chunk => {
        const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.accounts, false);
    const account = await fetch(`${base}/api/account/me`);
    assert.equal(account.status, 503);
    assert.match((await account.json()).error, /本机记账可继续使用/);
    const denied = await fetch(`${base}/api/account/register`, { method: 'POST', headers: { Origin: 'https://untrusted.example' } });
    assert.equal(denied.status, 403);
    const preflight = await fetch(`${base}/api/account/me`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Headers': 'Authorization' } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
});
