// Gauss/Anonymous Gregorian algorithm for Easter Sunday
function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getBerlinHolidays(year) {
  const holidays = new Set();

  // Fixed holidays
  holidays.add(`${year}-01-01`); // New Year's Day
  holidays.add(`${year}-03-08`); // International Women's Day (Berlin, since 2019)
  holidays.add(`${year}-05-01`); // Tag der Arbeit
  holidays.add(`${year}-10-03`); // Tag der deutschen Einheit
  holidays.add(`${year}-12-25`); // Christmas Day
  holidays.add(`${year}-12-26`); // Second Christmas Day

  // Easter-based holidays
  const easter = getEasterSunday(year);
  holidays.add(fmt(addDays(easter, -2)));  // Good Friday
  holidays.add(fmt(addDays(easter, 1)));   // Easter Monday
  holidays.add(fmt(addDays(easter, 39)));  // Ascension (39 days after Easter)
  holidays.add(fmt(addDays(easter, 50)));  // Whit Monday (50 days after Easter)

  return holidays;
}

// Returns array of { year, month (0-based), isPast } for the planner window.
// Default: current month → end of next calendar year.
// showPast: Jan 1 of this year → end of next calendar year.
export function getRolling12Months(showPast = false) {
  const now = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth();
  const startMonth = showPast ? 0 : currentMonth;
  const startYear  = currentYear;
  const endYear    = currentYear + 1;
  const months = [];
  for (let y = startYear, m = startMonth; ; ) {
    const isPast = y < currentYear || (y === currentYear && m < currentMonth);
    months.push({ year: y, month: m, isPast });
    m++;
    if (m > 11) { m = 0; y++; }
    if (y > endYear || (y === endYear && m > 11)) break;
  }
  return months;
}

// Today's date as YYYY-MM-DD
export function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function toDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isWeekend(year, month, day) {
  const dow = new Date(year, month, day).getDay();
  return dow === 0 || dow === 6;
}

export function getWeekdayAbbr(year, month, day) {
  const abbrs = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  return abbrs[new Date(year, month, day).getDay()];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function getMonthName(month) {
  return MONTH_NAMES[month];
}
