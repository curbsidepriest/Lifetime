import React, { useState, useRef, useEffect } from 'react';
import { daysInMonth, toDateKey, getMonthName } from '../utils/dates.js';
import { CANOPY_COLORS, DEFAULT_REQUIRED } from '../utils/storage.js';
import { placedCount } from '../utils/streams.js';

// ── Geometry ─────────────────────────────────────────────────────────────────
// Each month column is w-28 (112px) split into 4 quarter-month segments (28px),
// mirroring the day grid's column widths so the lane lines up with the months.
const SEG_W   = 28;
const LANE_H  = 34;
const SPACER  = 36;  // left gutter: w-8 (32) + mr-1 (4), matches the grid row header
const COL_GAP = 1;   // mr-px between month columns
const YB_GAP  = 16;  // ml-4 extra gap at a year boundary
const BLOCK_TOP = 7; // vertical offset of a season block within the lane
const BLOCK_H   = LANE_H - 6;

// ── Colour helpers ─────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  if (typeof hex !== 'string') return { r: 156, g: 163, b: 175 };
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return { r: 156, g: 163, b: 175 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgba(hex, a) { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
// Darken a hex toward black (f<1) — used for legible text on a muted tint.
function shade(hex, f) { const { r, g, b } = hexToRgb(hex); return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`; }

// placed ≥ required → the stream is "realized" (goal allocated).
const isRealized = (placed, required) => placed >= required;

// ── Segment ↔ day math ─────────────────────────────────────────────────────────
const segStartDay = (seg, dim) => Math.floor(seg * dim / 4) + 1;
const segEndDay   = (seg, dim) => Math.floor((seg + 1) * dim / 4);
function daySegIndex(day, dim) {
  for (let s = 0; s < 4; s++) if (day <= segEndDay(s, dim)) return s;
  return 3;
}

// Day key ± n days (for trimming overlaps on a single lane).
function shiftKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toDateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

// On a single lane, a new/edited span trims or evicts any season it overlaps.
function resolveOverlaps(list, keepId, ns, ne) {
  const out = [];
  for (const c of list) {
    if (c.id === keepId || !c.start || !c.end) { out.push(c); continue; }
    if (c.end < ns || c.start > ne) { out.push(c); continue; }   // disjoint — leave it
    if (c.start >= ns && c.end <= ne) continue;                  // swallowed — drop it
    if (c.start < ns) out.push({ ...c, end: shiftKey(ns, -1) }); // trim its tail
    else              out.push({ ...c, start: shiftKey(ne, 1) }); // trim its head
  }
  return out;
}

export default function SeasonTimeline({ months, canopies = [], onCanopiesChange, days = {} }) {
  const assigned = canopies.filter(c => c.start && c.end);

  // ── Drag-to-create state (linear segment index = colIdx*4 + seg) ─────────────
  const [anchor,  setAnchor]  = useState(null);
  const [current, setCurrent] = useState(null);
  const dragging = anchor != null;
  const maxLin = months.length * 4 - 1;

  // ── Pixel offsets — let a season render as ONE continuous block across months ──
  // The left edge (px, relative to the lane) of each month column, accounting for
  // the row-header gutter, the 1px inter-month gaps, and the 16px year-boundary gap.
  const monthLefts = [];
  {
    let x = SPACER;
    for (let i = 0; i < months.length; i++) {
      if (months[i].month === 0 && i > 0) x += YB_GAP;
      monthLefts.push(x);
      x += SEG_W * 4 + COL_GAP;
    }
  }
  const linLeftPx  = lin => monthLefts[Math.floor(lin / 4)] + (lin % 4) * SEG_W;
  const linRightPx = lin => monthLefts[Math.floor(lin / 4)] + ((lin % 4) + 1) * SEG_W;

  const firstKey = toDateKey(months[0].year, months[0].month, 1);
  const lastMon  = months[months.length - 1];
  const lastKey  = toDateKey(lastMon.year, lastMon.month, daysInMonth(lastMon.year, lastMon.month));

  // Clamp a season edge to the visible window; null if it falls entirely outside.
  function clampLin(key, edge) {
    const lin = keyToLin(key, edge);
    if (lin != null) return lin;
    if (key < firstKey) return 0;
    if (key > lastKey)  return maxLin;
    return null;
  }

  // ── Editor popover ───────────────────────────────────────────────────────────
  const [editor, setEditor] = useState(null); // { id, x, y }
  const editorRef = useRef(null);

  const linToStartKey = lin => {
    const col = Math.floor(lin / 4), seg = lin % 4, { year, month } = months[col];
    return toDateKey(year, month, segStartDay(seg, daysInMonth(year, month)));
  };
  const linToEndKey = lin => {
    const col = Math.floor(lin / 4), seg = lin % 4, { year, month } = months[col];
    return toDateKey(year, month, segEndDay(seg, daysInMonth(year, month)));
  };
  const keyToLin = (key, edge) => {
    const [y, m] = key.split('-').map(Number);
    const col = months.findIndex(mo => mo.year === y && mo.month === m - 1);
    if (col < 0) return null;
    const dim = daysInMonth(y, m - 1);
    const day = edge === 'end'
      ? (key < toDateKey(y, m - 1, dim) ? Number(key.slice(8, 10)) : dim)
      : (key > toDateKey(y, m - 1, 1)   ? Number(key.slice(8, 10)) : 1);
    return col * 4 + daySegIndex(day, dim);
  };

  // ── Finish a create-drag ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!dragging) return;
    function onUp(e) {
      const lo = Math.min(anchor, current), hi = Math.max(anchor, current);
      const ns = linToStartKey(lo), ne = linToEndKey(hi);
      const id = `cnp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
      const color = CANOPY_COLORS[canopies.length % CANOPY_COLORS.length];
      const next = resolveOverlaps([...canopies, { id, title: 'New season', color, start: ns, end: ne, required: DEFAULT_REQUIRED }], id, ns, ne);
      onCanopiesChange(next);
      setAnchor(null); setCurrent(null);
      setEditor({ id, x: e.clientX, y: e.clientY }); // open editor to name it
    }
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [dragging, anchor, current, canopies, months]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Editor: close on outside click ─────────────────────────────────────────────
  useEffect(() => {
    if (!editor) return;
    function onDown(e) { if (editorRef.current && !editorRef.current.contains(e.target)) setEditor(null); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editor]);

  const editing = editor ? canopies.find(c => c.id === editor.id) : null;

  function patchSeason(id, fields) {
    onCanopiesChange(canopies.map(c => (c.id === id ? { ...c, ...fields } : c)));
  }
  function deleteSeason(id) {
    onCanopiesChange(canopies.filter(c => c.id !== id));
    setEditor(null);
  }
  // Nudge an edge by one quarter-month segment, clamped & overlap-resolved.
  function nudge(season, edge, delta) {
    const startLin = keyToLin(season.start, 'start');
    const endLin   = keyToLin(season.end, 'end');
    if (startLin == null || endLin == null) return; // outside the visible window
    if (edge === 'start') {
      const lin = Math.max(0, Math.min(startLin + delta, endLin));
      const ns = linToStartKey(lin);
      onCanopiesChange(resolveOverlaps(patchList(season.id, { start: ns }), season.id, ns, season.end));
    } else {
      const lin = Math.max(startLin, Math.min(endLin + delta, maxLin));
      const ne = linToEndKey(lin);
      onCanopiesChange(resolveOverlaps(patchList(season.id, { end: ne }), season.id, season.start, ne));
    }
  }
  const patchList = (id, fields) => canopies.map(c => (c.id === id ? { ...c, ...fields } : c));

  function spanLabel(season) {
    const s = season.start.split('-'), e = season.end.split('-');
    const a = `${getMonthName(Number(s[1]) - 1).slice(0, 3)} ${Number(s[2])}`;
    const b = `${getMonthName(Number(e[1]) - 1).slice(0, 3)} ${Number(e[2])}`;
    return `${a} – ${b}`;
  }

  const lo = dragging ? Math.min(anchor, current) : null;
  const hi = dragging ? Math.max(anchor, current) : null;

  // ── Single priority lane ────────────────────────────────────────────────────
  // Only ONE stream canopy may own a given day-column range. Sort by start, then
  // greedily claim columns: a secondary that overlaps an already-claimed range is
  // pushed (its visible start truncated) or dropped if fully covered — never interleaved.
  const laneItems = (() => {
    const items = assigned
      .map(c => {
        if (c.end < firstKey || c.start > lastKey) return null; // outside the window
        const s = clampLin(c.start, 'start');
        const e = clampLin(c.end, 'end');
        if (s == null || e == null || e < s) return null;
        return { c, s, e, trueStartInView: c.start >= firstKey, trueEndInView: c.end <= lastKey };
      })
      .filter(Boolean)
      .sort((a, b) => a.s - b.s || a.e - b.e);

    const out = [];
    let claimedTo = -1;
    for (const it of items) {
      const startLin = Math.max(it.s, claimedTo + 1);
      if (startLin > it.e) continue;                 // fully overlapped → drop secondary
      out.push({ ...it, s: startLin, truncatedLeft: startLin !== it.s });
      claimedTo = it.e;
    }
    return out;
  })();

  return (
    <div className="relative inline-flex items-center select-none" style={{ minHeight: LANE_H + 8 }}>
      {/* Left label — matches the day grid's w-8 mr-1 row-header gutter */}
      <div className="w-8 mr-1 shrink-0 flex items-center justify-end pr-1">
        <span className="font-bold uppercase text-gray-300 whitespace-nowrap"
          style={{ fontSize: 6, letterSpacing: '0.02em' }}>
          Seasons
        </span>
      </div>

      {/* Segment ruler / drag targets — one cell per month, 4 quarter-month segments */}
      {months.map(({ year, month, isPast }, colIdx) => {
        const isYearBoundary = month === 0 && colIdx > 0;
        return (
          <div key={`${year}-${month}`}
            className={`relative shrink-0 mr-px ${isYearBoundary ? 'ml-4' : ''}`}
            style={{ width: SEG_W * 4, height: LANE_H }}>
            <div className="absolute inset-0 flex">
              {[0, 1, 2, 3].map(seg => {
                const lin = colIdx * 4 + seg;
                return (
                  <div key={seg}
                    onMouseDown={() => { setAnchor(lin); setCurrent(lin); }}
                    onMouseEnter={() => dragging && setCurrent(lin)}
                    className="flex-1 cursor-crosshair"
                    style={{
                      borderRight: seg < 3 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                      background: isPast ? 'rgba(0,0,0,0.015)' : 'transparent',
                    }} />
                );
              })}
            </div>
            <div className="absolute left-0 right-0 bottom-0 border-b border-gray-100" />
          </div>
        );
      })}

      {/* Continuous stream canopies — one unit each, in two allocation states */}
      {laneItems.map(({ c, s, e, truncatedLeft, trueStartInView, trueEndInView }) => {
        const left     = linLeftPx(s);
        const width    = linRightPx(e) - left;
        const placed   = placedCount(c.id, days);
        const required = c.required ?? DEFAULT_REQUIRED;
        const realized = isRealized(placed, required);
        // Round only the ends that are the stream's TRUE boundaries and in view; a
        // pushed/clipped edge stays square to signal it continues or was truncated.
        const roundL = trueStartInView && !truncatedLeft;
        const roundR = trueEndInView;
        const radius = {
          borderTopLeftRadius:    roundL ? 7 : 0, borderBottomLeftRadius: roundL ? 7 : 0,
          borderTopRightRadius:   roundR ? 7 : 0, borderBottomRightRadius: roundR ? 7 : 0,
        };
        const stateStyle = realized
          ? { // "Reality Realized" — solid premium fill + glowing aura
              background: c.color,
              boxShadow: `0 0 0 1px ${rgba(c.color, 0.5)}, 0 0 14px ${rgba(c.color, 0.6)}, 0 2px 6px ${rgba(c.color, 0.45)}`,
            }
          : { // "Incomplete" — dashed border + muted tint
              background: rgba(c.color, 0.12),
              border: `1.5px dashed ${rgba(c.color, 0.75)}`,
            };
        return (
          <div key={c.id}
            onMouseDown={ev => ev.stopPropagation()}
            onClick={ev => setEditor({ id: c.id, x: ev.clientX, y: ev.clientY })}
            title={`${c.title} — ${placed}/${required} placed${realized ? ' · realized' : ''} — click to edit`}
            className="absolute flex items-center gap-2 px-2.5 cursor-pointer transition-all hover:brightness-105 overflow-hidden"
            style={{ left, top: BLOCK_TOP, width, height: BLOCK_H, zIndex: realized ? 11 : 10, ...radius, ...stateStyle }}>
            {/* soft top sheen — only on the realized (solid) state */}
            {realized && (
              <span className="absolute inset-x-0 top-0 pointer-events-none" style={{
                height: '55%', background: 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0))',
              }} />
            )}
            <span className="relative text-[11px] font-bold truncate leading-none"
              style={realized
                ? { color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.28)' }
                : { color: shade(c.color, 0.6) }}>
              {c.title || 'Untitled'}
            </span>
            <span className="relative ml-auto shrink-0 text-[8px] font-bold leading-none whitespace-nowrap"
              style={realized ? { color: 'rgba(255,255,255,0.95)' } : { color: shade(c.color, 0.6) }}
              title={`${placed} of ${required} Build sessions placed`}>
              {realized ? `✓ ${placed}/${required}` : `${placed}/${required}`}
            </span>
          </div>
        );
      })}

      {/* Live drag preview — also a single continuous unit */}
      {dragging && (
        <div className="absolute rounded-md pointer-events-none"
          style={{
            left: linLeftPx(lo), top: BLOCK_TOP,
            width: linRightPx(hi) - linLeftPx(lo), height: BLOCK_H, zIndex: 20,
            background: 'rgba(99,102,241,0.18)', border: '1px dashed #818cf8',
          }} />
      )}

      {/* ── Editor popover ──────────────────────────────────────────────────────── */}
      {editing && (
        <div ref={editorRef}
          style={{
            position: 'fixed',
            top: Math.min(editor.y + 10, window.innerHeight - 220),
            left: Math.min(editor.x, window.innerWidth - 248),
            zIndex: 1000, width: 240,
          }}
          className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Season</span>
            <button onClick={() => setEditor(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
          </div>

          <input autoFocus type="text" value={editing.title}
            onChange={e => patchSeason(editing.id, { title: e.target.value })}
            placeholder="Name this season"
            className="w-full text-sm font-semibold border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 placeholder-gray-300" />

          {/* Colour */}
          <div className="flex items-center gap-1.5">
            {CANOPY_COLORS.map(col => (
              <button key={col} onClick={() => patchSeason(editing.id, { color: col })}
                className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                style={{ background: col, boxShadow: editing.color === col ? `0 0 0 2px white, 0 0 0 4px ${col}` : 'none' }}
                title={col} />
            ))}
          </div>

          {/* Span steppers (quarter-month) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span className="font-medium">{spanLabel(editing)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-gray-400 w-7">Start</span>
                <button onClick={() => nudge(editing, 'start', -1)} className="flex-1 text-xs py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50">◀</button>
                <button onClick={() => nudge(editing, 'start',  1)} className="flex-1 text-xs py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50">▶</button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-gray-400 w-6">End</span>
                <button onClick={() => nudge(editing, 'end', -1)} className="flex-1 text-xs py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50">◀</button>
                <button onClick={() => nudge(editing, 'end',  1)} className="flex-1 text-xs py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50">▶</button>
              </div>
            </div>
          </div>

          {/* Allocation goal — drives the Incomplete vs Realized state */}
          {(() => {
            const placed   = placedCount(editing.id, days);
            const required = editing.required ?? DEFAULT_REQUIRED;
            const realized = isRealized(placed, required);
            return (
              <div className="flex flex-col gap-1.5 pt-0.5 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wide">Sessions needed</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => patchSeason(editing.id, { required: Math.max(0, required - 1) })}
                      className="w-6 h-6 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 leading-none">−</button>
                    <span className="text-sm font-bold text-gray-700 w-6 text-center">{required}</span>
                    <button onClick={() => patchSeason(editing.id, { required: required + 1 })}
                      className="w-6 h-6 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 leading-none">+</button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium"
                  style={{ color: realized ? '#059669' : shade(editing.color, 0.6) }}>
                  <span className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: realized ? '#10b981' : 'transparent', border: realized ? 'none' : `1.5px dashed ${rgba(editing.color, 0.75)}` }} />
                  {realized ? `Realized — ${placed}/${required} placed` : `Incomplete — ${placed}/${required} placed`}
                </div>
              </div>
            );
          })()}

          <button onClick={() => deleteSeason(editing.id)}
            className="w-full text-xs py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors">
            Delete season
          </button>
        </div>
      )}
    </div>
  );
}
