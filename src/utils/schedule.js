import { daysInMonth, toDateKey, todayKey } from './dates.js';

/**
 * Auto-schedule intention tags spread evenly across a quarter.
 * For focus/creative: weekdays only. For retreat/check_in: any day.
 * Returns updated days object, or null if no candidates found.
 */
export function scheduleIntentions({ days, kind, year, quarter, targetCount }) {
  const qNum = parseInt(quarter);
  const startMonth = (qNum - 1) * 3;
  const endMonth   = startMonth + 2;
  const today      = todayKey();

  // Collect eligible days
  const candidates = [];
  for (let m = startMonth; m <= endMonth; m++) {
    const dim = daysInMonth(year, m);
    for (let d = 1; d <= dim; d++) {
      const key  = toDateKey(year, m, d);
      if (key < today) continue;                         // skip past days
      const dow = new Date(year, m, d).getDay();
      if ((kind === 'focus' || kind === 'creative') && (dow === 0 || dow === 6)) continue; // weekdays only
      if ((days[key]?.tags || []).some(t => t?.type === 'intention' && t.kind === kind)) continue; // already scheduled
      candidates.push(key);
    }
  }

  if (!candidates.length) return null;

  const count = Math.min(targetCount, candidates.length);

  // Spread evenly — pick indices at regular intervals
  const selected = new Set();
  const step = candidates.length / count;
  for (let i = 0; i < count; i++) {
    const idx = Math.min(Math.floor(i * step + step / 2), candidates.length - 1);
    selected.add(candidates[idx]);
  }

  // Apply to days
  const updates = { ...days };
  for (const key of selected) {
    const existing = updates[key] || { baseState: null, tags: [], note: '', maybes: [] };
    updates[key] = {
      ...existing,
      tags: [...(existing.tags || []), { type: 'intention', kind }],
    };
  }
  return updates;
}
