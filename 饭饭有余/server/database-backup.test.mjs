import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA, createAccountService } from './accounts.mjs';
import { encryptSnapshot, decryptSnapshot, snapshotDatabase, restoreEmptyDatabase } from './database-backup.mjs';

test('independent encrypted snapshot restores accounts to empty database and rejects overwrite/tampering', async () => {
  const db = new PGlite();
  const restored = new PGlite();
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  try {
    await db.exec(SCHEMA);
    const service = createAccountService(db);
    const original = await service.handle({ url: '/api/account/register', method: 'POST', headers: {}, socket: { remoteAddress: 'backup-test' } }, async () => ({ username: 'backup_user', password: 'backup-password-2026' }));
    await db.query('UPDATE fanfan_users SET email=$1,email_verified_at=NOW() WHERE id=$2', ['backup@example.com', original.user.id]);
    const ledger = { dataVersion: 7, onboarded: true, pools: { food: 560, happy: 100, emergency: 140, savings: 200 }, monthBudget: 1000, monthSavings: 200, currentSavingsAllocation: 200, nextMonthBudget: 0, emergencyCarryLimit: 100, wishReserve: 0, ratios: { food: 56, happy: 10, emergency: 14, savings: 20 }, transactions: [], wishes: [], completedWishes: [], archivedWishes: [], wishTransfers: [], monthlyHistory: [], dailyFoodBudgets: {} };
    await service.handle({ url: '/api/account/backup', method: 'POST', headers: { authorization: `Bearer ${original.token}` }, socket: { remoteAddress: 'backup-test' } }, async () => ({ data: ledger, revision: 0 }));
    const plain = await snapshotDatabase(db);
    assert.equal(plain.users.length, 1);
    assert.equal(plain.sessions, undefined);
    const encrypted = encryptSnapshot(plain, keys.publicKey);
    assert.equal(JSON.stringify(encrypted).includes('backup_user'), false);
    const snapshot = decryptSnapshot(encrypted, keys.privateKey);
    assert.equal(snapshot.users[0].id, original.user.id);
    const tampered = { ...encrypted, ciphertext: Buffer.from('tampered').toString('base64') };
    assert.throws(() => decryptSnapshot(tampered, keys.privateKey));
    assert.deepEqual(await restoreEmptyDatabase(restored, snapshot), { users: 1, backups: 1 });
    assert.deepEqual((await restored.query('SELECT data FROM fanfan_backups WHERE user_id=$1', [original.user.id])).rows[0].data, ledger);
    assert.equal((await restored.query('SELECT email FROM fanfan_users WHERE id=$1', [original.user.id])).rows[0].email, 'backup@example.com');
    assert.equal(Number((await restored.query('SELECT COUNT(*) AS count FROM fanfan_sessions')).rows[0].count), 0);
    const restoredService = createAccountService(restored);
    const login = await restoredService.handle({ url: '/api/account/login', method: 'POST', headers: {}, socket: { remoteAddress: 'restored-test' } }, async () => ({ username: 'backup_user', password: 'backup-password-2026' }));
    assert.equal(login.user.id, original.user.id);
    await assert.rejects(restoreEmptyDatabase(restored, snapshot), /non-empty/);
  } finally { await db.close(); await restored.close(); }
});
