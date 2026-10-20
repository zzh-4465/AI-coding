import React, { useEffect, useState } from 'react';
import { accountRequest, storeSession } from '../account-client.js';

export default function EmailRecovery({ session, onSession, onRecovered, mode, onCancel, onBusyChange }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [enabled, setEnabled] = useState(null);
  const [capabilityError, setCapabilityError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const binding = mode === 'bind';
  useEffect(() => {
    let active = true;
    accountRequest('capabilities', undefined, null).then(result => { if (active) setEnabled(result.emailRecovery === true); }).catch(() => { if (active) setCapabilityError('暂时无法连接邮箱服务，请联网后重新打开账号面板。'); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  async function run(action) {
    setBusy(true); onBusyChange?.(true); setError(''); setMessage('');
    try { await action(); }
    catch (error) { setError(error.name === 'TypeError' || error.name === 'TimeoutError' ? '连接失败，请稍后重试。' : error.message); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  async function requestCode(event) {
    event.preventDefault();
    await run(async () => {
      const result = await accountRequest(binding ? 'email/request' : 'password/request', { email, ...(binding ? { password } : {}) }, binding ? session : null);
      setChallengeId(result.challengeId); setCode(''); setCooldown(60); setMessage(result.message);
    });
  }
  async function confirm(event) {
    event.preventDefault();
    if (!binding && password !== confirmation) { setError('两次输入的新密码不一致'); return; }
    await run(async () => {
      const result = await accountRequest(binding ? 'email/verify' : 'password/reset', { challengeId, code, ...(!binding ? { password } : {}) }, binding ? session : null);
      if (binding) { const next = { ...session, user: result.user }; storeSession(next); onSession(next); }
      else onRecovered(result.username);
    });
  }
  if (binding && session?.user.emailVerified) return <section className="account-email"><h3>账号找回邮箱</h3><p>{session.user.email}</p><p className="account-hint">已验证，可用此邮箱登录或找回密码。当前版本暂不支持换绑。</p></section>;
  return <section className="account-email"><h3>{binding ? '绑定找回邮箱' : '找回账号密码'}</h3>
    {capabilityError ? <p className="form-error" role="alert">{capabilityError}</p> : enabled === false ? <p className="account-hint" role="status">邮箱服务尚未开通。请先保存好用户名与密码，原账本不受影响。</p> : <>
      <p className="account-hint">{binding ? '验证后可用邮箱登录并找回原账号，不会新建账本。' : '填写原账号已验证的邮箱。未绑定邮箱的账号暂时不能通过此方式找回。'}</p>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="account-success" role="status">{message}</p>}
      <form className="account-form" onSubmit={requestCode}>
        <label>验证邮箱<input type="email" autoComplete="email" required maxLength={254} disabled={busy || !!challengeId} value={email} onChange={event => setEmail(event.target.value)} /></label>
        {binding && <label>当前账号密码<input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={busy || !!challengeId} /></label>}
        <button className="account-secondary" disabled={busy || !enabled || cooldown > 0}>{busy ? '处理中…' : cooldown ? `${cooldown}秒后可重发` : challengeId ? '重新发送验证码' : '发送验证码'}</button>
        {challengeId && <button type="button" className="account-text-button" disabled={busy} onClick={() => { setChallengeId(''); setCode(''); setMessage(''); }}>修改邮箱</button>}
      </form>
      {challengeId && <form className="account-form" onSubmit={confirm}>
        <label>邮箱验证码<input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{8}" maxLength={8} placeholder="8位验证码，10分钟内有效" value={code} onChange={event => setCode(event.target.value)} /></label>
        {!binding && <><label>新密码<input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label><label>确认新密码<input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><p className="account-hint">重置成功后，所有设备需重新登录；原账号和账本保持不变。</p></>}
        <button className="primary-button" disabled={busy}>{binding ? '验证并绑定邮箱' : '确认重置密码'}</button>
      </form>}
    </>}
    {!binding && <button className="account-text-button" disabled={busy} onClick={onCancel}>返回登录</button>}
  </section>;
}
