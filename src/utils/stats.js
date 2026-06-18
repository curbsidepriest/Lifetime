import { getRolling12Months, daysInMonth, toDateKey, isWeekend, getBerlinHolidays, todayKey } from './dates.js';
import { DEFAULT_LEAVE_TYPES } from './storage.js';
import { isDayBusy } from './busy.js';

function emptyYear(leaveTypes) {
  const used = {};
  const maxConsecutive = {};
  for (const t of leaveTypes) { used[t.id] = 0; maxConsecutive[t.id] = 0; }
  return { used, maxConsecutive, away: 0 };
}

// Planning horizon for "free time" stats: rolling next 6 months from today.
const FREE_HORIZON_MONTHS = 6;

// Counts reflect only what's on the grid. The per-year "consumed at setup"
// baseline is folded in at render time (Sidebar/StatsPanel), not here, so the
// stats stay a pure mirror of the calendar.
export function computeStats(days, leaveTypes = DEFAULT_LEAVE_TYPES) {
  // Always scan full calendar years (from Jan 1) so annual stats are complete
  const months = getRolling12Months(true);
  const today  = todayKey();

  const allYears = [...new Set(months.map(m => m.year))];
  const bankHolidays = new Set();
  for (const y of allYears) {
    for (const h of getBerlinHolidays(y)) bankHolidays.add(h);
  }

  const byYear = {};
  const streak = {}; // { typeId: current run } — scanned across the whole window

  const allKeys = [];
  for (const { year, month } of months) {
    const dim = daysInMonth(year, month);
    for (let day = 1; day <= dim; day++) {
      allKeys.push({ key: toDateKey(year, month, day), year, month, day });
    }
  }

  for (const { key, year, month, day } of allKeys) {
    if (!byYear[year]) byYear[year] = emptyYear(leaveTypes);
    const d = days[key];

    // Away counts regardless of leave status
    if (d?.away === true) byYear[year].away++;

    const bs = d?.baseState || null;

    // Reset the streak of every type that isn't today's base state.
    for (const id of Object.keys(streak)) { if (id !== bs) streak[id] = 0; }

    if (!bs) continue;

    const skipCount = isWeekend(year, month, day) || bankHolidays.has(key);
    if (!skipCount) {
      const y = byYear[year];
      y.used[bs] = (y.used[bs] || 0) + 1;
      streak[bs] = (streak[bs] || 0) + 1;
      if (streak[bs] > (y.maxConsecutive[bs] || 0)) y.maxConsecutive[bs] = streak[bs];
    }
  }

  // Space counts (Build + Rest) by month for the health bar
  // Uses tag type 'space' (new) or 'intention' (legacy), kind 'build'|'rest'
  const spaceByMonth = {}; // { 'YYYY-MM': { build: N, rest: N } }
  for (const { key, year, month } of allKeys) {
    const d = days[key];
    const spaceTags = (d?.tags || []).filter(t => t?.type === 'space' || t?.type === 'intention');
    if (!spaceTags.length) continue;
    const mKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (!spaceByMonth[mKey]) spaceByMonth[mKey] = { build: 0, rest: 0 };
    for (const tag of spaceTags) {
      const kind = tag.kind;
      // Map legacy intention kinds to build/rest
      const mapped = (kind === 'build' || kind === 'focus' || kind === 'creative') ? 'build'
        : (kind === 'rest' || kind === 'retreat' || kind === 'check_in') ? 'rest'
        : null;
      if (mapped) spaceByMonth[mKey][mapped]++;
    }
  }

  // Free-time stats over a rolling planning horizon: [today, today + 6 months).
  const todayDate = new Date(today + 'T00:00:00');
  const horizonDate = new Date(todayDate);
  horizonDate.setMonth(horizonDate.getMonth() + FREE_HORIZON_MONTHS);
  const horizonKey = toDateKey(horizonDate.getFullYear(), horizonDate.getMonth(), horizonDate.getDate());

  // Free weekends — a weekend is free only if BOTH Sat and Sun are not busy.
  let freeWeekends = 0;
  for (const { year, month, isPast } of months) {
    if (isPast) continue;
    const dim = daysInMonth(year, month);
    for (let day = 1; day <= dim; day++) {
      const date = new Date(year, month, day);
      if (date.getDay() !== 6) continue;
      const satKey = toDateKey(year, month, day);
      if (satKey < today || satKey >= horizonKey) continue;
      const sunDate = new Date(year, month, day + 1);
      const sunKey  = toDateKey(sunDate.getFullYear(), sunDate.getMonth(), sunDate.getDate());
      if (!isDayBusy(days[satKey]) && !isDayBusy(days[sunKey])) freeWeekends++;
    }
  }

  // Free days — every day in [today, horizon) that isn't busy.
  let freeDaysAhead = 0;
  for (const { key } of allKeys) {
    if (key < today || key >= horizonKey) continue;
    if (!isDayBusy(days[key])) freeDaysAhead++;
  }

  return { byYear, freeWeekends, freeDaysAhead, horizonMonths: FREE_HORIZON_MONTHS, spaceByMonth };
}
