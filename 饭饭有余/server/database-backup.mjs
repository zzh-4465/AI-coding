import { randomBytes, createCipheriv, createDecipheriv, publicEncrypt, privateDecrypt, constants } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SCHEMA } from './accounts.mjs';
import { transaction } from './db-utils.mjs';
import { validBackup } from './backup-validation.mjs';

export function encryptSnapshot(snapshot, publicKey) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(snapshot), 'utf8'), cipher.final()]);
  return { format: 'fanfan-db-backup-v1', wrappedKey: publicEncrypt({ key: publicKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, key).toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
export function decryptSnapshot(envelope, privateKey) {
  if (envelope.format !== 'fanfan-db-backup-v1') throw new Error('Unknown backup format');
  const key = privateDecrypt({ key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(envelope.wrappedKey, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}
export async function snapshotDatabase(db) {
  return transaction(db, async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const users = (await client.query('SELECT to_jsonb(u) AS data FROM fanfan_users u ORDER BY id')).rows.map(({ data }) => ({ ...data, email: data.email ?? null, email_verified_at: data.email_verified_at ?? null, auth_version: data.auth_version ?? 0 }));
    const backups = (await client.query('SELECT user_id,revision,data,updated_at FROM fanfan_backups ORDER BY user_id')).rows;
    return { format: 'fanfan-account-snapshot-v1', createdAt: new Date().toISOString(), users, backups };
  });
}
export async function restoreEmptyDatabase(db, snapshot) {
  if (snapshot.format !== 'fanfan-account-snapshot-v1' || !Array.isArray(snapshot.users) || !Array.isArray(snapshot.backups)) throw new Error('Invalid database snapshot');
  if (typeof db.exec === 'function') await db.exec(SCHEMA);
  else await db.query(SCHEMA);
  return transaction(db, async client => {
    await client.query('LOCK TABLE fanfan_users,fanfan_backups IN ACCESS EXCLUSIVE MODE');
    const counts = (await client.query('SELECT (SELECT COUNT(*) FROM fanfan_users) AS users,(SELECT COUNT(*) FROM fanfan_backups) AS backups')).rows[0];
    if (Number(counts.users) || Number(counts.backups)) throw new Error('Restore refuses a non-empty target database');
    for (const user of snapshot.users) {
      if (!Number.isInteger(user.auth_version) || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.password_hash)) throw new Error('Invalid user snapshot');
      await client.query('INSERT INTO fanfan_users(id,username,password_hash,nickname,avatar,created_at,email,email_verified_at,auth_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [user.id, user.username, user.password_hash, user.nickname, user.avatar, user.created_at, user.email, user.email_verified_at, user.auth_version + 1]);
    }
    for (const backup of snapshot.backups) {
      if (!validBackup(backup.data) || !Number.isInteger(backup.revision) || backup.revision < 1) throw new Error('Invalid ledger snapshot');
      await client.query('INSERT INTO fanfan_backups(user_id,revision,data,updated_at) VALUES($1,$2,$3,$4)', [backup.user_id, backup.revision, backup.data, backup.updated_at]);
    }
    return { users: snapshot.users.length, backups: snapshot.backups.length };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv[2] !== 'export' || !process.argv[3] || !process.env.DATABASE_URL) throw new Error('Usage: node database-backup.mjs export BASE64_PUBLIC_KEY');
  const { Pool } = await import('pg');
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const result = encryptSnapshot(await snapshotDatabase(db), Buffer.from(process.argv[3], 'base64').toString('utf8'));
    process.stdout.write(JSON.stringify(result));
  } finally { await db.end(); }
}
