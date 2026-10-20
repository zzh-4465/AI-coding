import { distribute } from './budget.js';
export function partitionRatios(x, y) {
  const parts = distribute(100, [x * y, (100 - x) * y, x * (100 - y), (100 - x) * (100 - y)]);
  return Object.fromEntries(['savings', 'food', 'emergency', 'happy'].map((key, index) => [key, parts[index]]));
}

const allocationKeys = ['savings', 'food', 'emergency', 'happy'];

// Keep fixed amounts and distribute only the remainder, in integer cents.
export function allocateAmounts(budget, weights, fixed = {}) {
  const cents = value => {
    const text = String(value ?? '').trim();
    if (!/^\d+(?:\.\d{0,2})?$/.test(text)) return null;
    const result = Math.round(Number(text) * 100);
    return Number.isSafeInteger(result) && result >= 0 ? result : null;
  };
  const total = cents(budget);
  const fixedKeys = allocationKeys.filter(key => Object.hasOwn(fixed, key));
  const freeKeys = allocationKeys.filter(key => !Object.hasOwn(fixed, key));
  const invalidKeys = fixedKeys.filter(key => cents(fixed[key]) === null);
  const parts = Object.fromEntries(allocationKeys.map(key => [key, fixedKeys.includes(key) ? cents(fixed[key]) ?? 0 : 0]));
  const fixedTotal = fixedKeys.reduce((sum, key) => sum + parts[key], 0);
  const remainder = (total ?? 0) - fixedTotal;
  const shares = freeKeys.length ? distribute(Math.max(0, remainder), freeKeys.map(key => weights[key])) : [];
  freeKeys.forEach((key, index) => { parts[key] = shares[index]; });
  const valid = total > 0 && !invalidKeys.length && remainder >= 0 && (freeKeys.length > 0 || remainder === 0);
  const ratios = {};
  allocationKeys.forEach(key => {
    ratios[key] = total > 0 ? parts[key] / total * 100 : Number(weights[key] || 0);
  });
  return {
    valid, invalidKeys, freeKeys, fixedTotal: fixedTotal / 100, remainder: remainder / 100,
    total: (total ?? 0) / 100, amounts: Object.fromEntries(allocationKeys.map(key => [key, parts[key] / 100])), ratios
  };
}

export function moveAllocationBoundary(ratios, boundaryIndex, position) {
  if (!Number.isInteger(boundaryIndex) || boundaryIndex < 0 || boundaryIndex >= allocationKeys.length - 1) return ratios;
  const values = allocationKeys.map(key => Number(ratios[key] || 0));
  const before = values.slice(0, boundaryIndex).reduce((sum, value) => sum + value, 0);
  const pairTotal = values[boundaryIndex] + values[boundaryIndex + 1];
  const upperPool = Math.max(0, Math.min(pairTotal, Math.round(Number(position) - before)));
  return {
    ...ratios,
    [allocationKeys[boundaryIndex]]: upperPool,
    [allocationKeys[boundaryIndex + 1]]: pairTotal - upperPool
  };
}

// A fixed block can move, but cannot resize. Transfer only between the nearest
// automatic pools on either side of the dragged boundary.
export function allocationBoundary(allocation, fixed, index) {
  if (!allocation.valid || !Number.isInteger(index) || index < 0 || index >= allocationKeys.length - 1) return null;
  const upper = allocationKeys.slice(0, index + 1).reverse().find(key => !Object.hasOwn(fixed, key));
  const lower = allocationKeys.slice(index + 1).find(key => !Object.hasOwn(fixed, key));
  if (!upper || !lower) return null;
  const parts = Object.fromEntries(allocationKeys.map(key => [key, Math.round(allocation.amounts[key] * 100)]));
  const total = Math.round(allocation.total * 100);
  const current = allocationKeys.slice(0, index + 1).reduce((sum, key) => sum + parts[key], 0);
  if (parts[upper] + parts[lower] === 0) return null;
  return { upper, lower, current: current / total * 100, minimum: (current - parts[upper]) / total * 100, maximum: (current + parts[lower]) / total * 100 };
}

export function moveAutomaticBoundary(budget, weights, fixed, index, position) {
  const allocation = allocateAmounts(budget, weights, fixed);
  const boundary = allocationBoundary(allocation, fixed, index);
  if (!boundary || !Number.isFinite(Number(position))) return weights;
  const total = Math.round(allocation.total * 100);
  const parts = Object.fromEntries(allocationKeys.map(key => [key, Math.round(allocation.amounts[key] * 100)]));
  const current = allocationKeys.slice(0, index + 1).reduce((sum, key) => sum + parts[key], 0);
  const delta = Math.max(-parts[boundary.upper], Math.min(parts[boundary.lower], Math.round(Number(position) / 100 * total) - current));
  parts[boundary.upper] += delta;
  parts[boundary.lower] -= delta;
  return Object.fromEntries(allocationKeys.map(key => [key, parts[key] / total * 100]));
}
