import assert from 'node:assert/strict';
import { test } from 'node:test';
import { removeTransaction, validateRecordEdit } from '../src/finance.js';

const state = () => ({
  pools: { food: 20, happy: 80, emergency: 0, savings: 0 },
  monthBudget: 100, monthSavings: 0, currentSavingsAllocation: 0,
  transactions: []
});

test('spent income cannot be deleted and failure leaves data unchanged', () => {
  const data = state();
  data.transactions = [{ id: 1, pool: 'food', amount: 100 }];
  const before = structuredClone(data);
  assert.throws(() => removeTransaction(data, 1), /余额/);
  assert.deepEqual(data, before);
});
test('transfer deletion restores both sides atomically', () => {
  const data = state();
  data.transactions = [{ id: 1, transferId: 1, pool: 'food', amount: 20 }, { id: 2, transferId: 1, pool: 'happy', amount: -20 }];
  const result = removeTransaction(data, 2);
  assert.deepEqual(result.pools, { food: 0, happy: 100, emergency: 0, savings: 0 });
  assert.equal(result.transactions.length, 0);
  data.pools.food = 10;
  assert.throws(() => removeTransaction(data, 1), /余额/);
});
test('budget deletion restores budget and savings counters', () => {
  const data = state();
  data.pools.savings = data.monthSavings = data.currentSavingsAllocation = 30;
  data.transactions = [{ id: 1, kind: 'external', pool: 'savings', amount: 30 }];
  const result = removeTransaction(data, 1);
  assert.equal(result.monthBudget, 70);
  assert.equal(result.monthSavings, 0);
  assert.equal(result.currentSavingsAllocation, 0);
});
test('expense deletion refunds the account without changing budget', () => {
  const data = state();
  data.transactions = [{ id: 1, pool: 'food', amount: -10 }];
  const result = removeTransaction(data, 1);
  assert.equal(result.pools.food, 30);
  assert.equal(result.monthBudget, 100);
});
test('managed operations cannot become ordinary entries', () => {
  for (const kind of ['transfer', 'calibration', 'budget', 'external']) {
    const data = state();
    data.transactions = [{ id: 1, kind, pool: 'food', amount: 10 }];
    assert.throws(() => validateRecordEdit(data, { id: 1, pool: 'food', amount: 5 }), /普通记账/);
  }
});
test('moving spent income to another pool is rejected', () => {
  const data = state();
  data.transactions = [{ id: 1, pool: 'food', amount: 100 }];
  assert.throws(() => validateRecordEdit(data, { id: 1, pool: 'happy', amount: 100 }), /余额/);
});
test('expenses may overdraw a pool; invalid amounts are rejected', () => {
  const data = state();
  data.transactions = [{ id: 1, pool: 'food', amount: -10 }];
  assert.doesNotThrow(() => validateRecordEdit(data, { id: 1, pool: 'food', amount: -25 }));
  assert.doesNotThrow(() => validateRecordEdit(data, { id: 1, pool: 'food', amount: -31 }));
  for (const amount of [NaN, Infinity, 0]) assert.throws(() => validateRecordEdit(data, { id: 1, pool: 'food', amount }));
});
