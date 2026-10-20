import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distribute, refreshFoodBudget, rollMonth, ledgerDateTitle } from '../src/budget.js';
import { allocateAmounts, allocationBoundary, moveAutomaticBoundary, moveAllocationBoundary, partitionRatios } from '../src/allocation.js';
import { removeTransaction } from '../src/finance.js';

const fixture = () => ({ onboarded: true, lastBudgetMonth: '2026-08', pools: { food: 20, happy: 30, emergency: 150, savings: 200 }, monthBudget: 1000, nextMonthBudget: 1000, ratios: { food: 56, happy: 10, emergency: 14, savings: 20 }, monthSavings: 200, currentSavingsAllocation: 200, emergencyCarryLimit: 100, transactions: [{ id: 1, date: '2026-08-31', pool: 'food', amount: -10, title: '午饭' }], dailyFoodBudgets: { '2026-08-31': 30 }, monthlyHistory: [] });

test('manual allocations follow the three agreed examples without changing fixed amounts', () => {
  const weights = { savings: 20, food: 50, emergency: 20, happy: 10 };
  assert.deepEqual(allocateAmounts(1000, weights, { food: '400' }).amounts, { savings: 240, food: 400, emergency: 240, happy: 120 });
  assert.deepEqual(allocateAmounts(1000, weights, { food: '400', savings: '300' }).amounts, { savings: 300, food: 400, emergency: 200, happy: 100 });
  assert.deepEqual(allocateAmounts(1000, weights, { food: '400', savings: '300', emergency: '250' }).amounts, { savings: 300, food: 400, emergency: 250, happy: 50 });
  const conflict = allocateAmounts(1000, weights, { food: '400', savings: '300', emergency: '350' });
  assert.equal(conflict.valid, false);
  assert.equal(conflict.remainder, -50);
  assert.deepEqual(conflict.amounts, { savings: 300, food: 400, emergency: 350, happy: 0 });
});

test('dragging skips fixed pools and changes only the nearest automatic pool on each side', () => {
  const weights = { savings: 20, food: 50, emergency: 20, happy: 10 };
  const fixed = { food: '400' };
  const initial = allocateAmounts(1000, weights, fixed);
  assert.deepEqual(allocationBoundary(initial, fixed, 1), { upper: 'savings', lower: 'emergency', current: 64, minimum: 40, maximum: 88 });
  const moved = allocateAmounts(1000, moveAutomaticBoundary(1000, weights, fixed, 1, 70), fixed);
  assert.deepEqual(moved.amounts, { savings: 300, food: 400, emergency: 180, happy: 120 });
  assert.equal(moved.valid, true);
  assert.deepEqual(allocateAmounts(1000, moveAutomaticBoundary(1000, weights, fixed, 0, 30), fixed).amounts, moved.amounts);
  const end = allocateAmounts(1000, moveAutomaticBoundary(1000, weights, fixed, 1, 200), fixed);
  assert.deepEqual(end.amounts, { savings: 480, food: 400, emergency: 0, happy: 120 });
});

test('dragging preserves fixed cents and disables boundaries without two automatic pools', () => {
  const weights = { savings: 20, food: 50, emergency: 20, happy: 10 };
  const fixed = { food: '400.01', emergency: '250' };
  for (const index of [0, 1, 2]) {
    const result = allocateAmounts('1000.01', moveAutomaticBoundary('1000.01', weights, fixed, index, 80), fixed);
    assert.equal(result.amounts.food, 400.01);
    assert.equal(result.amounts.emergency, 250);
    assert.equal(Object.values(result.amounts).reduce((sum, value) => sum + Math.round(value * 100), 0), 100001);
  }
  const threeFixed = { ...fixed, savings: '300' };
  const allocation = allocateAmounts('1000.01', weights, threeFixed);
  for (const index of [0, 1, 2]) assert.equal(allocationBoundary(allocation, threeFixed, index), null);
  assert.equal(moveAutomaticBoundary('1000.01', weights, threeFixed, 1, 80), weights);
});

test('all fixed amounts must equal the budget, including when the total changes', () => {
  const weights = { savings: 20, food: 50, emergency: 20, happy: 10 };
  const fixed = { food: '400', savings: '300', emergency: '250', happy: '40' };
  assert.equal(allocateAmounts(1000, weights, fixed).valid, false);
  assert.equal(allocateAmounts(1000, weights, { ...fixed, happy: '50' }).valid, true);
  assert.equal(allocateAmounts(500, weights, fixed).valid, false);
  assert.equal(fixed.food, '400');
  const { happy, ...released } = fixed;
  assert.equal(allocateAmounts(1000, weights, released).amounts.happy, 50);
});

test('cent allocations conserve money, handle zero weights, and survive monthly distribution', () => {
  const weights = { savings: 0, food: 100, emergency: 0, happy: 0 };
  const result = allocateAmounts('1000.01', weights, { food: '400.01' });
  assert.equal(result.valid, true);
  assert.equal(result.amounts.food, 400.01);
  assert.deepEqual(result.amounts, { savings: 200, food: 400.01, emergency: 200, happy: 200 });
  const keys = ['food', 'happy', 'emergency', 'savings'];
  assert.deepEqual(distribute(100001, keys.map(key => result.ratios[key])), keys.map(key => Math.round(result.amounts[key] * 100)));
  for (const invalid of ['', '-1', '0.001', 'NaN', 'Infinity']) assert.equal(allocateAmounts(1000, weights, { food: invalid }).valid, false);
  assert.equal(allocateAmounts(0, weights).valid, false);
  assert.equal(allocateAmounts('0.001', weights).valid, false);
});

test('partition areas total 100, including boundaries and the supplied examples', () => {
  assert.deepEqual(partitionRatios(20, 50), { savings: 10, food: 40, emergency: 10, happy: 40 });
  assert.deepEqual(partitionRatios(60, 20), { savings: 12, food: 8, emergency: 48, happy: 32 });
  for (let x = 0; x <= 100; x++) for (let y = 0; y <= 100; y++) {
    const ratios = partitionRatios(x, y);
    assert.equal(Object.values(ratios).reduce((a, b) => a + b, 0), 100);
    assert.ok(Object.values(ratios).every(value => Number.isInteger(value) && value >= 0));
  }
  assert.equal(distribute(666601, [56, 10, 14, 20]).reduce((a, b) => a + b, 0), 666601);
});
test('moving a stacked boundary only changes its two adjacent pools', () => {
  const initial = { savings: 20, food: 50, emergency: 20, happy: 10 };
  assert.deepEqual(moveAllocationBoundary(initial, 0, 30), { savings: 30, food: 40, emergency: 20, happy: 10 });
  assert.deepEqual(moveAllocationBoundary(initial, 1, 60), { savings: 20, food: 40, emergency: 30, happy: 10 });
  assert.deepEqual(moveAllocationBoundary(initial, 2, 95), { savings: 20, food: 50, emergency: 25, happy: 5 });
});
test('manual food changes adjust today; ordinary expense does not', () => {
  const data = fixture();
  data.dailyFoodBudgets['2026-09-01'] = 20;
  assert.equal(refreshFoodBudget(data, '2026-09-01', 300).dailyFoodBudgets['2026-09-01'], 30);
  assert.equal(refreshFoodBudget(data, '2026-09-01', -300).dailyFoodBudgets['2026-09-01'], 10);
  assert.equal(refreshFoodBudget(data, '2026-09-01', 0), data);
});
test('month rollover closes old month and allocates exactly one monthly income', () => {
  const original = fixture();
  const next = rollMonth(original, '2026-09-01');
  assert.deepEqual(next.pools, { food: 560, happy: 200, emergency: 240, savings: 400 });
  assert.equal(next.transactions.filter(tx => tx.batch).reduce((sum, tx) => sum + tx.amount, 0), 1000);
  assert.equal(next.monthlyHistory[0].foodSpent, 10);
  assert.equal(next.transactions.find(tx => tx.id === 1).date, '2026-08-31');
  assert.deepEqual(rollMonth(next, '2026-09-04'), next);
  assert.equal(original.lastBudgetMonth, '2026-08');
});
test('missed months and year transition each credit once', () => {
  const data = fixture();
  data.lastBudgetMonth = '2026-12';
  const next = rollMonth(data, '2027-02-01');
  assert.equal(next.monthlyHistory.length, 2);
  assert.equal(new Set(next.transactions.filter(tx => tx.batch).map(tx => tx.batch)).size, 2);
  assert.equal(next.lastBudgetMonth, '2027-02');
});
test('monthly credit deletion is atomic and will not trigger automatic re-credit', () => {
  const next = rollMonth(fixture(), '2026-09-01');
  const credit = next.transactions.find(tx => tx.batch);
  const removed = removeTransaction(next, credit.id);
  assert.equal(removed.transactions.filter(tx => tx.batch).length, 0);
  assert.equal(removed.monthBudget, 0);
  assert.deepEqual(rollMonth(removed, '2026-09-02'), removed);
});
test('legacy account migration preserves dates and current-month account is not credited twice', () => {
  const data = fixture();
  delete data.lastBudgetMonth;
  assert.equal(rollMonth(data, '2026-09-01').lastBudgetMonth, '2026-09');
  data.transactions[0].date = '2026-09-01';
  assert.equal(rollMonth(data, '2026-09-04').transactions.length, 1);
  assert.equal(ledgerDateTitle('2026-08-31'), '2026 年 8 月 31 日');
});
