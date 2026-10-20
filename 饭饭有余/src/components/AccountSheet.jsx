import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { accountRequest, accountStoreKey, readSession, SESSION_KEY, storeSession } from '../account-client.js';
import { REAL_STORE_KEY } from '../clock.js';
import EmailRecovery from './EmailRecovery.jsx';

const avatars = { rice: ['🍙', '饭团'], leaf: ['🌱', '嫩芽'], sun: ['☀️', '太阳'], star: ['⭐', '星星'] };
const stamp = value => value ? new Date(value).toLocaleString('zh-CN') : '暂无';

export default function AccountSheet({ data, onRestore, onClose, disabled = false }) {
  const [session, setSession] = useState(readSession);
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState(session?.user.nickname || '');
  const [avatar, setAvatar] = useState(session?.user.avatar || 'rice');
  const [backup, setBackup] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [expired, setExpired] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [recovering, setRecovering] = useState(false);

  async function run(action) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (error) {
      setError(error.name === 'TimeoutError' || error.name === 'TypeError' ? '连接失败，请检查网络后重试；本地账本未变。' : error.message);
      if (error.status === 401 && session) setExpired(true);
    } finally { setBusy(false); }
  }
  async function refresh() {
    const result = await accountRequest('me');
    const next = { ...session, user: result.user };
    storeSession(next); setSession(next); setNickname(result.user.nickname); setAvatar(result.user.avatar);
    const resultBackup = await accountRequest('backup');
    setBackup(resultBackup.backup); setLoaded(true); setExpired(false);
  }
  useEffect(() => { if (session && !disabled) run(refresh); }, []);

  async function login(event) {
    event.preventDefault();
    await run(async () => {
      const result = await accountRequest(register ? 'register' : 'login', { username, password, nickname }, null);
      // Each identity has its own local ledger. Guest data is only copied explicitly.
      storeSession(result);
      window.location.reload();
    });
  }
  async function upload() {
    if (!window.confirm(backup ? `将用本机账本替换云端备份（${stamp(backup.updatedAt)}）。确认继续？` : '将当前账号的本机账本上传到云端，用于换机恢复。确认上传？')) return;
    await run(async () => {
      const snapshot = structuredClone(data);
      const saved = await accountRequest('backup', { data: snapshot, revision: backup?.revision || 0 });
      setBackup({ ...saved, data: snapshot });
      setMessage('云端备份已更新。后续记账后请再次备份。');
    });
  }
  async function restore() {
    if (!window.confirm(`恢复云端备份（${stamp(backup.updatedAt)}）将替换当前账号的本机账本，恢复前会保留本地快照。确认恢复？`)) return;
    await run(async () => {
      onRestore(backup.data);
      setMessage('已恢复云端备份。');
    });
  }
  async function importGuest() {
    if (!window.confirm('将复制这台设备的游客账本，替换当前账号的本机账本；游客原件保留，云端不会自动更新。确认复制？')) return;
    await run(async () => {
      const raw = localStorage.getItem(REAL_STORE_KEY);
      if (!raw) throw new Error('这台设备没有游客账本');
      const guest = JSON.parse(raw);
      if (!guest.onboarded) throw new Error('游客账本尚未初始化');
      onRestore(guest);
      setMessage('已复制游客账本。确认内容后，可手动备份到云端。');
    });
  }
  async function logout() {
    if (!window.confirm('退出后回到游客账本。当前账号的本机账本仍保留在这台设备，重新登录可继续使用。确认退出？')) return;
    await run(async () => {
      try { await accountRequest('logout', {}); } catch (error) { if (error.status !== 401) throw error; }
      localStorage.removeItem(SESSION_KEY);
      window.location.reload();
    });
  }
  async function deleteAccount(event) {
    event.preventDefault();
    if (!window.confirm('确认永久注销？账号、云端备份以及此账号在本机的账本和快照将被删除，无法撤销。其他设备的离线副本需自行清理。')) return;
    await run(async () => {
      await accountRequest('delete', { password: deletePassword });
      const key = accountStoreKey(REAL_STORE_KEY, session);
      const keys = Object.keys(localStorage).filter(name => name === key || name.startsWith(`${key}-`));
      keys.forEach(name => localStorage.removeItem(name));
      localStorage.removeItem(SESSION_KEY);
      window.location.reload();
    });
  }

  return <div className="sheet-backdrop" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
    <div className="sheet account-sheet" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <div className="sheet-handle" />
      <div className="sheet-head"><div><p className="eyebrow">YOUR ACCOUNT</p><h2 id="account-title">账号与云备份</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="关闭"><X /></button></div>
      {disabled ? <p>模拟模式不连接账号服务，请回到真实账本后使用。</p> : <>
        {session && <div className="account-identity"><span>{avatars[session.user.avatar]?.[0] || '🍙'}</span><div><b>{session.user.nickname}</b><small>@{session.user.username} · 当前为账号独立账本</small></div></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="account-success" role="status">{message}</p>}
        {recovering ? <EmailRecovery mode="reset" onBusyChange={setBusy} onCancel={() => setRecovering(false)} onRecovered={name => { setUsername(name); setPassword(''); setRegister(false); setRecovering(false); setMessage('密码已重置，请用新密码登录原账号。'); }} /> : (!session || expired) ? <>
          <p className="account-hint">登录后使用独立账本，可手动复制游客账本或恢复云备份。无需登录也能离线记账。</p>
          <form className="account-form" onSubmit={login}>
            <label>{register ? '用户名' : '用户名或已验证邮箱'}<input autoComplete="username" required minLength={4} maxLength={register ? 32 : 254} pattern={register ? '[A-Za-z0-9_]{4,32}' : undefined} placeholder={register ? '4–32位字母、数字或下划线' : '填写用户名或已验证邮箱'} value={username} onChange={event => setUsername(event.target.value)} /></label>
            {register && <label>昵称<input autoComplete="nickname" maxLength={24} value={nickname} onChange={event => setNickname(event.target.value)} /></label>}
            <label>密码<input type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={10} maxLength={128} placeholder="至少10位，请妥善保存" value={password} onChange={event => setPassword(event.target.value)} /></label>
            <p className="account-hint">注册后可在账号面板验证找回邮箱；请保存好用户名与密码。</p>
            <button className="primary-button" disabled={busy}>{busy ? '连接中…' : register ? '注册并登录' : '登录'}</button>
          </form>
          <button className="account-text-button" disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>{register ? '已有账号，去登录' : '还没有账号，去注册'}</button>
          {!register && <button className="account-text-button" disabled={busy} onClick={() => { setRecovering(true); setError(''); setMessage(''); }}>忘记密码？通过邮箱找回</button>}
          {session && <button className="account-text-button" disabled={busy} onClick={logout}>退出此账号</button>}
        </> : <>
          <EmailRecovery mode="bind" session={session} onSession={next => { setSession(next); setMessage('邮箱已验证，原账号与账本保留。'); }} onBusyChange={setBusy} />
          <form className="account-form" onSubmit={event => { event.preventDefault(); run(async () => {
            const result = await accountRequest('profile', { nickname, avatar });
            const next = { ...session, user: result.user }; storeSession(next); setSession(next); setMessage('个人资料已保存。');
          }); }}>
            <label>昵称<input required maxLength={24} value={nickname} onChange={event => setNickname(event.target.value)} /></label>
            <div className="account-avatars" aria-label="选择头像">{Object.entries(avatars).map(([key, [emoji, label]]) => <button key={key} type="button" aria-label={label} aria-pressed={avatar === key} onClick={() => setAvatar(key)} disabled={busy}>{emoji}</button>)}</div>
            <button className="account-secondary" disabled={busy}>保存资料</button>
          </form>
          <section className="account-cloud"><h3>云端备份</h3><p>最近备份：{loaded ? stamp(backup?.updatedAt) : '尚未获取'}</p><p className="account-hint">手动备份，不会自动合并两台设备的账本。每次上传会替换上一份云备份。</p>
            <div className="account-actions"><button className="primary-button" onClick={upload} disabled={busy || !loaded || !data.onboarded || !!data.loadError}>备份当前账本</button><button className="account-secondary" onClick={restore} disabled={busy || !backup}>恢复云端备份</button></div>
            <button className="account-text-button" onClick={() => run(refresh)} disabled={busy}>刷新云端状态</button>
          </section>
          <button className="account-secondary" onClick={importGuest} disabled={busy}>复制此设备的游客账本</button>
          <p className="account-hint">退出后，账号账本仍保存在此设备。共用设备时请注意隐私。</p>
          <button className="account-secondary" onClick={logout} disabled={busy}>退出登录</button>
          <button className="account-text-button account-danger" disabled={busy} onClick={() => setDeleteOpen(!deleteOpen)}>注销账号</button>
          {deleteOpen && <form className="account-form account-delete" onSubmit={deleteAccount}><p>注销会永久删除账号及云端备份，并清理此账号在本机的数据。建议先导出账本。</p><label>输入密码确认<input type="password" autoComplete="current-password" required maxLength={128} value={deletePassword} onChange={event => setDeletePassword(event.target.value)} /></label><button className="account-secondary account-danger" disabled={busy}>永久注销账号</button></form>}
        </>}
      </>}
    </div>
  </div>;
}
