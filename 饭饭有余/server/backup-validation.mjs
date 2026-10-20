// Backups are private snapshots, never a source of paid entitlements.
export function validBackup(data) {
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const nonnegative = value => number(value) && value >= 0;
  const pools = ['food', 'happy', 'emergency', 'savings'];
  if (!object(data) || data.onboarded !== true || data.loadError || !Number.isInteger(data.dataVersion) || data.dataVersion < 1 || data.dataVersion > 7 || !object(data.pools) || pools.some(key => !number(data.pools[key]))) return false;
  if (['monthBudget', 'monthSavings', 'currentSavingsAllocation', 'nextMonthBudget', 'emergencyCarryLimit', 'wishReserve'].some(key => !nonnegative(data[key]))) return false;
  for (const key of ['ratios', 'nextRatios']) {
    if (key === 'nextRatios' && data[key] === undefined) continue;
    const ratio = data[key];
    if (!object(ratio) || pools.some(pool => !nonnegative(ratio[pool]) || ratio[pool] > 100) || Math.abs(pools.reduce((sum, pool) => sum + ratio[pool], 0) - 100) > .00001) return false;
  }
  const date = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!Array.isArray(data.transactions)) return false;
  const ids = new Set();
  for (const tx of data.transactions) {
    if (!object(tx) || !number(tx.id) || ids.has(tx.id) || !date(tx.date) || !pools.includes(tx.pool) || !number(tx.amount) || typeof tx.title !== 'string' || (tx.transferId !== undefined && !number(tx.transferId)) || (tx.batch !== undefined && typeof tx.batch !== 'string')) return false;
    ids.add(tx.id);
  }
  for (const key of ['wishes', 'completedWishes', 'archivedWishes']) {
    if (!Array.isArray(data[key]) || data[key].some(wish => !object(wish) || !number(wish.id) || typeof wish.title !== 'string' || !nonnegative(wish.target) || !nonnegative(wish.locked))) return false;
  }
  if (!Array.isArray(data.wishTransfers) || data.wishTransfers.some(tx => !object(tx) || !number(tx.id) || !number(tx.amount) || !date(tx.date) || typeof tx.source !== 'string')) return false;
  if (!Array.isArray(data.monthlyHistory) || data.monthlyHistory.some(month => !object(month) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month.month) || ['saved', 'foodSpent', 'emergencyCarry'].some(key => !nonnegative(month[key])))) return false;
  if (!object(data.dailyFoodBudgets) || Object.entries(data.dailyFoodBudgets).some(([key, value]) => !date(key) || !nonnegative(value))) return false;
  if (data.lastBudgetMonth !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.lastBudgetMonth)) return false;
  return true;
}
