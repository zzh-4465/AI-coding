import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { transaction } from './db-utils.mjs';

const error = (status, message) => Object.assign(new Error(message), { status });
const hash = value => createHash('sha256').update(value).digest('hex');
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(email) ? email : null;
}
export const EMAIL_SCHEMA = `
ALTER TABLE fanfan_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE fanfan_users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE fanfan_users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS fanfan_users_email_unique ON fanfan_users(email) WHERE email IS NOT NULL;
CREATE TABLE IF NOT EXISTS fanfan_email_actions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES fanfan_users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK(purpose IN ('bind','reset')), email TEXT NOT NULL,
  token_hash TEXT NOT NULL, auth_version INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  delivered BOOLEAN NOT NULL DEFAULT FALSE, expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS fanfan_email_actions_user ON fanfan_email_actions(user_id);
CREATE TABLE IF NOT EXISTS fanfan_mail_limits (
  scope TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);`;

export function createEmailRecovery(db, { mailer, clock, passwordHash, checkPassword }) {
  const one = async (client, sql, params) => (await client.query(sql, params)).rows[0];
  const generic = '如果此邮箱已绑定账号，我们会发送验证码，请查看收件箱或垃圾邮件。';
  const invalid = () => error(400, '验证码无效、已过期或尝试次数过多，请重新获取');
  function requireMail() { if (!mailer.configured) throw error(503, '邮箱验证与找回服务尚未开通，请暂时保存好账号密码'); }
  async function limit(scope, count, windowMs) {
    const now = clock();
    const key = `${scope}:${Math.floor(now / windowMs)}`;
    const row = await one(db, `INSERT INTO fanfan_mail_limits(scope,count,expires_at) VALUES($1,1,$2)
      ON CONFLICT(scope) DO UPDATE SET count=fanfan_mail_limits.count+1 WHERE fanfan_mail_limits.count<$3 RETURNING count`, [key, new Date(now + windowMs).toISOString(), count]);
    if (!row) throw error(429, '验证码请求过于频繁，请稍后再试');
  }
  async function sendLimits(email, ip, userId) {
    await db.query('DELETE FROM fanfan_mail_limits WHERE expires_at<$1', [new Date(clock()).toISOString()]);
    await limit(`mail-minute:${hash(email)}`, 1, 60000);
    await limit(`mail-day:${hash(email)}`, 8, 86400000);
    await limit(`mail-ip:${ip}`, 20, 900000);
    if (userId) await limit(`mail-user:${userId}`, 8, 86400000);
  }
  async function prepare(userId, email, purpose, expectedVersion) {
    const id = randomBytes(24).toString('base64url');
    const code = String(randomInt(10000000, 100000000));
    await transaction(db, async client => {
      const user = await one(client, 'SELECT * FROM fanfan_users WHERE id=$1 FOR UPDATE', [userId]);
      if (!user || (purpose === 'reset' && user.email !== email)) throw invalid();
      if (expectedVersion !== undefined && user.auth_version !== expectedVersion) throw error(401, '账号安全状态已更新，请重新登录');
      if (purpose === 'bind' && user.email) throw error(409, '账号已绑定邮箱，当前版本暂不支持换绑');
      await client.query('DELETE FROM fanfan_email_actions WHERE user_id=$1 AND (purpose=$2 OR expires_at<$3)', [userId, purpose, new Date(clock()).toISOString()]);
      await client.query('INSERT INTO fanfan_email_actions(id,user_id,purpose,email,token_hash,auth_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, userId, purpose, email, hash(`${id}:${code}`), user.auth_version, new Date(clock() + 10 * 60000).toISOString()]);
    });
    return { id, code, email, purpose };
  }
  async function deliver(action) {
    try {
      await mailer.send({ to: action.email, subject: action.purpose === 'bind' ? '饭饭有余 · 邮箱绑定验证' : '饭饭有余 · 找回账号', text: `你的${action.purpose === 'bind' ? '邮箱绑定' : '密码重置'}验证码是：${action.code}\n10分钟内有效，请勿提供给他人。\n如果不是你本人操作，请忽略本邮件。` });
      await db.query('UPDATE fanfan_email_actions SET delivered=TRUE WHERE id=$1', [action.id]);
    } catch {
      await db.query('DELETE FROM fanfan_email_actions WHERE id=$1', [action.id]);
      throw error(503, '邮件暂时发送失败，请稍后重试');
    }
  }
  async function bindRequest(user, body, ip) {
    requireMail();
    const email = normalizeEmail(body.email);
    if (!email) throw error(400, '请填写有效邮箱地址');
    if (typeof body.password !== 'string' || body.password.length > 128 || !await checkPassword(body.password, user.password_hash)) throw error(403, '请填写当前账号的正确密码');
    if (user.email) throw error(409, '账号已绑定邮箱，当前版本暂不支持换绑');
    await sendLimits(email, ip, user.id);
    const action = await prepare(user.id, email, 'bind', user.auth_version);
    await deliver(action);
    return { challengeId: action.id, expiresIn: 600, message: '验证码已发送，有效期10分钟。' };
  }
  async function resetRequest(body, ip) {
    requireMail();
    const email = normalizeEmail(body.email);
    if (!email) throw error(400, '请填写有效邮箱地址');
    await sendLimits(email, ip);
    const user = await one(db, 'SELECT id FROM fanfan_users WHERE email=$1 AND email_verified_at IS NOT NULL', [email]);
    let challengeId = randomBytes(24).toString('base64url');
    if (user) {
      const action = await prepare(user.id, email, 'reset');
      challengeId = action.id;
      // Response never waits for SMTP: unknown and known accounts share the response path.
      void deliver(action).catch(() => console.warn('Password recovery email delivery failed'));
    }
    return { challengeId, expiresIn: 600, message: generic };
  }
  async function consume(body, purpose, authenticatedUser) {
    if (!/^[A-Za-z0-9_-]{32}$/.test(body.challengeId || '') || !/^\d{8}$/.test(body.code || '')) throw invalid();
    let newHash;
    if (purpose === 'reset') {
      if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) throw error(400, '新密码需10–128位');
      newHash = await passwordHash(body.password);
    }
    const outcome = await transaction(db, async client => {
      const candidate = await one(client, 'SELECT user_id FROM fanfan_email_actions WHERE id=$1', [body.challengeId]);
      if (!candidate || (authenticatedUser && candidate.user_id !== authenticatedUser.id)) return null;
      // Always lock user first, matching challenge creation and avoiding lock inversion.
      const user = await one(client, 'SELECT * FROM fanfan_users WHERE id=$1 FOR UPDATE', [candidate.user_id]);
      const action = await one(client, 'SELECT * FROM fanfan_email_actions WHERE id=$1 FOR UPDATE', [body.challengeId]);
      if (!user || !action || action.purpose !== purpose || !action.delivered || +new Date(action.expires_at) <= clock() || action.attempts >= 5 || action.auth_version !== user.auth_version || (purpose === 'reset' && action.email !== user.email)) return null;
      const matched = timingSafeEqual(Buffer.from(action.token_hash, 'hex'), Buffer.from(hash(`${action.id}:${body.code}`), 'hex'));
      if (!matched) {
        await client.query('UPDATE fanfan_email_actions SET attempts=attempts+1 WHERE id=$1', [action.id]);
        return null;
      }
      if (purpose === 'bind') {
        if (user.email || await one(client, 'SELECT id FROM fanfan_users WHERE email=$1', [action.email])) return { conflict: true };
        const updated = await one(client, 'UPDATE fanfan_users SET email=$1,email_verified_at=$2 WHERE id=$3 RETURNING *', [action.email, new Date(clock()).toISOString(), user.id]);
        await client.query('DELETE FROM fanfan_email_actions WHERE user_id=$1', [user.id]);
        return { user: updated };
      }
      await client.query('UPDATE fanfan_users SET password_hash=$1,auth_version=auth_version+1 WHERE id=$2', [newHash, user.id]);
      await client.query('DELETE FROM fanfan_sessions WHERE user_id=$1', [user.id]);
      await client.query('DELETE FROM fanfan_email_actions WHERE user_id=$1', [user.id]);
      return { username: user.username, email: user.email };
    });
    if (!outcome) throw invalid();
    if (outcome.conflict) throw error(409, '无法绑定此邮箱，请使用其他邮箱');
    if (purpose === 'reset') {
      void mailer.send({ to: outcome.email, subject: '饭饭有余 · 密码已重置', text: '你的账号密码刚刚已重置，所有设备的登录状态均已失效。如果不是你本人操作，请立即通过找回密码功能重新设置密码。' }).catch(() => console.warn('Password change notification delivery failed'));
      return { ok: true, username: outcome.username, message: '密码已重置，请重新登录原账号；原账本保留。' };
    }
    return outcome;
  }
  return { bindRequest, resetRequest, consume };
}
