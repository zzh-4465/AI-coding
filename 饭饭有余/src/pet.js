import { now } from './clock.js';

export const TEST_MEMBERSHIP_ENABLED = import.meta.env?.VITE_ENABLE_TEST_MEMBERSHIP === 'true';
export const BIRTHDAY_TEST_ENABLED = import.meta.env?.VITE_ENABLE_BIRTHDAY_TEST === 'true';
export const BIRTHDAY_SKIN_ID = 'birthday-dog';
export const BIRTHDAY = { month: 1, day: 4, birthYear: 2006, firstYear: 2027 };
const birthdayTestAllowed = options => options.allowBirthdayTest ?? BIRTHDAY_TEST_ENABLED;

export function birthdayEdition(timestamp = now().getTime()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const today = `${values.year}-${values.month}-${values.day}`;
  const year = Math.max(BIRTHDAY.firstYear, Number(values.year) + (today.slice(5) > '01-04' ? 1 : 0));
  return { year, age: year - BIRTHDAY.birthYear, date: `${year}-01-04`, isBirthday: Number(values.year) >= BIRTHDAY.firstYear && today.slice(5) === '01-04' };
}

export function canUnlockBirthday(options = {}) {
  return birthdayTestAllowed(options) || birthdayEdition(options.timestamp).isBirthday;
}
const testAllowed = options => options.allowTestMembership ?? TEST_MEMBERSHIP_ENABLED;

export const PET_DEFAULTS = {
  enabled: true,
  selectedSkin: 'fanfan',
  ownedSkins: ['fanfan'],
  points: 0,
  testMembership: false,
  testPoints: 0,
  testGrantClaimed: false,
  testOwnedSkins: [],
  birthdayUnlocked: false,
  birthdayTestUnlocked: false,
  birthdayYear: 2027,
  birthdayTestYear: 2027,
  streakDays: 0,
  lastVisitAt: Date.now(),
  lastRecordDate: '',
  reviveCards: 1,
  rewarded: { record: '', budget: '', value: '' },
  pointHistory: []
};

export const PET_SKINS = [
  { id: 'fanfan', name: '饭团', cost: 0, description: '默认伙伴' },
  { id: 'onigiri', name: '三角饭团', cost: 0, description: '免费互动伙伴' },
  { id: 'baozi', name: '包子', cost: 30, description: '积分解锁' },
  { id: 'jiaozi', name: '饺子', cost: 30, description: '积分解锁' },
  { id: 'toast', name: '吐司', cost: 60, description: '积分解锁' },
  { id: 'pudding', name: '布丁', cost: 60, description: '积分解锁' },
  { id: 'dafu', name: '大福', cost: 80, description: '积分解锁' },
  { id: 'egg', name: '煎蛋', vip: true, description: '会员专属' },
  { id: 'takoyaki', name: '章鱼烧', event: true, description: '节日限定' },
  { id: BIRTHDAY_SKIN_ID, name: '黄耳朵', event: true, birthday: true, description: '生日限定' }
];

export function normalizePet(pet = {}, options = {}) {
  const merged = {
    ...PET_DEFAULTS,
    ...pet,
    birthdayUnlocked: pet.birthdayUnlocked === true,
    birthdayTestUnlocked: pet.birthdayTestUnlocked === true,
    birthdayYear: Number.isInteger(pet.birthdayYear) && pet.birthdayYear >= BIRTHDAY.firstYear ? pet.birthdayYear : BIRTHDAY.firstYear,
    birthdayTestYear: Number.isInteger(pet.birthdayTestYear) && pet.birthdayTestYear >= BIRTHDAY.firstYear ? pet.birthdayTestYear : BIRTHDAY.firstYear,
    testMembership: testAllowed(options) && pet.testMembership === true,
    testPoints: Number.isFinite(pet.testPoints) ? Math.max(0, pet.testPoints) : 0,
    testGrantClaimed: pet.testGrantClaimed === true,
    testOwnedSkins: Array.isArray(pet.testOwnedSkins) ? [...new Set(pet.testOwnedSkins.filter(id => PET_SKINS.some(skin => skin.id === id && !skin.vip && !skin.event)))] : [],
    ownedSkins: Array.isArray(pet.ownedSkins) ? [...new Set(['fanfan', ...pet.ownedSkins])] : ['fanfan'],
    rewarded: { ...PET_DEFAULTS.rewarded, ...(pet.rewarded || {}) },
    pointHistory: Array.isArray(pet.pointHistory) ? pet.pointHistory : []
  };
  // Birthday appearances are temporary; never persist them as the regular selection.
  if (merged.selectedSkin === BIRTHDAY_SKIN_ID || !canUsePetSkin(merged, merged.selectedSkin, options)) merged.selectedSkin = 'fanfan';
  return merged;
}

export function activePet(petInput, options = {}) {
  const pet = normalizePet(petInput, options);
  return canUnlockBirthday(options) ? { ...pet, selectedSkin: BIRTHDAY_SKIN_ID } : pet;
}

export function canUsePetSkin(pet, skinId, options = {}) {
  const skin = PET_SKINS.find(item => item.id === skinId);
  if (!skin) return false;
  if (skin.birthday) return canUnlockBirthday(options);
  if (skin.event) return false;
  if (skinId === 'onigiri') return true;
  const member = testAllowed(options) && pet.testMembership === true;
  if (skin.vip) return member;
  return pet.ownedSkins?.includes(skinId) || (member && pet.testOwnedSkins?.includes(skinId)) || false;
}

export function availablePetPoints(pet, options = {}) {
  return testAllowed(options) && pet.testMembership === true ? pet.testPoints : pet.points;
}

export function setTestMembership(petInput, enabled, options = {}) {
  const pet = normalizePet(petInput, options);
  if (!testAllowed(options)) return pet;
  const grant = enabled && !pet.testGrantClaimed;
  return normalizePet({ ...pet, testMembership: Boolean(enabled),
    testGrantClaimed: pet.testGrantClaimed || grant,
    testPoints: grant ? 999 : pet.testPoints }, options);
}

export function petStage(lastVisitAt, timestamp = Date.now(), streakDays = 0) {
  const elapsedHours = Math.max(0, timestamp - Number(lastVisitAt || timestamp)) / 3600000;
  if (elapsedHours >= 24) return 'resting';
  if (elapsedHours >= 20) return 'wilted';
  if (elapsedHours >= 16) return 'dazed';
  if (elapsedHours >= 8) return 'sleepy';
  return streakDays >= 7 ? 'energized' : 'normal';
}

const dateDistance = (from, to) => {
  if (!from || !to) return Infinity;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  return Math.round((end - start) / 86400000);
};

export function rewardPet(data, { date, withinBudget = false, valueMarked = false }) {
  const pet = normalizePet(data.pet);
  const rewarded = { ...pet.rewarded };
  let gained = 0;
  const history = [...pet.pointHistory];
  if (rewarded.record !== date) { rewarded.record = date; gained += 1; history.push({ date, type: 'record', points: 1 }); }
  if (withinBudget && rewarded.budget !== date) { rewarded.budget = date; gained += 1; history.push({ date, type: 'budget', points: 1 }); }
  if (valueMarked && rewarded.value !== date) { rewarded.value = date; gained += 1; history.push({ date, type: 'value', points: 1 }); }
  const distance = dateDistance(pet.lastRecordDate, date);
  const streakDays = pet.lastRecordDate === date ? pet.streakDays : distance === 1 ? pet.streakDays + 1 : 1;
  return {
    ...data,
    pet: { ...pet, rewarded, pointHistory: history, points: pet.points + gained, streakDays, lastRecordDate: date, lastVisitAt: Date.now() }
  };
}

export function unlockPetSkin(petInput, skinId, options = {}) {
  const pet = normalizePet(petInput, options);
  const skin = PET_SKINS.find(item => item.id === skinId);
  if (skin?.birthday) return pet;
  if (canUsePetSkin(pet, skinId, options)) return { ...pet, selectedSkin: skinId };
  if (!skin || skin.vip || skin.event || availablePetPoints(pet, options) < skin.cost) return pet;
  if (pet.testMembership) {
    if (pet.testPoints < skin.cost) return pet;
    return { ...pet, testPoints: pet.testPoints - skin.cost, testOwnedSkins: [...pet.testOwnedSkins, skinId], selectedSkin: skinId };
  }
  return { ...pet, points: pet.points - skin.cost, ownedSkins: [...pet.ownedSkins, skinId], selectedSkin: skinId };
}

export function resetBirthdayTest(petInput, options = {}) {
  const pet = normalizePet(petInput, options);
  if (!birthdayTestAllowed(options)) return pet;
  return normalizePet({ ...pet, birthdayTestUnlocked: false }, options);
}
