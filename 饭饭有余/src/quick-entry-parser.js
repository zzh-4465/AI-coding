const MEAL_RULES = [
  ['breakfast', /早餐|早饭|早点|早上/],
  ['lunch', /午餐|午饭|中饭/],
  ['dinner', /晚餐|晚饭/],
  ['snack', /夜宵|宵夜|加餐|零食|奶茶/]
];

const EXPLICIT_POOL_RULES = [
  ['food', /饮食池|饭钱/],
  ['happy', /小余仓/],
  ['emergency', /应急(?:必备)?池|应急必备/],
  ['savings', /储蓄池/],
  ['wish', /愿望池|愿望金/]
];

const INFERRED_POOL_RULES = [
  ['emergency', /水费|电费|燃气|话费|房租|药(?:品)?|医院|看病|日用品|生活用品/],
  ['happy', /电影|演出|游戏|游乐|娱乐|唱歌|KTV|聚会|礼物/],
  ['savings', /储蓄|存钱|攒钱/],
  ['wish', /愿望/]
];

const VALUE_RULES = [
  ['worth', /不后悔/],
  ['regret', /不太值|不怎么值|不值(?:得)?|后悔|踩雷|浪费|冲动消费|被坑|亏了/],
  ['worth', /很值|挺值|真值|值得|值了|不亏|满意|开心/],
  ['neutral', /一般|还行|凑合|普通|没感觉|无功无过/]
];

const INCOME_RE = /收入|进账|到账|收到|赚了|工资|生活费|奖学金|退款|报销/;
const EXPENSE_RE = /花了|花掉|支出|消费|付款|付了|买了?|吃了?|用了|扣款|交了/;
const WEEKDAY_INDEX = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
const DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNITS = { 十: 10, 百: 100, 千: 1000, 万: 10000 };

const pad = value => String(value).padStart(2, '0');
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const validDate = (year, month, day) => {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

function chineseInteger(text) {
  if (!text) return null;
  if (![...text].some(char => UNITS[char])) {
    const digits = [...text].map(char => DIGITS[char]);
    return digits.some(value => value === undefined) ? null : Number(digits.join(''));
  }
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const char of text) {
    if (DIGITS[char] !== undefined) {
      digit = DIGITS[char];
      continue;
    }
    const unit = UNITS[char];
    if (!unit) return null;
    if (unit === 10000) {
      section += digit;
      total += section * unit;
      section = 0;
    } else {
      section += (digit || 1) * unit;
    }
    digit = 0;
  }
  return total + section + digit;
}

function chineseNumber(text) {
  const normalized = text.replace(/人民币/g, '').replace(/[元块钱圆]/g, '');
  const decimalParts = normalized.split(/[点\.]/);
  if (decimalParts.length > 2) return null;
  const integer = chineseInteger(decimalParts[0]);
  if (integer === null) return null;
  if (decimalParts.length === 1) return integer;
  const decimalDigits = [...decimalParts[1]].map(char => DIGITS[char]);
  if (!decimalDigits.length || decimalDigits.some(value => value === undefined)) return null;
  return Number(`${integer}.${decimalDigits.join('')}`);
}

function findAmount(text) {
  const arabicPatterns = [
    /(?:收入|进账|到账|收到|赚了|工资|生活费|退款|报销|花了|花掉|支出|消费|付款|付了|用了|扣款|交了)\s*[¥￥]?\s*(\d+(?:\.\d{1,2})?)/,
    /[¥￥]\s*(\d+(?:\.\d{1,2})?)/,
    /(\d+(?:\.\d{1,2})?)\s*(?:元|块钱|块|圆)/,
    /(?:早餐|早饭|午餐|午饭|中饭|晚餐|晚饭|夜宵|宵夜|加餐)\s*(\d+(?:\.\d{1,2})?)/
  ];
  for (const pattern of arabicPatterns) {
    const match = text.match(pattern);
    if (match) return { value: Number(match[1]), evidence: match[0], confidence: 'high' };
  }

  // Voice keyboards often transcribe “十五块八” without the decimal point.
  const colloquial = text.match(/([零〇一二两三四五六七八九十百千万]+)块([零〇一二三四五六七八九])(?![零〇一二三四五六七八九十百千万])/);
  if (colloquial) {
    const whole = chineseInteger(colloquial[1]);
    const decimal = DIGITS[colloquial[2]];
    if (Number.isFinite(whole) && decimal !== undefined) return { value: whole + decimal / 10, evidence: colloquial[0], confidence: 'medium' };
  }
  const chineseMatch = text.match(/([零〇一二两三四五六七八九十百千万]+(?:点[零〇一二两三四五六七八九]+)?)\s*(?:元|块钱|块|圆)/);
  if (chineseMatch) {
    const value = chineseNumber(chineseMatch[1]);
    if (Number.isFinite(value)) return { value, evidence: chineseMatch[0], confidence: 'medium' };
  }
  return null;
}

function findDate(text, referenceDate) {
  const explicit = text.match(/(?:(\d{4})\s*[年\/-])?(\d{1,2})\s*[月\/-](\d{1,2})\s*日?/);
  if (explicit) {
    const year = Number(explicit[1] || referenceDate.getFullYear());
    const value = validDate(year, Number(explicit[2]), Number(explicit[3]));
    if (value) return { value: dateKey(value), evidence: explicit[0], confidence: 'high' };
  }
  const relativeRules = [
    ['大前天', -3], ['前天', -2], ['昨天', -1], ['昨日', -1], ['今天', 0], ['今日', 0]
  ];
  for (const [word, offset] of relativeRules) {
    if (text.includes(word)) return { value: dateKey(addDays(referenceDate, offset)), evidence: word, confidence: 'high' };
  }
  const lastWeek = text.match(/上(?:个)?周([一二三四五六日天])/);
  if (lastWeek) {
    const currentWeekday = referenceDate.getDay() || 7;
    const monday = addDays(referenceDate, 1 - currentWeekday);
    const value = addDays(monday, WEEKDAY_INDEX[lastWeek[1]] - 8);
    return { value: dateKey(value), evidence: lastWeek[0], confidence: 'high' };
  }
  return { value: dateKey(referenceDate), evidence: '默认今天', confidence: 'low' };
}

function findRule(text, rules, confidence = 'high') {
  for (const [value, pattern] of rules) {
    const match = text.match(pattern);
    if (match) return { value, evidence: match[0], confidence };
  }
  return null;
}

function containsMultipleEntries(text) {
  const currencyAmounts = text.match(/(?:[¥￥]\s*)?\d+(?:\.\d{1,2})?\s*(?:元|块钱|块|圆)/g) || [];
  const mealAmounts = text.match(/(?:早餐|早饭|早点|午餐|午饭|中饭|晚餐|晚饭|夜宵|宵夜|加餐)\s*\d+(?:\.\d{1,2})?/g) || [];
  const meals = MEAL_RULES.filter(([, pattern]) => pattern.test(text)).length;
  return Math.max(currencyAmounts.length, mealAmounts.length, meals) > 1;
}

function findConditionalWish(text) {
  const hasWishCue = /如果|要是|只要|等到|完成.+后|考(?:到|了)?.+就|坚持.+就/.test(text);
  if (!hasWishCue) return null;
  const normalized = text.replace(/^(?:如果|要是|只要|等到)\s*/, '');
  const match = normalized.match(/^(.+?)(?:我就|以后就|后就|以后|后|就)(.+)$/);
  if (!match) return null;
  const condition = match[1].trim().replace(/[，,。；;]+$/g, '');
  const rewardText = match[2].trim().replace(/^[，,。；;]+/g, '');
  if (!condition || !rewardText) return null;
  const budget = findAmount(rewardText);
  const title = rewardText
    .replace(/^(?:奖励自己|我要|我想|去|买(?:一个|个)?|吃(?:一个|个)?)/, '')
    .replace(/(?:花|预算|不超过)\s*[¥￥]?\d+(?:\.\d{1,2})?\s*(?:元|块钱|块|圆).*$/g, '')
    .replace(/[，,。；;]+$/g, '')
    .trim() || rewardText;
  return { condition, title, budget: budget?.value ?? null, evidence: text };
}

export function parseQuickEntry(input, options = {}) {
  const text = String(input || '').trim().replace(/\s+/g, ' ');
  const referenceDate = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!text || Number.isNaN(referenceDate.getTime())) throw new TypeError('需要有效的记账文字和参考时间');

  const wish = findConditionalWish(text);
  if (wish) {
    return {
      originalText: text,
      intent: 'create_wish',
      title: wish.title,
      condition: wish.condition,
      amount: wish.budget,
      direction: null,
      date: dateKey(referenceDate),
      meal: null,
      pool: null,
      value: null,
      multipleEntries: false,
      needsConfirmation: wish.budget === null ? ['amount'] : [],
      details: { wish: { value: wish, evidence: wish.evidence, confidence: wish.budget === null ? 'medium' : 'high' } }
    };
  }

  const amount = findAmount(text);
  const date = findDate(text, referenceDate);
  const meal = findRule(text, MEAL_RULES);
  const explicitPool = findRule(text, EXPLICIT_POOL_RULES);
  const inferredPool = explicitPool || (meal ? { value: 'food', evidence: meal.evidence, confidence: 'medium' } : findRule(text, INFERRED_POOL_RULES, 'medium'));
  const valueJudgment = findRule(text, VALUE_RULES);
  const hasIncome = INCOME_RE.test(text);
  const hasExpense = EXPENSE_RE.test(text) || Boolean(meal);
  const direction = hasIncome !== hasExpense
    ? { value: hasIncome ? 'income' : 'expense', evidence: hasIncome ? text.match(INCOME_RE)[0] : (text.match(EXPENSE_RE)?.[0] || meal.evidence), confidence: 'high' }
    : null;

  const resolvedPool = direction?.value === 'income' ? { value: 'happy', evidence: '收入进入小余仓', confidence: 'high' } : inferredPool;
  const fields = { amount, direction, date, meal, pool: resolvedPool, value: valueJudgment };
  const required = ['amount', 'direction', 'date', 'pool', 'value'];
  const needsConfirmation = required.filter(name => !fields[name] || fields[name].confidence === 'low');

  return {
    originalText: text,
    intent: direction?.value === 'income' ? 'income' : 'expense',
    amount: amount?.value ?? null,
    direction: direction?.value ?? null,
    date: date.value,
    meal: meal?.value ?? null,
    pool: resolvedPool?.value ?? null,
    value: valueJudgment?.value ?? null,
    multipleEntries: containsMultipleEntries(text),
    needsConfirmation,
    details: Object.fromEntries(Object.entries(fields).map(([name, result]) => [name, result || { value: null, evidence: null, confidence: 'none' }]))
  };
}
