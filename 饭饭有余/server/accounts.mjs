import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { validBackup } from './backup-validation.mjs';
import { EMAIL_SCHEMA, createEmailRecovery, normalizeEmail } from './email-recovery.mjs';
import { createMailer } from './mail.mjs';

const scrypt = promisify(scryptCallback);
const digest = token => createHash('sha256').update(token).digest('hex');
const problem = (status, message) => Object.assign(new Error(message), { status });
export const AVATARS = ['rice', 'leaf', 'sun', 'star'];
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS fanfan_users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  nickname TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT 'rice', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS fanfan_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES fanfan_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS fanfan_sessions_user ON fanfan_sessions(user_id);
CREATE TABLE IF NOT EXISTS fanfan_backups (
  user_id TEXT PRIMARY KEY REFERENCES fanfan_users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);${EMAIL_SCHEMA}`;

export async function openAccountDatabase(connectionString) {
  if (!connectionString) return null;
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000 });
  pool.on('error', error => console.error('Account database connection error:', error.code || 'unknown'));
  await pool.query(SCHEMA);
  return pool;
}

async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `${salt}:${key.toString('hex')}`;
}
async function checkPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(key, Buffer.from(hash, 'hex'));
}
const publicUser = row => ({ id: row.id, username: row.username, nickname: row.nickname, avatar: row.avatar, email: row.email || null, emailVerified: Boolean(row.email_verified_at) });

export function createAccountService(db, { clock = Date.now, mailer = createMailer() } = {}) {
  const attempts = new Map();
  // Precomputed dummy hash keeps unknown-user login on the password verification path.
  const dummyHash = passwordHash(randomBytes(32).toString('hex'));
  const query = (...args) => db.query(...args);
  const one = async (...args) => (await query(...args)).rows[0];
  const recovery = createEmailRecovery(db, { clock, mailer, passwordHash, checkPassword });
  function throttle(key, limit) {
    const now = clock();
    if (attempts.size > 10000) for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
    const entry = attempts.get(key);
    if (!entry || entry.until <= now) {
      if (attempts.size >= 10000 && !entry) throw problem(429, '服务繁忙，请稍后重试');
      attempts.set(key, { count: 1, until: now + 15 * 60000 }); return;
    }
    if (++entry.count > limit) throw problem(429, '尝试过于频繁，请15分钟后再试');
  }
  async function session(user) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(clock() + 30 * 86400000).toISOString();
    await query('DELETE FROM fanfan_sessions WHERE expires_at <= $1', [new Date(clock()).toISOString()]);
    const saved = await one('INSERT INTO fanfan_sessions(token_hash,user_id,expires_at) SELECT $1,id,$3 FROM fanfan_users WHERE id=$2 AND auth_version=$4 RETURNING token_hash', [digest(token), user.id, expiresAt, user.auth_version]);
    if (!saved) throw problem(401, '账号安全状态已更新，请重新登录');
    return { token, expiresAt, user: publicUser(user) };
  }
  async function authenticate(req) {
    const header = req.headers.authorization || '';
    if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) throw problem(401, '请先登录');
    const tokenHash = digest(header.slice(7));
    const user = await one('SELECT u.* FROM fanfan_users u JOIN fanfan_sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>$2', [tokenHash, new Date(clock()).toISOString()]);
    if (!user) throw problem(401, '登录已失效，请重新登录');
    return { user, tokenHash };
  }
  async function handle(req, readJson) {
    if (!db) throw problem(503, '账号与云备份尚未开通，本机记账可继续使用');
    const path = req.url;
    const ip = req.socket.remoteAddress || 'unknown';
    if (path === '/api/account/capabilities' && req.method === 'GET') return { emailRecovery: mailer.configured };
    if (path === '/api/account/password/request' && req.method === 'POST') {
      throttle(`reset-request:${ip}`, 40);
      return recovery.resetRequest(await readJson(req), ip);
    }
    if (path === '/api/account/password/reset' && req.method === 'POST') {
      throttle(`reset-confirm:${ip}`, 40);
      return recovery.consume(await readJson(req), 'reset');
    }
    if (req.method === 'POST' && ['/api/account/register', '/api/account/login'].includes(path)) {
      throttle(`ip:${req.socket.remoteAddress}`, 40);
      const body = await readJson(req);
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      const password = body.password;
      const registering = path.endsWith('/register');
      if ((!/^[a-z0-9_]{4,32}$/.test(username) && (registering || !normalizeEmail(username))) || typeof password !== 'string' || password.length < 10 || password.length > 128) throw problem(400, '请填写有效用户名或已验证邮箱，密码需10–128位；注册用户名为4–32位字母、数字或下划线');
      throttle(`user:${username}`, 15);
      if (path.endsWith('/register')) {
        const nickname = typeof body.nickname === 'string' ? body.nickname.trim().slice(0, 24) : username;
        try {
          const user = await one('INSERT INTO fanfan_users(id,username,password_hash,nickname) VALUES($1,$2,$3,$4) RETURNING *', [randomUUID(), username, await passwordHash(password), nickname || username]);
          return await session(user);
        } catch (error) { if (error.code === '23505') throw problem(409, '这个用户名已被使用'); throw error; }
      }
      const user = await one('SELECT * FROM fanfan_users WHERE username=$1 OR (email=$1 AND email_verified_at IS NOT NULL)', [username]);
      const valid = await checkPassword(password, user?.password_hash || await dummyHash);
      if (!user || !valid) throw problem(401, '用户名或密码不正确');
      return session(user);
    }
    const { user, tokenHash } = await authenticate(req);
    if (path === '/api/account/email/request' && req.method === 'POST') {
      throttle(`bind:${user.id}`, 10);
      return recovery.bindRequest(user, await readJson(req), ip);
    }
    if (path === '/api/account/email/verify' && req.method === 'POST') {
      throttle(`bind-confirm:${user.id}`, 30);
      try { return { user: publicUser((await recovery.consume(await readJson(req), 'bind', user)).user) }; }
      catch (error) { if (error.code === '23505') throw problem(409, '无法绑定此邮箱，请使用其他邮箱'); throw error; }
    }
    if (path === '/api/account/me' && req.method === 'GET') return { user: publicUser(user) };
    if (path === '/api/account/profile' && req.method === 'POST') {
      const body = await readJson(req);
      if (typeof body.nickname !== 'string' || !body.nickname.trim() || body.nickname.trim().length > 24 || !AVATARS.includes(body.avatar)) throw problem(400, '请填写1–24字昵称并选择头像');
      return { user: publicUser(await one('UPDATE fanfan_users SET nickname=$1,avatar=$2 WHERE id=$3 RETURNING *', [body.nickname.trim(), body.avatar, user.id])) };
    }
    if (path === '/api/account/logout' && req.method === 'POST') {
      await query('DELETE FROM fanfan_sessions WHERE token_hash=$1', [tokenHash]);
      return { ok: true };
    }
    if (path === '/api/account/delete' && req.method === 'POST') {
      const body = await readJson(req);
      throttle(`delete:${user.id}`, 10);
      if (typeof body.password !== 'string' || body.password.length > 128 || !await checkPassword(body.password, user.password_hash)) throw problem(403, '密码不正确，未注销账号');
      await query('DELETE FROM fanfan_users WHERE id=$1', [user.id]);
      return { ok: true };
    }
    if (path === '/api/account/backup' && req.method === 'GET') {
      const backup = await one('SELECT revision,data,updated_at FROM fanfan_backups WHERE user_id=$1', [user.id]);
      return { backup: backup ? { revision: backup.revision, data: backup.data, updatedAt: backup.updated_at } : null };
    }
    if (path === '/api/account/backup' && req.method === 'POST') {
      const { data, revision } = await readJson(req);
      if (!Number.isInteger(revision) || revision < 0 || !validBackup(data) || Buffer.byteLength(JSON.stringify(data)) > 2 * 1024 * 1024) throw problem(400, '账本格式无效或超过2MB');
      // Compare-and-swap: two devices cannot silently replace the same revision.
      const saved = revision === 0
        ? await one('INSERT INTO fanfan_backups(user_id,revision,data) VALUES($1,1,$2) ON CONFLICT(user_id) DO NOTHING RETURNING revision,updated_at', [user.id, data])
        : await one('UPDATE fanfan_backups SET data=$1,revision=revision+1,updated_at=NOW() WHERE user_id=$2 AND revision=$3 RETURNING revision,updated_at', [data, user.id, revision]);
      if (!saved) throw problem(409, '云端备份已发生变化，请重新查看后再决定是否覆盖');
      return { revision: saved.revision, updatedAt: saved.updated_at };
    }
    throw problem(404, '接口不存在');
  }
  return { handle, authenticate };
}
