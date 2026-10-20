import { test } from 'node:test';
import assert from 'node:assert/strict';

test('account storage namespaces and cross-tab request guards', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const alice = { token: 'alice-token', user: { id: '11111111-1111-4111-8111-111111111111' } };
  const bob = { token: 'bob-token', user: { id: '22222222-2222-4222-8222-222222222222' } };
  values.set('fanfan-account-session-v1', JSON.stringify(alice));
  const client = await import('../src/account-client.js');
  assert.equal(client.accountStoreKey('ledger'), `ledger-user-${alice.user.id}`);
  assert.equal(client.accountStoreKey('ledger', null), 'ledger');
  let requests = 0;
  globalThis.fetch = async () => { requests++; return { ok: true, json: async () => ({ ok: true }) }; };
  await client.accountRequest('me');
  assert.equal(requests, 1);
  client.storeSession(bob);
  await assert.rejects(client.accountRequest('backup', { revision: 0, data: {} }), /账号已在其他页面切换/);
  await assert.rejects(client.accountRequest('backup', {}, alice), /账号已在其他页面切换/);
  assert.equal(requests, 1, 'stale tab must not send a snapshot under another identity');
  values.set(client.SESSION_KEY, '{broken');
  assert.equal(client.readSession(), null);
  delete globalThis.localStorage;
  delete globalThis.fetch;
});
