export const REAL_STORE_KEY = import.meta.env?.VITE_WEB_DEMO === 'true'
  ? 'fanfan-youyu-app-v5-android-clean-web-demo-v291'
  : 'fanfan-youyu-app-v5-android-clean';
export const SIMULATION_STORE_KEY = `${REAL_STORE_KEY}-simulation`;
export const isSimulation = typeof location !== 'undefined' && new URLSearchParams(location.search).get('simulation') === '1';
export function now() {
  const value = isSimulation ? sessionStorage.getItem('fanfan-simulation-date') : null;
  return value && Number.isFinite(Date.parse(value)) ? new Date(value) : new Date();
}
export function startSimulation(data) {
  localStorage.setItem(SIMULATION_STORE_KEY, JSON.stringify(data));
  sessionStorage.setItem('fanfan-simulation-date', new Date().toISOString());
  const url = new URL(location.href);
  url.searchParams.set('simulation', '1');
  location.assign(url.href);
}
export function setSimulationTime(value) {
  if (!isSimulation || !Number.isFinite(Date.parse(value))) return;
  sessionStorage.setItem('fanfan-simulation-date', new Date(value).toISOString());
  location.reload();
}
export function exitSimulation() {
  const url = new URL(location.href);
  url.searchParams.delete('simulation');
  location.assign(url.href);
}
