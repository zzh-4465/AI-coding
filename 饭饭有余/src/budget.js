const keys = ['food', 'happy', 'emergency', 'savings'];
const monthKey = date => date.slice(0, 7);

// Largest remainders keep the total exact, including when all other weights are zero.
export function distribute(total, weights) {
  const sum = weights.reduce((a, b) => a + Math.max(0, Number(b) || 0), 0);
  const raw = weights.map(value => total * (sum ? Math.max(0, Number(value) || 0) / sum : 1 / weights.length));
  const result = raw.map(Math.floor);
  const order = raw.map((value, index) => ({ index, remainder: value - result[index] })).sort((a, b) => b.remainder - a.remainder);
  const missing = total - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < missing; i++) result[order[i].index]++;
  return result;
}

export function refreshFoodBudget(data, date, delta) {
  if (!delta) return data;
  const [year, month, day] = date.split('-').map(Number);
  const days = new Date(year, month, 0).getDate() - day + 1;
  const spent = data.transactions.filter(tx => tx.pool === 'food' && tx.date === date && tx.amount < 0 && !tx.transferId && tx.kind !== 'calibration').reduce((sum, tx) => sum - tx.amount, 0);
  const old = data.dailyFoodBudgets?.[date];
  const amount = Math.max(0, Number.isFinite(old) ? old + delta / days : (data.pools.food + spent) / days);
  return { ...data, dailyFoodBudgets: { ...data.dailyFoodBudgets, [date]: amount } };
}

export function rollMonth(data, today) {
  if (!data.onboarded) return data;
  const current = monthKey(today);
  // Existing accounts without a marker start from their latest recorded month.
  const dates = data.transactions.map(tx => tx.date).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today).sort();
  let last = data.lastBudgetMonth || (dates.length ? monthKey(dates.at(-1)) : current);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(last)) return { ...data, lastBudgetMonth: current };
  // Moving a simulated/device clock backwards must never lower the credit watermark.
  if (last > current) return data;
  let next = { ...data, lastBudgetMonth: last };
  const rolled = last < current;
  let id = Math.max(Date.now(), ...data.transactions.map(tx => Number(tx.id) + 1 || 0));
  while (last < current) {
    const [year, month] = last.split('-').map(Number);
    const date = `${last}-${new Date(year, month, 0).getDate()}`;
    const pools = { ...next.pools };
    const records = [];
    const carry = Math.min(pools.emergency, next.emergencyCarryLimit);
    for (const [source, amount] of [['food', pools.food], ['emergency', pools.emergency - carry]]) {
      if (amount <= 0) continue;
      const transferId = ++id;
      records.push({ id: ++id, transferId, date, pool: source, amount: -amount, kind: 'transfer', title: '月末结转小余仓' }, { id: ++id, transferId, date, pool: 'happy', amount, kind: 'transfer', title: '月末结余转入' });
      pools[source] -= amount;
      pools.happy += amount;
    }
    const history = next.monthlyHistory.some(item => item.month === last) ? next.monthlyHistory : [{ month: last, saved: next.monthSavings, emergencyCarry: carry, foodSpent: -next.transactions.filter(tx => tx.date.startsWith(last) && tx.pool === 'food' && tx.amount < 0 && !tx.transferId && tx.kind !== 'calibration').reduce((sum, tx) => sum + tx.amount, 0), happyAdded: 0 }, ...next.monthlyHistory];
    last = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`;
    const total = Math.max(0, Math.round(Number(next.nextMonthBudget || 0) * 100));
    const ratios = next.nextRatios || next.ratios;
    const parts = distribute(total, keys.map(key => ratios[key]));
    const batch = `monthly-${last}`;
    for (const [index, pool] of keys.entries()) {
      const amount = parts[index] / 100;
      pools[pool] += amount;
      if (amount > 0) records.push({ id: ++id, date: `${last}-01`, pool, amount, kind: 'budget', budgetMonth: last, batch, title: '每月生活费自动入账', note: '外部生活费按预算比例分配' });
    }
    next = { ...next, pools, ratios, monthBudget: total / 100, monthSavings: parts[3] / 100, currentSavingsAllocation: parts[3] / 100, monthlyHistory: history, transactions: [...records.reverse(), ...next.transactions], lastBudgetMonth: last };
  }
  if (rolled) {
    next.dailyFoodBudgets = { ...next.dailyFoodBudgets };
    delete next.dailyFoodBudgets[today];
  }
  return next;
}

export function ledgerDateTitle(date) {
  const [year, month, day] = date.split('-').map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}
