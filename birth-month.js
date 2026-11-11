// Taiwan 2000 monthly live births (內政部統計處) and birth-month helpers.
// Counts: data/taiwan-2000-monthly-births.json. Source: https://data.gov.tw/dataset/14233
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ALABirth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

const MONTH_LENGTHS = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
const DEFAULT_PLAYER_BIRTH_DATE = Object.freeze({ year: 2000, month: 5, day: 1 });
const TAIWAN_2000_MONTHLY_BIRTHS = Object.freeze([24042, 22263, 26259, 22587, 25019, 22937, 24436, 25771, 26915, 28710, 28499, 27874]);
const TAIWAN_2000_BIRTHS_TOTAL = 305312;
const TAIWAN_2000_BIRTHS_SOURCE_PAGE = 'https://data.gov.tw/dataset/14233';
const TAIWAN_2000_BIRTHS_SOURCE_QUERY = 'https://statis.moi.gov.tw/micst/webMain.aspx?sys=220&kind=21&type=1&funid=c0120101&cycle=41&outmode=12&utf=1&compmode=0&outkind=3&fldspc=0,7,&codspc0=0,2,3,2,6,1,9,1,12,1,15,16,&ym=8901&ymt=8912';
const SEASON_OF_MONTH = Object.freeze({
  1: '冬', 2: '冬', 3: '春', 4: '春', 5: '春', 6: '夏',
  7: '夏', 8: '夏', 9: '秋', 10: '秋', 11: '秋', 12: '冬',
});
const SEASON_FALLBACK_MONTH = Object.freeze({ 春: 3, 夏: 7, 秋: 10, 冬: 12 });

function hashSeed(input) {
  const text = String(input);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let a = (Number(seed) || 1) >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return next;
}

function weightedPick(rng, items, weights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!items.length || total <= 0) return null;
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function resolveBirth(birth) {
  if (birth == null || (typeof birth === 'object' && birth.month == null && birth.birthMonth == null)) {
    return DEFAULT_PLAYER_BIRTH_DATE;
  }
  const month = Number(birth.month ?? birth.birthMonth);
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('生日月份必須是 1 到 12。');
  const year = Number(birth.year);
  const day = Number(birth.day);
  return {
    year: Number.isInteger(year) && year > 0 ? year : 2000,
    month,
    day: Number.isInteger(day) && day > 0 ? day : 1,
  };
}

function birthDayOfYear(birth) {
  const b = resolveBirth(birth);
  let doy = b.day - 1;
  for (let i = 0; i < b.month - 1; i++) doy += MONTH_LENGTHS[i];
  return doy;
}

/** Seeded draw at new life. Uses hashSeed(`${seed}:birth-month`), never the life event RNG. */
function drawBirthMonth(seed) {
  const rng = makeRng(hashSeed(`${seed}:birth-month`));
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  return weightedPick(rng, months, TAIWAN_2000_MONTHLY_BIRTHS);
}

function drawBirthDate(seed) {
  return Object.freeze({ year: 2000, month: drawBirthMonth(seed), day: 1 });
}

function civilYear(age, month, birth) {
  const b = resolveBirth(birth);
  const a = Math.max(0, Math.floor(Number(age) || 0));
  const m = Math.floor(Number(month));
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new RangeError('月份必須是 1 到 12。');
  return m >= b.month ? b.year + a : b.year + a + 1;
}

function seasonOfMonth(month) {
  return SEASON_OF_MONTH[month];
}

function defaultMonthForSeason(season, birth) {
  const b = resolveBirth(birth);
  if (season && SEASON_OF_MONTH[b.month] === season) return b.month;
  return SEASON_FALLBACK_MONTH[season] || b.month;
}

/** Taiwan 1 Sept: Jan–Sep enter in the September of the year they turn 6; Oct–Dec one year later. */
function primarySchoolEntryYear(birth) {
  const b = resolveBirth(birth);
  return b.month <= 9 ? b.year + 6 : b.year + 7;
}

function primarySchoolEntryAge(birth) {
  const b = resolveBirth(birth);
  const year = primarySchoolEntryYear(b);
  const month = 9;
  // Invert civilYear: year = 2000+age if month >= birth, else 2000+age+1
  const age = month >= b.month ? year - b.year : year - b.year - 1;
  return age;
}

function dayFromMonthsSinceBirth(months, birth) {
  const n = Math.floor(Number(months));
  if (!Number.isInteger(n) || n < 0) throw new RangeError('出生後月數必須是非負整數。');
  const b = resolveBirth(birth);
  let day = 0;
  for (let i = 0; i < n; i++) {
    const m = ((b.month - 1 + i) % 12) + 1;
    day += MONTH_LENGTHS[m - 1];
  }
  return day;
}

function scheduleEvent(elig, birth) {
  const b = resolveBirth(birth);
  if (elig && elig.months_since_birth != null) {
    const day = dayFromMonthsSinceBirth(elig.months_since_birth, b);
    const age = Math.floor(day / 365);
    const month = ((b.month - 1 + elig.months_since_birth) % 12) + 1;
    const year = civilYear(age, month, b);
    return { day, age, month, year, monthsSinceBirth: elig.months_since_birth };
  }
  const age = Math.max(0, Math.floor(Number(elig?.age_min) || 0));
  const month = Math.floor(Number(elig?.calendar_month));
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('事件月份必須是 1 到 12。');
  const year = civilYear(age, month, b);
  return { age, month, year };
}

const api = {
  MONTH_LENGTHS,
  DEFAULT_PLAYER_BIRTH_DATE,
  TAIWAN_2000_MONTHLY_BIRTHS,
  TAIWAN_2000_BIRTHS_TOTAL,
  TAIWAN_2000_BIRTHS_SOURCE_PAGE,
  TAIWAN_2000_BIRTHS_SOURCE_QUERY,
  SEASON_OF_MONTH,
  hashSeed,
  makeRng,
  weightedPick,
  resolveBirth,
  birthDayOfYear,
  drawBirthMonth,
  drawBirthDate,
  civilYear,
  seasonOfMonth,
  defaultMonthForSeason,
  primarySchoolEntryYear,
  primarySchoolEntryAge,
  dayFromMonthsSinceBirth,
  scheduleEvent,
};

  return api;
});
