import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAiParseResult, validateAiBatch } from '../src/ai-normalize.js';
import { applyQuickBatch } from '../src/quick-batch.js';

const date = '2026-10-19';
const fixture = () => ({ pools: { food: 200, happy: 150, savings: 50, emergency: 50 }, wishes: [{ id: 7, title: '耳机', target: 600, locked: 50 }], wishReserve: 30, transactions: [], wishTransfers: [] });

test('mixed expense, income, new wish and deposit keep separate amounts and save atomically', () => {
  const data = fixture();
  const { events } = normalizeAiParseResult({ events: [
    { intent: 'expense', amount: 15, pool: 'food', note: '午饭' },
    { intent: 'income', amount: 500, note: '兼职' },
    { intent: 'create_wish', title: '相机', amount: 3000 },
    { intent: 'fund_wish', amount: 200, wishTitle: '相机', source: 'happy' }
  ] }, date, data.wishes);
  assert.equal(events[3].wishId, 'new:2');
  const next = applyQuickBatch(data, events, date, 100);
  assert.equal(next.pools.food, 185); assert.equal(next.pools.happy, 450);
  assert.equal(next.wishes.find(w => w.title === '相机').locked, 200);
  assert.equal(next.wishes.find(w => w.title === '相机').target, 3000);
  assert.equal(next.transactions.length, 2); assert.equal(next.wishTransfers.length, 1);
  assert.equal(data.pools.food, 200); assert.equal(data.wishes.length, 1);
});

test('wish deposits match existing targets and do not turn into expenses', () => {
  const data = fixture();
  const { events } = normalizeAiParseResult({ events: [{ intent: 'fund_wish', wishTitle: '耳机', amount: 100 }] }, date, data.wishes);
  const next = applyQuickBatch(data, events, date);
  assert.equal(next.wishes[0].locked, 150); assert.equal(next.pools.happy, 50);
  assert.equal(next.transactions.length, 0); assert.equal(next.wishTransfers[0].source, 'happy');
});

test('unclear wish deposits keep their intent and require user selection instead of guessing', () => {
  const { events } = normalizeAiParseResult({ events: [{ intent: 'fund_wish', wishTitle: '耳机' }] }, date, [{ id: 1, title: '耳机' }, { id: 2, title: '耳机' }]);
  assert.equal(events[0].intent, 'fund_wish'); assert.equal(events[0].wishId, null); assert.equal(events[0].amount, null);
  assert.deepEqual(validateAiBatch(events), ['愿望存钱 1']);
});

test('insufficient funding, duplicate deposits and over-target funding cannot partially save', () => {
  const data = fixture(), original = structuredClone(data);
  const expense = { intent: 'expense', amount: 100, pool: 'happy', date, note: '娱乐' };
  const deposit = { intent: 'fund_wish', amount: 100, wishId: 7, source: 'happy', date };
  assert.throws(() => applyQuickBatch(data, [expense, deposit], date), /余额不足/);
  assert.throws(() => applyQuickBatch(data, [deposit, deposit], date), /余额不足/);
  assert.throws(() => applyQuickBatch(data, [{ ...deposit, source: 'external', amount: 1000 }], date), /最多还可存入/);
  assert.deepEqual(data, original);
});

test('reserve and external sources preserve correct accounting at cent precision', () => {
  const data = fixture();
  const next = applyQuickBatch(data, [{ intent: 'fund_wish', amount: 0.01, wishId: 7, source: 'reserve', date }, { intent: 'fund_wish', amount: 0.02, wishId: 'reserve', source: 'external', date }], date);
  assert.equal(next.wishes[0].locked, 50.01); assert.equal(next.wishReserve, 30.01); assert.equal(next.pools.happy, 150);
});
