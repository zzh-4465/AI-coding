import { isDateKey } from './calendar.js';
import { normalizePet } from './pet.js';

const pools = ['food', 'happy', 'emergency', 'savings'];
const ROLLING_BACKUP_SUFFIX = '-rolling-backups';
export const ROLLING_BACKUP_LIMIT = 5;
export const ROLLING_BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = field => { throw new Error(`数据字段无效：${field}。原账本未被覆盖。`); };

const rollingBackupKey = key => `${key}${ROLLING_BACKUP_SUFFIX}`;

export function readRollingBackups(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(rollingBackupKey(key)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => object(item) && typeof item.createdAt === 'string' && object(item.data))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch {
    return [];
  }
}

export function latestRollingBackup(storage, key) {
  return readRollingBackups(storage, key)[0] || null;
}

export function saveRollingBackup(storage, key, data, options = {}) {
  if (!object(data) || data.loadError || data.onboarded !== true) return { created: false, backup: latestRollingBackup(storage, key) };
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const force = options.force === true;
  const interval = Number.isFinite(options.intervalMs) ? options.intervalMs : ROLLING_BACKUP_INTERVAL_MS;
  const limit = Math.max(1, Number.isFinite(options.limit) ? Math.floor(options.limit) : ROLLING_BACKUP_LIMIT);
  const backups = readRollingBackups(storage, key);
  const latestTime = backups[0] ? Date.parse(backups[0].createdAt) : 0;
  if (!force && Number.isFinite(latestTime) && now - latestTime < interval) return { created: false, backup: backups[0] || null };
  const backup = {
    id: `${now}-${backups.length}`,
    createdAt: new Date(now).toISOString(),
    reason: typeof options.reason === 'string' ? options.reason : 'interval',
    data: structuredClone(data)
  };
  const next = [backup, ...backups.filter(item => item.id !== backup.id)].slice(0, limit);
  let lastError;
  for (let count = next.length; count >= 1; count -= 1) {
    try {
      storage.setItem(rollingBackupKey(key), JSON.stringify(next.slice(0, count)));
      return { created: true, backup };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('自动备份保存失败');
}

export function restoreLatestRollingBackup(storage, key, defaults) {
  const target = latestRollingBackup(storage, key);
  if (!target) throw new Error('还没有可恢复的自动备份');
  const next = normalizeData(target.data, defaults);
  const currentRaw = storage.getItem(key);
  if (currentRaw !== null) {
    try {
      const current = normalizeData(JSON.parse(currentRaw), defaults);
      saveRollingBackup(storage, key, current, { force: true, reason: 'before-rolling-restore' });
    } catch {
      // A corrupt live account must not replace the last known-good rolling backup.
    }
  }
  return importData(storage, key, next, defaults);
}

export function normalizeData(input, defaults) {
  if (!object(input) || !object(input.pools) || !Array.isArray(input.transactions)) fail('账本结构');
  if (input.dataVersion !== undefined && (!finite(input.dataVersion) || input.dataVersion > defaults.dataVersion)) fail('版本');
  const data = { ...structuredClone(defaults), ...structuredClone(input) };
  data.pet = normalizePet(input.pet || defaults.pet);
  for (const key of pools) if (!finite(data.pools[key])) fail(`资金池 ${key}`);
  for (const key of ['monthBudget', 'monthSavings', 'currentSavingsAllocation', 'nextMonthBudget', 'emergencyCarryLimit', 'wishReserve']) {
    if (!finite(data[key]) || data[key] < 0) fail(key);
  }
  if (typeof data.onboarded !== 'boolean') fail('初始化状态');
  for (const name of ['ratios', 'nextRatios']) {
    const ratios = data[name];
    if (name === 'nextRatios' && ratios === undefined) continue;
    if (!object(ratios) || pools.some(key => !finite(ratios[key]) || ratios[key] < 0 || ratios[key] > 100) || Math.abs(pools.reduce((sum, key) => sum + ratios[key], 0) - 100) > .00001) fail(name);
  }
  const ids = new Set();
  for (const tx of data.transactions) {
    if (!object(tx) || !finite(tx.id) || ids.has(tx.id) || !isDateKey(tx.date) || !pools.includes(tx.pool) || !finite(tx.amount) || typeof tx.title !== 'string') fail('流水');
    if (tx.transferId !== undefined && !finite(tx.transferId)) fail('关联转账');
    if (tx.batch !== undefined && typeof tx.batch !== 'string') fail('入账批次');
    ids.add(tx.id);
  }
  for (const key of ['wishes', 'completedWishes', 'archivedWishes']) {
    if (!Array.isArray(data[key])) fail(key);
    for (const wish of data[key]) if (!object(wish) || !finite(wish.id) || typeof wish.title !== 'string' || !finite(wish.target) || !finite(wish.locked) || wish.target < 0 || wish.locked < 0) fail(key);
  }
  if (!Array.isArray(data.wishTransfers)) fail('愿望流水');
  for (const tx of data.wishTransfers) if (!object(tx) || !finite(tx.id) || !finite(tx.amount) || !isDateKey(tx.date) || typeof tx.source !== 'string') fail('愿望流水');
  if (!Array.isArray(data.monthlyHistory)) fail('月度总结');
  for (const month of data.monthlyHistory) {
    if (!object(month) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month.month)) fail('总结月份');
    for (const key of ['saved', 'foodSpent', 'emergencyCarry']) if (!finite(month[key]) || month[key] < 0) fail('总结金额');
  }
  if (!object(data.dailyFoodBudgets)) fail('每日预算格式');
  for (const [date, amount] of Object.entries(data.dailyFoodBudgets)) if (!isDateKey(date) || !finite(amount) || amount < 0) fail('每日预算');
  if (data.lastBudgetMonth !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.lastBudgetMonth)) fail('最近入账月份');
  delete data.loadError;
  return data;
}

// localStorage replacement is atomic; require a pre-restore snapshot before committing.
export function importData(storage, key, input, defaults) {
  const data = normalizeData(input, defaults);
  const old = storage.getItem(key);
  if (old !== null) storage.setItem(`${key}-before-restore`, old);
  storage.setItem(key, JSON.stringify(data));
  return data;
}
