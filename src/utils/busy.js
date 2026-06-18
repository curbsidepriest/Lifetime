// A day is "busy" if anything that consumes the day is on it:
//   - leave (baseState)
//   - away (travelling)
//   - a Space day (Build / Rest)
//   - the "What's on" entry (stored as `note`)
//   - any possibility (even a single unresolved maybe)
// A deadline does NOT make a day busy — it's just a tracked marker.
// Bare weekends / bank holidays with nothing on them are free.
export function isDayBusy(d) {
  if (!d) return false;
  if (d.baseState) return true;
  if (d.away === true) return true;
  if (d.note && String(d.note).trim()) return true;
  if (d.maybes && d.maybes.length > 0) return true;
  if ((d.tags || []).some(t => t?.type === 'space' || t?.type === 'intention')) return true;
  return false;
}
