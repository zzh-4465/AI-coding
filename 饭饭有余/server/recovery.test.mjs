import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createAccountService, SCHEMA } from './accounts.mjs';

test('verified email recovery preserves identity and revokes old sessions', async t => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(SCHEMA);
  let now = Date.now();
  const messages = [];
  const mailer = { configured: true, send: async message => { messages.push(message); } };
  let service = createAccountService(db, { clock: () => now, mailer });
  let ip = 0;
  const call = (path, body, token) => service.handle({ url: `/api/account/${path}`, method: body === undefined ? 'GET' : 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, socket: { remoteAddress: `recovery-${++ip}` } }, async () => body);
  const password = 'old-password-2026';
  const newPassword = 'new-password-2026';
  const alice = await call('register', { username: 'recovery_alice', password });
  const bob = await call('register', { username: 'recovery_bobby', password });
  const code = () => messages.at(-1).text.match(/\b\d{8}\b/)[0];
  async function delivered(id) {
    for (let i = 0; i < 100; i++) {
      const row = (await db.query('SELECT delivered FROM fanfan_email_actions WHERE id=$1', [id])).rows[0];
      if (row?.delivered) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('mail delivery not recorded');
  }
  try {
    await t.test('binding requires current password and never returns a verification code', async () => {
      await assert.rejects(call('email/request', { email: 'alice@example.com', password: 'wrong' }, alice.token), { status: 403 });
      const challenge = await call('email/request', { email: ' Alice@Example.com ', password }, alice.token);
      assert.equal(challenge.code, undefined);
      assert.equal((await call('me', undefined, alice.token)).user.email, null);
      const row = (await db.query('SELECT token_hash FROM fanfan_email_actions WHERE id=$1', [challenge.challengeId])).rows[0];
      assert.notEqual(row.token_hash, code());
      await assert.rejects(call('email/verify', { ...challenge, code: code() }, bob.token), { status: 400 });
      for (let i = 0; i < 5; i++) await assert.rejects(call('email/verify', { ...challenge, code: '00000000' }, alice.token), { status: 400 });
      await assert.rejects(call('email/verify', { ...challenge, code: code() }, alice.token), { status: 400 });
    });
    await t.test('mail limits survive process restart; expired or guessed codes do not bind', async () => {
      service = createAccountService(db, { clock: () => now, mailer });
      await assert.rejects(call('email/request', { email: 'alice@example.com', password }, alice.token), { status: 429 });
      now += 61000;
      const challenge = await call('email/request', { email: 'alice@example.com', password }, alice.token);
      const good = code();
      now += 11 * 60000;
      await assert.rejects(call('email/verify', { ...challenge, code: good }, alice.token), { status: 400 });
    });
    await t.test('successful binding is single use and enables email login on same user', async () => {
      const challenge = await call('email/request', { email: 'alice@example.com', password }, alice.token);
      const good = code();
      const outcomes = await Promise.allSettled([call('email/verify', { ...challenge, code: good }, alice.token), call('email/verify', { ...challenge, code: good }, alice.token)]);
      assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
      const profile = (await call('me', undefined, alice.token)).user;
      assert.equal(profile.email, 'alice@example.com');
      assert.equal(profile.emailVerified, true);
      assert.equal((await call('login', { username: 'ALICE@example.com', password })).user.id, alice.user.id);
      await assert.rejects(call('email/request', { email: 'changed@example.com', password }, alice.token), { status: 409 });
    });
    await t.test('unknown and known reset requests use the same response, with no code leakage', async () => {
      const before = messages.length;
      const unknown = await call('password/request', { email: 'unknown@example.com' });
      assert.equal(messages.length, before);
      now += 61000;
      const known = await call('password/request', { email: 'alice@example.com' });
      await delivered(known.challengeId);
      assert.equal(unknown.message, known.message);
      assert.deepEqual(Object.keys(unknown), Object.keys(known));
      assert.equal(known.code, undefined);
      await assert.rejects(call('password/reset', { ...known, code: code(), password: 'short' }), { status: 400 });
      const outcomes = await Promise.allSettled([call('password/reset', { ...known, code: code(), password: newPassword }), call('password/reset', { ...known, code: code(), password: newPassword })]);
      assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
    });
    await t.test('reset invalidates all prior sessions, old password and consumed codes', async () => {
      await assert.rejects(call('me', undefined, alice.token), { status: 401 });
      await assert.rejects(call('login', { username: alice.user.username, password }), { status: 401 });
      const restored = await call('login', { username: 'alice@example.com', password: newPassword });
      assert.equal(restored.user.id, alice.user.id);
      assert.equal((await call('me', undefined, bob.token)).user.id, bob.user.id);
      assert.equal((await db.query('SELECT COUNT(*) AS count FROM fanfan_email_actions WHERE user_id=$1', [alice.user.id])).rows[0].count, 0);
    });
    await t.test('email uniqueness prevents taking another account email; unavailable SMTP fails closed', async () => {
      now += 61000;
      const challenge = await call('email/request', { email: 'alice@example.com', password }, bob.token);
      await assert.rejects(call('email/verify', { ...challenge, code: code() }, bob.token), { status: 409 });
      const disabled = createAccountService(db, { mailer: { configured: false } });
      const request = { url: '/api/account/password/request', method: 'POST', headers: {}, socket: { remoteAddress: 'disabled' } };
      await assert.rejects(disabled.handle(request, async () => ({ email: 'alice@example.com' })), { status: 503 });
      assert.equal((await call('me', undefined, bob.token)).user.email, null);
    });
    await t.test('failed SMTP never makes an unverified email usable', async () => {
      const failing = createAccountService(db, { clock: () => now, mailer: { configured: true, send: async () => { throw new Error('provider unavailable'); } } });
      const request = { url: '/api/account/email/request', method: 'POST', headers: { authorization: `Bearer ${bob.token}` }, socket: { remoteAddress: 'smtp-failure' } };
      await assert.rejects(failing.handle(request, async () => ({ email: 'failed@example.com', password })), { status: 503 });
      assert.equal((await db.query('SELECT COUNT(*) AS count FROM fanfan_email_actions WHERE email=$1', ['failed@example.com'])).rows[0].count, 0);
    });
  } finally { await db.close(); }
});
