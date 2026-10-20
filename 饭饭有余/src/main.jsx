import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive, ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, BookOpen, CalendarDays,
  Camera, Check, ChevronRight, CircleDollarSign, GripVertical, Heart, Home, Leaf, LockOpen,
  MessageCircle, PiggyBank, Plus, RotateCcw, Search, Settings, ShieldCheck, Sparkles,
  Trash2, Utensils, WalletCards, X
} from 'lucide-react';
import './styles.css';
import { isManagedRecord, removeTransaction, validateRecordEdit } from './finance.js';
import { rollMonth, refreshFoodBudget, ledgerDateTitle } from './budget.js';
import BudgetAllocation from './components/BudgetAllocation.jsx';
import OnigiriMascot from './components/OnigiriMascot.jsx';
import BirthdayMascot from './components/BirthdayMascot.jsx';
import FloatingPet from './components/FloatingPet.jsx';
import AccountSheet from './components/AccountSheet.jsx';
import { accountStoreKey, readSession, WEB_DEMO } from './account-client.js';
import { applyQuickBatch } from './quick-batch.js';
const PetAppearanceContext = createContext({ skin: 'fanfan', stage: 'normal' });
import Calendar from './components/Calendar.jsx';
import SimulationBanner from './components/SimulationBanner.jsx';
import { now, isSimulation, REAL_STORE_KEY, SIMULATION_STORE_KEY, startSimulation } from './clock.js';
import { isDateKey } from './calendar.js';
import { normalizeData, importData, latestRollingBackup, saveRollingBackup, restoreLatestRollingBackup } from './storage.js';
import { downloadBackup, nativeBackup, openNativeBackup } from './backup.js';
import { monthOutlook, tomorrowFoodBudget } from './forecast.js';
import { parseQuickEntry } from './quick-entry-parser.js';
import { compressImage, estimateWishBudget, parseWithAi, requestAiReport } from './ai-client.js';
import { validateAiBatch } from './ai-normalize.js';
import { buildMonthlyReportInput } from './report.js';
import { PET_DEFAULTS, PET_SKINS, TEST_MEMBERSHIP_ENABLED, BIRTHDAY_TEST_ENABLED, BIRTHDAY_SKIN_ID, birthdayEdition, activePet, canUnlockBirthday, resetBirthdayTest, normalizePet, petStage, rewardPet, unlockPetSkin, availablePetPoints, canUsePetSkin, setTestMembership } from './pet.js';

const money = value => `¥${Number(value).toFixed(2)}`;
const CUSTOM_EDITION = import.meta.env.VITE_CUSTOM_EDITION === 'zsy';
const APP_NAME = CUSTOM_EDITION ? '饭饭有余·zsy定制版' : '饭饭有余';
if (CUSTOM_EDITION) document.title = APP_NAME;
// V5 intentionally starts from a clean data space for the first public Android build.
const STORE_KEY = isSimulation ? SIMULATION_STORE_KEY : accountStoreKey(REAL_STORE_KEY);
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const TODAY = dateKey(now());
const REMAINING_DAYS = new Date(now().getFullYear(), now().getMonth() + 1, 0).getDate() - now().getDate() + 1;
const CURRENT_YEAR = now().getFullYear();
const CURRENT_MONTH = now().getMonth() + 1;
const CURRENT_DAY = now().getDate();
const DAYS_IN_MONTH = new Date(CURRENT_YEAR, CURRENT_MONTH, 0).getDate();
const monthTitle = `${CURRENT_YEAR} 年 ${CURRENT_MONTH} 月`;
const MEALS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };

const foodBudgetAtDayStart = data => {
  const todayFoodChange = (data.transactions || [])
    .filter(item => item.pool === 'food' && item.date === TODAY && !isManagedRecord(item))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return Math.max(0, Number(data.pools?.food || 0) - todayFoodChange) / REMAINING_DAYS;
};

const ensureTodayBudgetSnapshot = data => {
  if (Number.isFinite(data.dailyFoodBudgets?.[TODAY])) return data;
  return {
    ...data,
    dailyFoodBudgets: {
      ...(data.dailyFoodBudgets || {}),
      [TODAY]: foodBudgetAtDayStart(data)
    }
  };
};

const INITIAL = {
  dataVersion: 7,
  onboarded: false,
  pools: { food: 0, happy: 0, emergency: 0, savings: 0 },
  monthBudget: 0,
  monthSavings: 0,
  currentSavingsAllocation: 0,
  nextMonthBudget: 0,
  ratios: { savings: 20, food: 56, emergency: 14, happy: 10 },
  emergencyCarryLimit: 100,
  dailyFoodBudgets: {},
  transactions: [],
  wishes: [],
  completedWishes: [],
  archivedWishes: [],
  wishReserve: 0,
  wishTransfers: [],
  monthlyHistory: [],
  pet: structuredClone(PET_DEFAULTS)
};

const POOLS = {
  food: { name: '饮食池', icon: Utensils, tone: 'green', meta: '每日预算' },
  happy: { name: '小余仓', icon: Sparkles, tone: 'yellow', meta: '本月攒下' },
  emergency: { name: '应急必备池', icon: ShieldCheck, tone: 'coral', meta: '本月已花' },
  wishes: { name: '愿望池', icon: Heart, tone: 'pink', meta: '愿望资金账本' },
  savings: { name: '储蓄池', icon: PiggyBank, tone: 'blue', meta: '累计已存下' }
};


function useStore() {
  const [data, setData] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!stored) return structuredClone(INITIAL);
      if (!isSimulation && Number(stored.dataVersion || 0) < INITIAL.dataVersion) {
        try { saveRollingBackup(localStorage, STORE_KEY, stored, { force: true, reason: 'before-upgrade' }); }
        catch { console.warn('本地空间不足，未能保留升级前滚动备份，请手动导出备份。'); }
      }
      if (stored.onboarded && !stored.lastBudgetMonth && !localStorage.getItem(`${STORE_KEY}-before-monthly-upgrade`)) {
        try { localStorage.setItem(`${STORE_KEY}-before-monthly-upgrade`, JSON.stringify(stored)); }
        catch { console.warn('本地空间不足，未能保留升级前快照，请手动导出备份。'); }
      }
      const legacyArchived = (stored.completedWishes || []).filter(item => item.status === 'archived');
      const legacyReserve = legacyArchived.reduce((sum, item) => sum + Number(item.locked || 0), 0);
      const migratingWishReserve = stored.wishReserve === undefined;
      return ensureTodayBudgetSnapshot(rollMonth(normalizeData({
        ...structuredClone(INITIAL), ...stored,
        pools: { ...INITIAL.pools, ...stored.pools, happy: migratingWishReserve ? Math.max(0, (stored.pools?.happy ?? INITIAL.pools.happy) - legacyReserve) : (stored.pools?.happy ?? INITIAL.pools.happy) },
        ratios: { ...INITIAL.ratios, ...stored.ratios },
        completedWishes: (stored.completedWishes || []).filter(item => item.status !== 'archived'),
        archivedWishes: [...(stored.archivedWishes || []), ...legacyArchived],
        wishReserve: stored.wishReserve ?? legacyReserve,
        monthSavings: stored.monthSavings ?? stored.pools?.savings ?? INITIAL.monthSavings,
        currentSavingsAllocation: stored.currentSavingsAllocation ?? stored.monthSavings ?? 0,
        transactions: (stored.transactions || []).filter(item => !(
          (item.title === '余额校准' && item.note === '手动调整当前余额') ||
          (item.title === '储蓄余额纠错' && item.note === '手动校准储蓄余额')
        )),
        wishTransfers: stored.wishTransfers || [],
        monthlyHistory: stored.monthlyHistory || INITIAL.monthlyHistory,
        dailyFoodBudgets: stored.dailyFoodBudgets || {}
      }, INITIAL), TODAY));
    }
    catch (error) { return { ...structuredClone(INITIAL), loadError: error.message || '无法读取本地账本' }; }
  });
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    if (data.loadError) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    }
    catch { setStorageError('本次修改尚未保存到设备，请先导出备份并释放存储空间。'); return; }
    try {
      if (!isSimulation) saveRollingBackup(localStorage, STORE_KEY, data);
      setStorageError('');
    } catch { setStorageError('账本已保存，但自动备份失败，请释放存储空间或手动导出备份。'); }
  }, [data]);
  return [data, setData, storageError];
}

function restoreBackup(input) {
  const next = ensureTodayBudgetSnapshot(rollMonth(normalizeData(input, INITIAL), TODAY));
  if (!isSimulation) backupCurrentData('before-file-restore');
  return importData(localStorage, STORE_KEY, next, INITIAL);
}

function backupCurrentData(reason) {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return null;
  let current;
  try { current = normalizeData(JSON.parse(raw), INITIAL); }
  catch { return null; }
  return saveRollingBackup(localStorage, STORE_KEY, current, { force: true, reason });
}

function restoreLatestBackup() {
  return ensureTodayBudgetSnapshot(rollMonth(restoreLatestRollingBackup(localStorage, STORE_KEY, INITIAL), TODAY));
}

function App() {
  const [data, setData, storageError] = useStore();
  const [tab, setTab] = useState('today');
  const [detail, setDetail] = useState(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const [wishTransferOpen, setWishTransferOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [foodCoverPrompt, setFoodCoverPrompt] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('food');
  const [calibrationPool, setCalibrationPool] = useState(null);
  const [petMenuOpen, setPetMenuOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [toast, setToast] = useState('');
  const dailyBudget = data.dailyFoodBudgets?.[TODAY] ?? foodBudgetAtDayStart(data);
  const shanghaiDay = () => Math.floor((now().getTime() + 8 * 3600000) / 86400000);
  const [birthdayDay, setBirthdayDay] = useState(shanghaiDay);
  useEffect(() => {
    const refresh = () => setBirthdayDay(shanghaiDay());
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const pet = activePet(data.pet, { timestamp: birthdayDay * 86400000 - 8 * 3600000 });

  useEffect(() => {
    const accountChanged = event => {
      if (WEB_DEMO) return;
      if (event.key === 'fanfan-account-session-v1' && event.newValue !== event.oldValue) {
        const oldId = (() => { try { return JSON.parse(event.oldValue)?.user?.id; } catch { return null; } })();
        if (oldId !== readSession()?.user.id) window.location.reload();
      }
    };
    window.addEventListener('storage', accountChanged);
    return () => window.removeEventListener('storage', accountChanged);
  }, []);

  useEffect(() => {
    window.fanfanGoBack = () => {
      const sheets = [...document.querySelectorAll('.sheet-backdrop')];
      const top = [...sheets].reverse().find(sheet => sheet.classList.contains('confirm-backdrop')) || sheets.at(-1);
      if (top) {
        const close = top.querySelector('.sheet-head .icon-button, .confirm-sheet > div:last-child button:first-child, button[aria-label="关闭"]');
        close?.click();
        return true;
      }
      if (detail) { setDetail(null); return true; }
      if (tab !== 'today') { setTab('today'); return true; }
      return false;
    };
    return () => { delete window.fanfanGoBack; };
  }, [detail, tab]);

  useEffect(() => {
    if (!history.state?.fanfan) history.pushState({ fanfan: true }, '');
    const back = () => {
      if (window.fanfanGoBack?.()) history.pushState({ fanfan: true }, '');
      else history.back();
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);

  useEffect(() => {
    const checkDate = () => {
      if (dateKey(now()) !== TODAY) window.location.reload();
    };
    const timer = window.setInterval(checkDate, 60000);
    document.addEventListener('visibilitychange', checkDate);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkDate);
    };
  }, []);

  const notify = text => {
    setToast(text);
    window.clearTimeout(window.__fanfanToast);
    window.__fanfanToast = window.setTimeout(() => setToast(''), 2400);
  };

  const todaySpent = useMemo(() => Math.abs(data.transactions
    .filter(item => item.pool === 'food' && item.date === TODAY && item.amount < 0 && !item.transferId && item.kind !== 'calibration')
    .reduce((sum, item) => sum + item.amount, 0)), [data.transactions]);
  const currentPetStage = todaySpent > dailyBudget || data.pools.food <= 0 ? 'overspent' : petStage(pet.lastVisitAt, Date.now(), pet.streakDays);

  const saveTransaction = (item, coverChoice) => {
    const previous = item.id ? data.transactions.find(tx => tx.id === item.id) : null;
    let foodCover = 0;
    if (!previous && item.pool === 'food' && item.amount < 0 && item.date === TODAY) {
      const covered = data.transactions.filter(tx => tx.pool === 'food' && tx.date === TODAY && tx.transferId && tx.title === '小余仓补充饭钱').reduce((sum, tx) => sum + tx.amount, 0);
      const over = Math.max(0, todaySpent + Math.abs(item.amount) - dailyBudget - covered);
      if (over > 0 && data.pools.happy > 0) {
        foodCover = Math.min(over, data.pools.happy);
        if (coverChoice === undefined) {
          setFoodCoverPrompt({ item, over, cover: foodCover });
          return;
        }
        if (!coverChoice) foodCover = 0;
      }
    }
    try { validateRecordEdit({ ...data, pools: { ...data.pools, food: data.pools.food + foodCover, happy: data.pools.happy - foodCover } }, item); }
    catch (error) { window.alert(error.message); return; }
    setData(current => {
      const oldItem = item.id ? current.transactions.find(tx => tx.id === item.id) : null;
      let transactions = oldItem
        ? current.transactions.map(tx => tx.id === item.id ? { ...tx, ...item } : tx)
        : [{ ...item, id: Date.now() }, ...current.transactions];
      const pools = { ...current.pools };
      let monthSavings = current.monthSavings;
      if (oldItem) pools[oldItem.pool] -= oldItem.amount;
      if (oldItem?.pool === 'savings' && oldItem.date.startsWith(TODAY.slice(0, 7))) monthSavings -= oldItem.amount;
      pools[item.pool] = (pools[item.pool] || 0) + item.amount;
      if (item.pool === 'savings' && item.date.startsWith(TODAY.slice(0, 7))) monthSavings += item.amount;
      if (foodCover > 0) {
        const transferId = Date.now() + 1;
        pools.happy -= foodCover;
        pools.food += foodCover;
        transactions = [
          { id: transferId + 1, transferId, kind: 'transfer', date: TODAY, pool: 'food', title: '小余仓补充饭钱', amount: foodCover },
          { id: transferId, transferId, kind: 'transfer', date: TODAY, pool: 'happy', title: '补充饮食池', amount: -foodCover },
          ...transactions
        ];
      }
      const savingsChange = (item.pool === 'savings' && item.date.startsWith(TODAY.slice(0, 7)) ? item.amount : 0) - (oldItem?.pool === 'savings' && oldItem.date.startsWith(TODAY.slice(0, 7)) ? oldItem.amount : 0);
      const result = { ...current, transactions, pools, monthSavings: Math.max(0, monthSavings), currentSavingsAllocation: Math.max(0, (current.currentSavingsAllocation || 0) + savingsChange) };
      const externalFoodChange = (item.pool === 'food' && item.amount > 0 ? item.amount : 0) - (oldItem?.pool === 'food' && oldItem.amount > 0 ? oldItem.amount : 0);
      const next = refreshFoodBudget(result, TODAY, externalFoodChange);
      if (oldItem) return next;
      const spent = Math.abs(next.transactions.filter(tx => tx.pool === 'food' && tx.date === TODAY && tx.amount < 0 && !tx.transferId && tx.kind !== 'calibration').reduce((sum, tx) => sum + tx.amount, 0));
      return rewardPet(next, { date: TODAY, withinBudget: spent <= (next.dailyFoodBudgets?.[TODAY] ?? dailyBudget), valueMarked: Boolean(item.health) });
    });
    setEntryOpen(false);
    setEditing(null);
    notify(item.id ? '已修改，并重新计算后续预算' : '记好啦，余额已更新');
  };

  const saveAiBatch = events => {
    try {
      const next = applyQuickBatch(data, events, TODAY);
      const spent = Math.abs(next.transactions.filter(tx => tx.pool === 'food' && tx.date === TODAY && tx.amount < 0 && !tx.transferId && tx.kind !== 'calibration').reduce((sum, tx) => sum + tx.amount, 0));
      setData(rewardPet(next, { date: TODAY, withinBudget: spent <= (next.dailyFoodBudgets?.[TODAY] ?? dailyBudget), valueMarked: false }));
      setQuickEntryOpen(false); notify('已保存 ' + events.length + ' 项，余额和愿望已更新');
    } catch (error) { window.alert(error.message || '保存失败，请检查识别结果'); }
  };

  const deleteTransaction = id => {
    try {
      const next = removeTransaction(data, id);
      const record = data.transactions.find(tx => tx.id === id);
      setData(record && (isManagedRecord(record) || record.amount > 0) ? refreshFoodBudget(next, TODAY, next.pools.food - data.pools.food) : next);
      notify('记录已删除，余额和预算已更新');
    } catch (error) { window.alert(error.message); }
  };

  const requestDeleteTransaction = id => {
    const item = data.transactions.find(tx => tx.id === id);
    if (item) setDeleteCandidate(item);
  };

  const openPool = key => {
    setDetail(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetData = () => {
    if (!window.confirm('确认清空全部数据并重新初始化吗？清空前会自动保留一份本机备份。')) return;
    try { if (!isSimulation) backupCurrentData('before-reset'); }
    catch { notify('自动备份失败，数据没有清空'); return; }
    setData(structuredClone(INITIAL));
    notify('数据已清空，可从最近自动备份恢复');
  };

  const openEntry = initial => {
    if (initial && isManagedRecord(initial)) {
      window.alert('这类资金操作不能作为普通记账修改，请删除原操作后重新录入。');
      return;
    }
    setEditing(initial || null);
    setEntryOpen(true);
  };

  const wakePet = () => setData(current => ({ ...current, pet: { ...normalizePet(current.pet), lastVisitAt: Date.now() } }));
  const selectPetSkin = skinId => setData(current => {
    const nextPet = unlockPetSkin(current.pet, skinId, { timestamp: now().getTime() });
    return { ...current, pet: nextPet };
  });
  const resetBirthday = () => setData(current => ({ ...current, pet: resetBirthdayTest(current.pet) }));
  const changeTestMembership = enabled => {
    setData(current => ({ ...current, pet: setTestMembership(current.pet, enabled) }));
    notify(enabled ? '测试会员已开启，可体验煎蛋形象' : '测试会员已关闭，已恢复普通身份');
  };

  const transferFunds = ({ source, target, amount, note }) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || !(source in data.pools) || !(target in data.pools) || source === target || value > data.pools[source] || source === 'savings') return false;
    setData(current => {
      const transferId = Date.now();
      const pools = { ...current.pools, [source]: current.pools[source] - value, [target]: current.pools[target] + value };
      const sourceName = POOLS[source].name;
      const targetName = POOLS[target].name;
      const transactions = [
        { id: transferId + 1, transferId, kind: 'transfer', date: TODAY, pool: target, title: `${sourceName}转入${targetName}`, note, amount: value },
        { id: transferId, transferId, kind: 'transfer', date: TODAY, pool: source, title: `转入${targetName}`, note, amount: -value },
        ...current.transactions
      ];
      return refreshFoodBudget({ ...current, pools, transactions, monthSavings: target === 'savings' ? current.monthSavings + value : current.monthSavings, currentSavingsAllocation: (current.currentSavingsAllocation || 0) + (target === 'savings' ? value : 0) }, TODAY, pools.food - current.pools.food);
    });
    setTransferOpen(false);
    notify('转账完成，两边流水已同步');
    return true;
  };

  const calibratePool = ({ pool, target, note }) => {
    const value = Number(target);
    if (!Number.isFinite(value) || value < 0) return false;
    setData(current => {
      const delta = value - current.pools[pool];
      if (delta === 0) return current;
      const record = { id: Date.now(), kind: 'calibration', date: TODAY, pool, title: '余额校准', note: note || '核对实际余额', amount: delta };
      return refreshFoodBudget({ ...current, pools: { ...current.pools, [pool]: value }, transactions: [record, ...current.transactions], monthSavings: pool === 'savings' ? Math.max(0, current.monthSavings + delta) : current.monthSavings, currentSavingsAllocation: Math.max(0, (current.currentSavingsAllocation || 0) + (pool === 'savings' ? delta : 0)) }, TODAY, pool === 'food' ? delta : 0);
    });
    setCalibrationPool(null);
    notify('已生成可删除的校准流水');
    return true;
  };

  const finishOnboarding = setup => {
    const amount = setup.monthBudget;
    setData({
      ...structuredClone(INITIAL),
      onboarded: true,
      lastBudgetMonth: TODAY.slice(0, 7),
      monthBudget: amount,
      nextMonthBudget: amount,
      ratios: setup.ratios,
      pools: { ...setup.amounts },
      monthSavings: setup.amounts.savings,
      currentSavingsAllocation: setup.amounts.savings,
      dailyFoodBudgets: { [TODAY]: setup.amounts.food / REMAINING_DAYS },
      transactions: [],
      wishes: [],
      wishTransfers: []
    });
  };

  const fundWish = (wishId, amount, source = 'happy', note = '') => {
    setData(current => {
      const value = Number(amount);
      const sourceBalance = source === 'external' ? Number.POSITIVE_INFINITY : source === 'reserve' ? current.wishReserve : current.pools.happy;
      if (!Number.isFinite(value) || value <= 0 || value > sourceBalance) return current;
      if (!wishId) {
        if (source === 'reserve') return current;
        return {
          ...current,
          wishReserve: current.wishReserve + value,
          pools: { ...current.pools, happy: source === 'happy' ? current.pools.happy - value : current.pools.happy },
          wishTransfers: [{ id: Date.now(), date: TODAY, wishId: null, source, note: note.trim(), title: '存入愿望池（待分配）', amount: value }, ...current.wishTransfers]
        };
      }
      const wish = current.wishes.find(item => item.id === wishId);
      if (!wish || value > Math.max(0, wish.target - wish.locked)) return current;
      return {
        ...current,
        wishReserve: source === 'reserve' ? current.wishReserve - value : current.wishReserve,
        pools: { ...current.pools, happy: source === 'happy' ? current.pools.happy - value : current.pools.happy },
        wishes: current.wishes.map(item => item.id === wishId ? { ...item, locked: item.locked + value } : item),
        wishTransfers: [{ id: Date.now(), date: TODAY, wishId, source, note: note.trim(), title: `${source === 'reserve' ? '从待分配存入' : source === 'external' ? '由外部支持存入' : '从小余仓存入'}「${wish.title}」`, amount: value }, ...current.wishTransfers]
      };
    });
    notify(wishId ? '这笔钱已锁定到愿望' : '已存入愿望池，暂未分配');
  };

  const deleteWishTransfer = id => {
    setData(current => {
      const record = current.wishTransfers.find(item => item.id === id);
      if (!record) return current;
      const value = Math.abs(Number(record.amount));
      const wishes = [...current.wishes];
      const pools = { ...current.pools };
      let wishReserve = current.wishReserve;
      if (record.amount >= 0 && record.wishId) {
        const index = wishes.findIndex(item => item.id === record.wishId);
        if (index < 0 || wishes[index].locked < value) return current;
        wishes[index] = { ...wishes[index], locked: wishes[index].locked - value };
        if (record.source === 'reserve') wishReserve += value;
        if (record.source === 'happy') pools.happy += value;
      } else if (record.amount >= 0) {
        if (wishReserve < value) return current;
        wishReserve -= value;
        if (record.source === 'happy') pools.happy += value;
      } else {
        const index = wishes.findIndex(item => item.id === record.wishId);
        if (index < 0 || wishes[index].locked + value > wishes[index].target || (record.destination === 'happy' ? pools.happy : wishReserve) < value) return current;
        wishes[index] = { ...wishes[index], locked: wishes[index].locked + value };
        if (record.destination === 'happy') pools.happy -= value; else wishReserve -= value;
      }
      return { ...current, pools, wishes, wishReserve, wishTransfers: current.wishTransfers.filter(item => item.id !== id) };
    });
    notify('愿望金记录已删除，相关余额已同步');
  };

  if (data.loadError) {
    return <div className="recovery-screen"><h1>账本暂时无法读取</h1><p>{data.loadError}</p><p>原始数据仍保留在设备中，请恢复一份有效备份。</p><DataBackupSheet data={data} latestBackup={latestRollingBackup(localStorage, STORE_KEY)} onClose={null} onExport={() => downloadBackup(localStorage.getItem(STORE_KEY) || '{}').catch(error => window.alert(error.message))} onRestoreLatest={() => { try { setData(restoreLatestBackup()); } catch (error) { window.alert(error.message || '自动备份恢复失败'); } }} onImport={next => setData(restoreBackup(next))}/></div>;
  }
  if (!data.onboarded) {
    return <>{storageError && <p className="storage-error" role="alert">{storageError}</p>}<Onboarding onComplete={finishOnboarding} onAccount={() => setAccountOpen(true)} />{accountOpen && <AccountSheet data={data} disabled={isSimulation} onRestore={next => setData(restoreBackup(next))} onClose={() => setAccountOpen(false)} />}</>;
  }

  return (
    <PetAppearanceContext.Provider value={{ skin: pet.selectedSkin, stage: currentPetStage }}><div className="app-shell">
      {storageError && <p className="storage-error" role="alert">{storageError}</p>}
      <main className="phone-stage">
        <AppHeader detail={detail} onBack={() => setDetail(null)} />
        <div className={`screen ${!detail && tab === 'today' ? 'screen-today' : ''}`} key={detail || tab}>
          {detail ? (
            <PoolDetail pool={detail} data={data} dailyBudget={dailyBudget} dailyFoodBudgets={data.dailyFoodBudgets || {}} onEdit={openEntry} onDelete={requestDeleteTransaction} onWishTransfer={fundWish} onDeleteWishTransfer={deleteWishTransfer} onTransfer={() => setTransferOpen(true)} onCalibrate={() => setCalibrationPool(detail)} />
          ) : tab === 'today' ? (
            <Today data={data} pet={pet} petStage={currentPetStage} onWardrobe={() => setWardrobeOpen(true)} onWake={wakePet} dailyBudget={dailyBudget} todaySpent={todaySpent} onAdd={openEntry} onMonth={() => setMonthOpen(true)} />
          ) : tab === 'ledger' ? (
            <Ledger data={data} setData={setData} notify={notify} onEdit={openEntry} onDelete={requestDeleteTransaction} onAdd={openEntry} />
          ) : tab === 'funds' ? (
            <FundsPage data={data} dailyBudget={dailyBudget} openPool={openPool} pet={pet} />
          ) : tab === 'wishes' ? (
            <Wishes data={data} setData={setData} notify={notify} />
          ) : (
            <SettingsPage data={data} setData={setData} resetData={resetData} notify={notify} onAccount={() => setAccountOpen(true)} onMembership={() => setMembershipOpen(true)} onWishFunds={() => setWishTransferOpen(true)} onTransfer={target => { setTransferTarget(typeof target === 'string' ? target : 'food'); setTransferOpen(true); }} />
          )}
        </div>
        <GlobalPetButton pet={pet} stage={currentPetStage} onTap={() => { wakePet(); setPetMenuOpen(true); }} />
        {!detail && <BottomNav tab={tab} setTab={setTab} />}
        {wishTransferOpen && <WishTransferSheet data={data} onClose={() => setWishTransferOpen(false)} onTransfer={(wishId, amount, source, note) => { fundWish(wishId, amount, source, note); setWishTransferOpen(false); }} />}
      </main>
      <aside className="desktop-note">
        <div className="brand-mark"><RiceMascot /></div>
        <p className="eyebrow">{WEB_DEMO ? '网页演示版 · V2.9.1' : '交互原型 · V0.5'}</p>
        <h1>好好吃饭，<br />也要饭饭有余。</h1>
        <p>{WEB_DEMO ? '无需登录，直接体验生活费分配、快捷记账和愿望养成。演示账本保存在当前浏览器，可手动导出备份。' : '记账默认保存在本机。登录后可在设置中手动备份到云端，换设备时恢复。'}</p>
        <div className="desktop-stats">
          <span><b>5</b> 个资金池</span><span><b>离线</b> 记账</span><span><b>{WEB_DEMO ? '免登录' : '可选'}</b> {WEB_DEMO ? '演示' : '云备份'}</span>
        </div>
      </aside>
      {entryOpen && <TransactionSheet initial={editing} onClose={() => { setEntryOpen(false); setEditing(null); }} onSave={saveTransaction} data={data} dailyBudget={dailyBudget} todaySpent={todaySpent} />}
      {quickEntryOpen && <QuickEntrySheet data={data} onClose={() => setQuickEntryOpen(false)} onSaveBatch={saveAiBatch} />}
      {monthOpen && <MonthProgressSheet data={data} dailyBudget={dailyBudget} onClose={() => setMonthOpen(false)} />}
      {transferOpen && <TransferSheet data={data} initialTarget={transferTarget} onClose={() => setTransferOpen(false)} onSave={transferFunds} />}
      {calibrationPool && <CalibrationSheet pool={calibrationPool} data={data} onClose={() => setCalibrationPool(null)} onSave={calibratePool} />}
      {deleteCandidate && <ConfirmSheet title="确认删除这笔记录？" description={deleteCandidate.batch ? '这会撤销本月整笔自动生活费及其所有分配记录。已使用的资金需先补足，撤销后不会再次自动入账。' : '删除后相关余额会恢复，关联转账一起撤销。普通消费不改变今日额度，资金调整会同步更新额度。'} confirmText="确认删除" onCancel={() => setDeleteCandidate(null)} onConfirm={() => { const id = deleteCandidate.id; setDeleteCandidate(null); deleteTransaction(id); }} />}
      {foodCoverPrompt && <FoodCoverSheet over={foodCoverPrompt.over} cover={foodCoverPrompt.cover} onClose={() => setFoodCoverPrompt(null)} onChoose={useHappy => { const item = foodCoverPrompt.item; setFoodCoverPrompt(null); saveTransaction(item, useHappy); }} />}
      {petMenuOpen && <PetActionSheet pet={pet} stage={currentPetStage} onClose={() => setPetMenuOpen(false)} onManual={() => { setPetMenuOpen(false); openEntry(); }} onQuick={() => { setPetMenuOpen(false); setQuickEntryOpen(true); }} onWardrobe={() => { setPetMenuOpen(false); setWardrobeOpen(true); }} />}
      {wardrobeOpen && <PetWardrobeSheet pet={pet} onClose={() => setWardrobeOpen(false)} onSelect={selectPetSkin} onResetBirthday={resetBirthday} onMembership={() => { setWardrobeOpen(false); setMembershipOpen(true); }} />}
      {membershipOpen && <MembershipSheet pet={pet} onToggle={changeTestMembership} onWardrobe={() => { setMembershipOpen(false); setWardrobeOpen(true); }} onClose={() => setMembershipOpen(false)} />}
      {accountOpen && <AccountSheet data={data} disabled={isSimulation} onRestore={next => setData(restoreBackup(next))} onClose={() => setAccountOpen(false)} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div></PetAppearanceContext.Provider>
  );
}

function Onboarding({ onComplete, onAccount }) {
  const [monthBudget, setMonthBudget] = useState('');
  const [ratios, setRatios] = useState({ savings: 20, food: 56, emergency: 14, happy: 10 });
  const [allocation, setAllocation] = useState(null);
  const valid = allocation?.valid === true;
  return <div className="app-shell onboarding-shell"><main className="phone-stage onboarding-stage">
    {!WEB_DEMO && <button className="account-onboard-link" onClick={onAccount}>{readSession() ? '账号与云备份 · 恢复账本' : '登录 / 注册 · 恢复云端账本'}</button>}
    <section className="onboarding-hero"><RiceMascot /><p className="eyebrow">WELCOME</p><h1>先分好这个月的余粮</h1><p>让每一笔钱都有安心的位置。</p></section>
    <form className="onboarding-form" onSubmit={event => { event.preventDefault(); if (valid) onComplete({ monthBudget: Number(monthBudget), ratios, amounts: allocation.amounts }); }}>
      <label className="onboard-budget"><span>本月可用生活费</span><div><b>¥</b><input type="number" min="0.01" step="0.01" required value={monthBudget} onChange={event => setMonthBudget(event.target.value)} /></div></label>
      <BudgetAllocation ratios={ratios} onChange={setRatios} onAllocationChange={setAllocation} amount={monthBudget} />
      <button className="primary-button" type="submit" disabled={!valid}>开始饭饭有余 <ArrowRight size={19} /></button>
    </form></main></div>;
}

function MonthProgressSheet({ data, dailyBudget, onClose }) {
  const foodDaily = tomorrowFoodBudget(data, TODAY);
  const progress = Math.round(CURRENT_DAY / DAYS_IN_MONTH * 100);
  const outlook = monthOutlook(data, TODAY, dailyBudget);
  const pet = activePet(data.pet);
  const monthKey = TODAY.slice(0, 7);
  const monthPetPoints = pet.pointHistory.filter(item => item.date?.startsWith(monthKey)).reduce((sum, item) => sum + Number(item.points || 0), 0);
  const activeDays = new Set(data.transactions.filter(item => item.date?.startsWith(monthKey) && !isManagedRecord(item)).map(item => item.date)).size;
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const generateReport = async () => {
    setReportLoading(true); setReportError('');
    try {
      const value = await requestAiReport(buildMonthlyReportInput(data, TODAY.slice(0, 7)));
      setReport({
        summary: typeof value.summary === 'string' ? value.summary : '',
        findings: Array.isArray(value.findings) ? value.findings.slice(0, 3) : [],
        suggestions: Array.isArray(value.suggestions) ? value.suggestions.slice(0, 3) : []
      });
    } catch (error) { setReportError(error.message || 'AI报告生成失败'); }
    finally { setReportLoading(false); }
  };
  return <div className="sheet-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="sheet progress-sheet"><div className="sheet-handle" /><div className="sheet-head"><div><p className="eyebrow">MONTH PROGRESS</p><h2>{CURRENT_MONTH} 月余粮预报</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></div><div className={`progress-mascot outlook-${outlook.level}`}><RiceMascot mood={outlook.mood} skin={pet.selectedSkin} /><div><b>{outlook.title}</b><span>{outlook.detail}</span></div></div><div className="progress-facts"><span><small>月份进度</small><b>{progress}%</b></span><span><small>次日起预计每日饮食预算</small><b>{foodDaily === null ? '本月最后一天' : money(foodDaily)}</b></span><span><small>月底预计饮食余额</small><b>{money(outlook.projectedEnd)}</b></span></div>
    <section className="pet-growth-report"><div><RiceMascot skin={pet.selectedSkin}/><span><p className="eyebrow">COMPANION GROWTH</p><b>饭团本月成长</b><small>不是比谁花得少，而是把钱花得更明白。</small></span></div><div className="pet-growth-facts"><span><b>+{monthPetPoints}</b><small>本月积分</small></span><span><b>{activeDays}</b><small>记录天数</small></span><span><b>{pet.ownedSkins.length}</b><small>已收集形象</small></span></div></section>
    <section className="ai-report-section"><div><span><Sparkles size={18}/><b>AI月度解读</b></span><small>只上传本地算好的汇总数字，不上传原始流水</small></div>
      {!report && <button type="button" onClick={generateReport} disabled={reportLoading}>{reportLoading ? '生成中…' : '生成AI分析'}</button>}
      {reportError && <p className="form-error">{reportError}</p>}
      {report && <article className="ai-report"><p><b>AI生成分析</b>{report.summary}</p>{report.findings.map((item, index) => <div className={`finding ${item.level || 'notice'}`} key={index}><b>{item.title}</b><span>{item.evidence}</span></div>)}{report.suggestions.length > 0 && <ul>{report.suggestions.map((item, index) => <li key={index}>{item}</li>)}</ul>}<button type="button" onClick={generateReport} disabled={reportLoading}>重新生成</button></article>}
    </section>
  </div></div>;
}

function AppHeader({ detail, onBack }) {
  const weekday = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][now().getDay()];
  return (
    <header className="app-header">
      {detail ? <button className="icon-button" onClick={onBack} aria-label="返回"><ArrowLeft /></button> : <RiceMini />}
      <div className="header-title">
        <strong>{detail ? POOLS[detail].name : APP_NAME}</strong>
        <span>{detail ? monthTitle : `${CURRENT_MONTH}月${CURRENT_DAY}日 · ${weekday}`}</span>
      </div>
      <span className="header-spacer" />
    </header>
  );
}

function Today({ data, pet, petStage, onWardrobe, onWake, dailyBudget, todaySpent, onAdd, onMonth }) {
  const remaining = dailyBudget - todaySpent;
  const ratio = dailyBudget > 0 ? todaySpent / dailyBudget : 0;
  const state = data.pools.food <= 0 ? 'over' : ratio > 1 ? 'over' : ratio > .72 ? 'near' : 'calm';
  const health = data.pools.food <= 0 ? '饮食池已经没钱了' : ratio > 1 ? '今天需要余粮帮忙' : ratio > .72 ? '快到今日预算啦' : '今天吃得很从容';
  const outlook = monthOutlook(data, TODAY, dailyBudget);
  const meals = Object.entries(MEALS).map(([key, label]) => {
    const transaction = data.transactions.find(item => item.pool === 'food' && item.date === TODAY && item.meal === key);
    return { key, label, transaction };
  });
  return (
    <>
      <section className={`today-hero ${state}`}>
        <div className="hero-top"><span className="status-dot" />{health}<Leaf size={17} /></div>
        <p>今日饭钱</p><div className="hero-money"><b>{money(todaySpent)}</b><span>/ {money(dailyBudget)}</span></div>
        <div className="budget-track"><i style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
        <div className="hero-foot"><span>还能吃 <b>{money(Math.max(0, remaining))}</b></span><span>{remaining >= 0 ? `预计余粮 +${money(remaining)}` : `小余仓补 ${money(-remaining)}`}</span></div>
      </section>

      <section className="quick-section">
        <div className="section-heading"><div><p className="eyebrow">TODAY'S MEALS</p><h2>今天吃了什么</h2></div></div>
        <div className="meal-grid">{meals.map(({ key, label, transaction }) => (
          <button className={`meal-item ${transaction ? transaction.health : 'empty'}`} key={key} onClick={() => onAdd(transaction || { pool: 'food', meal: key, date: TODAY, title: '' })}>
            <span>{label.slice(0, 1)}</span><small>{transaction ? money(Math.abs(transaction.amount)) : '待记录'}</small>
          </button>
        ))}</div>
      </section>

      <button className={`month-callout outlook-${outlook.level}`} onClick={onMonth}><RiceMascot mood={outlook.mood} /><div><p>{CURRENT_MONTH} 月已经过了 {Math.round(CURRENT_DAY / DAYS_IN_MONTH * 100)}%</p><strong>{outlook.title}</strong><small>{outlook.detail}</small></div><ArrowRight size={20} /></button>
      <HomePet pet={pet} stage={petStage} onWake={onWake} onWardrobe={onWardrobe}/>
    </>
  );
}

function FundsPage({ data, dailyBudget, openPool, pet }) {
  const currentAvailable = data.pools.food + data.pools.happy + data.pools.emergency;
  const cards = [
    ['food', data.pools.food, `今日可吃 ${money(dailyBudget)}`],
    ['happy', data.pools.happy, `本月收进 ${money(data.transactions.filter(item => item.pool === 'happy' && item.amount > 0).reduce((sum, item) => sum + item.amount, 0))}`],
    ['emergency', data.pools.emergency, `本月用了 ${money(Math.abs(data.transactions.filter(item => item.pool === 'emergency' && item.amount < 0).reduce((sum, item) => sum + item.amount, 0)))}`],
    ['wishes', data.wishes.reduce((sum, wish) => sum + wish.locked, 0) + data.wishReserve, `${data.wishes.length} 个愿望在路上`],
    ['savings', data.pools.savings, '只进不出，慢慢长大']
  ];
  return <>
    <section className="funds-intro"><div className="funds-copy"><p className="eyebrow">MY POCKETS</p><h1>我的资金池</h1><p>饭团替你看着，每一笔都有自己的位置。</p></div><RiceMascot skin={pet.selectedSkin} /><div className="funds-total"><span>当前可用生活费</span><b>{money(currentAvailable)}</b></div></section>
    <section className="pool-section funds-page-grid"><div className="pool-card-grid">{cards.map(([key, value, sub]) => <PoolCard key={key} poolKey={key} value={value} sub={sub} max={data.monthBudget} onClick={openPool} />)}</div></section>
  </>;
}

function PoolCard({ poolKey, value, sub, max, onClick }) {
  const pool = POOLS[poolKey];
  const Icon = pool.icon;
  const fill = Math.max(8, Math.min(100, Number(value) / Math.max(1, Number(max)) * 100));
  return <button className={`pool-card ${pool.tone}`} onClick={() => onClick(poolKey)}>
    <span className="pool-card-top"><span className="pool-card-icon"><Icon size={23} /></span><ChevronRight size={16} /></span>
    <span className="pool-card-copy"><b>{pool.name}</b><strong>{money(value)}</strong><small>{sub}</small></span>
    <span className="pool-card-vessel" aria-hidden="true"><i style={{ height: `${fill}%` }} /></span>
  </button>;
}

function PoolDetail({ pool, data, dailyBudget, dailyFoodBudgets, onEdit, onDelete, onWishTransfer, onDeleteWishTransfer, onTransfer, onCalibrate }) {
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const selectedMonth = selectedDate.slice(0, 7);
  if (pool === 'wishes') return <WishPoolSummary data={data} onTransfer={onWishTransfer} onDeleteTransfer={onDeleteWishTransfer} />;
  const info = POOLS[pool];
  const Icon = info.icon;
  const txs = data.transactions.filter(item => item.pool === pool && item.date === selectedDate);
  const otherTxs = data.transactions.filter(item => item.pool === pool && item.date.startsWith(selectedMonth) && item.date !== selectedDate).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const mainValue = data.pools[pool];
  const poolTransactions = data.transactions.filter(item => item.pool === pool && item.date.startsWith(`${selectedMonth}-`));
  const monthIncome = poolTransactions.filter(item => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const monthExpense = Math.abs(poolTransactions.filter(item => item.amount < 0).reduce((sum, item) => sum + item.amount, 0));
  return <>
    <section className={`pool-hero ${info.tone}`}>
      <div className="pool-hero-icon"><Icon /></div>
      <p>{pool === 'food' ? '当前总余额' : pool === 'savings' ? '累计已存下' : '当前可用'}</p>
      <h1>{money(mainValue)}</h1>
      <div className="pool-metrics">
        {pool === 'food' && <><span><small>今日预算</small><b>{money(dailyBudget)}</b></span><span><small>剩余天数</small><b>{REMAINING_DAYS} 天</b></span></>}
        {pool === 'happy' && <><span><small>所选月流入</small><b>{money(monthIncome)}</b></span><span><small>所选月支出</small><b>{money(monthExpense)}</b></span></>}
        {pool === 'emergency' && <><span><small>所选月已花</small><b>{money(monthExpense)}</b></span><span><small>下月最多结转</small><b>{money(data.emergencyCarryLimit)}</b></span></>}
        {pool === 'savings' && <><span><small>本月储蓄</small><b>{money(data.monthSavings)}</b></span><span><small>规则</small><b>只进不出</b></span></>}
      </div>
    </section>
    <Calendar pool={pool} transactions={data.transactions} budgets={dailyFoodBudgets} selectedDate={selectedDate} onSelect={setSelectedDate} today={TODAY} />
    <section className="ledger-section">
      <div id="selected-day-records" className="section-heading"><div><p className="eyebrow">DAILY DETAILS</p><h2>{ledgerDateTitle(selectedDate)}</h2></div></div>
      <div className="detail-actions"><button onClick={() => onEdit({ pool, date: selectedDate, title: '', amount: pool === 'savings' ? 1 : undefined })}><Plus size={17}/>{pool === 'savings' ? '存入' : '记一笔'}</button>{pool !== 'savings' && <button onClick={onTransfer}><ArrowLeftRight size={17}/>转账</button>}<button onClick={onCalibrate}><RotateCcw size={17}/>校准</button></div>
      <TransactionList data={data} items={txs} onEdit={onEdit} onDelete={onDelete} onAdd={() => onEdit({ pool, date: selectedDate, title: '', amount: pool === 'savings' ? 1 : undefined })} />
      {otherTxs.length > 0 && <><div className="section-heading other-month-heading"><div><p className="eyebrow">MONTH RECORDS</p><h2>所选月份其他流水</h2></div></div><TransactionList data={data} items={otherTxs} onEdit={onEdit} onDelete={onDelete} /></>}
    </section>
  </>;
}

function Ledger({ data, setData, notify, onEdit, onDelete, onAdd }) {
  const [query, setQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [reviewOpen, setReviewOpen] = useState(false);
  const month = selectedDate.slice(0, 7);
  const monthItems = data.transactions.filter(item => item.date.startsWith(month));
  const filtered = monthItems.filter(item => [item.title, item.date, Math.abs(item.amount)].join(' ').includes(query)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const groups = [...new Set(filtered.map(item => item.date))].map(date => ({ date, items: filtered.filter(item => item.date === date) }));
  const expense = -monthItems.filter(item => item.amount < 0).reduce((sum, item) => sum + item.amount, 0);
  const income = monthItems.filter(item => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const add = () => onAdd({ date: selectedDate, title: '' });
  return <>
    <section className="ledger-top"><p className="eyebrow">MONTH LEDGER</p><h1>每一笔，都有记录</h1>
      <div className="ledger-summary"><span><small>所选月流水支出</small><b>{money(expense)}</b></span><span><small>所选月流水收入</small><b>{money(income)}</b></span></div>
      <button className="monthly-review-entry" onClick={() => setReviewOpen(true)}><CalendarDays size={19}/><span><b>月度回顾</b><small>查看本月总结和历史月份</small></span><ChevronRight size={18}/></button>
    </section>
    <Calendar selectedDate={selectedDate} onSelect={setSelectedDate} today={TODAY} transactions={data.transactions}/>
    <section className="selected-date-records"><div className="section-heading"><h2>{ledgerDateTitle(selectedDate)}</h2><button className="text-button" onClick={add}>记一笔</button></div>
      <TransactionList data={data} items={filtered.filter(item => item.date === selectedDate)} onEdit={onEdit} onDelete={onDelete} onAdd={add}/>
    </section>
    <label className="search-box"><Search size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索所选月份的用途或金额"/></label>
    <section className="all-ledger"><h2>所选月份其他流水</h2>{groups.filter(group => group.date !== selectedDate).map(group => <section className="ledger-day-group" key={group.date}><div className="ledger-date-heading"><b>{ledgerDateTitle(group.date)}</b><small>{group.items.length} 笔</small></div><TransactionList data={data} items={group.items} onEdit={onEdit} onDelete={onDelete}/></section>)}</section>
    {reviewOpen && <MonthlyReviewSheet data={data} setData={setData} notify={notify} onClose={() => setReviewOpen(false)}/>}
  </>;
}

function MonthlyReviewSheet({ data, setData, notify, onClose }) {
  const currentKey = `${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, '0')}`;
  const options = Array.from({ length: 12 }, (_, index) => {
    const value = new Date(CURRENT_YEAR, CURRENT_MONTH - 1 - index, 1);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedKey, setSelectedKey] = useState(currentKey);
  const [editing, setEditing] = useState(false);
  const selected = data.monthlyHistory.find(item => item.month === selectedKey);
  const currentFoodSpent = Math.abs(data.transactions.filter(item => item.pool === 'food' && item.date.startsWith(currentKey) && item.amount < 0).reduce((sum, item) => sum + item.amount, 0));
  const summary = selectedKey === currentKey ? { foodSpent: currentFoodSpent, saved: data.monthSavings, emergencyCarry: 0 } : selected;
  const label = key => { const [year, month] = key.split('-'); return `${year} 年 ${Number(month)} 月`; };
  const save = values => {
    setData(current => ({ ...current, monthlyHistory: [{ month: selectedKey, ...values }, ...current.monthlyHistory.filter(item => item.month !== selectedKey)] }));
    setEditing(false);
    notify('月度记录已保存');
  };
  return <div className="sheet-backdrop"><div className="sheet monthly-review-sheet"><div className="sheet-handle"/><div className="sheet-head"><div><p className="eyebrow">MONTHLY REVIEW</p><h2>月度回顾</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X/></button></div><label className="review-month-select">选择年月<input aria-label="回顾年月" type="month" min="1900-01" max="9999-12" value={selectedKey} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) { setSelectedKey(event.target.value); setEditing(false); } }}/></label><p className="month-picker-hint">或选择最近月份</p><div className="month-picker">{options.map(key => <button className={key === selectedKey ? 'active' : ''} onClick={() => { setSelectedKey(key); setEditing(false); }} key={key}>{key.replace('-', '.')}</button>)}</div><h3 className="selected-month-title">{label(selectedKey)}</h3>{summary && !editing ? <article className="history-detail"><div><span><small>饮食支出</small><b>{money(summary.foodSpent || 0)}</b></span><span><small>本月储蓄</small><b>{money(summary.saved || 0)}</b></span><span><small>应急结转到下月</small><b>{money(summary.emergencyCarry || 0)}</b></span></div>{selectedKey === currentKey ? <p className="review-note">本月仍在进行中，结算后会保存完整记录。</p> : <button className="edit-month-button" onClick={() => setEditing(true)}>修改这个月</button>}</article> : editing ? <MonthlyEditor initial={selected} onCancel={() => setEditing(false)} onSave={save}/> : <div className="empty-state month-empty"><b>这个月还没有保存过总结</b><span>可以补充饮食支出、储蓄和应急结转。</span><button className="empty-add" onClick={() => setEditing(true)}>补充这个月</button></div>}</div></div>;
}

function MonthlyEditor({ initial, onCancel, onSave }) {
  const [foodSpent, setFoodSpent] = useState(String(initial?.foodSpent || ''));
  const [saved, setSaved] = useState(String(initial?.saved || ''));
  const [emergencyCarry, setEmergencyCarry] = useState(String(initial?.emergencyCarry || ''));
  const valid = [foodSpent, saved, emergencyCarry].every(value => value === '' || Number(value) >= 0);
  return <form className="monthly-editor" onSubmit={event => { event.preventDefault(); if (valid) onSave({ foodSpent: Number(foodSpent || 0), saved: Number(saved || 0), emergencyCarry: Number(emergencyCarry || 0) }); }}><label><span>饮食支出</span><input type="number" min="0" step="0.01" value={foodSpent} onChange={event => setFoodSpent(event.target.value)}/></label><label><span>本月储蓄</span><input type="number" min="0" step="0.01" value={saved} onChange={event => setSaved(event.target.value)}/></label><label><span>应急结转到下月</span><input type="number" min="0" step="0.01" value={emergencyCarry} onChange={event => setEmergencyCarry(event.target.value)}/></label><div className="monthly-editor-actions"><button type="button" onClick={onCancel}>取消</button><button disabled={!valid}>保存修改</button></div></form>;
}

function TransactionList({ items, onEdit, onDelete, onAdd, locked, data }) {
  if (!items.length) return <div className="empty-state"><RiceMascot /><b>这一天还没有记录</b><span>想起漏记的，现在补上就好。</span>{onAdd && <button className="empty-add" onClick={onAdd}><Plus size={17} />补记一笔</button>}</div>;
  return <div className="transaction-list">{items.map(item => {
    const meta = POOLS[item.pool] || POOLS.food;
    const Icon = item.pool === 'food' ? Utensils : item.pool === 'happy' ? Sparkles : item.pool === 'emergency' ? ShieldCheck : PiggyBank;
    const ordered = [...(data?.transactions || [])].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const index = ordered.findIndex(tx => tx.id === item.id);
    const newerChange = index >= 0 ? ordered.slice(0, index).filter(tx => tx.pool === item.pool).reduce((sum, tx) => sum + tx.amount, 0) : 0;
    const balanceAfter = data ? data.pools[item.pool] - newerChange : null;
    return <div className="swipe-row" key={item.id}>
      <div className={`transaction-row ${item.health ? `health-${item.health}` : ''}`} onClick={() => !locked && onEdit(item)}>
        <span className={`tx-icon ${meta.tone}`}><Icon size={18} /></span>
        <span className="tx-copy"><b>{item.meal ? `${MEALS[item.meal]}${item.title ? ` · ${item.title}` : ''}` : item.title}</b><small>{item.date.replaceAll('-', '.')} {item.health && ` · ${item.health === 'good' ? '健康' : item.health === 'normal' ? '普通' : '不健康'}`}</small></span>
        <span className={`tx-amount ${item.amount > 0 ? 'income' : ''}`}>{item.amount > 0 ? '+' : '-'}{money(Math.abs(item.amount))}{balanceAfter !== null && <small>余额 {money(balanceAfter)}</small>}</span>
        {!locked && <button className="row-delete-button" title="删除这笔记录" aria-label={`删除${item.title}`} onClick={event => { event.stopPropagation(); onDelete(item.id); }}><Trash2 size={18} /></button>}
      </div>
    </div>;
  })}</div>;
}

function Wishes({ data, setData, notify }) {
  const [editorWish, setEditorWish] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [redeemWish, setRedeemWish] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [memoryWish, setMemoryWish] = useState(null);
  const [deleteWish, setDeleteWish] = useState(null);
  const total = data.wishes.reduce((sum, wish) => sum + wish.locked, 0) + data.wishReserve;
  const reorder = (sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    const next = [...data.wishes];
    const from = next.findIndex(item => item.id === sourceId);
    const to = next.findIndex(item => item.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setData(current => ({ ...current, wishes: next }));
  };
  const removeWish = (wish, archive = false) => {
    const reason = archive ? (window.prompt('写下暂时收起的原因（选填）', '') || '').trim() : '';
    setData(current => ({ ...current, wishReserve: current.wishReserve + wish.locked, wishes: current.wishes.filter(item => item.id !== wish.id), archivedWishes: archive ? [{ ...wish, locked: 0, status: 'archived', archivedAt: TODAY, archiveReason: reason }, ...current.archivedWishes] : current.archivedWishes, wishTransfers: wish.locked > 0 ? [{ id: Date.now(), date: TODAY, wishId: wish.id, title: `释放「${wish.title}」至愿望池`, amount: -wish.locked }, ...current.wishTransfers] : current.wishTransfers }));
    notify(`${money(wish.locked)} 已留在愿望池，等待下一个愿望`);
  };
  const restoreWish = wish => {
    setData(current => ({ ...current, archivedWishes: current.archivedWishes.filter(item => item.id !== wish.id), wishes: [...current.wishes, { ...wish, status: undefined, archivedAt: undefined, archiveReason: undefined }] }));
    notify('愿望已放回小铺');
  };
  const deleteArchivedWish = wish => {
    setData(current => ({ ...current, archivedWishes: current.archivedWishes.filter(item => item.id !== wish.id) }));
    notify('暂存愿望已删除');
  };
  const saveWish = (nextWish, options = {}) => {
    setData(current => {
      const previous = nextWish.id ? current.wishes.find(item => item.id === nextWish.id) : null;
      const oldLocked = previous?.locked || 0;
      const difference = nextWish.locked - oldLocked;
      const savedWish = previous ? nextWish : { ...nextWish, id: Date.now() };
      const source = options.source || 'reserve';
      const sourceBalance = source === 'external' ? Number.POSITIVE_INFINITY : source === 'reserve' ? current.wishReserve : current.pools.happy;
      if (difference > sourceBalance) return current;
      const withdrawTarget = options.withdrawTarget || 'reserve';
      const nextReserve = current.wishReserve + (difference < 0 ? (withdrawTarget === 'reserve' ? -difference : 0) : (source === 'reserve' ? -difference : 0));
      const nextHappy = difference > 0 && source === 'happy' ? current.pools.happy - difference : difference < 0 && withdrawTarget === 'happy' ? current.pools.happy - difference : current.pools.happy;
      const action = difference > 0 ? `${source === 'reserve' ? '从待分配存入' : source === 'external' ? '由外部支持存入' : '从小余仓存入'}` : '释放';
      return { ...current, wishReserve: nextReserve, pools: { ...current.pools, happy: nextHappy }, wishes: previous ? current.wishes.map(item => item.id === nextWish.id ? nextWish : item) : [...current.wishes, savedWish], wishTransfers: difference !== 0 ? [{ id: Date.now() + 1, date: TODAY, wishId: savedWish.id, source, destination: difference < 0 ? withdrawTarget : undefined, note: (options.note || '').trim(), title: `${action}「${savedWish.title}」`, amount: difference }, ...current.wishTransfers] : current.wishTransfers };
    });
    setEditorOpen(false); setEditorWish(null); notify('愿望已经放进小铺');
  };
  const redeem = (wish, memory) => {
    setData(current => ({ ...current, wishes: current.wishes.filter(item => item.id !== wish.id), completedWishes: [{ ...wish, ...memory, status: 'redeemed', completedAt: TODAY }, ...current.completedWishes] }));
    setRedeemWish(null); notify('愿望兑换成功，值得纪念');
  };
  return <>
    <section className="wish-heading"><p className="eyebrow">WISH LIST</p><h1>把喜欢的事，<br />一点点攒出来。</h1><div className="wish-total"><span>愿望池共有<small>{data.wishReserve > 0 && `待分配 ${money(data.wishReserve)}`}</small></span><b>{money(total)}</b></div></section>
    <section className="wish-list">{data.wishes.map(wish => <WishCard key={wish.id} wish={wish} dragging={dragging === wish.id} onDragStart={setDragging} onDragEnter={target => reorder(dragging, target)} onDragEnd={() => { setDragging(null); notify('愿望顺序已调整'); }} onOpen={() => wish.locked >= wish.target ? setRedeemWish(wish) : (setEditorWish(wish), setEditorOpen(true))} onDelete={() => setDeleteWish({ wish, archived: false })} onArchive={() => removeWish(wish, true)} />)}</section>
    <button className="wide-action" onClick={() => { setEditorWish(null); setEditorOpen(true); }}><Plus size={19} />添加一个愿望</button>
    {data.completedWishes.length > 0 && <section className="completed-wishes"><div className="section-heading"><div><p className="eyebrow">MEMORIES</p><h2>已经实现的愿望</h2></div></div>{data.completedWishes.map(wish => <button className="memory-card" onClick={() => setMemoryWish(wish)} key={`${wish.id}-${wish.completedAt}`}>{wish.image ? <img src={wish.image} alt="" /> : <span>{wish.icon}</span>}<div><b>{wish.title}</b><small>{wish.completedAt?.replaceAll('-', '.')} · {wish.message || '打开这份愿望回忆'}</small></div><ChevronRight size={18} /></button>)}</section>}
    {data.archivedWishes.length > 0 && <section className="archived-wishes"><div className="section-heading"><div><p className="eyebrow">ARCHIVE</p><h2>暂时收起的愿望</h2></div></div>{data.archivedWishes.map(wish => <article key={`${wish.id}-${wish.archivedAt}`}><span>{wish.icon}</span><div><b>{wish.title}</b><small>{wish.archivedAt?.replaceAll('-', '.')} 暂存{wish.archiveReason ? ` · ${wish.archiveReason}` : ''}</small></div><div className="archive-actions"><button onClick={() => restoreWish(wish)}>恢复</button><button onClick={() => setDeleteWish({ wish, archived: true })}>删除</button></div></article>)}</section>}
    {editorOpen && <WishEditor wish={editorWish} happy={data.pools.happy} reserve={data.wishReserve} transfers={data.wishTransfers} onClose={() => setEditorOpen(false)} onSave={saveWish} />}
    {redeemWish && <RedeemWishSheet wish={redeemWish} onClose={() => setRedeemWish(null)} onRedeem={redeem} />}
    {memoryWish && <WishMemorySheet wish={memoryWish} onClose={() => setMemoryWish(null)} />}
    {deleteWish && <ConfirmSheet title={`确认删除「${deleteWish.wish.title}」？`} description={deleteWish.archived ? '删除后将无法恢复。' : `已存入的 ${money(deleteWish.wish.locked)} 会回到愿望池待分配。`} confirmText="确认删除" onCancel={() => setDeleteWish(null)} onConfirm={() => { const candidate = deleteWish; setDeleteWish(null); candidate.archived ? deleteArchivedWish(candidate.wish) : removeWish(candidate.wish); }} />}
  </>;
}

function WishCard({ wish, dragging, onDragStart, onDragEnter, onDragEnd, onOpen, onDelete, onArchive }) {
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const [swipeOffset, setSwipeOffset] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const finishSwipe = (event, cancelled = false) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (active.horizontal) {
      suppressClick.current = true;
      if (!cancelled) setRevealed(active.offset < -42);
    }
    gesture.current = null;
    setSwipeOffset(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const progress = Math.min(100, wish.locked / wish.target * 100);
  return <div className="wish-swipe-wrap" data-wish-id={wish.id} onDragOver={event => event.preventDefault()} onDragEnter={() => onDragEnter(wish.id)}>
    <div className="wish-swipe-actions"><button onClick={onArchive} aria-label="归档愿望"><Archive size={17} /><small>归档</small></button><button onClick={onDelete} aria-label="删除愿望"><Trash2 size={17} /><small>删除</small></button></div>
    <article className={`wish-card ${revealed ? 'revealed' : ''} ${dragging ? 'dragging' : ''}`} style={swipeOffset === null ? undefined : { transform: `translateX(${swipeOffset}px)`, transition: 'none' }} onPointerDown={event => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      suppressClick.current = false;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, initial: revealed ? -116 : 0, offset: revealed ? -116 : 0, horizontal: false };
    }} onPointerMove={event => {
      const active = gesture.current;
      if (!active || active.id !== event.pointerId) return;
      const dx = event.clientX - active.x, dy = event.clientY - active.y;
      if (!active.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        if (Math.abs(dy) >= Math.abs(dx)) { gesture.current = null; return; }
        active.horizontal = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      active.offset = Math.max(-116, Math.min(0, active.initial + dx));
      setSwipeOffset(active.offset);
    }} onPointerUp={event => finishSwipe(event)} onPointerCancel={event => finishSwipe(event, true)} onClickCapture={event => {
      if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
    }}>
      <button className="wish-order" aria-label="拖动调整顺序" draggable onDragStart={() => onDragStart(wish.id)} onDragEnd={onDragEnd} onPointerDown={event => { event.stopPropagation(); onDragStart(wish.id); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (!dragging && event.buttons !== 1) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-wish-id]'); if (target) onDragEnter(Number(target.dataset.wishId)); }} onPointerUp={onDragEnd}><GripVertical size={22} /></button>
      <div className="wish-icon">{wish.icon}</div>
      <button className="wish-main" onClick={onOpen}><div className="wish-title"><b>{wish.title}</b><span>{progress >= 100 ? '可兑换' : `${Math.round(progress)}%`}</span></div><small>{wish.condition}</small><div className="wish-progress"><i style={{ width: `${progress}%` }} /></div><div className="wish-money"><span>{money(wish.locked)} 已锁定</span><b>{money(wish.target)}</b></div></button>
    </article>
  </div>;
}

function WishEditor({ wish, happy, reserve, transfers, onClose, onSave }) {
  const [title, setTitle] = useState(wish?.title || ''); const [condition, setCondition] = useState(wish?.condition || ''); const [target, setTarget] = useState(wish?.target || 50); const [locked, setLocked] = useState(wish?.locked || 0); const [icon, setIcon] = useState(wish?.icon || '🎁');
  const [editingDetails, setEditingDetails] = useState(!wish);
  const [fundMode, setFundMode] = useState('deposit');
  const [fundAmount, setFundAmount] = useState('');
  const [fundNote, setFundNote] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fundSource, setFundSource] = useState(reserve > 0 ? 'reserve' : 'happy');
  const sourceBalance = fundSource === 'external' ? Number.POSITIVE_INFINITY : fundSource === 'reserve' ? reserve : happy;
  const wishHistory = wish ? transfers.filter(item => item.wishId === wish.id && item.amount > 0) : [];
  const valid = title.trim() && Number(target) > 0 && Number(locked) <= Number(target) && (Boolean(wish) || Number(locked) <= sourceBalance);
  if (wish && !editingDetails) {
    const maxDeposit = Math.max(0, Math.min(wish.target - wish.locked, sourceBalance));
    const maxChange = fundMode === 'deposit' ? maxDeposit : wish.locked;
    const value = Number(fundAmount || 0);
    const nextLocked = fundMode === 'deposit' ? wish.locked + value : wish.locked - value;
    const validChange = value > 0 && value <= maxChange;
    const nextProgress = Math.min(100, nextLocked / wish.target * 100);
    const remainingTarget = Math.max(0, wish.target - wish.locked);
    const error = value > maxChange
      ? fundMode === 'deposit'
        ? value > remainingTarget
          ? `超过愿望剩余预算 ${money(remainingTarget)}，请减少存入金额。`
          : `${fundSource === 'reserve' ? '池内待分配' : '小余仓'}余额不足，还差 ${money(value - maxChange)}。请减少金额或切换资金来源。`
        : `这个愿望目前只能提取 ${money(wish.locked)}`
      : '';
    return <div className="sheet-backdrop"><form className="sheet wish-editor wish-fund-sheet" onSubmit={event => { event.preventDefault(); if (validChange) onSave({ ...wish, locked: nextLocked }, { source: fundSource, note: fundNote }); }}><div className="sheet-handle"/><div className="sheet-head"><div><p className="eyebrow">WISH SAVINGS</p><h2>为「{wish.title}」攒一点</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X/></button></div><div className="wish-fund-summary"><span className="wish-icon">{wish.icon}</span><div><span><b>已经存入 {money(wish.locked)}</b><small>预算 {money(wish.target)}</small></span><div className="wish-progress"><i style={{ width: `${Math.min(100, wish.locked / wish.target * 100)}%` }}/></div></div></div><div className="direction-tabs wish-fund-tabs"><button type="button" className={fundMode === 'deposit' ? 'active' : ''} onClick={() => { setFundMode('deposit'); setFundAmount(''); }}><Plus size={16}/>存入</button><button type="button" className={fundMode === 'withdraw' ? 'active' : ''} onClick={() => { setFundMode('withdraw'); setFundAmount(''); }}><ArrowDownLeft size={16}/>提取</button></div>{fundMode === 'deposit' && <FundSourcePicker source={fundSource} onChange={value => { setFundSource(value); setFundAmount(''); }} reserve={reserve} happy={happy}/>}<label className="amount-field"><span>{fundMode === 'deposit' ? '这次为愿望存入' : '这次从愿望释放'}</span><div><b>¥</b><input type="number" min="0.01" max={maxChange} step="0.01" value={fundAmount} onChange={event => setFundAmount(event.target.value)} placeholder="0.00" autoFocus/></div></label>{fundMode === 'deposit' && <label className="text-field fund-note"><span>这次为什么奖励自己（选填）</span><input value={fundNote} maxLength={60} onChange={event => setFundNote(event.target.value)} placeholder="例如：这周按计划完成了学习任务"/></label>}{error && <p className="fund-error">{error}</p>}<div className="wish-fund-preview"><span>{fundMode === 'deposit' ? '存入后' : '提取后'}<small>{fundMode === 'deposit' ? `本次将锁定到该愿望，最多可存 ${money(maxDeposit)}` : '提取金额会留在愿望池待分配'}</small></span><b>{money(Math.max(0, nextLocked))}</b><i style={{ width: `${nextProgress}%` }}/></div><button className="primary-button" disabled={!validChange}>{fundMode === 'deposit' ? '确认存入并锁定' : '确认提取'} <ArrowRight size={18}/></button><button type="button" className="wish-history-toggle" onClick={() => setHistoryOpen(current => !current)}><span><b>存入历史</b><small>{wishHistory.length ? `${wishHistory.length} 次记录` : '还没有存入记录'}</small></span><ChevronRight className={historyOpen ? 'open' : ''} size={17}/></button>{historyOpen && <WishDepositHistory records={wishHistory}/>}<button type="button" className="wish-edit-details" onClick={() => setEditingDetails(true)}>编辑愿望名称、条件和预算 <ChevronRight size={17}/></button></form></div>;
  }
  return <div className="sheet-backdrop"><form className="sheet wish-editor" onSubmit={event => { event.preventDefault(); if (valid) onSave({ id: wish?.id, icon, title: title.trim(), condition: condition.trim() || '给自己一个小目标', target: Number(target), locked: Number(locked) }, { source: fundSource }); }}><div className="sheet-handle"/><div className="sheet-head"><div><p className="eyebrow">WISH DETAILS</p><h2>{wish ? '编辑愿望资料' : '添加一个愿望'}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></div><div className="wish-form-grid"><label><span>图标</span><input value={icon} onChange={event => setIcon(event.target.value)} maxLength={2}/></label><label><span>愿望名称</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：去看一场电影"/></label></div><label className="text-field"><span>完成条件</span><input value={condition} onChange={event => setCondition(event.target.value)} placeholder="例如：学完数据结构第一章"/></label><div className={`wish-number-grid ${wish ? 'single' : ''}`}><label className="text-field"><span>预算</span><input type="number" min={wish?.locked || 1} value={target} onChange={event => setTarget(event.target.value)}/></label>{!wish && <label className="text-field"><span>首次存入</span><input type="number" min="0" max={Math.min(Number(target), sourceBalance)} value={locked} onChange={event => setLocked(event.target.value)}/></label>}</div>{!wish && <FundSourcePicker source={fundSource} onChange={setFundSource} reserve={reserve} happy={happy}/>}<p className="available-note">{wish ? `已经为这个愿望存入 ${money(wish.locked)}，资料修改不会改变已存金额。` : `首次存入会直接锁定到愿望；也可以先填 0，之后再慢慢存。`}</p><button className="primary-button" disabled={!valid}>{wish ? '保存愿望资料' : '保存愿望'} <ArrowRight size={18}/></button>{wish && <button type="button" className="wish-edit-details" onClick={() => setEditingDetails(false)}><ArrowLeft size={17}/>返回存入或提取</button>}</form></div>;
}

function FundSourcePicker({ source, onChange, reserve, happy, showReserve = true }) {
  return <div className="fund-source"><span>资金来源</span><div className={showReserve ? 'three' : ''}>{showReserve && <button type="button" className={source === 'reserve' ? 'active' : ''} onClick={() => onChange('reserve')}><b>池内待分配</b><small>{money(reserve)}</small></button>}<button type="button" className={source === 'happy' ? 'active' : ''} onClick={() => onChange('happy')}><b>小余仓</b><small>{money(happy)}</small></button><button type="button" className={source === 'external' ? 'active' : ''} onClick={() => onChange('external')}><b>外部支持</b><small>不占池内余额</small></button></div></div>;
}

function WishDepositHistory({ records }) {
  if (!records.length) return <div className="wish-history-empty">第一次存入时，可以为这份期待留下一句话。</div>;
  return <div className="wish-deposit-history">{records.map(item => <article key={item.id}><span><b>+{money(item.amount)}</b><small>{item.date.replaceAll('-', '.')} · {item.source === 'happy' ? '小余仓' : item.source === 'reserve' ? '池内待分配' : item.source === 'external' ? '外部支持' : '愿望金'}</small></span><p>{item.note || '这次没有写备注'}</p></article>)}</div>;
}

function RedeemWishSheet({ wish, onClose, onRedeem }) {
  const [message, setMessage] = useState('');
  const [image, setImage] = useState('');
  const loadImage = event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setImage(reader.result); reader.readAsDataURL(file); };
  return <div className="sheet-backdrop"><div className="sheet redeem-sheet"><div className="sheet-handle"/><div className="sheet-head"><div><p className="eyebrow">WISH UNLOCKED</p><h2>{wish.icon} 愿望已经达标</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></div><p>已经攒够 {money(wish.target)}，为这次实现留一张回忆卡吧。</p><label className="text-field memory-note"><span>写一小段话</span><textarea value={message} onChange={event => setMessage(event.target.value)} placeholder="这一刻为什么值得记住？" /></label><label className="photo-picker">{image ? <img src={image} alt="愿望回忆预览" /> : <><Plus size={20}/><span>放一张照片</span></>}<input type="file" accept="image/*" onChange={loadImage}/></label><button className="primary-button" onClick={() => onRedeem(wish, { message: message.trim(), image })}><Sparkles size={18}/>确认兑换并收藏</button></div></div>;
}

function WishMemorySheet({ wish, onClose }) {
  return <div className="sheet-backdrop"><div className="sheet memory-sheet"><div className="sheet-handle"/><div className="sheet-head"><div><p className="eyebrow">WISH MEMORY</p><h2>{wish.icon} {wish.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X/></button></div>{wish.image && <img className="memory-photo" src={wish.image} alt="愿望实现时留下的照片"/>}<p className="memory-date">{wish.completedAt?.replaceAll('-', '.')} 兑换</p><p className="memory-copy">{wish.message || '这个愿望已经实现，值得好好记住。'}</p></div></div>;
}

function WishPoolSummary({ data, onTransfer, onDeleteTransfer }) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteTransfer, setDeleteTransfer] = useState(null);
  const total = data.wishes.reduce((sum, wish) => sum + wish.locked, 0) + data.wishReserve;
  return <><section className="pool-hero pink"><div className="pool-hero-icon"><Heart /></div><p>当前愿望金</p><h1>{money(total)}</h1><div className="pool-metrics"><span><small>池内待分配</small><b>{money(data.wishReserve)}</b></span><span><small>待实现愿望</small><b>{data.wishes.length} 个</b></span></div></section><button className="wish-transfer-entry" onClick={() => setTransferOpen(true)}><Plus size={19}/><span><b>存入愿望池</b><small>可以先不分配，也可以直接锁定给一个愿望</small></span><ChevronRight size={18}/></button><section className="wish-funding-history"><div className="section-heading"><div><p className="eyebrow">FUNDING HISTORY</p><h2>愿望金记录</h2></div></div>{data.wishTransfers.length ? data.wishTransfers.map(item => <article key={item.id}><span className={item.amount >= 0 ? 'income' : 'out'}>{item.amount >= 0 ? <ArrowDownLeft size={18}/> : <LockOpen size={18}/>}</span><div><b>{item.title}</b><small>{item.date.replaceAll('-', '.')} · {item.source === 'external' ? '外部支持' : item.source === 'happy' ? '小余仓' : item.source === 'reserve' ? '池内待分配' : '愿望金'} {item.note && `· ${item.note}`}</small></div><strong className={item.amount >= 0 ? 'income-text' : ''}>{item.amount >= 0 ? '+' : '-'}{money(Math.abs(item.amount))}</strong><button className="history-delete" onClick={() => setDeleteTransfer(item)} aria-label={`删除${item.title}`}><Trash2 size={17}/></button></article>) : <div className="empty-compact">还没有愿望金记录</div>}</section>{transferOpen && <WishTransferSheet data={data} onClose={() => setTransferOpen(false)} onTransfer={(wishId, amount, source, note) => { onTransfer(wishId, amount, source, note); setTransferOpen(false); }} />}{deleteTransfer && <ConfirmSheet title="确认删除这条愿望金记录？" description="只有资金仍可原路恢复时才会删除，相关愿望进度和余额会同步更新。" confirmText="确认删除" onCancel={() => setDeleteTransfer(null)} onConfirm={() => { const id = deleteTransfer.id; setDeleteTransfer(null); onDeleteTransfer(id); }}/>}</>;
}

function WishTransferSheet({ data, onClose, onTransfer }) {
  const [wishId, setWishId] = useState('reserve');
  const [source, setSource] = useState('happy');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const wish = data.wishes.find(item => item.id === Number(wishId));
  const isReserve = wishId === 'reserve';
  const effectiveSource = source;
  const sourceBalance = effectiveSource === 'external' ? Number.POSITIVE_INFINITY : effectiveSource === 'reserve' ? data.wishReserve : data.pools.happy;
  const maxAmount = isReserve ? sourceBalance : Math.min(sourceBalance, Math.max(0, wish.target - wish.locked));
  const value = Number(amount || 0);
  const valid = value > 0 && value <= maxAmount;
  const remainingTarget = wish ? Math.max(0, wish.target - wish.locked) : Number.POSITIVE_INFINITY;
  const error = value > maxAmount ? !isReserve && value > remainingTarget ? `超过愿望剩余预算 ${money(remainingTarget)}，请减少存入金额。` : `${effectiveSource === 'reserve' ? '池内待分配' : '小余仓'}余额不足，还差 ${money(value - maxAmount)}。请减少金额或切换资金来源。` : '';
  const sourceHint = effectiveSource === 'external' ? '外部支持不会占用现有资金池余额' : `${effectiveSource === 'reserve' ? '池内待分配' : '小余仓'}最多可用 ${money(maxAmount)}`;
  return <div className="sheet-backdrop"><form className="sheet wish-transfer-sheet" onSubmit={event => { event.preventDefault(); if (valid) onTransfer(isReserve ? null : wish.id, value, effectiveSource, note); }}><div className="sheet-handle"/><div className="sheet-head"><div><p className="eyebrow">ADD WISH FUND</p><h2>存入愿望池</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X/></button></div><label className="select-field"><span>存到哪里</span><select value={wishId} onChange={event => { setWishId(event.target.value); setAmount(''); if (event.target.value === 'reserve' && source === 'reserve') setSource('happy'); }}><option value="reserve">先存入愿望池，暂不分配</option>{data.wishes.map(item => <option value={item.id} key={item.id}>{item.icon} 直接存给「{item.title}」</option>)}</select></label><FundSourcePicker source={source} onChange={value => { setSource(value); setAmount(''); }} reserve={data.wishReserve} happy={data.pools.happy} showReserve={!isReserve}/><label className="amount-field"><span>这次存入</span><div><b>¥</b><input type="number" min="0.01" max={Number.isFinite(maxAmount) ? maxAmount : undefined} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" autoFocus/></div></label><label className="text-field fund-note"><span>给这次存入写句话（选填）</span><input value={note} maxLength={60} onChange={event => setNote(event.target.value)} placeholder={effectiveSource === 'external' ? '例如：妈妈奖励我坚持完成了目标' : '例如：按计划完成了这周的目标'}/></label><p className="available-note">{isReserve ? `${sourceHint}，存后保持待分配。` : `${sourceHint}，这笔钱会直接锁定到「${wish?.title}」。`}</p>{error && <p className="fund-error">{error}</p>}<button className="primary-button" disabled={!valid}>{isReserve ? '确认存入愿望池' : '确认存入并锁定'}</button></form></div>;
}

function SettingsPage({ data, setData, resetData, notify, onTransfer, onWishFunds, onMembership, onAccount }) {
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [budgetMode, setBudgetMode] = useState(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const saveBudget = setup => {
    setData(current => {
      if (budgetMode === 'next') return { ...current, nextMonthBudget: setup.monthBudget, nextRatios: setup.ratios };
      const allocated = key => setup.amounts?.[key] ?? 0;
      const savingsAdded = allocated('savings');
      const stamp = Date.now();
      const additions = ['food','happy','emergency','savings'].filter(key => allocated(key) > 0).map((key, index) => ({ id: stamp + index, kind: 'external', date: TODAY, pool: key, title: '新增生活费', amount: allocated(key) }));
      return refreshFoodBudget({ ...current, monthBudget: current.monthBudget + setup.monthBudget, monthSavings: current.monthSavings + savingsAdded, currentSavingsAllocation: current.currentSavingsAllocation + savingsAdded, pools: { ...current.pools, food: current.pools.food + allocated('food'), happy: current.pools.happy + allocated('happy'), emergency: current.pools.emergency + allocated('emergency'), savings: current.pools.savings + savingsAdded }, transactions: [...additions, ...current.transactions] }, TODAY, allocated('food'));
    });
    notify(budgetMode === 'next' ? '下月预算方案已保存' : '新增预算已经放进各资金池'); setBudgetMode(null);
  };
  const exportData = async () => {
    try { await downloadBackup(JSON.stringify(data, null, 2)); notify(nativeBackup ? '备份已保存' : '已发起备份下载'); }
    catch (error) { notify(error.message || '备份保存失败'); }
  };
  const automaticBackup = latestRollingBackup(localStorage, STORE_KEY);
  const recoverLatest = () => {
    try {
      setData(restoreLatestBackup());
      setBackupOpen(false);
      notify('已恢复最近自动备份，恢复前账本也已留档');
    } catch (error) { notify(error.message || '自动备份恢复失败，原账本未变'); }
  };
  return <>
    <section className="settings-intro"><p className="eyebrow">SETTINGS</p><h1>按照你的节奏来</h1><p>资金变化都留下记录，余额更容易核对。</p></section>
    {!WEB_DEMO && <section className="settings-group"><h2>账号与数据</h2><SettingRow icon={ShieldCheck} tone="green" title="账号与云备份" value={readSession()?.user.nickname || '游客模式'} sub="登录、个人资料与手动云端备份" chevron onClick={onAccount} /></section>}
    <section className="settings-group"><h2>饭团陪伴</h2><SettingRow icon={Sparkles} tone="yellow" title="饭饭陪伴会员" value={normalizePet(data.pet).testMembership ? '测试会员已开启' : TEST_MEMBERSHIP_ENABLED ? '测试版可体验' : '权益预览'} sub={TEST_MEMBERSHIP_ENABLED ? '开启测试会员，领取999测试积分' : '查看形象与陪伴权益'} chevron onClick={onMembership} /></section>
    <section className="settings-group"><h2>预算</h2>
      <SettingRow icon={ArrowLeftRight} tone="green" title="资金池转账" value={money(data.pools.food + data.pools.happy + data.pools.emergency)} sub="在饮食、小余仓和应急池之间流转" chevron onClick={onTransfer} />
      <SettingRow icon={Plus} tone="yellow" title="增加预算" value="" sub="有一笔新生活费时，从这里加进来" chevron onClick={() => setBudgetMode('add')} />
      <SettingRow icon={CalendarDays} tone="blue" title="下月预算" value={money(data.nextMonthBudget)} sub={`${CURRENT_MONTH === 12 ? 1 : CURRENT_MONTH + 1} 月 1 日生效`} chevron onClick={() => setBudgetMode('next')} />
      <label className="setting-row"><span className="setting-icon coral"><ShieldCheck size={19} /></span><span className="setting-copy"><b>应急结转上限</b><small>超出部分进入小余仓</small></span><span className="setting-value"><input aria-label="应急结转上限" className="money-input" type="number" min="0" value={data.emergencyCarryLimit} onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value) && value >= 0) setData({ ...data, emergencyCarryLimit: value }); }} onBlur={() => notify(`已保存：下月最多结转 ${money(data.emergencyCarryLimit)}`)} /><small>元</small></span></label>
    </section>
    <section className="settings-group"><h2>回顾与结算</h2>
      <SettingRow icon={CalendarDays} tone="blue" title="月度回顾" value="" sub="查看本月总结和历史月份" chevron onClick={() => setReviewOpen(true)} />
    </section>
    <section className="settings-group"><h2>演练</h2><SettingRow icon={CalendarDays} tone="yellow" title="时间演练" sub="复制账本，模拟跨日跨月，不影响真实数据" chevron onClick={() => { try { startSimulation(data); } catch { notify('空间不足，无法创建演练账本'); } }} /></section><section className="settings-group"><h2>数据</h2>
      <SettingRow icon={ArrowDownLeft} tone="blue" title="备份与恢复" value="" sub="换手机或误删前留一份" chevron onClick={() => setBackupOpen(true)} />
      <SettingRow icon={RotateCcw} tone="coral" title="清空并重新初始化" value="" sub="删除本机全部记录" chevron onClick={resetData} />
    </section>
    <section className="settlement-preview"><RiceMascot /><div><p className="eyebrow">MONTH END</p><h2>本月结算预览</h2><p>应急池将保留 {money(Math.min(data.pools.emergency, data.emergencyCarryLimit))}，超出部分进入小余仓。</p><button onClick={() => setSettlementOpen(true)}>查看资金去向 <ArrowRight size={17} /></button></div></section>
    {settlementOpen && <SettlementSheet data={data} onClose={() => setSettlementOpen(false)} onSavings={() => { setSettlementOpen(false); onTransfer('savings'); }} onWishes={() => { setSettlementOpen(false); onWishFunds(); }} />}
    {budgetMode && <BudgetSheet mode={budgetMode} data={data} onClose={() => setBudgetMode(null)} onSave={saveBudget} />}
    {backupOpen && <DataBackupSheet data={data} latestBackup={automaticBackup} onClose={() => setBackupOpen(false)} onExport={exportData} onRestoreLatest={recoverLatest} onImport={next => { setData(restoreBackup(next)); setBackupOpen(false); notify('备份恢复成功'); }} />}
    {reviewOpen && <MonthlyReviewSheet data={data} setData={setData} notify={notify} onClose={() => setReviewOpen(false)} />}
  </>;
}

function TransferSheet({ data, onClose, onSave, initialTarget = 'food' }) {
  const [source, setSource] = useState('happy');
  const [target, setTarget] = useState(initialTarget);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const value = Number(amount || 0);
  const sourceOptions = ['food','happy','emergency'];
  const targetOptions = ['food','happy','emergency','savings'];
  const valid = source !== target && value > 0 && value <= data.pools[source];
  return <div className="sheet-backdrop"><form className="sheet transfer-sheet" onSubmit={event => { event.preventDefault(); if (valid) onSave({ source, target, amount: value, note: note.trim() }); }}><div className="sheet-handle"/><div className="sheet-head"><div><p className="eyebrow">POOL TRANSFER</p><h2>资金池转账</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X/></button></div><div className="transfer-grid"><label className="select-field"><span>从哪里转出</span><select value={source} onChange={event => { setSource(event.target.value); if (target === event.target.value) setTarget(event.target.value === 'food' ? 'happy' : 'food'); }} >{sourceOptions.map(key => <option value={key} key={key}>{POOLS[key].name} · {money(data.pools[key])}</option>)}</select></label><span className="transfer-arrow"><ArrowRight size={22}/></span><label className="select-field"><span>转到哪里</span><select value={target} onChange={event => setTarget(event.target.value)}>{targetOptions.filter(key => key !== source).map(key => <option value={key} key={key}>{POOLS[key].name}</option>)}</select></label></div><label className="amount-field"><span>转账金额</span><div><b>¥</b><input type="number" min="0.01" max={data.pools[source]} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" autoFocus/></div></label><label className="text-field"><span>备注（选填）</span><input value={note} maxLength={60} onChange={event => setNote(event.target.value)} placeholder="例如：应急池补充饭钱"/></label><div className="impact"><ArrowLeftRight size={19}/><span>会同时生成转出和转入两条关联流水，删除任意一条会一起撤销。</span></div>{value > data.pools[source] && <p className="form-error">{POOLS[source].name}余额不足，最多可转 {money(data.pools[source])}</p>}<button className="primary-button" disabled={!valid}>确认转账</button></form></div>;
}

function CalibrationSheet({ pool, data, onClose, onSave }) {
  const [target, setTarget] = useState(String(data.pools[pool]));
  const [note, setNote] = useState('');
  const value = Number(target);
  const valid = Number.isFinite(value) && value >= 0 && value !== data.pools[pool];
  return <div className="sheet-backdrop"><form className="sheet calibration-sheet" onSubmit={event => { event.preventDefault(); if (valid) onSave({ pool, target: value, note: note.trim() }); }}><div className="sheet-handle"/><div className="sheet-head"><div><p className="eyebrow">BALANCE CHECK</p><h2>校准{POOLS[pool].name}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X/></button></div><p className="balance-intro">仅在账本和实际金额不一致时使用。系统会生成一条可删除的“余额校准”流水。</p><label className="amount-field"><span>实际余额</span><div><b>¥</b><input type="number" min="0" step="0.01" value={target} onFocus={event => event.target.select()} onChange={event => setTarget(event.target.value)}/></div></label><label className="text-field"><span>校准原因（选填）</span><input value={note} maxLength={60} onChange={event => setNote(event.target.value)} placeholder="例如：核对银行卡后修正"/></label><div className="balance-total"><span>本次差额</span><b>{value >= data.pools[pool] ? '+' : '-'}{money(Math.abs(value - data.pools[pool]))}</b></div><button className="primary-button" disabled={!valid}>保存校准流水</button></form></div>;
}

function BudgetSheet({ mode, data, onClose, onSave }) {
  const [monthBudget, setMonthBudget] = useState(mode === 'next' ? data.nextMonthBudget : mode === 'add' ? '' : data.monthBudget);
  const [ratios, setRatios] = useState(mode === 'next' ? (data.nextRatios || data.ratios) : data.ratios);
  const [amounts, setAmounts] = useState({ food: '', happy: '', emergency: '', savings: '' });
  const [allocation, setAllocation] = useState(null);
  const amountTotal = Object.values(amounts).reduce((sum, value) => sum + Number(value || 0), 0);
  const normalizedRatios = () => Object.fromEntries(Object.entries(ratios).map(([key, value]) => [key, Number(value || 0)]));
  const title = mode === 'next' ? '设置下月预算' : '增加一笔预算';
  const eyebrow = mode === 'next' ? 'NEXT MONTH' : 'ADD BUDGET';
  return <div className="sheet-backdrop"><form className="sheet budget-sheet" onSubmit={event => { event.preventDefault(); if (mode === 'add' ? amountTotal > 0 : allocation?.valid === true) onSave(mode === 'add' ? { monthBudget: amountTotal, amounts: Object.fromEntries(Object.entries(amounts).map(([key,value]) => [key, Number(value || 0)])) } : { monthBudget: Number(monthBudget), ratios: normalizedRatios() }); }}><div className="sheet-handle"/><div className="sheet-head"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X/></button></div>{mode === 'add' ? <><p className="balance-intro">直接填写这笔新生活费要进入哪些资金池，不再要求重新设置比例。</p><div className="compact-ratios manual-amounts">{Object.entries(amounts).map(([key,value]) => <label key={key}><span>{POOLS[key].name}</span><div><small>¥</small><input aria-label={`${POOLS[key].name}增加金额`} type="number" min="0" step="0.01" value={value} placeholder="0.00" onFocus={event => event.target.select()} onChange={event => setAmounts(current => ({ ...current, [key]: event.target.value }))}/></div></label>)}</div><div className="ratio-total valid"><span>本次增加合计</span><b>{money(amountTotal)}</b></div><div className="impact"><CircleDollarSign size={19}/><span>每个非零金额都会生成“新增生活费”流水，之后可以核对和删除。</span></div></> : <><label className="onboard-budget"><span>下月可用生活费</span><div><b>¥</b><input type="number" min="0.01" step="0.01" value={monthBudget} placeholder="0.00" onChange={event => setMonthBudget(event.target.value)}/></div></label><BudgetAllocation ratios={ratios} onChange={setRatios} onAllocationChange={setAllocation} amount={monthBudget}/></>}<button className="primary-button" disabled={mode === 'add' ? amountTotal <= 0 : allocation?.valid !== true}>{mode === 'add' ? '确认增加预算' : '保存预算方案'}</button></form></div>;
}

function DataBackupSheet({ data, latestBackup, onClose, onExport, onRestoreLatest, onImport }) {
  const importFile = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.pools || !Array.isArray(parsed.transactions)) throw new Error('invalid');
        onImport(parsed);
      } catch (error) { window.alert(error.message || '这份文件不是有效的饭饭有余备份。'); }
    };
    reader.readAsText(file);
  };
  const backupTime = latestBackup ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(latestBackup.createdAt)) : '';
  return <div className="sheet-backdrop"><div className="sheet backup-sheet"><div className="sheet-handle"/><div className="sheet-head"><div><p className="eyebrow">DATA SAFETY</p><h2>备份与恢复</h2></div>{onClose && <button className="icon-button" onClick={onClose} aria-label="关闭"><X/></button>}</div><div className="backup-note"><ShieldCheck size={22}/><div><b>本机自动保留最近 5 份账本</b><span>{latestBackup ? `最近备份：${backupTime}` : '完成首次设置后会自动生成备份。'} 换手机前仍建议另存备份文件。</span></div></div><button className="backup-action" disabled={!latestBackup} onClick={onRestoreLatest}><RotateCcw size={20}/><span><b>一键恢复最近自动备份</b><small>{latestBackup ? `恢复到 ${backupTime}` : '暂时没有可恢复的自动备份'}</small></span><ChevronRight size={18}/></button><button className="backup-action" onClick={onExport}><ArrowDownLeft size={20}/><span><b>保存备份文件</b><small>下载到手机的文件目录</small></span><ChevronRight size={18}/></button><label className="backup-action" onClick={nativeBackup ? async event => { event.preventDefault(); try { onImport(await openNativeBackup()); } catch (error) { window.alert(error.message || '恢复失败，原账本未变'); } } : undefined}><RotateCcw size={20}/><span><b>从备份文件恢复</b><small>选择以前保存的饭饭有余文件</small></span><ChevronRight size={18}/><input type="file" disabled={nativeBackup} accept="application/json,.json" onChange={importFile}/></label></div></div>;
}

function SettlementSheet({ data, onClose, onSavings, onWishes }) {
  const emergencyCarry = Math.max(0, Math.min(data.pools.emergency, data.emergencyCarryLimit));
  const emergencyExtra = Math.max(0, data.pools.emergency - emergencyCarry);
  const happyAfter = data.pools.happy + data.pools.food + emergencyExtra;
  const outlook = monthOutlook(data, TODAY, data.dailyFoodBudgets?.[TODAY] || 0);
  return <div className="sheet-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div className="sheet settlement-sheet">
      <div className="sheet-handle" />
      <div className="sheet-head"><div><p className="eyebrow">MONTH END</p><h2>{outlook.projectedEnd < 0 ? '这个月需要补一补' : '看看这个月还剩多少'}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></div>
      <div className="settlement-total"><RiceMascot /><div><span>结算后小余仓可用</span><b>{money(happyAfter)}</b></div></div>
      <div className="flow-list">
        <div><span className="flow-icon green"><Utensils size={18} /></span><p><b>饮食池剩余</b><small>全部进入小余仓</small></p><strong>+{money(data.pools.food)}</strong></div>
        <div><span className="flow-icon coral"><ShieldCheck size={18} /></span><p><b>应急池结转</b><small>保留到下月</small></p><strong>{money(emergencyCarry)}</strong></div>
        <div><span className="flow-icon yellow"><Sparkles size={18} /></span><p><b>应急池超出部分</b><small>进入小余仓</small></p><strong>+{money(emergencyExtra)}</strong></div>
      </div>
      <p className="allocation-title">小余仓里的余粮准备怎么安排？</p>
      <p className="allocation-help">月末余额会在进入下月时自动结转。现在可安排小余仓已有的资金。</p><div className="allocation-actions"><button onClick={onSavings}><PiggyBank size={20} /><span><b>存起来</b><small>选择金额转入储蓄池</small></span><ChevronRight size={17} /></button><button onClick={onWishes}><Heart size={20} /><span><b>留给愿望</b><small>选择愿望和金额</small></span><ChevronRight size={17} /></button></div>
    </div>
  </div>;
}

function SettingRow({ icon: Icon, tone, title, sub, value, chevron, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return <Tag className="setting-row" onClick={onClick}><span className={`setting-icon ${tone}`}><Icon size={19} /></span><span className="setting-copy"><b>{title}</b><small>{sub}</small></span><span className="setting-value">{value}{chevron && <ChevronRight size={17} />}</span></Tag>;
}

function QuickEntrySheet({ data, onClose, onSaveBatch }) {
  const [text, setText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [accepted, setAccepted] = useState(() => localStorage.getItem('fanfan-ai-notice-accepted') === 'yes');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState(null);
  const [unresolved, setUnresolved] = useState([]);
  const [resultNotice, setResultNotice] = useState('');
  const [estimatingWish, setEstimatingWish] = useState(null);
  const [wishEstimates, setWishEstimates] = useState({});
  const [wishEstimateErrors, setWishEstimateErrors] = useState({});
  const supportedPools = ['food', 'happy', 'emergency'];
  const updateEvent = (index, patch) => setEvents(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const removeEvent = index => setEvents(current => current.filter((_, itemIndex) => itemIndex !== index).map(item => {
    if (item.intent !== 'fund_wish' || !/^new:\d+$/.test(item.wishId || '')) return item;
    const target = Number(item.wishId.slice(4));
    return { ...item, wishId: target === index ? null : `new:${target > index ? target - 1 : target}` };
  }));
  const reset = () => { setEvents(null); setUnresolved([]); setResultNotice(''); setError(''); };
  const parseLocally = source => {
    if ((text.match(/\d+(?:\.\d+)?\s*(?:元|块)/g) || []).length > 1 || (/花了|买了|支出/.test(text) && /愿望|如果|想买|创建/.test(text))) throw new Error('这段话包含多项操作，请使用AI逐项识别，避免漏记');
    const result = parseQuickEntry(text, { now: now() });
    const targets = data.wishes.filter(wish => text.includes(wish.title));
    if (/存入|存钱|存\s*\d|攒\s*\d/.test(text) && (/愿望/.test(text) || targets.length)) return [{ intent: 'fund_wish', amount: result.amount, date: result.date || TODAY,
      wishId: targets.length === 1 ? targets[0].id : /愿望池/.test(text) && !targets.length ? 'reserve' : null,
      wishTitle: targets.length === 1 ? targets[0].title : '', source: /外部|家人|妈妈|爸爸/.test(text) ? 'external' : /待分配/.test(text) ? 'reserve' : 'happy', note: text, evidence: text }];
    if (result.multipleEntries) throw new Error('本地规则只能识别单笔；多笔请启动AI服务。');
    if (result.intent !== 'create_wish' && /愿望|想买|想去/.test(text)) throw new Error('请使用AI识别愿望操作，避免误记为消费');
    if (result.intent === 'create_wish') return [{
      intent: 'create_wish',
      amount: result.amount,
      title: result.title,
      condition: result.condition,
      evidence: result.originalText,
      confidence: result.amount === null ? 0.55 : 0.85,
      entrySource: source
    }];
    return [{
      intent: result.direction === 'income' ? 'income' : 'expense',
      amount: result.amount,
      date: result.date || TODAY,
      pool: result.direction === 'income' ? 'happy' : supportedPools.includes(result.pool) ? result.pool : null,
      meal: result.meal || null,
      note: result.originalText,
      evidence: result.originalText,
      confidence: 0,
      entrySource: source
    }];
  };
  const estimateBudget = async (index, item) => {
    if (!item.title?.trim()) return;
    setEstimatingWish(index);
    setWishEstimateErrors(current => ({ ...current, [index]: '' }));
    try {
      const estimate = await estimateWishBudget({ title: item.title.trim(), condition: item.condition?.trim() || '' });
      setWishEstimates(current => ({ ...current, [index]: estimate }));
      updateEvent(index, { amount: estimate.suggested });
    } catch (estimateError) {
      setWishEstimateErrors(current => ({ ...current, [index]: estimateError.message || '暂时无法估算，请手动填写预算。' }));
    } finally { setEstimatingWish(null); }
  };
  const chooseImage = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setError('');
      setImageDataUrl(await compressImage(file));
      setImageName(file.name);
    } catch (uploadError) { setError(uploadError.message); }
  };
  const analyzeAi = async event => {
    event.preventDefault();
    if ((!text.trim() && !imageDataUrl) || !accepted) return;
    setLoading(true); setError('');
    try {
      const result = await parseWithAi({ text: text.trim(), imageDataUrl, date: TODAY, wishes: data.wishes });
      setEvents(result.events.map(item => ({ ...item, entrySource: imageDataUrl ? 'ai-image' : 'ai-text' })));
      setUnresolved(result.unresolved);
      localStorage.setItem('fanfan-ai-notice-accepted', 'yes');
    } catch (aiError) {
      if (text.trim() && !imageDataUrl) {
        try {
          setEvents(parseLocally('quick-local-fallback'));
          setUnresolved([]);
          setResultNotice(`AI暂不可用，已切换本地解析；请确认识别结果。`);
        } catch (fallbackError) { setError(`${aiError.message || 'AI识别失败'}；${fallbackError.message}`); }
      } else setError(aiError.message || 'AI识别失败');
    }
    finally { setLoading(false); }
  };
  const analyzeLocal = event => {
    event.preventDefault();
    if (!text.trim()) return;
    try { setEvents(parseLocally('quick-local')); setUnresolved([]); setResultNotice('已使用本地规则识别，请确认后保存。'); setError(''); }
    catch (localError) { setError(localError.message); }
  };
  const errors = events ? validateAiBatch(events) : [];
  let batchError = '';
  if (events?.length && !errors.length) { try { applyQuickBatch(data, events, TODAY); } catch (error) { batchError = error.message; } }
  return <div className="sheet-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div className="sheet quick-entry-sheet">
      <div className="sheet-handle" />
      <div className="sheet-head"><div><p className="eyebrow">AI QUICK ENTRY</p><h2>一句话记账和图片记账</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></div>
      {!events ? <form onSubmit={analyzeAi}>
        {error && <div className="parse-blocked" role="alert"><b>识别未完成</b><span>{error}</span></div>}
        <label className="quick-entry-input"><span>说说刚才发生了什么</span><textarea autoFocus rows="5" value={text} onChange={event => setText(event.target.value)} placeholder="例如：午饭15元，建一个预算600元的耳机愿望，再给它存100元" /></label>
        <p className="keyboard-voice-note">可以直接打字，也可使用键盘自带的语音输入。</p>
        <label className={`ai-image-picker ${imageName ? 'selected' : ''}`}><Camera size={19}/><span><b>{imageName || '选一张支付截图或小票'}</b><small>会在本机压缩后再发送</small></span><input type="file" accept="image/*" onChange={chooseImage}/></label>
        {imageName && <button type="button" className="remove-ai-image" onClick={() => { setImageDataUrl(''); setImageName(''); }}>移除图片</button>}
        <label className="ai-consent"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)}/><span>使用AI时会发送本次文字/图片及现有愿望名称，用于识别和匹配；所有操作确认后才保存。</span></label>
        <button className="primary-button" type="submit" disabled={loading || !accepted || (!text.trim() && !imageDataUrl)}>{loading ? '正在拆分账目…' : '用AI识别并拆分'} <Sparkles size={19}/></button>
        <button className="local-parse-button" type="button" disabled={!text.trim() || loading} onClick={analyzeLocal}>仅用本地规则识别单笔</button>
      </form> : <form onSubmit={event => { event.preventDefault(); if (!errors.length) onSaveBatch(events); }}>
        <button type="button" className="parsed-source" onClick={reset}><span>原文</span><b>{text || imageName || '图片识别'}</b><small>重新输入</small></button>
        <p className={`ai-result-notice ${resultNotice ? 'fallback' : ''}`}>{resultNotice || 'AI识别结果，请逐笔核对金额和资金池'}</p>
        {events.map((item, index) => item.intent === 'fund_wish' ? <article className="ai-event-card wish-deposit" key={index}>
          <div className="ai-event-head"><b>为愿望存钱 {index + 1}</b><button type="button" onClick={() => removeEvent(index)}>删除</button></div>
          {item.evidence && <small className="ai-evidence">识别片段：{item.evidence}</small>}
          <label className="select-field"><span>存到哪个愿望</span><select aria-label={`存钱目标 ${index + 1}`} value={item.wishId ?? ''} onChange={event => { const value = event.target.value; updateEvent(index, { wishId: /^new:/.test(value) || value === 'reserve' || !value ? value || null : data.wishes.find(wish => String(wish.id) === value)?.id ?? null }); }}><option value="">请选择愿望</option><option value="reserve">愿望池（先存入，待分配）</option>{data.wishes.map(wish => <option key={wish.id} value={wish.id}>{wish.title}</option>)}{events.map((wish, wishIndex) => wish.intent === 'create_wish' ? <option key={`new:${wishIndex}`} value={`new:${wishIndex}`}>{wish.title || '新愿望'}（本次创建）</option> : null)}</select></label>
          <label className="select-field"><span>资金来源</span><select aria-label={`存钱来源 ${index + 1}`} value={item.source} onChange={event => updateEvent(index, { source: event.target.value })}><option value="happy">小余仓</option><option value="reserve" disabled={item.wishId === 'reserve'}>愿望池待分配余额</option><option value="external">外部新收入／家人支持</option></select></label>
          <label className="ai-compact-field"><span>本次存入金额</span><div><b>¥</b><input aria-label={`愿望存入金额 ${index + 1}`} type="number" min="0.01" step="0.01" value={item.amount ?? ''} onChange={event => updateEvent(index, { amount: event.target.value })}/></div></label>
          <p className="ai-evidence">这是愿望存款，不会记成消费；确认后才转入。</p>
        </article> : item.intent === 'create_wish' ? <article className="ai-event-card wish" key={index}>
          <div className="ai-event-head"><b>愿望 {index + 1}</b><button type="button" onClick={() => removeEvent(index)}>删除</button></div>
          <label className="text-field"><span>愿望奖励</span><input value={item.title} onChange={event => updateEvent(index, { title: event.target.value })}/></label>
          <label className="text-field"><span>完成条件</span><input value={item.condition} onChange={event => updateEvent(index, { condition: event.target.value })}/></label>
          <label className="ai-compact-field wish-budget-input"><span>你愿意为这个愿望准备多少预算？</span><div><b>¥</b><input type="number" min="0.01" step="0.01" value={item.amount ?? ''} onChange={event => updateEvent(index, { amount: event.target.value })} placeholder="由你决定，也可以让 AI 估算"/></div></label>
          <div className="wish-budget-helper"><button type="button" disabled={estimatingWish === index || !item.title?.trim()} onClick={() => estimateBudget(index, item)}><Sparkles size={16}/>{estimatingWish === index ? '正在分析可能的预算…' : '让 AI 给个参考预算'}</button>{wishEstimates[index] && <div className="wish-estimate"><p><b>参考区间 {money(wishEstimates[index].low)}–{money(wishEstimates[index].high)}</b><span>{wishEstimates[index].reason}</span><small>{wishEstimates[index].assumption} · 仅供参考，可自行修改</small></p><div>{[['低一些',wishEstimates[index].low],['建议',wishEstimates[index].suggested],['宽松些',wishEstimates[index].high]].map(([label,value]) => <button type="button" className={Number(item.amount) === value ? 'active' : ''} onClick={() => updateEvent(index, { amount: value })} key={label}>{label} {money(value)}</button>)}</div></div>}{wishEstimateErrors[index] && <p className="wish-estimate-error">{wishEstimateErrors[index]}</p>}</div>
          <small className="ai-evidence">创建愿望不会立即扣款</small>
        </article> : <article className="ai-event-card" key={index}>
          <div className="ai-event-head"><b>{item.intent === 'income' ? '收入' : '支出'} {index + 1}</b><button type="button" onClick={() => removeEvent(index)}>删除</button></div>
          <div className="direction-tabs"><button type="button" className={item.intent === 'expense' ? 'active' : ''} onClick={() => updateEvent(index, { intent: 'expense' })}>支出</button><button type="button" className={item.intent === 'income' ? 'active' : ''} onClick={() => updateEvent(index, { intent: 'income', pool: 'happy', meal: null })}>收入</button></div>
          {item.evidence && <small className="ai-evidence">识别片段：{item.evidence}</small>}
          <div className="ai-two-fields"><label className="ai-compact-field"><span>金额</span><div><b>¥</b><input type="number" min="0.01" step="0.01" value={item.amount ?? ''} onChange={event => updateEvent(index, { amount: event.target.value })}/></div></label><label className="record-date"><span>日期</span><input type="date" value={item.date || TODAY} onChange={event => updateEvent(index, { date: event.target.value })}/></label></div>
          {item.intent === 'income' ? <p className="impact">收入直接存入小余仓</p> : <div className="quick-field"><span>从哪里扣</span><div className="pool-tabs">{supportedPools.map(key => <button type="button" className={item.pool === key ? 'active' : ''} onClick={() => updateEvent(index, { pool: key, meal: key === 'food' ? item.meal : null })} key={key}>{POOLS[key].name}</button>)}</div></div>}
          {item.pool === 'food' && <div className="meal-picker"><span>餐次（可不标）</span><div>{Object.entries(MEALS).map(([key, label]) => <button type="button" className={item.meal === key ? 'active' : ''} onClick={() => updateEvent(index, { meal: item.meal === key ? null : key })} key={key}>{label}</button>)}</div></div>}
          <label className="text-field"><span>账本备注</span><input value={item.note} onChange={event => updateEvent(index, { note: event.target.value })}/></label>
        </article>)}
        {unresolved.length > 0 && <div className="ai-unresolved"><b>未自动入账</b>{unresolved.map((item, index) => <span key={index}>{item.text}：{item.reason}</span>)}</div>}
        {!events.length && <div className="parse-blocked"><b>没有可保存的账目</b><span>请返回补充金额或换一张更清晰的图片。</span></div>}
        {errors.length > 0 && <div className="parse-warning"><span>还需要你补全</span><b>{errors.join('、')}</b></div>}
        {batchError && <div className="parse-blocked" role="alert"><b>暂时无法保存</b><span>{batchError}</span></div>}
        <button className="primary-button" type="submit" disabled={!events.length || errors.length > 0 || Boolean(batchError)}>确认并保存 {events.length} 项 <ArrowUpRight size={19}/></button>
      </form>}
    </div>
  </div>;
}

function TransactionSheet({ initial, onClose, onSave, data, dailyBudget, todaySpent }) {
  const editingExisting = Boolean(initial?.id);
  const [recordDate, setRecordDate] = useState(initial?.date || TODAY);
  const [pool, setPool] = useState(initial?.pool || 'food');
  const [direction, setDirection] = useState(initial?.amount > 0 ? 'income' : 'expense');
  const [amount, setAmount] = useState(editingExisting ? Math.abs(initial.amount) : '');
  const [title, setTitle] = useState(initial?.title || '');
  const [meal, setMeal] = useState(initial?.meal || 'breakfast');
  const [health, setHealth] = useState(initial?.health || 'good');
  useEffect(() => {
    if (pool === 'savings') setDirection('income');
  }, [pool]);
  const previousFoodSpend = editingExisting && initial.date === TODAY && initial.pool === 'food' && initial.amount < 0 ? Math.abs(initial.amount) : 0;
  const projectedSpend = todaySpent - previousFoodSpend + (recordDate === TODAY && pool === 'food' && direction === 'expense' ? Number(amount || 0) : 0);
  const predicted = recordDate === TODAY && pool === 'food' && amount ? dailyBudget - projectedSpend : null;
  const suggestions = pool === 'food'
    ? ({ breakfast: ['食堂', '面包牛奶', '早餐店'], lunch: ['食堂', '外卖', '下馆子'], dinner: ['食堂', '外卖', '下馆子'], snack: ['水果', '甜品', '夜宵'] }[meal])
    : pool === 'happy' ? ['奖励自己', '退款', '娱乐'] : pool === 'savings' ? ['主动存入', '本月储蓄', '额外存下'] : ['水电费', '教材', '药品'];
  const titleRequired = pool !== 'food' || direction === 'income';
  const submit = event => {
    event.preventDefault();
    if (!amount || (titleRequired && !title.trim()) || !isDateKey(recordDate)) return;
    onSave({
      id: initial?.id,
      date: recordDate,
      pool,
      meal: pool === 'food' ? meal : undefined,
      title: title.trim(),
      amount: direction === 'expense' ? -Number(amount) : Number(amount),
      health: pool === 'food' && direction === 'expense' ? health : undefined
    });
  };
  return <div className="sheet-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <form className="sheet transaction-sheet" onSubmit={submit}>
      <div className="sheet-handle" /><div className="sheet-head"><div><p className="eyebrow">{editingExisting ? 'EDIT RECORD' : 'NEW RECORD'}</p><h2>{editingExisting ? '修改这笔记录' : '今天记一笔'}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></div>
      {pool !== 'savings' && <div className="direction-tabs"><button type="button" className={direction === 'expense' ? 'active' : ''} onClick={() => setDirection('expense')}>支出</button><button type="button" className={direction === 'income' ? 'active' : ''} onClick={() => { setDirection('income'); setPool('happy'); }}>收入</button></div>}
      <label className="record-date"><span>记账日期</span><input type="date" aria-label="记账日期" min="1900-01-01" max="9999-12-31" required value={recordDate} onChange={event => setRecordDate(event.target.value)}/></label>{direction === 'income' && pool !== 'savings' ? <p className="impact">收入直接存入小余仓</p> : <div className="pool-tabs">{['food','happy','emergency','savings'].map(key => <button type="button" className={pool === key ? 'active' : ''} onClick={() => setPool(key)} key={key}>{POOLS[key].name}</button>)}</div>}
      {pool === 'food' && <div className="meal-picker"><span>餐次</span><div>{Object.entries(MEALS).map(([key, label]) => <button type="button" className={meal === key ? 'active' : ''} onClick={() => setMeal(key)} key={key}>{label}</button>)}</div></div>}
      <label className="amount-field"><span>金额</span><div><b>¥</b><input type="number" step="0.01" min="0.01" autoFocus value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></div></label>
      <label className="text-field"><span>{direction === 'income' ? '这笔钱来自' : pool === 'food' ? '这笔钱花在（选填）' : '这笔钱花在（必填）'}</span><input required={titleRequired} value={title} onChange={event => setTitle(event.target.value)} placeholder={direction === 'income' ? '例如：退款' : pool === 'food' ? '不填也可以直接记账' : '例如：买一本书'} /></label>
      <div className="entry-suggestions"><span>快捷选择，选完还可以补充</span><div>{suggestions.map(option => <button type="button" className={title === option ? 'active' : ''} onClick={() => setTitle(option)} key={option}>{option}</button>)}</div></div>
      {pool === 'food' && direction === 'expense' && <div className="health-picker"><span>主观健康度</span><div><button type="button" className={health === 'good' ? 'active good' : ''} onClick={() => setHealth('good')}>健康</button><button type="button" className={health === 'normal' ? 'active normal' : ''} onClick={() => setHealth('normal')}>普通</button><button type="button" className={health === 'bad' ? 'active bad' : ''} onClick={() => setHealth('bad')}>不健康</button></div></div>}
      {predicted !== null && <div className={`impact ${predicted < 0 ? 'warning' : ''}`}><CircleDollarSign size={19} /><span>{predicted >= 0 ? `记账后预计还有余粮 ${money(predicted)}` : `小余仓预计补饭钱 ${money(-predicted)}`}</span></div>}
      <button className="primary-button" type="submit">{editingExisting ? '保存修改' : '确认记账'}<ArrowUpRight size={19} /></button>
    </form>
  </div>;
}

function FoodCoverSheet({ over, cover, onClose, onChoose }) {
  return <div className="sheet-backdrop confirm-backdrop food-cover-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div className="sheet food-cover-sheet">
      <div className="food-cover-pet"><RiceMascot mood="careful" /></div>
      <button type="button" className="icon-button food-cover-close" onClick={onClose} aria-label="关闭"><X /></button>
      <p className="eyebrow">饭团提醒</p><h2>今天的饭钱有点不够啦</h2>
      <p>这笔会超出今日预算 <b>{money(over)}</b>，想从哪里补上？</p>
      <div className="food-cover-actions"><button type="button" onClick={() => onChoose(false)}><span>慢慢消化</span><small>由之后的饮食预算承担</small></button><button type="button" className="use-happy" onClick={() => onChoose(true)}><span>小余仓来帮忙</span><small>补充 {money(cover)}</small></button></div>
    </div>
  </div>;
}

function ConfirmSheet({ title, description, confirmText, onCancel, onConfirm }) {
  return <div className="sheet-backdrop confirm-backdrop"><div className="sheet confirm-sheet"><div className="sheet-handle"/><h2>{title}</h2><p>{description}</p><div><button type="button" onClick={onCancel}>取消</button><button type="button" className="danger" onClick={onConfirm}>{confirmText}</button></div></div></div>;
}

const PET_STAGE_COPY = {
  overspent: ['今天超支啦', '今天花得有点多，接下来一起省着点。'],
  energized: ['精神饱满', '连续坚持很棒，今天也一起稳稳吃饭！'],
  normal: ['正在陪你', '点我打开一句话记账和图片记账。'],
  sleepy: ['有点困啦', '好久没见，记一笔让我精神起来吧。'],
  dazed: ['正在发呆', '我还在这里，回来看看今天的钱吧。'],
  wilted: ['有点蔫巴', '不用内疚，回来就好。'],
  resting: ['趴窝休息', '记一笔或者摸摸我，就能重新精神起来。']
};

function HomePet({ pet, stage, onWake, onWardrobe }) {
  const [reaction, setReaction] = useState('');
  const [line, setLine] = useState('摸摸头，陪我待一会儿。');
  const timer = useRef(null);
  const pointer = useRef(null);
  const [burst, setBurst] = useState(0);
  const isBirthday = pet.selectedSkin === BIRTHDAY_SKIN_ID;
  const birthday = birthdayEdition();
  useEffect(() => { setLine(isBirthday ? `${birthday.age} 岁生日快乐！今天陪你一起庆生。` : '摸摸头，陪我待一会儿。'); }, [isBirthday, birthday.year]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const interact = action => {
    window.clearTimeout(timer.current);
    setReaction(action);
    setBurst(value => value + 1);
    setLine((isBirthday ? { petted: '哈哈哈哈！又长大一岁，也要天天开心。', poked: '哈哈哈，好痒！蛋糕可要拿稳啦。', blow: '呼——许个愿，愿你心想事成。', celebrate: '举起蛋糕，为你庆生！', spinning: '举起蛋糕，为你庆生！' } : { petted: '嘿嘿，舒服。今天也陪你慢慢来。', poked: '呀，好痒！饭粒都要掉啦。', spinning: '转一圈，换个好心情！' })[action]);
    onWake();
    timer.current = window.setTimeout(() => {
      if (action === 'spinning') {
        setReaction('dizzy'); setLine('晕乎乎……让我站稳。');
        timer.current = window.setTimeout(() => setReaction(''), 1800);
      } else setReaction('');
    }, isBirthday ? action === 'celebrate' ? 2800 : action === 'blow' ? 3200 : 5600 : action === 'spinning' ? 1400 : 2400);
  };
  return <section className="home-companion" aria-label="饭团互动区">
    <div className="companion-heading"><span>陪你慢慢攒<small>{PET_STAGE_COPY[stage]?.[0]}</small></span><button type="button" className="points-bank" onClick={onWardrobe} aria-label={`${pet.testMembership ? '测试' : '成长'}积分存钱罐 ${availablePetPoints(pet)}，查看可兑换形象`} title="记账获得成长积分，用于解锁普通形象；测试积分单独计算"><PiggyBank size={28}/><span><b key={availablePetPoints(pet)}>{availablePetPoints(pet)}</b><small>{pet.testMembership ? '测试积分罐' : '成长积分罐'}</small></span></button></div>
    <p className="companion-bubble" aria-live="polite">{stage === 'overspent' ? PET_STAGE_COPY.overspent[1] : line}</p>
    <button type="button" className={`companion-character reaction-${reaction}`} aria-label="摸摸饭团的头" onPointerDown={event => { pointer.current = { x: event.clientX, y: event.clientY, stroked: false }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => {
      const start = pointer.current;
      if (start && !start.stroked && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) { start.stroked = true; interact('petted'); }
    }} onPointerUp={() => { pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }} onClick={() => interact('petted')}><RiceMascot key={`pet-${burst}`} skin={pet.selectedSkin} stage={stage} points={availablePetPoints(pet)} reaction={reaction}/>{reaction && <span className={`companion-fx fx-${reaction}`} key={`fx-${burst}`} aria-hidden="true"><i>♡</i><i>✦</i><i>♡</i></span>}</button>
    <div className="companion-actions"><button type="button" onClick={() => interact('petted')}>{isBirthday ? '笑哈哈' : '摸摸头'}</button><button type="button" onClick={() => interact(isBirthday ? 'blow' : 'poked')}>{isBirthday ? '吹蜡烛' : '戳一戳'}</button><button type="button" onClick={() => interact(isBirthday ? 'celebrate' : 'spinning')}>{isBirthday ? '庆生' : '转个圈'}</button></div>
  </section>;
}

function GlobalPetButton({ pet, stage, onTap }) {
  return <FloatingPet stage={stage} onTap={onTap}><RiceMascot skin={pet.selectedSkin} stage={stage} points={availablePetPoints(pet)}/></FloatingPet>;
}
function PetActionSheet({ pet, stage, onClose, onManual, onQuick, onWardrobe }) {
  const [title, line] = PET_STAGE_COPY[stage] || PET_STAGE_COPY.normal;
  pet = { ...pet, points: availablePetPoints(pet) };
  return <div className="sheet-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="sheet pet-action-sheet"><div className="sheet-handle"/><div className="pet-action-hello"><RiceMascot skin={pet.selectedSkin} stage={stage}/><div><p className="eyebrow">YOUR LITTLE COMPANION</p><h2>{title}</h2><p>{line}</p>{pet.testMembership && <small>测试会员 · 本机体验</small>}</div><button className="icon-button" onClick={onClose} aria-label="关闭"><X/></button></div><div className="pet-stats"><span><b>{availablePetPoints(pet)}</b><small>{pet.testMembership ? '测试积分' : '成长积分'}</small></span><span><b>{pet.streakDays}</b><small>连续记录</small></span><span><b>{PET_SKINS.filter(skin => canUsePetSkin(pet, skin.id)).length}</b><small>已有形象</small></span></div><div className="pet-action-grid"><button onClick={onQuick}><MessageCircle size={20}/><span><b>一句话记账和图片记账</b><small>也可使用输入法语音</small></span></button><button onClick={onManual}><Plus size={20}/><span><b>手动记一笔</b><small>填写完整账目</small></span></button><button onClick={onWardrobe}><Sparkles size={20}/><span><b>宠物形象</b><small>积分切换新形象</small></span></button></div></div></div>;
}

function PetWardrobeSheet({ pet, onClose, onSelect, onResetBirthday, onMembership }) {
  const [birthdayMotion, setBirthdayMotion] = useState('laugh');
  const birthdayOwned = canUsePetSkin(pet, BIRTHDAY_SKIN_ID);
  const edition = birthdayEdition();
  useEffect(() => {
    if (birthdayOwned) document.querySelector('.birthday-reveal')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [birthdayOwned]);
  return <div className="sheet-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="sheet pet-wardrobe-sheet"><div className="sheet-handle"/><div className="sheet-head"><div><p className="eyebrow">PET CHARACTERS</p><h2>选择今天的伙伴</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X/></button></div>{pet.testMembership && <p className="test-member-note">测试会员 · 仅本机体验，不产生扣款</p>}<div className="wardrobe-balance"><Sparkles size={17}/><span>{pet.testMembership ? '可用测试积分' : '可用成长积分'}</span><b>{availablePetPoints(pet)}</b></div><div className="skin-grid">{PET_SKINS.map(skin => {
    const owned = canUsePetSkin(pet, skin.id);
    const selected = pet.selectedSkin === skin.id;
    const disabled = !owned && (skin.birthday ? !canUnlockBirthday({ timestamp: now().getTime() }) : skin.vip || skin.event || availablePetPoints(pet) < skin.cost);
    return <button type="button" className={`skin-card ${selected ? 'selected' : ''} ${skin.vip ? 'vip' : ''} ${skin.event ? 'event' : ''} ${skin.birthday ? 'birthday-card' : ''}`} disabled={disabled} onClick={() => onSelect(skin.id)} key={skin.id}><RiceMascot skin={skin.id} stage="normal" ordinary={skin.birthday && !owned}/><b>{skin.birthday && owned ? '黄耳朵 · 生日装' : skin.name}</b>{skin.birthday && <small className="birthday-tag">生日限定</small>}<small>{selected ? skin.birthday ? '生日当天 · 自动换装' : '正在陪伴' : owned ? '点击换上' : skin.birthday ? '每年 1月4日 自动换装' : skin.vip ? '会员专属' : skin.event ? '节日限定' : `${skin.cost} 积分解锁`}</small></button>;
  })}</div>{birthdayOwned && <section className="birthday-reveal" aria-label="生日当天限定"><h3>{edition.age} 岁，生日快乐！</h3><p>{edition.year} 年 1 月 4 日 · 每年此日，为你庆生</p><div className="birthday-preview"><BirthdayMascot motion={birthdayMotion}/></div><div className="birthday-motion-actions">{[['idle', '捧蛋糕'], ['laugh', '笑哈哈'], ['blow', '吹蜡烛'], ['celebrate', '庆生']].map(([action, label]) => <button type="button" key={action} aria-pressed={birthdayMotion === action} onClick={() => setBirthdayMotion(action)}>{label}</button>)}</div></section>}{BIRTHDAY_TEST_ENABLED && <div className="birthday-test-note"><span>生日测试版 · 可随时免费解锁</span>{pet.birthdayTestUnlocked && <button type="button" onClick={onResetBirthday}>重置为未解锁</button>}</div>}<button className="membership-entry" onClick={onMembership}><span><Sparkles size={18}/><b>看看会员陪伴计划</b></span><small>完整形象、更多动作和月度陪伴记录</small><ChevronRight size={18}/></button><p className="wardrobe-note">基础饭团和记账功能始终免费；会员只扩展形象与互动。</p></div></div>;
}

function MembershipSheet({ pet, onToggle, onWardrobe, onClose }) {
  return <div className="sheet-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><div className="sheet membership-sheet">
    <div className="sheet-handle"/><div className="sheet-head"><div><p className="eyebrow">{TEST_MEMBERSHIP_ENABLED ? 'MEMBER TEST' : 'MEMBER PREVIEW'}</p><h2>饭饭陪伴会员</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X/></button></div>
    <div className="membership-hero"><RiceMascot skin="egg" stage="energized"/><div><b>{pet.testMembership ? '测试会员已开启' : '让陪伴多一点新鲜感'}</b><span>{TEST_MEMBERSHIP_ENABLED ? '本机测试体验 · 免费' : '正式会员筹备中'}</span><small>基础记账和预算功能始终免费</small></div></div>
    <div className="member-benefits"><p><Check size={17}/><span><b>煎蛋会员形象</b><small>开启后可以直接换上，不消耗积分</small></span></p><p><Check size={17}/><span><b>999测试积分</b><small>首次开启领取，可兑换普通形象，与成长积分分开</small></span></p><p><Check size={17}/><span><b>体验进度保留</b><small>重新打开App仍保留身份、形象和积分余额</small></span></p></div>
    {TEST_MEMBERSHIP_ENABLED ? <><p className="test-member-note">仅供测试，无真实订阅、支付或云端会员权益。节日限定暂未开放。</p>{pet.testGrantClaimed && <p className="membership-boundary">剩余测试积分 {pet.testPoints} · 成长积分 {pet.points}，切换身份不会重复赠送积分。</p>}<button className="primary-button" onClick={() => onToggle(!pet.testMembership)}>{pet.testMembership ? '关闭测试会员' : pet.testGrantClaimed ? '重新开启测试会员' : '开启测试会员，领取999积分'}</button>{pet.testMembership && <button className="membership-entry" onClick={onWardrobe}><span><Sparkles size={18}/><b>去形象页换上新伙伴</b></span><ChevronRight size={18}/></button>}</> : <><button className="primary-button" disabled>正式版接入账号与支付后开放</button><p className="membership-boundary">当前仅为权益预览。</p></>}
  </div></div>;
}

function BottomNav({ tab, setTab }) {
  const items = [['today', Home, '今日'], ['ledger', BookOpen, '账本'], ['funds', WalletCards, '资金池'], ['wishes', Heart, '愿望'], ['settings', Settings, '设置']];
  return <nav className="bottom-nav">{items.map(([key, Icon, label]) => <button className={tab === key ? 'active' : ''} onClick={() => { setTab(key); window.scrollTo(0,0); }} key={key}><Icon size={21} /><span>{label}</span></button>)}</nav>;
}

function RiceMini() { return <span className="header-pet"><RiceMascot/></span>; }
function RiceMascot({ mood = 'happy', skin: skinProp, stage: stageProp, points, reaction, ordinary = false }) {
  const appearance = useContext(PetAppearanceContext);
  const skin = skinProp ?? appearance.skin;
  const stage = stageProp ?? appearance.stage;
  const skinName = PET_SKINS.find(item => item.id === skin)?.name || '饭团';
  if (skin === BIRTHDAY_SKIN_ID) return <div className="rice-mascot birthday-dog-mascot" aria-label={ordinary ? '黄耳朵普通头像' : '黄耳朵生日限定'}><BirthdayMascot ordinary={ordinary} stage={stage} reaction={reaction} motion={['blow', 'celebrate'].includes(reaction) ? reaction : 'idle'}/></div>;
  if (skin === 'onigiri') return <div className={`rice-mascot skin-onigiri onigiri-mascot ${mood} pet-stage-${stage}`} aria-label={`${skinName}${PET_STAGE_COPY[stage]?.[0] || '开心'}`}><OnigiriMascot stage={stage} mood={mood} reaction={reaction}/></div>;
  const expression = stage === 'overspent' || stage === 'wilted' || mood === 'worried' ? 'worried' : reaction === 'dizzy' ? 'dizzy' : ['petted', 'poked'].includes(reaction) || stage === 'energized' ? 'delighted' : ['sleepy', 'resting'].includes(stage) ? 'sleepy' : stage === 'dazed' || mood === 'careful' ? 'blank' : 'normal';
  return <div className={`rice-mascot skin-${skin} ${mood} pet-stage-${stage}`} aria-label={`${skinName}${PET_STAGE_COPY[stage]?.[0] || '开心'}`}><div className="rice-ear left"/><div className="rice-ear right"/><div className="rice-face"><span className="pet-detail" aria-hidden="true"/><i className="pet-cheek left"/><i className="pet-cheek right"/><span className="pet-features" data-expression={expression} aria-hidden="true"><span className="pet-eye left"/><span className="pet-eye right"/><span className="pet-mouth"/></span></div></div>;
}

createRoot(document.getElementById('root')).render(<>{isSimulation && <SimulationBanner />}<App /></>);
