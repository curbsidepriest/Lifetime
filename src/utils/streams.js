// ── Stream (macro canopy) ↔ day linkage ─────────────────────────────────────────
// A "Build" day that falls inside an active stream's date range is *allocated* to
// that stream: it carries `day.streamId`. A Build day outside every stream is
// *unallocated* — back in the open resource pool (no streamId).
//
// placedInstances is intentionally DERIVED from these links rather than stored as a
// separate counter: days are mutated through many paths (popover, fill-drag, Delete
// key, AI assistant), so a standalone counter would inevitably drift. Counting the
// links keeps the number correct by construction — toggling a Build day in range
// adds exactly one link (+1); shrinking/shifting/deleting a stream strips the links
// of the days that left its scope (−1 each).

const SPACE_LEGACY = { focus: 'build', creative: 'build', retreat: 'rest', check_in: 'rest' };

// The resolved Space kind on a day's tag ('build' | 'rest' | null), legacy-aware.
function spaceKindOf(t) {
  if (t?.type !== 'space' && t?.type !== 'intention') return null;
  return t.kind === 'build' || t.kind === 'rest' ? t.kind : (SPACE_LEGACY[t.kind] || null);
}

// Does this day hold a Build session? (handles legacy intention kinds)
export function isBuildDay(d) {
  return (d?.tags || []).some(t => spaceKindOf(t) === 'build');
}

// Does this day hold a Rest session? Rest is an independent space utility — it is
// never linked to a stream, so it has no bearing on canopy allocation.
export function isRestDay(d) {
  return (d?.tags || []).some(t => spaceKindOf(t) === 'rest');
}

// The assigned stream whose range contains `key`, or null. The single-lane rule
// guarantees at most one, so the first match is authoritative.
export function streamForDate(key, canopies) {
  return (canopies || []).find(c => c.start && c.end && key >= c.start && key <= c.end) || null;
}

// Bring every day's `streamId` in line with reality: a Build day in a stream's
// range links to it; anything else has no link. Returns the SAME object reference
// when nothing changed, so callers can skip needless saves/re-renders.
// This one function covers all the scope-change cases — shorten, shift, delete —
// because it simply re-derives each link from the current ranges.
export function reconcileStreamLinks(days, canopies) {
  const assigned = (canopies || []).filter(c => c.start && c.end);
  let changed = false;
  const out = {};
  for (const [key, d] of Object.entries(days)) {
    if (!d) { out[key] = d; continue; }
    const owner = isBuildDay(d) ? streamForDate(key, assigned) : null;
    const want = owner ? owner.id : null;
    const has  = d.streamId ?? null;
    if (want === has) { out[key] = d; continue; }
    changed = true;
    if (want) {
      out[key] = { ...d, streamId: want };       // allocate to the stream
    } else {
      const rest = { ...d };                       // return to the open pool
      delete rest.streamId;
      out[key] = rest;
    }
  }
  return changed ? out : days;
}

// placedInstances for a stream — the number of Build days currently linked to it.
export function placedCount(canopyId, days) {
  let n = 0;
  for (const k in days) if (days[k]?.streamId === canopyId) n++;
  return n;
}
