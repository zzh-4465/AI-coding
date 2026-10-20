export const SESSION_KEY = 'fanfan-account-session-v1';
export const WEB_DEMO = import.meta.env?.VITE_WEB_DEMO === 'true';
export function readSession() {
  if (WEB_DEMO) return null;
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY));
    return value?.user?.id && /^[a-f0-9-]{36}$/.test(value.user.id) && typeof value.token === 'string' ? value : null;
  } catch { return null; }
}
export const accountStoreKey = (base, session = readSession()) => session ? `${base}-user-${session.user.id}` : base;
export function storeSession(session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
const initialUserId = readSession()?.user.id;
export async function accountRequest(path, body, session = readSession()) {
  if (session && (session.user.id !== initialUserId || readSession()?.user.id !== initialUserId)) {
    throw new Error('账号已在其他页面切换，请刷新页面后继续');
  }
  const base = import.meta.env?.VITE_ACCOUNT_API_BASE || import.meta.env?.VITE_AI_API_BASE || '';
  const response = await fetch(`${base}/api/account/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || '账号服务暂时不可用，请稍后重试'), { status: response.status });
  return result;
}
