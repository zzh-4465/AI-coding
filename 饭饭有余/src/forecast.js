const spendingPools = ['food', 'happy', 'emergency'];

export function tomorrowFoodBudget(data, date) {
  const [year, month, day] = date.split('-').map(Number);
  const daysAfterToday = new Date(year, month, 0).getDate() - day;
  return daysAfterToday > 0 ? data.pools.food / daysAfterToday : null;
}

export function monthOutlook(data, date, todayBudget = 0) {
  const [year, month, day] = date.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthKey = date.slice(0, 7);
  const foodSpent = -(data.transactions || [])
    .filter(item => item.pool === 'food' && item.date.startsWith(monthKey) && item.date <= date && item.amount < 0 && !item.transferId && item.kind !== 'calibration')
    .reduce((sum, item) => sum + item.amount, 0);
  const dailyPace = foodSpent / Math.max(1, day);
  const projectedEnd = data.pools.food - dailyPace * Math.max(0, daysInMonth - day);
  const debts = spendingPools.filter(key => data.pools[key] < 0);
  const reference = Math.max(1, todayBudget, Number(data.monthBudget || 0) * Number(data.ratios?.food || 0) / 100 / daysInMonth);
  if (debts.length) return { level: 'debt', mood: 'worried', title: '已经出现负债', detail: `${debts.map(key => ({ food: '饮食池', happy: '小余仓', emergency: '应急池' })[key]).join('、')}低于 0，需要优先补上。`, projectedEnd };
  if (data.pools.food <= 0) return { level: 'empty', mood: 'worried', title: '饮食余粮已经见底', detail: '今天开始需要补充饮食池或减少支出。', projectedEnd };
  if (projectedEnd < 0) return { level: 'careful', mood: 'careful', title: '接下来要省着点花', detail: `按本月饮食速度，月底可能差 ${formatAmount(-projectedEnd)}。`, projectedEnd };
  if (projectedEnd < reference * 2) return { level: 'balanced', mood: 'steady', title: '现在属于保本状态', detail: `按当前节奏，月底预计剩 ${formatAmount(projectedEnd)}。`, projectedEnd };
  return { level: 'surplus', mood: 'happy', title: '照这个节奏，月底还能有余', detail: `按当前节奏，月底预计剩 ${formatAmount(projectedEnd)}。`, projectedEnd };
}

const formatAmount = value => `¥${Number(value).toFixed(2)}`;
