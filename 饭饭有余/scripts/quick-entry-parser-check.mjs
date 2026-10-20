import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickEntry } from '../src/quick-entry-parser.js';

const now = new Date(2026, 9, 18, 12);
const parse = text => parseQuickEntry(text, { now });

test('parses a valuable breakfast expense from yesterday', () => {
  const result = parse('昨天早餐花了12.5元，挺值的');
  assert.deepEqual(
    { amount: result.amount, direction: result.direction, date: result.date, meal: result.meal, pool: result.pool, value: result.value },
    { amount: 12.5, direction: 'expense', date: '2026-10-17', meal: 'breakfast', pool: 'food', value: 'worth' }
  );
  assert.deepEqual(result.needsConfirmation, []);
});

test('resolves last Friday by calendar week', () => {
  const result = parse('上周五夜宵28块，后悔了');
  assert.equal(result.date, '2026-10-09');
  assert.equal(result.meal, 'snack');
  assert.equal(result.value, 'regret');
});

test('routes income directly to the happy pool', () => {
  const result = parse('今天收到兼职收入500元');
  assert.equal(result.amount, 500);
  assert.equal(result.direction, 'income');
  assert.equal(result.intent, 'income');
  assert.equal(result.pool, 'happy');
  assert.deepEqual(result.needsConfirmation, ['value']);
});

test('infers emergency expenses and neutral value', () => {
  const result = parse('前天交电费80元，一般');
  assert.equal(result.date, '2026-10-16');
  assert.equal(result.pool, 'emergency');
  assert.equal(result.value, 'neutral');
});

test('supports colloquial Chinese decimal amounts from speech input', () => {
  const result = parse('午饭十五块八，还行');
  assert.equal(result.amount, 15.8);
  assert.equal(result.direction, 'expense');
  assert.equal(result.pool, 'food');
});

test('parses explicit month-day and entertainment spending', () => {
  const result = parse('10月3日买电影票35元，很值');
  assert.equal(result.date, '2026-10-03');
  assert.equal(result.pool, 'happy');
  assert.equal(result.value, 'worth');
});

test('returns uncertain fields for the confirmation screen', () => {
  const result = parse('昨天花了20元');
  assert.equal(result.amount, 20);
  assert.equal(result.direction, 'expense');
  assert.deepEqual(result.needsConfirmation, ['pool', 'value']);
});

test('negative value phrases take priority over the word 值', () => {
  assert.equal(parse('晚饭30元，不太值').value, 'regret');
  assert.equal(parse('晚饭30元，不后悔').value, 'worth');
});

test('flags multiple expenses instead of silently keeping only the first', () => {
  const result = parse('早上饭堂12元，晚上外卖20元，都挺值');
  assert.equal(result.multipleEntries, true);
});

test('parses a conditional wish locally without treating a score as money', () => {
  const result = parse('要是我考了100分就买个麦当劳的冰淇淋');
  assert.equal(result.intent, 'create_wish');
  assert.equal(result.condition, '我考了100分');
  assert.equal(result.title, '麦当劳的冰淇淋');
  assert.equal(result.amount, null);
  assert.deepEqual(result.needsConfirmation, ['amount']);
});

test('extracts an explicit wish budget for confirmation', () => {
  const result = parse('如果连续记账7天，就奖励自己看电影，预算35元');
  assert.equal(result.intent, 'create_wish');
  assert.equal(result.condition, '连续记账7天');
  assert.equal(result.title, '看电影');
  assert.equal(result.amount, 35);
});

test('understands a natural reward sentence without a leading if', () => {
  const result = parse('考了100分我就奖励自己吃冰淇淋');
  assert.equal(result.intent, 'create_wish');
  assert.equal(result.condition, '考了100分');
  assert.equal(result.title, '吃冰淇淋');
  assert.equal(result.amount, null);
});
