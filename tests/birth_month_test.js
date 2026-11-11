#!/usr/bin/env node
// Birth-month parameterization: all 12 months, school entry, old save = May, weighted draw.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const B = require('../birth-month.js');
const C = require('../calendar.js');

const COUNTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'taiwan-2000-monthly-births.json'), 'utf8'));
const MAY = { year: 2000, month: 5, day: 1 };
const SEASON = { 1: '冬', 2: '冬', 3: '春', 4: '春', 5: '春', 6: '夏', 7: '夏', 8: '夏', 9: '秋', 10: '秋', 11: '秋', 12: '冬' };

let passed = 0;
function pass(name) { passed += 1; console.log('ok', passed, name); }

assert.deepStrictEqual([...B.TAIWAN_2000_MONTHLY_BIRTHS], COUNTS.counts);
assert.strictEqual(B.TAIWAN_2000_BIRTHS_TOTAL, COUNTS.total);
assert.strictEqual(COUNTS.counts.reduce((a, b) => a + b, 0), 305312);
assert.strictEqual(COUNTS.source_page, 'https://data.gov.tw/dataset/14233');
assert.ok(COUNTS.source_query.includes('statis.moi.gov.tw'));
pass('MOI 2000 monthly counts and source URL match the data file');

assert.deepStrictEqual(B.resolveBirth(null), MAY);
assert.deepStrictEqual(B.resolveBirth(undefined), MAY);
assert.deepStrictEqual(B.resolveBirth({}), MAY);
assert.deepStrictEqual(B.resolveBirth({ year: 2000, day: 1 }), MAY);
assert.deepStrictEqual(C.resolveBirth(null), MAY);
pass('old save / missing field = May');

for (let month = 1; month <= 12; month++) {
  const birth = { year: 2000, month, day: 1 };
  const day0 = C.monthDate(0, birth);
  assert.strictEqual(day0.year, 2000, `m${month} day0 year`);
  assert.strictEqual(day0.month, month, `m${month} day0 month`);
  assert.strictEqual(day0.dayOfMonth, 1, `m${month} day0 dom`);
  const stamp0 = C.cornerStamp(0, birth);
  assert.strictEqual(stamp0.season, SEASON[month], `m${month} day0 season`);
  assert.strictEqual(stamp0.age, 0);
  assert.strictEqual(stamp0.label, `${C.chineseYear(2000)}年・${SEASON[month]}・你零歲`, `m${month} naming`);

  for (let age = 0; age <= 10; age++) {
    for (let m = 1; m <= 12; m++) {
      const year = B.civilYear(age, m, birth);
      const expected = m >= month ? 2000 + age : 2000 + age + 1;
      assert.strictEqual(year, expected, `m${month} age${age} month${m} year`);
      const day = C.dayFromAgeMonth(age, m, 1, birth);
      const date = C.monthDate(day, birth);
      const stamp = C.cornerStamp(day, birth);
      assert.strictEqual(date.year, expected, `m${month} age${age} month${m} date year`);
      assert.strictEqual(date.month, m);
      assert.strictEqual(Math.floor(day / 365), age, `m${month} age${age} month${m} age`);
      assert.strictEqual(stamp.season, SEASON[m]);
      assert.strictEqual(stamp.year, expected);
      // Year boundary: last day of month before birthday, and birthday itself.
    }
    // Across the year boundary of this age-year: day before next birthday, and next birthday.
    const nextBirthday = (age + 1) * 365;
    const eve = nextBirthday - 1;
    const eveDate = C.monthDate(eve, birth);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? 2000 + age : 2000 + age + 1; // Jan birth: eve is Dec of same civil year 2000+age
    // Age N lasts until the day before birthday of year 2000+(N+1).
    // Civil date of eve: the last day of the month before the birth month, year 2000+age+1
    // except January birth: eve is 31 Dec of 2000+age.
    if (month === 1) {
      assert.strictEqual(eveDate.year, 2000 + age, `jan eve year age${age}`);
      assert.strictEqual(eveDate.month, 12);
      assert.strictEqual(eveDate.dayOfMonth, 31);
    } else {
      assert.strictEqual(eveDate.year, 2000 + age + 1, `m${month} eve year age${age}`);
      assert.strictEqual(eveDate.month, prevMonth);
      assert.strictEqual(eveDate.dayOfMonth, C.MONTH_LENGTHS[prevMonth - 1]);
    }
    assert.strictEqual(Math.floor(eve / 365), age);
    const nb = C.monthDate(nextBirthday, birth);
    assert.strictEqual(nb.year, 2000 + age + 1);
    assert.strictEqual(nb.month, month);
    assert.strictEqual(nb.dayOfMonth, 1);
    assert.strictEqual(Math.floor(nextBirthday / 365), age + 1);
  }

  const entryYear = B.primarySchoolEntryYear(birth);
  assert.strictEqual(entryYear, month <= 9 ? 2006 : 2007, `m${month} school year`);
  assert.strictEqual(B.primarySchoolEntryAge(birth), 6, `m${month} school age`);
  // September of age 6 is the entry year for every birth month.
  assert.strictEqual(B.civilYear(6, 9, birth), entryYear, `m${month} age6 Sept`);
}
pass('all 12 months: day 0 / naming, civil year across each year boundary, season, school entry');

// 滿月 / 收涎 / 抓周 = months since birth
for (let month = 1; month <= 12; month++) {
  const birth = { year: 2000, month, day: 1 };
  const fullMoon = B.dayFromMonthsSinceBirth(1, birth);
  const saliva = B.dayFromMonthsSinceBirth(4, birth);
  const zhuzhou = B.dayFromMonthsSinceBirth(12, birth);
  assert.strictEqual(C.monthDate(fullMoon, birth).month, month === 12 ? 1 : month + 1);
  const salivaMonth = ((month - 1 + 4) % 12) + 1;
  assert.strictEqual(C.monthDate(saliva, birth).month, salivaMonth);
  const zhuDate = C.monthDate(zhuzhou, birth);
  assert.strictEqual(zhuDate.month, month);
  assert.strictEqual(zhuDate.year, 2001);
  assert.strictEqual(Math.floor(zhuzhou / 365), 1);
  // Born in September or later, 收涎 is not September 2000.
  if (month >= 9) {
    const s = B.scheduleEvent({ months_since_birth: 4 }, birth);
    assert.ok(!(s.year === 2000 && s.month === 9), `m${month} 收涎 not Sep 2000`);
  }
}
pass('滿月/收涎/抓周 are months since birth');

// May-era 收涎 (Sep of age 0) only holds for May birth.
const salivaMay = B.scheduleEvent({ months_since_birth: 4 }, MAY);
assert.strictEqual(salivaMay.year, 2000);
assert.strictEqual(salivaMay.month, 9);
pass('May birth still has 收涎 in 2000-09');

// Weighted draw vs MOI weights over many seeds
const N = 40000;
const hist = Array(13).fill(0);
for (let i = 0; i < N; i++) hist[B.drawBirthMonth(`dist-seed-${i}`)] += 1;
let chi = 0;
for (let m = 1; m <= 12; m++) {
  const expected = N * (COUNTS.counts[m - 1] / COUNTS.total);
  const got = hist[m];
  assert.ok(got > 0, `month ${m} never drawn`);
  const sd = Math.sqrt(expected * (1 - COUNTS.counts[m - 1] / COUNTS.total));
  assert.ok(Math.abs(got - expected) < 5 * sd, `month ${m} got ${got} expected ${expected.toFixed(1)} sd=${sd.toFixed(1)}`);
  chi += (got - expected) ** 2 / expected;
}
// df=11, critical value ~19.7 at 5%; allow generous 30 so a rare unlucky run doesn't flake.
assert.ok(chi < 30, `chi-square ${chi.toFixed(2)} too far from MOI weights`);
pass(`weighted draw over ${N} seeds matches MOI weights (chi^2=${chi.toFixed(2)})`);

// Same seed is deterministic; different from event-style raw seed stream (hash key is seed:birth-month)
assert.strictEqual(B.drawBirthMonth('abc'), B.drawBirthMonth('abc'));
assert.notStrictEqual(B.drawBirthMonth('abc'), B.drawBirthMonth('abc:other'));
pass('draw is deterministic per life seed');

console.log('\nAll', passed, 'birth-month groups passed.');
