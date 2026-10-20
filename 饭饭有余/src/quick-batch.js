import { validateAiBatch } from './ai-normalize.js';

// Build the complete result before committing; a failed wish deposit saves nothing.
export function applyQuickBatch(data, events, today, stamp = Date.now()) {
  const errors = validateAiBatch(events);
  if (!events.length || errors.length) throw new Error(`请补全：${errors.join('、') || '识别结果'}`);
  const next = { ...data, pools: { ...data.pools }, wishes: data.wishes.map(wish => ({ ...wish })), transactions: [...data.transactions], wishTransfers: [...data.wishTransfers] };
  const cents = value => Math.round(Number(value) * 100);
  let id = Math.max(stamp, ...[...data.transactions, ...data.wishes, ...data.wishTransfers].map(item => Number(item.id) || 0));
  const created = new Map();
  const transactions = [], transfers = [];
  events.forEach((event, index) => {
    if (event.intent === 'create_wish') {
      const wish = { id: ++id, icon: '✨', title: event.title.trim(), condition: event.condition?.trim() || '给自己一个小目标', target: cents(event.amount) / 100, locked: 0, createdAt: today, source: 'ai-quick-entry' };
      created.set(`new:${index}`, wish.id); next.wishes.unshift(wish);
    } else if (['expense', 'income'].includes(event.intent)) {
      const pool = event.intent === 'income' ? 'happy' : event.pool;
      const amount = cents(event.amount) * (event.intent === 'income' ? 1 : -1);
      next.pools[pool] = (cents(next.pools[pool]) + amount) / 100;
      transactions.push({ id: ++id, date: event.date, pool, meal: pool === 'food' ? event.meal || undefined : undefined, title: event.note.trim(), note: event.evidence || undefined, amount: amount / 100, entrySource: event.entrySource || 'ai-text' });
    }
  });
  for (const event of events.filter(item => item.intent === 'fund_wish')) {
    const amount = cents(event.amount);
    const wishId = created.get(event.wishId) ?? event.wishId;
    const wish = next.wishes.find(item => item.id === wishId);
    if (wishId !== 'reserve' && !wish) throw new Error('请重新选择要存入的愿望');
    if (wish && amount > cents(wish.target) - cents(wish.locked)) throw new Error(`「${wish.title}」最多还可存入 ${((cents(wish.target) - cents(wish.locked)) / 100).toFixed(2)} 元`);
    const balance = event.source === 'external' ? Infinity : cents(event.source === 'reserve' ? next.wishReserve : next.pools.happy);
    if (amount > balance) throw new Error(`${event.source === 'reserve' ? '愿望池待分配余额' : '小余仓余额'}不足，还差 ${((amount - balance) / 100).toFixed(2)} 元`);
    if (event.source === 'happy') next.pools.happy = (cents(next.pools.happy) - amount) / 100;
    if (event.source === 'reserve') next.wishReserve = (cents(next.wishReserve) - amount) / 100;
    if (wish) wish.locked = (cents(wish.locked) + amount) / 100;
    else next.wishReserve = (cents(next.wishReserve) + amount) / 100;
    transfers.push({ id: ++id, date: event.date, wishId: wish?.id ?? null, source: event.source, note: event.note || event.evidence || '', title: wish ? `${event.source === 'reserve' ? '从待分配存入' : event.source === 'external' ? '由外部支持存入' : '从小余仓存入'}「${wish.title}」` : '存入愿望池（待分配）', amount: amount / 100 });
  }
  next.transactions = [...transactions, ...next.transactions]; next.wishTransfers = [...transfers, ...next.wishTransfers];
  return next;
}
