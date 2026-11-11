// Shared non-leap calendar, aligned with A-Life-Again PR #19 (6ea7814, game-calendar.js).
// A game year is 365 days starting on the birthday. There is no 29 February;
// after 80 game years the civil date is 20 days ahead of the real calendar, by design.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ALACalendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MONTH_LENGTHS = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

  /** The player's birth date. Day 0 of a life is this civil date. */
  const PLAYER_BIRTH_DATE = Object.freeze({ year: 2000, month: 5, day: 1 });

  const GAME_START_YEAR = PLAYER_BIRTH_DATE.year;
  const BIRTH_MONTH = PLAYER_BIRTH_DATE.month;
  const BIRTH_DAY_OF_MONTH = PLAYER_BIRTH_DATE.day;

  /** 0-based day-of-year of the birthday in the non-leap 365-day year. */
  const BIRTH_DAY_OF_YEAR = MONTH_LENGTHS.slice(0, BIRTH_MONTH - 1).reduce((sum, days) => sum + days, 0)
    + (BIRTH_DAY_OF_MONTH - 1);

  // Display seasons follow the real month, not a birthday offset: 3–5 春, 6–8 夏, 9–11 秋, 12–2 冬.
  const CORNER_SEASON = Object.freeze({
    1: '冬', 2: '冬', 3: '春', 4: '春', 5: '春', 6: '夏',
    7: '夏', 8: '夏', 9: '秋', 10: '秋', 11: '秋', 12: '冬',
  });

  // When a screen only has a season word, pick a month inside that season.
  // 春 → May (birthday, start of that age). 冬 → December (first winter of that age).
  // 夏 / 秋 fall wholly after the birthday, so mid-season months are unambiguous.
  const DEFAULT_MONTH_FOR_SEASON = Object.freeze({ 春: 5, 夏: 7, 秋: 10, 冬: 12 });

  const YEAR_DIGIT = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const AGE_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

  function monthOfDayOfYear(dayOfYear) {
    let offset = 0, month = 0;
    while (month < 11 && dayOfYear >= offset + MONTH_LENGTHS[month]) offset += MONTH_LENGTHS[month++];
    return { monthIndex: month, dayOfMonth: dayOfYear - offset + 1, daysInMonth: MONTH_LENGTHS[month] };
  }

  function dayOfYear0(month, dayOfMonth) {
    let offset = 0;
    for (let i = 0; i < month - 1; i++) offset += MONTH_LENGTHS[i];
    return offset + (dayOfMonth - 1);
  }

  /** Shared non-leap calendar. A game year is 365 days starting on the birthday. */
  function monthDate(day) {
    if (!Number.isSafeInteger(day) || day < 0) throw new RangeError('遊戲日期必須是非負整數。');
    const ageYear = Math.floor(day / 365);
    const shifted = day % 365 + BIRTH_DAY_OF_YEAR;
    const yearCarry = shifted >= 365 ? 1 : 0;
    const { monthIndex, dayOfMonth, daysInMonth } = monthOfDayOfYear(shifted % 365);
    const year = GAME_START_YEAR + ageYear + yearCarry;
    const month = monthIndex + 1;
    const lifeMonth = (monthIndex - (BIRTH_MONTH - 1) + 12) % 12;
    return {
      day, year, month, dayOfMonth, daysInMonth,
      monthIndex: ageYear * 12 + lifeMonth,
      label: `${year} 年 ${month} 月 ${dayOfMonth} 日`,
      calendar: 'game-365',
    };
  }

  /** 1-based day of this life year. Day 0, the birthday, is 第 1 天 — not 1 January. */
  function lifeDayOfYear(day) {
    if (!Number.isSafeInteger(day) || day < 0) throw new RangeError('遊戲日期必須是非負整數。');
    return day % 365 + 1;
  }

  /** Birth-record and in-life month heading. Day 0 is the birthday month. */
  function monthLabel(day) {
    const whole = Math.max(0, Math.floor(Number(day) || 0));
    const date = monthDate(whole);
    return `${date.year} 年 ${date.month} 月`;
  }

  function chineseYear(year) {
    return String(year).replace(/\d/g, digit => YEAR_DIGIT[digit]);
  }

  function chineseMonth(month) {
    if (month === 10) return '十';
    if (month === 11) return '十一';
    if (month === 12) return '十二';
    return YEAR_DIGIT[month];
  }

  function chineseDayOfMonth(dayOfMonth) {
    if (dayOfMonth < 10) return YEAR_DIGIT[dayOfMonth];
    if (dayOfMonth === 10) return '十';
    if (dayOfMonth < 20) return `十${YEAR_DIGIT[dayOfMonth - 10]}`;
    const tens = Math.floor(dayOfMonth / 10);
    const ones = dayOfMonth % 10;
    const tenWord = `${YEAR_DIGIT[tens]}十`;
    return ones ? `${tenWord}${YEAR_DIGIT[ones]}` : tenWord;
  }

  /** Actual calendar date, Chinese numerals, from monthDate. Example: 二〇〇一年一月一日. */
  function chineseDateLabel(day) {
    const date = monthDate(day);
    return `${chineseYear(date.year)}年${chineseMonth(date.month)}月${chineseDayOfMonth(date.dayOfMonth)}日`;
  }

  function chineseAge(age) {
    const n = Math.max(0, Math.floor(age));
    if (n < 10) return AGE_DIGIT[n];
    if (n < 20) return `十${n === 10 ? '' : AGE_DIGIT[n % 10]}`;
    if (n < 100) {
      const tens = Math.floor(n / 10);
      const ones = n % 10;
      return `${AGE_DIGIT[tens]}十${ones ? AGE_DIGIT[ones] : ''}`;
    }
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    const head = `${AGE_DIGIT[hundreds]}百`;
    if (!rest) return head;
    if (rest < 10) return `${head}零${AGE_DIGIT[rest]}`;
    return head + chineseAge(rest);
  }

  /**
   * Corner label. Year and season both come from monthDate, never from the season word.
   * Jan–Apr of age N is birthYear+N+1; May–Dec is birthYear+N.
   */
  function cornerStamp(day) {
    const whole = Math.max(0, Math.floor(Number(day) || 0));
    const date = monthDate(whole);
    const age = Math.floor(whole / 365);
    const season = CORNER_SEASON[date.month];
    return {
      year: date.year,
      month: date.month,
      season,
      age,
      label: `${chineseYear(date.year)}年・${season}・你${chineseAge(age)}歲`,
    };
  }

  function nextMonthBoundary(day) {
    const date = monthDate(day);
    return day + date.daysInMonth - date.dayOfMonth + 1;
  }

  function defaultMonthForSeason(season) {
    return DEFAULT_MONTH_FOR_SEASON[season] || BIRTH_MONTH;
  }

  function seasonOfMonth(month) {
    return CORNER_SEASON[month];
  }

  /**
   * Life day for (age, month, dayOfMonth) under the May-birthday year.
   * Age N runs from 1 May (birthYear+N) through 30 April (birthYear+N+1).
   */
  function dayFromAgeMonth(age, month, dayOfMonth) {
    const a = Math.max(0, Math.floor(Number(age) || 0));
    const m = Math.floor(Number(month));
    const d = Math.floor(Number(dayOfMonth) || 1);
    if (!Number.isSafeInteger(m) || m < 1 || m > 12) throw new RangeError('月份必須是 1 到 12。');
    const dim = MONTH_LENGTHS[m - 1];
    if (!Number.isSafeInteger(d) || d < 1 || d > dim) throw new RangeError('日期超出該月天數。');
    const doy = dayOfYear0(m, d);
    const day = m >= BIRTH_MONTH
      ? a * 365 + (doy - BIRTH_DAY_OF_YEAR)
      : a * 365 + (365 - BIRTH_DAY_OF_YEAR) + doy;
    return day;
  }

  /**
   * Phone B corner label.
   * Prefer a life day; else age+month; else age+season with the default month for that season.
   * Also accepts the older cornerLabel(age, season) call shape.
   */
  function cornerLabel(ageOrOpts, season) {
    let day = null, age = null, month = null, dayOfMonth = 1, seas = null;
    if (ageOrOpts != null && typeof ageOrOpts === 'object') {
      if (ageOrOpts.day != null && ageOrOpts.day !== '') day = +ageOrOpts.day;
      if (ageOrOpts.age != null && ageOrOpts.age !== '') age = +ageOrOpts.age;
      if (ageOrOpts.month != null && ageOrOpts.month !== '') month = +ageOrOpts.month;
      if (ageOrOpts.dayOfMonth != null && ageOrOpts.dayOfMonth !== '') dayOfMonth = +ageOrOpts.dayOfMonth;
      seas = ageOrOpts.season || null;
    } else {
      if (ageOrOpts != null && ageOrOpts !== '') age = +ageOrOpts;
      seas = season || null;
    }
    if (day != null && Number.isFinite(day)) {
      if (!Number.isSafeInteger(day) || day < 0) throw new RangeError('遊戲日期必須是非負整數。');
      return cornerStamp(day).label;
    }
    if (age == null || !Number.isFinite(age)) age = 5;
    if (month == null || !Number.isFinite(month)) month = defaultMonthForSeason(seas || '春');
    return cornerStamp(dayFromAgeMonth(age, month, dayOfMonth)).label;
  }

  return {
    MONTH_LENGTHS,
    PLAYER_BIRTH_DATE,
    GAME_START_YEAR,
    BIRTH_MONTH,
    BIRTH_DAY_OF_MONTH,
    BIRTH_DAY_OF_YEAR,
    monthDate,
    lifeDayOfYear,
    monthLabel,
    chineseDateLabel,
    chineseYear,
    chineseAge,
    cornerStamp,
    nextMonthBoundary,
    dayFromAgeMonth,
    defaultMonthForSeason,
    seasonOfMonth,
    cornerLabel,
    CORNER_SEASON,
    DEFAULT_MONTH_FOR_SEASON,
    YEAR_DIGIT,
    AGE_DIGIT,
  };
});
