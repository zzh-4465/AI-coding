import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAiParseResult, validateAiBatch } from '../src/ai-normalize.js';

test('income is positive and always routes to happy, including incorrect AI pool guesses', () => {
  const { events } = normalizeAiParseResult({ events: [{ intent: 'income', amount: 500, pool: 'food', note: '兼职收入' }] }, '2026-10-19');
  assert.equal(events[0].intent, 'income');
  assert.equal(events[0].amount, 500);
  assert.equal(events[0].pool, 'happy');
  assert.equal(events[0].meal, null);
  assert.deepEqual(validateAiBatch(events), []);
  assert.deepEqual(validateAiBatch([{ ...events[0], pool: 'food' }]), ['账目 1']);
});

test('normalizes multiple expenses and keeps an unpriced fragment unresolved', () => {
  const result = normalizeAiParseResult({
    events: [
      { intent: 'expense', amount: 2, date: '2026-10-18', pool: 'food', meal: 'breakfast', item: '香蕉', note: '香蕉' },
      { intent: 'expense', amount: 15, date: '2026-10-18', pool: 'food', meal: 'lunch', merchant: '西亚', item: '面' },
      { intent: 'expense', amount: 299, date: '2026-10-18', pool: 'happy', meal: 'dinner', item: 'KTV消费' }
    ],
    unresolved: [{ text: '还买了个小水果', reason: '没有金额' }]
  }, '2026-10-18');
  assert.equal(result.events.length, 3);
  assert.equal(result.events[1].note, '西亚 面');
  assert.equal(result.events[2].meal, null);
  assert.deepEqual(result.unresolved, [{ text: '还买了个小水果', reason: '没有金额' }]);
  assert.deepEqual(validateAiBatch(result.events), []);
});

test('normalizes a conditional wish without deducting a pool', () => {
  const result = normalizeAiParseResult({ events: [{ intent: 'create_wish', condition: '考试通过', reward: '去吃麦当劳', budget: 50 }] }, '2026-10-18');
  assert.deepEqual(result.events[0], {
    intent: 'create_wish', amount: 50, title: '去吃麦当劳', condition: '考试通过', evidence: '', confidence: 0
  });
});

test('keeps a wish without budget so the confirmation screen can ask the user', () => {
  const result = normalizeAiParseResult({ events: [{ intent: 'create_wish', condition: '考到100分', reward: '吃冰淇淋', budget: null }] }, '2026-10-19');
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].amount, null);
  assert.equal(result.events[0].title, '吃冰淇淋');
  assert.equal(result.unresolved.length, 0);
  assert.deepEqual(validateAiBatch(result.events), ['愿望 1']);
});
