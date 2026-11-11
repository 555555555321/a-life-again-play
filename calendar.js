// Shared non-leap calendar, aligned with A-Life-Again game-calendar.js.
// A game year is 365 days starting on the birthday. There is no 29 February;
// after 80 game years the civil date is 20 days ahead of the real calendar, by design.
// Birth month is per life (default May for old data). Pass {year:2000,month,day:1} as the last argument.
(function (root, factory) {
  const api = factory(root && root.ALABirth);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ALACalendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ALABirth) {
  const MONTH_LENGTHS = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

  /** Default birth date when a life (or old save / scenes.json) has no field: 2000-05-01. */
  const PLAYER_BIRTH_DATE = Object.freeze({ year: 2000, month: 5, day: 1 });

  const GAME_START_YEAR = PLAYER_BIRTH_DATE.year;
  const BIRTH_MONTH = PLAYER_BIRTH_DATE.month;
  const BIRTH_DAY_OF_MONTH = PLAYER_BIRTH_DATE.day;

  function resolveBirth(birth) {
    if (ALABirth && ALABirth.resolveBirth) return ALABirth.resolveBirth(birth);
    if (birth == null || (typeof birth === 'object' && birth.month == null && birth.birthMonth == null)) {
      return PLAYER_BIRTH_DATE;
    }
    const month = Number(birth.month ?? birth.birthMonth);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('生日月份必須是 1 到 12。');
    return { year: 2000, month, day: 1 };
  }

  function birthDayOfYear(birth) {
    if (ALABirth && ALABirth.birthDayOfYear) return ALABirth.birthDayOfYear(birth);
    const b = resolveBirth(birth);
    let doy = b.day - 1;
    for (let i = 0; i < b.month - 1; i++) doy += MONTH_LENGTHS[i];
    return doy;
  }

  const BIRTH_DAY_OF_YEAR = birthDayOfYear(PLAYER_BIRTH_DATE);

  const CORNER_SEASON = Object.freeze({
    1: '冬', 2: '冬', 3: '春', 4: '春', 5: '春', 6: '夏',
    7: '夏', 8: '夏', 9: '秋', 10: '秋', 11: '秋', 12: '冬',
  });

  // Fallback month when the season word is given and this life's birthday is not in that season.
  // If the birthday falls in the season, defaultMonthForSeason uses the birthday month instead.
  const DEFAULT_MONTH_FOR_SEASON = Object.freeze({ 春: 5, 夏: 7, 秋: 10, 冬: 12 });
  const SEASON_FALLBACK_MONTH = Object.freeze({ 春: 3, 夏: 7, 秋: 10, 冬: 12 });

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
  function monthDate(day, birth) {
    if (!Number.isSafeInteger(day) || day < 0) throw new RangeError('遊戲日期必須是非負整數。');
    const b = resolveBirth(birth);
    const birthDoy = birthDayOfYear(b);
    const ageYear = Math.floor(day / 365);
    const shifted = day % 365 + birthDoy;
    const yearCarry = shifted >= 365 ? 1 : 0;
    const { monthIndex, dayOfMonth, daysInMonth } = monthOfDayOfYear(shifted % 365);
    const year = b.year + ageYear + yearCarry;
    const month = monthIndex + 1;
    const lifeMonth = (monthIndex - (b.month - 1) + 12) % 12;
    return {
      day, year, month, dayOfMonth, daysInMonth,
      monthIndex: ageYear * 12 + lifeMonth,
      label: `${year} 年 ${month} 月 ${dayOfMonth} 日`,
      calendar: 'game-365',
    };
  }

  function lifeDayOfYear(day) {
    if (!Number.isSafeInteger(day) || day < 0) throw new RangeError('遊戲日期必須是非負整數。');
    return day % 365 + 1;
  }

  function monthLabel(day, birth) {
    const whole = Math.max(0, Math.floor(Number(day) || 0));
    const date = monthDate(whole, birth);
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

  function chineseDateLabel(day, birth) {
    const date = monthDate(day, birth);
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
   * Before the birth month of age N the year is 2000+N+1; from the birth month on it is 2000+N.
   */
  function cornerStamp(day, birth) {
    const whole = Math.max(0, Math.floor(Number(day) || 0));
    const date = monthDate(whole, birth);
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

  function nextMonthBoundary(day, birth) {
    const date = monthDate(day, birth);
    return day + date.daysInMonth - date.dayOfMonth + 1;
  }

  function defaultMonthForSeason(season, birth) {
    if (ALABirth && ALABirth.defaultMonthForSeason) return ALABirth.defaultMonthForSeason(season, birth);
    const b = resolveBirth(birth);
    if (season && CORNER_SEASON[b.month] === season) return b.month;
    if (season && SEASON_FALLBACK_MONTH[season]) return SEASON_FALLBACK_MONTH[season];
    return DEFAULT_MONTH_FOR_SEASON[season] || b.month;
  }

  function seasonOfMonth(month) {
    return CORNER_SEASON[month];
  }

  function civilYear(age, month, birth) {
    if (ALABirth && ALABirth.civilYear) return ALABirth.civilYear(age, month, birth);
    const b = resolveBirth(birth);
    const a = Math.max(0, Math.floor(Number(age) || 0));
    const m = Math.floor(Number(month));
    if (!Number.isInteger(m) || m < 1 || m > 12) throw new RangeError('月份必須是 1 到 12。');
    return m >= b.month ? b.year + a : b.year + a + 1;
  }

  /**
   * Life day for (age, month, dayOfMonth) under this life's birthday.
   * Age N runs from the birthday (2000+N) through the day before the next birthday.
   */
  function dayFromAgeMonth(age, month, dayOfMonth, birth) {
    const b = resolveBirth(birth);
    const a = Math.max(0, Math.floor(Number(age) || 0));
    const m = Math.floor(Number(month));
    const d = Math.floor(Number(dayOfMonth) || 1);
    if (!Number.isSafeInteger(m) || m < 1 || m > 12) throw new RangeError('月份必須是 1 到 12。');
    const dim = MONTH_LENGTHS[m - 1];
    if (!Number.isSafeInteger(d) || d < 1 || d > dim) throw new RangeError('日期超出該月天數。');
    const doy = dayOfYear0(m, d);
    const birthDoy = birthDayOfYear(b);
    const day = m >= b.month
      ? a * 365 + (doy - birthDoy)
      : a * 365 + (365 - birthDoy) + doy;
    return day;
  }

  /**
   * Phone B corner label.
   * Prefer a life day; else age+month; else age+season with the default month for that season.
   * Also accepts the older cornerLabel(age, season) call shape.
   * Options may include `birth`.
   */
  function cornerLabel(ageOrOpts, season, birth) {
    let day = null, age = null, month = null, dayOfMonth = 1, seas = null, b = birth;
    if (ageOrOpts != null && typeof ageOrOpts === 'object') {
      if (ageOrOpts.day != null && ageOrOpts.day !== '') day = +ageOrOpts.day;
      if (ageOrOpts.age != null && ageOrOpts.age !== '') age = +ageOrOpts.age;
      if (ageOrOpts.month != null && ageOrOpts.month !== '' && ageOrOpts.month !== 'birth') month = +ageOrOpts.month;
      if (ageOrOpts.dayOfMonth != null && ageOrOpts.dayOfMonth !== '') dayOfMonth = +ageOrOpts.dayOfMonth;
      seas = ageOrOpts.season || null;
      if (ageOrOpts.birth) b = ageOrOpts.birth;
    } else {
      if (ageOrOpts != null && ageOrOpts !== '') age = +ageOrOpts;
      seas = season || null;
    }
    const resolved = resolveBirth(b);
    if (day != null && Number.isFinite(day)) {
      if (!Number.isSafeInteger(day) || day < 0) throw new RangeError('遊戲日期必須是非負整數。');
      return cornerStamp(day, resolved).label;
    }
    if (age == null || !Number.isFinite(age)) age = 5;
    if (month == null || !Number.isFinite(month)) month = defaultMonthForSeason(seas || '春', resolved);
    return cornerStamp(dayFromAgeMonth(age, month, dayOfMonth, resolved), resolved).label;
  }

  return {
    MONTH_LENGTHS,
    PLAYER_BIRTH_DATE,
    GAME_START_YEAR,
    BIRTH_MONTH,
    BIRTH_DAY_OF_MONTH,
    BIRTH_DAY_OF_YEAR,
    resolveBirth,
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
    civilYear,
    cornerLabel,
    CORNER_SEASON,
    DEFAULT_MONTH_FOR_SEASON,
    YEAR_DIGIT,
    AGE_DIGIT,
  };
});
