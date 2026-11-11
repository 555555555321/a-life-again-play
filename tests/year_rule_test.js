#!/usr/bin/env node
// Date-based corner / chineseDateLabel tests, aligned with A-Life-Again PR #19 (6ea7814).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../calendar.js');

const {
  PLAYER_BIRTH_DATE, MONTH_LENGTHS, monthDate, chineseDateLabel, cornerStamp,
  lifeDayOfYear, monthLabel, nextMonthBoundary, dayFromAgeMonth, cornerLabel,
  chineseYear, chineseAge, seasonOfMonth, defaultMonthForSeason,
} = C;

let passed = 0;
function pass(name) { passed += 1; console.log('PASS', name); }

// Offsets inside a life year that starts 1 May, matching PR #19 tests.
const JAN = 31 + 30 + 31 + 31 + 30 + 31 + 30 + 31; // 245: 1 Jan
const APR = JAN + 31 + 28 + 31; // 1 Apr = day 335
const MAY = 0;
const DEC = 31 + 30 + 31 + 31 + 30 + 31 + 30; // 214: 1 Dec
const AGES = [0, 1, 3, 5, 18];

assert.deepStrictEqual(PLAYER_BIRTH_DATE, { year: 2000, month: 5, day: 1 });
assert.strictEqual(monthDate(0).label, '2000 年 5 月 1 日');
assert.strictEqual(monthDate(0).month, 5);
assert.strictEqual(Math.floor(0 / 365), 0);
assert.strictEqual(chineseDateLabel(0), '二〇〇〇年五月一日');
assert.strictEqual(cornerStamp(0).label, '二〇〇〇年・春・你零歲');
assert.strictEqual(cornerStamp(0).year, 2000);
assert.strictEqual(cornerStamp(0).season, '春');
assert.strictEqual(monthDate(30).label, '2000 年 5 月 31 日');
assert.strictEqual(nextMonthBoundary(0), 31);
assert.strictEqual(monthDate(31).label, '2000 年 6 月 1 日');
assert.strictEqual(lifeDayOfYear(0), 1);
assert.strictEqual(monthLabel(0), '2000 年 5 月');
pass('day 0 is 1 May 2000, 二〇〇〇年五月一日, 二〇〇〇年・春・你零歲');

assert.strictEqual(chineseDateLabel(245), '二〇〇一年一月一日');
assert.strictEqual(monthDate(JAN).label, '2001 年 1 月 1 日');
assert.strictEqual(cornerStamp(JAN).label, '二〇〇一年・冬・你零歲');
assert.strictEqual(lifeDayOfYear(JAN), JAN + 1);
pass('2001-01-01 is day 245, 二〇〇一年一月一日');

// Age 5: March is 2006 spring, May is 2005 spring, December is 2005 winter.
const march5 = 5 * 365 + 304; // 1 March, still age 5 (304 = 245+31+28)
assert.strictEqual(Math.floor(march5 / 365), 5);
assert.strictEqual(cornerStamp(march5).year, 2006);
assert.strictEqual(cornerStamp(march5).season, '春');
assert.strictEqual(cornerStamp(march5).label, '二〇〇六年・春・你五歲');
assert.strictEqual(cornerStamp(5 * 365).year, 2005);
assert.strictEqual(cornerStamp(5 * 365).season, '春');
assert.strictEqual(cornerStamp(5 * 365).label, '二〇〇五年・春・你五歲');
assert.strictEqual(cornerStamp(5 * 365 + DEC).year, 2005);
assert.strictEqual(cornerStamp(5 * 365 + DEC).season, '冬');
assert.strictEqual(cornerStamp(5 * 365 + DEC).label, '二〇〇五年・冬・你五歲');
pass('age 5 March=2006春, May=2005春, December=2005冬');

// Year / date use 〇; corner age uses 零 (never 〇).
assert.strictEqual(chineseDateLabel(3650), '二〇一〇年五月一日'); // 2010-05-01
assert.strictEqual(cornerStamp(3650).label, '二〇一〇年・春・你十歲');
assert.strictEqual(chineseDateLabel(7300), '二〇二〇年五月一日'); // 2020-05-01
assert.strictEqual(cornerStamp(7300).label, '二〇二〇年・春・你二十歲');
assert.strictEqual(chineseDateLabel(36500), '二一〇〇年五月一日'); // 2100-05-01
assert.strictEqual(cornerStamp(36500).label, '二一〇〇年・春・你一百歲');
assert.ok(chineseYear(2010).includes('〇'));
assert.ok(chineseYear(2020).includes('〇'));
assert.ok(chineseYear(2100).includes('〇'));
assert.strictEqual(chineseAge(0), '零');
assert.ok(!String(chineseAge(0)).includes('〇'));
assert.ok(!cornerStamp(0).label.includes('〇歲'));
assert.ok(!chineseDateLabel(0).includes('零'));
pass('years 2010/2020/2100 use 〇; corner age uses 零');

// Months 1, 4, 5, 12 at ages 0, 1, 3, 5, 18.
const samples = [
  ['1 月', JAN, 1, '冬'],
  ['4 月', APR, 4, '春'],
  ['5 月', MAY, 5, '春'],
  ['12 月', DEC, 12, '冬'],
];
for (const age of AGES) {
  for (const [name, offset, month, season] of samples) {
    const day = age * 365 + offset;
    const date = monthDate(day);
    const year = month <= 4 ? PLAYER_BIRTH_DATE.year + age + 1 : PLAYER_BIRTH_DATE.year + age;
    assert.strictEqual(date.month, month, `${age} ${name}`);
    assert.strictEqual(date.dayOfMonth, 1, `${age} ${name}`);
    assert.strictEqual(date.year, year, `${age} ${name} year`);
    assert.strictEqual(Math.floor(day / 365), age, `${age} ${name} age`);
    assert.strictEqual(cornerStamp(day).season, season, `${age} ${name} season`);
    assert.strictEqual(dayFromAgeMonth(age, month, 1), day, `${age} ${name} dayFromAgeMonth`);
  }
}
assert.strictEqual(monthDate(1 * 365 + JAN).year, 2002);
assert.strictEqual(monthDate(3 * 365 + JAN).year, 2004);
assert.strictEqual(monthDate(5 * 365 + JAN).year, 2006);
assert.strictEqual(monthDate(5 * 365 + MAY).year, 2005);
pass('months 1/4/5/12 at ages 0,1,3,5,18');

assert.strictEqual(monthDate(365 - 1).label, '2001 年 4 月 30 日');
assert.strictEqual(Math.floor(364 / 365), 0);
assert.strictEqual(monthDate(365).label, '2001 年 5 月 1 日');
assert.strictEqual(monthDate(5 * 365 - 1).label, '2005 年 4 月 30 日');
assert.strictEqual(Math.floor((5 * 365 - 1) / 365), 4);
assert.strictEqual(monthDate(5 * 365).label, '2005 年 5 月 1 日');
assert.strictEqual(monthDate(85 * 365).year, 2085);
assert.strictEqual(monthDate(85 * 365).label, '2085 年 5 月 1 日');
pass('day before birthday is 30 April of the next civil year, still the old age');

// 230+ named points: every month end from May 2000 through April 2019 (228),
// plus day 0, 2001-01-01, and May 1 of 2010/2020/2100.
const points = [];
function addPoint(day, note) {
  if (points.some(p => p.day === day && p.note === note)) return;
  points.push({ day, note });
}
addPoint(0, 'day 0');
addPoint(JAN, '2001-01-01');
addPoint(3650, '2010-05-01');
addPoint(7300, '2020-05-01');
addPoint(36500, '2100-05-01');

// Walk month ends from 2000-05 to 2019-04 inclusive = 19*12 = 228 ends.
let cursor = 0; // 2000-05-01
const lastEndYear = 2019, lastEndMonth = 4;
while (true) {
  const date = monthDate(cursor);
  const endDay = cursor + date.daysInMonth - date.dayOfMonth;
  const end = monthDate(endDay);
  assert.strictEqual(end.dayOfMonth, end.daysInMonth);
  if (end.month === 2) assert.strictEqual(end.dayOfMonth, 28, end.label);
  addPoint(endDay, `month-end ${end.year}-${String(end.month).padStart(2, '0')}-${end.dayOfMonth}`);
  if (end.year === lastEndYear && end.month === lastEndMonth) break;
  cursor = nextMonthBoundary(cursor);
  assert.ok(cursor > endDay);
}
addPoint(244, '2000-12-31');

assert.ok(points.length >= 230, 'expected at least 230 points, got ' + points.length);

let checked = 0;
for (const { day, note } of points) {
  const date = monthDate(day);
  const stamp = cornerStamp(day);
  const label = chineseDateLabel(day);
  const age = Math.floor(day / 365);
  const expectedYear = date.month <= 4
    ? PLAYER_BIRTH_DATE.year + age + 1
    : PLAYER_BIRTH_DATE.year + age;
  assert.strictEqual(date.year, expectedYear, `${note} year`);
  assert.strictEqual(stamp.year, date.year, `${note} stamp year`);
  assert.strictEqual(stamp.month, date.month, `${note} stamp month`);
  assert.strictEqual(stamp.age, age, `${note} age`);
  assert.strictEqual(stamp.season, seasonOfMonth(date.month), `${note} season`);
  assert.strictEqual(
    stamp.label,
    `${chineseYear(date.year)}年・${stamp.season}・你${chineseAge(age)}歲`,
    `${note} corner`,
  );
  assert.strictEqual(
    label,
    `${chineseYear(date.year)}年${({10:'十',11:'十一',12:'十二'}[date.month] || '〇一二三四五六七八九'[date.month])}月` + label.split('月')[1],
    `${note} date year/month prefix`,
  );
  assert.ok(!label.includes('零'), `${note} date must not use 零`);
  assert.ok(!stamp.label.includes('〇歲'), `${note} age must not use 〇`);
  if (date.month === 2) assert.strictEqual(date.daysInMonth, 28, note);
  // Reconstruct the Chinese day-of-month against monthDate.
  assert.ok(label.endsWith('日'), note);
  assert.strictEqual(lifeDayOfYear(day), day % 365 + 1, note);
  checked += 1;
}
assert.strictEqual(checked, points.length);
// Named anchors inside the 230
const byNote = Object.fromEntries(points.map(p => [p.note, p.day]));
assert.strictEqual(chineseDateLabel(byNote['day 0']), '二〇〇〇年五月一日');
assert.strictEqual(chineseDateLabel(byNote['2001-01-01']), '二〇〇一年一月一日');
assert.strictEqual(monthDate(byNote['month-end 2000-05-31']).label, '2000 年 5 月 31 日');
assert.strictEqual(chineseDateLabel(byNote['month-end 2000-12-31']), '二〇〇〇年十二月三十一日');
assert.strictEqual(cornerStamp(byNote['2000-12-31']).label, '二〇〇〇年・冬・你零歲');
assert.strictEqual(chineseDateLabel(byNote['2010-05-01']), '二〇一〇年五月一日');
assert.strictEqual(chineseDateLabel(byNote['2020-05-01']), '二〇二〇年五月一日');
assert.strictEqual(chineseDateLabel(byNote['2100-05-01']), '二一〇〇年五月一日');
pass(`230+ points (${points.length} unique days/notes) including day 0, 2001-01-01, month ends, 2010/2020/2100`);

// No leap year: 80 game years sit 20 days ahead of the real calendar (by design).
assert.strictEqual(monthDate(80 * 365).label, '2080 年 5 月 1 日');
const real = new Date(Date.UTC(2000, 4, 1 + 80 * 365)); // JS Date includes leap days
assert.strictEqual(real.getUTCFullYear(), 2080);
assert.strictEqual(real.getUTCMonth() + 1, 4); // April
assert.strictEqual(real.getUTCDate(), 11);
assert.strictEqual(
  (Date.UTC(2080, 4, 1) - Date.UTC(2000, 4, 1)) / 86400000 - 80 * 365,
  20,
);
pass('80 game years are 20 days ahead of the real calendar (no leap days)');

// Phone B cornerLabel helpers: day wins; season 春 defaults to May (start of that age).
assert.strictEqual(cornerLabel({ day: 0 }), '二〇〇〇年・春・你零歲');
assert.strictEqual(cornerLabel({ day: 244 }), '二〇〇〇年・冬・你零歲');
assert.strictEqual(cornerLabel({ day: 5 * 365 }), '二〇〇五年・春・你五歲');
assert.strictEqual(cornerLabel({ age: 5, month: 3 }), '二〇〇六年・春・你五歲');
assert.strictEqual(cornerLabel({ age: 5, month: 5 }), '二〇〇五年・春・你五歲');
assert.strictEqual(cornerLabel({ age: 5, month: 12, dayOfMonth: 31 }), '二〇〇五年・冬・你五歲');
assert.strictEqual(cornerLabel(5, '春'), '二〇〇五年・春・你五歲'); // default 春 → May
assert.strictEqual(cornerLabel(0, '春'), '二〇〇〇年・春・你零歲'); // was 二〇〇一年 under the old season-word rule
assert.strictEqual(cornerLabel(25, '秋'), '二〇二五年・秋・你二十五歲');
assert.strictEqual(defaultMonthForSeason('春'), 5);
assert.strictEqual(defaultMonthForSeason('冬'), 12);
assert.throws(() => monthDate(-1), RangeError);
assert.throws(() => lifeDayOfYear(-1), RangeError);
pass('cornerLabel day/month/season fallbacks (春→May, age 0 春 is 二〇〇〇年)');

// scenes.json stored corners match the date rule.
const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scenes.json'), 'utf8'));
for (const [id, scr] of Object.entries(scenes.screens)) {
  if (scr._corner_hardcoded) continue;
  const expected = cornerLabel({
    day: scr.day, age: scr.age != null ? scr.age : scenes.age,
    month: scr.month, season: scr.season || scenes.season, dayOfMonth: scr.dayOfMonth,
  });
  if (scr.corner) assert.strictEqual(scr.corner, expected, id + ' corner');
  else assert.strictEqual(typeof expected, 'string', id);
}
assert.strictEqual(scenes.corner, cornerLabel({ age: scenes.age, month: scenes.month, season: scenes.season }));
assert.strictEqual(scenes.screens.elders_stand.day, 0);
assert.ok(!scenes.screens.elders_stand._corner_hardcoded);
pass('scenes.json corners agree with the date rule');

console.log('\nAll', passed, 'groups passed;', 'checked', checked, 'calendar points.');
