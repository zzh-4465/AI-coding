import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeMonth, selectMonth, isDateKey } from '../src/calendar.js';
import { normalizeData, importData, latestRollingBackup, readRollingBackups, restoreLatestRollingBackup, saveRollingBackup } from '../src/storage.js';
import { rollMonth } from '../src/budget.js';
const sample = () => ({ dataVersion: 6, onboarded: true, lastBudgetMonth: '2026-09', pools: { food: 560, happy: 100, emergency: 140, savings: 200 }, ratios: { food: 56, happy: 10, emergency: 14, savings: 20 }, monthBudget: 1000, nextMonthBudget: 1000, monthSavings: 200, currentSavingsAllocation: 200, wishReserve: 0, emergencyCarryLimit: 100, transactions: [], wishes: [], archivedWishes: [], completedWishes: [], wishTransfers: [], monthlyHistory: [], dailyFoodBudgets: {} });
test('calendar switches years and clamps days for leap February and small months', () => {
  assert.equal(changeMonth('2026-12-31', 1), '2027-01-31');
  assert.equal(changeMonth('2026-03-31', -1), '2026-02-28');
  assert.equal(selectMonth('2026-08-31', '2024-02'), '2024-02-29');
  assert.equal(selectMonth('2026-08-31', '2026-09'), '2026-09-30');
  assert.equal(isDateKey('2026-09-31'), false);
  assert.equal(isDateKey('2024-02-29'), true);
});
test('invalid backup does not mutate source data', () => {
  const data = sample();
  data.pools.food = '100';
  assert.throws(() => normalizeData(data, sample()), /资金池/);
  assert.equal(data.pools.food, '100');
  data.pools.food = 100;
  data.dailyFoodBudgets['2026-09-31'] = 10;
  assert.throws(() => normalizeData(data, sample()), /每日预算/);
});
test('invalid transaction dates, duplicate IDs and wrong array shapes rejected', () => {
  const data = sample();
  data.transactions = [{ id: 1, date: '2026-09-31', pool: 'food', title: 'bad date', amount: -10 }];
  assert.throws(() => normalizeData(data, sample()), /流水/);
  data.transactions[0].date = '2026-09-01';
  data.transactions.push({ ...data.transactions[0] });
  assert.throws(() => normalizeData(data, sample()), /流水/);
  data.transactions = [];
  data.wishes = {};
  assert.throws(() => normalizeData(data, sample()), /wishes/);
});
test('restore preserves prior snapshot; quota failure never overwrites existing account', () => {
  const map = new Map([['real', 'original']]);
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
  importData(storage, 'real', sample(), sample());
  assert.equal(map.get('real-before-restore'), 'original');
  const before = map.get('real');
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => importData(storage, 'real', sample(), sample()), /quota/);
  assert.equal(map.get('real'), before);
});
test('rolling backup respects interval, keeps five snapshots and restores the latest valid account', () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
  const first = sample();
  const firstResult = saveRollingBackup(storage, 'real', first, { now: 1_000, intervalMs: 100 });
  assert.equal(firstResult.created, true);
  const skipped = saveRollingBackup(storage, 'real', { ...first, monthBudget: 1100 }, { now: 1_050, intervalMs: 100 });
  assert.equal(skipped.created, false);
  for (let index = 1; index <= 6; index += 1) {
    saveRollingBackup(storage, 'real', { ...first, monthBudget: 1000 + index }, { now: 1_000 + index * 100, force: true, reason: 'test' });
  }
  assert.equal(readRollingBackups(storage, 'real').length, 5);
  assert.equal(latestRollingBackup(storage, 'real').data.monthBudget, 1006);
  const live = { ...first, monthBudget: 2000 };
  storage.setItem('real', JSON.stringify(live));
  const restored = restoreLatestRollingBackup(storage, 'real', sample());
  assert.equal(restored.monthBudget, 1006);
  assert.equal(JSON.parse(storage.getItem('real')).monthBudget, 1006);
  assert.equal(latestRollingBackup(storage, 'real').data.monthBudget, 2000);
});
test('rolling backup failure leaves existing snapshots untouched', () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
  saveRollingBackup(storage, 'real', sample(), { now: 1_000, force: true });
  const before = storage.getItem('real-rolling-backups');
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => saveRollingBackup(storage, 'real', { ...sample(), monthBudget: 2000 }, { now: 2_000, force: true }), /quota/);
  assert.equal(map.get('real-rolling-backups'), before);
});
test('rewinding clock cannot lower credit watermark or duplicate monthly income', () => {
  const data = rollMonth(sample(), '2026-10-01');
  const past = rollMonth(data, '2026-08-01');
  assert.equal(past.lastBudgetMonth, '2026-10');
  assert.deepEqual(rollMonth(past, '2026-10-01'), data);
});
