import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyReportInput } from '../src/report.js';

test('builds exact local monthly aggregates and excludes transfers', () => {
  const result = buildMonthlyReportInput({
    pools: { food: 100, happy: 50, emergency: 80, savings: 20 },
    transactions: [
      { date: '2026-10-01', pool: 'food', amount: -10, title: '早餐' },
      { date: '2026-10-01', pool: 'happy', amount: -20, title: 'KTV' },
      { date: '2026-10-02', pool: 'food', amount: -30, title: '午餐' },
      { date: '2026-10-02', pool: 'food', amount: 5, title: '返还' },
      { date: '2026-10-02', pool: 'food', amount: -50, title: '转账', transferId: 1 }
    ],
    wishes: [{ title: '旅行', target: 1000, locked: 250 }]
  }, '2026-10');
  assert.equal(result.totalExpense, 60);
  assert.deepEqual(result.expensesByPool, { food: 40, happy: 20, emergency: 0 });
  assert.equal(result.averageFoodOnActiveDays, 20);
  assert.equal(result.wishes[0].progress, 0.25);
});
