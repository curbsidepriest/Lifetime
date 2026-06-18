const DAYS_KEY         = 'planner_days';
const BUDGETS_KEY      = 'planner_budgets';
const SPACE_KEY        = 'planner_space_cfg';
const RELATIONSHIPS_KEY = 'planner_relationships';
const LEAVE_TYPES_KEY  = 'planner_leave_types';
const LIFE_LENSES_KEY  = 'planner_life_lenses';
const CANOPIES_KEY     = 'planner_canopies';

// ── Leave types (configurable) ──────────────────────────────────────────────
// Each: { id, label, color (hex), maxConsecutive (number|null) }
// `id` is the stable key stored in day.baseState — never change it on rename.
export const DEFAULT_LEAVE_TYPES = [
  { id: 'holiday', label: 'Holiday', color: '#4ade80', maxConsecutive: null },
  { id: 'unpaid',  label: 'Unpaid',  color: '#fbbf24', maxConsecutive: null },
  { id: 'wfa',     label: 'WFA',     color: '#a78bfa', maxConsecutive: 30 },
];

// ── Space types (Build + Rest) ─────────────────────────────────────────────────
export const SPACE_TYPES = [
  { kind: 'build', label: 'Build', icon: '◆', color: '#2563eb' }, // making / writing / deep work
  { kind: 'rest',  label: 'Rest',  icon: '◎', color: '#059669' }, // recovery / reading / stillness
];

const DEFAULT_SPACE_TARGETS = {
  build: { target: 2, period: 'week' },
  rest:  { target: 1, period: 'week' },
};

// ── Canopies (macro "Season / Chapter" layer) ──────────────────────────────────
// A canopy is a macro arc that floats ABOVE the day grid — it never touches
// day-level state, schemas, or the leave/space model. Each:
//   { id, title, color (hex), start: 'YYYY-MM-DD'|null, end: 'YYYY-MM-DD'|null }
// An *assigned* canopy has start+end and paints a vertical indicator bar
// alongside the months it spans. An *unassigned* one (start/end null) is a
// "superposition" — a big idea not yet collapsed onto the calendar — and lives
// in the sidebar hopper until it's given boundaries.
// Differentiated but cohesive "muted jewel" tones — distinct hues spread across the
// wheel (violet → blue → teal → amber → rose → plum) at a similar mid lightness, so
// streams read as their own family while staying easy to tell apart. Violet/blue lead
// to keep the indigo→violet→blue brand anchor.
export const CANOPY_COLORS = ['#7d6bc0', '#4c84c4', '#2fa39a', '#c4923f', '#c56b85', '#9d62b0'];

// How many feeding sessions (Build/Rest days) a stream needs before it counts as
// "realized". `required` is the goal; the placed count is derived from the days.
export const DEFAULT_REQUIRED = 8;

export const DEFAULT_CANOPIES = [
  { id: 'cnp-builders-summer', title: "Builder's Summer", color: '#7d6bc0', start: '2026-06-01', end: '2026-08-31', required: 12 },
  { id: 'cnp-reset-plan',      title: 'Reset & Plan',     color: '#2fa39a', start: '2026-09-01', end: '2026-10-15', required: 4 },
  { id: 'cnp-sabbatical',      title: 'Sabbatical year',  color: '#c4923f', start: null, end: null, required: 20 },
  { id: 'cnp-write-book',      title: 'Write a book',     color: '#c56b85', start: null, end: null, required: 30 },
];

export function loadCanopies() {
  try {
    const raw = localStorage.getItem(CANOPIES_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_CANOPIES.map(c => ({ ...c }));
  } catch { return DEFAULT_CANOPIES.map(c => ({ ...c })); }
}
export function saveCanopies(c) { localStorage.setItem(CANOPIES_KEY, JSON.stringify(c)); }

// ── Life lenses (configurable cadence stats) ────────────────────────────────
// Each: { id, label, everyYears (number), anchor? (year for fixed-cycle events) }
export const DEFAULT_LIFE_LENSES = [
  { id: 'summers',   label: 'Summers',             everyYears: 1 },
  { id: 'fullmoons', label: 'Full moons',          everyYears: 0.0808 }, // ~12.37/yr
  { id: 'seasons',   label: 'Seasons',             everyYears: 0.25 },
  { id: 'bday10',    label: 'Round birthdays ×10', everyYears: 10 },
  { id: 'worldcups', label: 'World Cups',          everyYears: 4, anchor: 2026 },
];

// ── Leave budgets ──────────────────────────────────────────────────────────────
const DEFAULT_BUDGETS_BY_TYPE = {
  holiday: 26,
  unpaid: 4,
  wfa: 40,
};

export function loadDays() {
  try {
    const raw = localStorage.getItem(DAYS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
export function saveDays(days) {
  localStorage.setItem(DAYS_KEY, JSON.stringify(days));
}

// ── Leave types ────────────────────────────────────────────────────────────────
export function loadLeaveTypes() {
  try {
    const raw = localStorage.getItem(LEAVE_TYPES_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through to defaults */ }

  // First run (or pre-feature install): seed from defaults, pulling the old
  // wfaMaxConsecutive onto the wfa type if a legacy budgets blob exists.
  const types = DEFAULT_LEAVE_TYPES.map(t => ({ ...t }));
  try {
    const oldBudgets = JSON.parse(localStorage.getItem(BUDGETS_KEY) || '{}');
    if (oldBudgets.wfaMaxConsecutive != null) {
      const wfa = types.find(t => t.id === 'wfa');
      if (wfa) wfa.maxConsecutive = oldBudgets.wfaMaxConsecutive;
    }
  } catch { /* ignore */ }
  return types;
}
export function saveLeaveTypes(types) {
  localStorage.setItem(LEAVE_TYPES_KEY, JSON.stringify(types));
}

// ── Budgets ──────────────────────────────────────────────────────────────────
// New shape: { byType: { id: days }, perYear: { year: { budget:{id:n}, consumed:{id:n} } } }
// Migrates the legacy shape { holiday, unpaid, wfa, wfaMaxConsecutive, perYear:{year:{...}} }.
function migrateBudgets(stored) {
  if (stored.byType) return stored; // already new shape

  const byType = {};
  for (const [key, val] of Object.entries(stored)) {
    if (key === 'perYear' || key === 'wfaMaxConsecutive') continue;
    if (typeof val === 'number') byType[key] = val;
  }

  const perYear = {};
  for (const [year, override] of Object.entries(stored.perYear || {})) {
    const budget = {};
    for (const [k, v] of Object.entries(override)) {
      if (k === 'wfaMaxConsecutive') continue; // never surfaced; drop it
      if (typeof v === 'number') budget[k] = v;
    }
    perYear[year] = { budget, consumed: {} };
  }

  return { byType, perYear };
}

export function loadBudgets() {
  try {
    const raw = localStorage.getItem(BUDGETS_KEY);
    let stored = raw ? JSON.parse(raw) : {};
    if (!stored.byType) stored = migrateBudgets(stored);
    return {
      byType:  { ...DEFAULT_BUDGETS_BY_TYPE, ...(stored.byType || {}) },
      perYear: stored.perYear || {},
    };
  } catch {
    return { byType: { ...DEFAULT_BUDGETS_BY_TYPE }, perYear: {} };
  }
}
export function saveBudgets(b) { localStorage.setItem(BUDGETS_KEY, JSON.stringify(b)); }

// ── Space targets ──────────────────────────────────────────────────────────────
export function loadSpaceTargets() {
  try {
    const raw = localStorage.getItem(SPACE_KEY);
    return raw ? { ...DEFAULT_SPACE_TARGETS, ...JSON.parse(raw) } : { ...DEFAULT_SPACE_TARGETS };
  } catch { return { ...DEFAULT_SPACE_TARGETS }; }
}
export function saveSpaceTargets(t) { localStorage.setItem(SPACE_KEY, JSON.stringify(t)); }

// ── Life lenses ────────────────────────────────────────────────────────────────
export function loadLifeLenses() {
  try {
    const raw = localStorage.getItem(LIFE_LENSES_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_LIFE_LENSES.map(l => ({ ...l }));
  } catch { return DEFAULT_LIFE_LENSES.map(l => ({ ...l })); }
}
export function saveLifeLenses(l) { localStorage.setItem(LIFE_LENSES_KEY, JSON.stringify(l)); }

// ── Relationships (for the "what matters" life stats) ─────────────────────────
// { id, type: 'parent'|'partner'|'child', name: string, birthYear: number }
export function loadRelationships() {
  try { return JSON.parse(localStorage.getItem(RELATIONSHIPS_KEY) || '[]'); }
  catch { return []; }
}
export function saveRelationships(r) { localStorage.setItem(RELATIONSHIPS_KEY, JSON.stringify(r)); }

// ── Budget helpers ────────────────────────────────────────────────────────────
// Resolves the budget + consumed-at-setup for a given year, keyed by every
// current leave-type id. `budget[id]` may be null (no budget set); `consumed[id]`
// defaults to 0.
export function getBudgetsForYear(budgets, leaveTypes, year) {
  const yo = budgets.perYear?.[year] || {};
  const budget = {};
  const consumed = {};
  for (const t of leaveTypes) {
    budget[t.id]   = yo.budget?.[t.id]   ?? budgets.byType?.[t.id] ?? null;
    consumed[t.id] = yo.consumed?.[t.id] ?? 0;
  }
  return { budget, consumed };
}

// ── Backup & restore ──────────────────────────────────────────────────────────
// Everything the app persists lives in localStorage under keys prefixed "planner"
// (days, budgets, leave types, canopies, life lenses, relationships, space cfg,
// mottos, people, birthday, …). Export/import grabs them all by prefix so no key
// is ever missed, even ones not declared above.
const BACKUP_PREFIX = 'planner';

function plannerKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(BACKUP_PREFIX)) keys.push(k);
  }
  return keys;
}

// Returns a serialisable snapshot of all planner data.
export function exportAllData() {
  const data = {};
  for (const k of plannerKeys()) data[k] = localStorage.getItem(k);
  return { app: 'planner', version: 1, exportedAt: new Date().toISOString(), data };
}

// Restores a snapshot produced by exportAllData (or a bare { key: value } map).
// Replaces existing planner data so the result matches the backup exactly.
// Returns the number of keys written. Throws on an invalid/empty file.
export function importAllData(payload) {
  const data = payload && payload.data ? payload.data : payload;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Not a valid planner backup file.');
  }
  const incoming = Object.keys(data).filter(k => k.startsWith(BACKUP_PREFIX));
  if (incoming.length === 0) throw new Error('No planner data found in this file.');
  // Clear existing planner_* keys first so import is a clean replace, not a merge.
  for (const k of plannerKeys()) localStorage.removeItem(k);
  for (const k of incoming) {
    const v = data[k];
    localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  return incoming.length;
}
