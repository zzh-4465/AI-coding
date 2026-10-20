// Pure account operations: validate the complete change before committing it.
export const isBudgetRecord = item => item.kind === 'budget' || item.kind === 'external';
export const isManagedRecord = item => Boolean(item.transferId) || ['transfer', 'calibration', 'budget', 'external', 'settlement'].includes(item.kind);

export function removeTransaction(data, id) {
  const item = data.transactions.find(tx => tx.id === id);
  if (!item) return data;
  const removed = item.batch ? data.transactions.filter(tx => tx.batch === item.batch) : item.transferId ? data.transactions.filter(tx => tx.transferId === item.transferId) : [item];
  const pools = { ...data.pools };
  let savingsChange = 0;
  let budgetChange = 0;
  for (const tx of removed) {
    pools[tx.pool] -= tx.amount;
    const currentMonth = !data.lastBudgetMonth || tx.date?.startsWith(data.lastBudgetMonth);
    if (tx.pool === 'savings' && currentMonth) savingsChange += tx.amount;
    if (isBudgetRecord(tx) && currentMonth) budgetChange += tx.amount;
  }
  if (Object.values(pools).some(value => !Number.isFinite(value) || value < -0.000001)) {
    throw new Error('这笔资金已被使用，删除后余额会不足。请先补足相关资金池。');
  }
  for (const key of Object.keys(pools)) pools[key] = Math.max(0, pools[key]);
  return {
    ...data, pools,
    monthBudget: Math.max(0, data.monthBudget - budgetChange),
    monthSavings: Math.max(0, data.monthSavings - savingsChange),
    currentSavingsAllocation: Math.max(0, (data.currentSavingsAllocation || 0) - savingsChange),
    transactions: data.transactions.filter(tx => !removed.some(record => record.id === tx.id))
  };
}

export function validateRecordEdit(data, item) {
  if (!Number.isFinite(item.amount) || item.amount === 0 || !(item.pool in data.pools)) throw new Error('请输入有效的金额和资金池。');
  const previous = data.transactions.find(tx => tx.id === item.id);
  if (previous && isManagedRecord(previous)) throw new Error('这类资金操作不能作为普通记账修改，请删除原操作后重新录入。');
  const pools = { ...data.pools };
  if (previous) pools[previous.pool] -= previous.amount;
  pools[item.pool] += item.amount;
  if (Object.values(pools).some(value => !Number.isFinite(value))) throw new Error('修改后的资金池金额无效。');
  // Expenses may overdraw a pool. Positive records are still protected because
  // moving or shrinking spent income would silently remove its funding source.
  if (item.amount > 0 && Object.values(pools).some(value => value < -0.000001)) throw new Error('修改后资金池余额不足，请先补足资金。');
}
