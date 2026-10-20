import { isDateKey } from './calendar.js';

export const AI_POOLS = ['food', 'happy', 'emergency'];
export const AI_MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

const cleanText = (value, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const finiteAmount = value => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
};

export function normalizeAiParseResult(input, fallbackDate, wishes = []) {
  const source = input && typeof input === 'object' ? input : {};
  const events = [];
  const unresolved = Array.isArray(source.unresolved)
    ? source.unresolved.map(item => ({
      text: cleanText(item?.text),
      reason: cleanText(item?.reason) || '信息不完整'
    })).filter(item => item.text)
    : [];

  for (const [index, raw] of (Array.isArray(source.events) ? source.events : []).entries()) {
    if (!raw || typeof raw !== 'object') continue;
    const intent = raw.intent || 'expense';
    const amount = finiteAmount(raw.amount ?? raw.budget);
    if (!['expense', 'income', 'create_wish', 'fund_wish'].includes(intent)) {
      unresolved.push({ text: cleanText(raw.evidence) || `第 ${index + 1} 项`, reason: '无法确认操作类型' }); continue;
    }
    if (intent === 'fund_wish') {
      const title = cleanText(raw.wishTitle || raw.title, 40);
      const candidates = wishes.filter(wish => String(wish.id) === String(raw.wishId) || (title && wish.title === title));
      events.push({ intent, amount, wishId: raw.wishId === 'reserve' ? 'reserve' : candidates.length === 1 ? candidates[0].id : null, wishTitle: title,
        source: ['happy', 'reserve', 'external'].includes(raw.source) ? raw.source : 'happy', date: isDateKey(raw.date) ? raw.date : fallbackDate,
        note: cleanText(raw.note || raw.evidence, 80) || '为愿望存钱', evidence: cleanText(raw.evidence) });
      continue;
    }
    if (intent === 'create_wish') {
      const title = cleanText(raw.reward || raw.title || raw.item, 40);
      if (!title) {
        unresolved.push({ text: cleanText(raw.evidence) || `第 ${index + 1} 个愿望`, reason: '缺少愿望内容' });
        continue;
      }
      events.push({
        intent,
        amount,
        title,
        condition: cleanText(raw.condition, 80) || '给自己一个小目标',
        evidence: cleanText(raw.evidence),
        confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0))
      });
      continue;
    }
    if (!amount) {
      unresolved.push({ text: cleanText(raw.evidence || raw.note || raw.item) || `第 ${index + 1} 个事件`, reason: '缺少有效金额' });
      continue;
    }

    const pool = intent === 'income' ? 'happy' : AI_POOLS.includes(raw.pool) ? raw.pool : null;
    const date = isDateKey(raw.date) ? raw.date : fallbackDate;
    const meal = AI_MEALS.includes(raw.meal) ? raw.meal : null;
    const note = cleanText(raw.note || [raw.merchant, raw.item].filter(Boolean).join(' '), 60) || (intent === 'income' ? '一笔收入' : '一笔消费');
    events.push({
      intent,
      amount,
      date,
      pool,
      meal: pool === 'food' ? meal : null,
      note,
      category: cleanText(raw.category, 30),
      evidence: cleanText(raw.evidence),
      confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0))
    });
  }

  for (const event of events) {
    if (event.intent !== 'fund_wish' || event.wishId !== null || !event.wishTitle) continue;
    const matches = events.map((item, index) => ({ item, index })).filter(({ item }) => item.intent === 'create_wish' && item.title === event.wishTitle);
    if (matches.length === 1) event.wishId = `new:${matches[0].index}`;
  }
  return { events, unresolved };
}

export function validateAiBatch(events) {
  const errors = [];
  for (const [index, event] of events.entries()) {
    if (event.intent === 'fund_wish') {
      const target = event.wishId === 'reserve' || Number.isFinite(event.wishId) || /^new:\d+$/.test(event.wishId || '');
      if (!finiteAmount(event.amount) || !target || !['happy', 'reserve', 'external'].includes(event.source) || !isDateKey(event.date) || (event.wishId === 'reserve' && event.source === 'reserve')) errors.push(`愿望存钱 ${index + 1}`);
      continue;
    }
    if (event.intent === 'create_wish') {
      if (!finiteAmount(event.amount) || !cleanText(event.title)) errors.push(`愿望 ${index + 1}`);
      continue;
    }
    if (!['expense', 'income'].includes(event.intent) || (event.intent === 'income' && event.pool !== 'happy') || !finiteAmount(event.amount) || !AI_POOLS.includes(event.pool) || !isDateKey(event.date) || !cleanText(event.note)) {
      errors.push(`账目 ${index + 1}`);
    }
  }
  return errors;
}
