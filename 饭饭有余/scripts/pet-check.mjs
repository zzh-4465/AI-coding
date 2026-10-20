import test from 'node:test';
import assert from 'node:assert/strict';
import { PET_DEFAULTS, PET_SKINS, normalizePet, activePet, petStage, rewardPet, unlockPetSkin, setTestMembership, canUsePetSkin, availablePetPoints, BIRTHDAY_SKIN_ID, birthdayEdition, canUnlockBirthday } from '../src/pet.js';

test('pet stage follows the time since last interaction', () => {
  const now = Date.now();
  assert.equal(petStage(now - 9 * 3600000, now), 'sleepy');
  assert.equal(petStage(now - 17 * 3600000, now), 'dazed');
  assert.equal(petStage(now - 25 * 3600000, now), 'resting');
  assert.equal(petStage(now - 3600000, now, 7), 'energized');
});

test('daily rewards cannot be claimed twice', () => {
  const data = { pet: structuredClone(PET_DEFAULTS) };
  const first = rewardPet(data, { date: '2026-10-19', withinBudget: true, valueMarked: true });
  const second = rewardPet(first, { date: '2026-10-19', withinBudget: true, valueMarked: true });
  assert.equal(first.pet.points, 3);
  assert.equal(second.pet.points, 3);
  assert.equal(first.pet.pointHistory.length, 3);
  assert.equal(second.pet.pointHistory.length, 3);
});

test('points unlock a skin and normalization protects unavailable selections', () => {
  const unlocked = unlockPetSkin({ ...PET_DEFAULTS, points: 30 }, 'baozi');
  assert.equal(unlocked.points, 0);
  assert.ok(unlocked.ownedSkins.includes('baozi'));
  assert.equal(normalizePet({ selectedSkin: 'egg' }).selectedSkin, 'fanfan');
});

test('wardrobe contains ten characters and paid or event skins cannot be bought with points', () => {
  assert.equal(PET_SKINS.length, 10);
  assert.equal(unlockPetSkin(PET_DEFAULTS, 'onigiri').selectedSkin, 'onigiri');
  assert.equal(unlockPetSkin(PET_DEFAULTS, 'onigiri').points, 0);
  const rich = { ...PET_DEFAULTS, points: 999 };
  assert.ok(!unlockPetSkin(rich, 'egg').ownedSkins.includes('egg'));
  assert.ok(!unlockPetSkin(rich, 'takoyaki').ownedSkins.includes('takoyaki'));
});

test('birthday is January 4 in Shanghai, turning 21 in 2027 and increasing annually', () => {
  assert.deepEqual(birthdayEdition(Date.parse('2026-10-20T00:00:00Z')), { year: 2027, age: 21, date: '2027-01-04', isBirthday: false });
  assert.equal(birthdayEdition(Date.parse('2027-01-03T15:59:59Z')).isBirthday, false);
  assert.equal(birthdayEdition(Date.parse('2027-01-03T16:00:00Z')).isBirthday, true);
  assert.equal(birthdayEdition(Date.parse('2027-01-04T15:59:59Z')).isBirthday, true);
  assert.deepEqual(birthdayEdition(Date.parse('2027-01-04T16:00:00Z')), { year: 2028, age: 22, date: '2028-01-04', isBirthday: false });
  assert.equal(birthdayEdition(Date.parse('2026-01-04T00:00:00Z')).isBirthday, false);
});

test('birthday automatically overrides the appearance every year without changing the regular pet', () => {
  const initial = { ...structuredClone(PET_DEFAULTS), selectedSkin: 'onigiri', points: 12, testPoints: 99 };
  const snapshot = structuredClone(initial);
  for (const year of [2027, 2028, 2029, 2030]) {
    const before = { allowBirthdayTest: false, timestamp: Date.parse(`${year}-01-03T15:59:59Z`) };
    const during = { ...before, timestamp: Date.parse(`${year}-01-03T16:00:00Z`) };
    const after = { ...before, timestamp: Date.parse(`${year}-01-04T16:00:00Z`) };
    assert.equal(activePet(initial, before).selectedSkin, 'onigiri');
    assert.equal(activePet(initial, during).selectedSkin, BIRTHDAY_SKIN_ID);
    assert.equal(birthdayEdition(during.timestamp).age, year - 2006);
    assert.equal(activePet(initial, after).selectedSkin, 'onigiri');
    assert.deepEqual(unlockPetSkin(initial, BIRTHDAY_SKIN_ID, during), normalizePet(initial, during));
    assert.deepEqual(initial, snapshot);
  }
});

test('old permanent birthday rights cannot bypass the date or retain a birthday selection', () => {
  const closed = { allowBirthdayTest: false, timestamp: Date.parse('2027-01-03T15:59:59Z') };
  const open = { ...closed, timestamp: Date.parse('2027-01-03T16:00:00Z') };
  assert.equal(canUnlockBirthday(closed), false);
  assert.equal(unlockPetSkin({ ...PET_DEFAULTS, birthdayTestUnlocked: true, points: 999 }, BIRTHDAY_SKIN_ID, closed).selectedSkin, 'fanfan');
  assert.equal(canUsePetSkin({ ...PET_DEFAULTS, ownedSkins: [BIRTHDAY_SKIN_ID] }, BIRTHDAY_SKIN_ID, closed), false);
  const legacy = { ...PET_DEFAULTS, birthdayUnlocked: true, birthdayTestUnlocked: true, selectedSkin: BIRTHDAY_SKIN_ID };
  assert.equal(canUsePetSkin(legacy, BIRTHDAY_SKIN_ID, closed), false);
  assert.equal(activePet(legacy, closed).selectedSkin, 'fanfan');
  assert.equal(activePet(legacy, open).selectedSkin, BIRTHDAY_SKIN_ID);
  assert.equal(normalizePet(legacy, open).selectedSkin, 'fanfan');
});

const beta = { allowTestMembership: true };
const production = { allowTestMembership: false };

test('test membership grants a separate wallet once and unlocks the member skin', () => {
  const member = setTestMembership({ ...PET_DEFAULTS, points: 12 }, true, beta);
  assert.equal(member.testPoints, 999);
  assert.equal(member.points, 12);
  assert.equal(member.pointHistory.length, 0);
  assert.equal(availablePetPoints(member, beta), 999);
  assert.ok(canUsePetSkin(member, 'egg', beta));
  assert.ok(!canUsePetSkin(member, 'takoyaki', beta));
  const egg = unlockPetSkin(member, 'egg', beta);
  assert.equal(egg.selectedSkin, 'egg');
  assert.equal(egg.testPoints, 999);
  const off = setTestMembership(egg, false, beta);
  assert.equal(off.selectedSkin, 'fanfan');
  assert.equal(availablePetPoints(off, beta), 12);
});

test('test purchases persist across reloads without spending earned points or duplicating grants', () => {
  const member = setTestMembership({ ...PET_DEFAULTS, points: 20 }, true, beta);
  const bought = unlockPetSkin(member, 'baozi', beta);
  assert.equal(bought.testPoints, 969);
  assert.equal(bought.points, 20);
  assert.ok(!bought.ownedSkins.includes('baozi'));
  const reloaded = normalizePet(JSON.parse(JSON.stringify(bought)), beta);
  assert.equal(reloaded.selectedSkin, 'baozi');
  assert.equal(unlockPetSkin(reloaded, 'baozi', beta).testPoints, 969);
  const off = setTestMembership(reloaded, false, beta);
  assert.equal(off.selectedSkin, 'fanfan');
  assert.ok(!canUsePetSkin(off, 'baozi', beta));
  const again = setTestMembership(off, true, beta);
  assert.equal(again.testPoints, 969);
  assert.ok(canUsePetSkin(again, 'baozi', beta));
});

test('ordinary builds ignore imported test entitlements and cannot activate test membership', () => {
  const member = unlockPetSkin(setTestMembership(PET_DEFAULTS, true, beta), 'egg', beta);
  const ordinary = normalizePet(member, production);
  assert.equal(ordinary.testMembership, false);
  assert.equal(ordinary.selectedSkin, 'fanfan');
  assert.ok(!canUsePetSkin(member, 'egg', production));
  assert.equal(availablePetPoints(member, production), 0);
  assert.equal(setTestMembership(member, true, production).testMembership, false);
});
