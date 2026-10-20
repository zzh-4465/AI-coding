import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monthOutlook, tomorrowFoodBudget } from '../src/forecast.js';
const data = overrides => ({ pools: { food: 300, happy: 50, emergency: 50, ...(overrides?.pools || {}) }, monthBudget: 1000, ratios: { food: 60 }, transactions: [], ...overrides, pools: { food: 300, happy: 50, emergency: 50, ...(overrides?.pools || {}) } });
test('tomorrow budget only uses current food balance and days after today', () => {
  assert.equal(tomorrowFoodBudget(data(), '2026-10-01'), 10);
  assert.equal(tomorrowFoodBudget(data({ pools: { food: 0 }, monthBudget: 9000 }), '2026-10-02'), 0);
  assert.equal(tomorrowFoodBudget(data(), '2026-10-31'), null);
});
test('outlook reports debt and zero food before optimistic states', () => {
  assert.equal(monthOutlook(data({ pools: { happy: -1 } }), '2026-10-02', 20).level, 'debt');
  assert.equal(monthOutlook(data({ pools: { food: 0 } }), '2026-10-02', 20).level, 'empty');
});
test('outlook tiers follow projected month-end food balance', () => {
  const heavy = data({ pools: { food: 20 }, transactions: [{ date: '2026-10-01', pool: 'food', amount: -20 }] });
  assert.equal(monthOutlook(heavy, '2026-10-10', 20).level, 'careful');
  const balanced = data({ pools: { food: 35 } });
  assert.equal(monthOutlook(balanced, '2026-10-30', 20).level, 'balanced');
  assert.equal(monthOutlook(data(), '2026-10-02', 20).level, 'surplus');
});
