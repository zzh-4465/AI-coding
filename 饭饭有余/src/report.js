const round = value => Math.round(Number(value || 0) * 100) / 100;

export function buildMonthlyReportInput(data, month) {
  const records = (data.transactions || []).filter(item =>
    item.date?.startsWith(month) && item.amount < 0 && !item.transferId && !['calibration', 'settlement'].includes(item.kind)
  );
  const expenses = records.map(item => ({ ...item, spent: Math.abs(item.amount) }));
  const byPool = Object.fromEntries(['food', 'happy', 'emergency'].map(pool => [pool, round(expenses.filter(item => item.pool === pool).reduce((sum, item) => sum + item.spent, 0))]));
  const foodByDay = {};
  for (const item of expenses.filter(item => item.pool === 'food')) foodByDay[item.date] = round((foodByDay[item.date] || 0) + item.spent);
  const titleTotals = new Map();
  for (const item of expenses) {
    const title = String(item.title || '未备注').slice(0, 30);
    titleTotals.set(title, round((titleTotals.get(title) || 0) + item.spent));
  }
  const topPurposes = [...titleTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount }));
  const activeFoodDays = Object.keys(foodByDay).length;
  return {
    period: month,
    currency: 'CNY',
    totalExpense: round(expenses.reduce((sum, item) => sum + item.spent, 0)),
    expensesByPool: byPool,
    transactionCount: expenses.length,
    foodActiveDays: activeFoodDays,
    averageFoodOnActiveDays: activeFoodDays ? round(byPool.food / activeFoodDays) : 0,
    highestFoodDay: Object.entries(foodByDay).sort((a, b) => b[1] - a[1])[0] ? { date: Object.entries(foodByDay).sort((a, b) => b[1] - a[1])[0][0], amount: Object.entries(foodByDay).sort((a, b) => b[1] - a[1])[0][1] } : null,
    currentPoolBalances: Object.fromEntries(['food', 'happy', 'emergency', 'savings'].map(key => [key, round(data.pools?.[key])] )),
    topPurposes,
    wishes: (data.wishes || []).slice(0, 5).map(item => ({ title: String(item.title).slice(0, 40), target: round(item.target), saved: round(item.locked), progress: item.target > 0 ? round(item.locked / item.target) : 0 })),
    dataNote: '金额由本地程序统计，AI只负责解释，不得重新计算或改写。'
  };
}
