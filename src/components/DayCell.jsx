import React from 'react';
import { getWeekdayAbbr } from '../utils/dates.js';
import { SPACE_TYPES } from '../utils/storage.js';
import { isDayBusy } from '../utils/busy.js';

// Map for Build/Rest lookup — also handles legacy intention kinds
const SPACE_MAP = Object.fromEntries(SPACE_TYPES.map(it => [it.kind, it]));
// Legacy mapping so old focus/creative/retreat/check_in tags still render
const LEGACY_KIND = { focus: 'build', creative: 'build', retreat: 'rest', check_in: 'rest' };
function resolveSpaceKind(kind) {
  return SPACE_MAP[kind] || SPACE_MAP[LEGACY_KIND[kind]] || null;
}

// Leave-type colours are now arbitrary hex values, so backgrounds are derived
// from the type colour at render time rather than from fixed Tailwind classes.
const ORPHAN_COLOR = '#9ca3af'; // a day still referencing a removed leave type
const BANKHOL_MARKER = '#93c5fd'; // neutral "public holiday" dot

function hexToRgb(hex) {
  if (typeof hex !== 'string') return { r: 156, g: 163, b: 175 };
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return { r: 156, g: 163, b: 175 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgba(hex, a) { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

// Background tint for a day that has a base state, derived from the type colour.
// away layer: weekday strong (0.55), weekend/bank-hol muted (0.28). space layer: faint (0.12).
function deriveBaseBg(color, { muted, layer }) {
  if (layer === 'space') return rgba(color, 0.12);
  return muted ? rgba(color, 0.28) : rgba(color, 0.55);
}

// The Build/Rest "gem" — protected time, rendered as eye-candy in every view.
// `bright` = sitting on the saturated Space-layer block (white, glowing); otherwise
// it's a small coloured gem that glows against a light background (e.g. travel view).
function SpaceGem({ it, size = 11, bright = false }) {
  return (
    <span
      className="leading-none shrink-0 pointer-events-none"
      title={`${it.label} day — protected time`}
      style={{
        fontSize: size,
        color: bright ? '#ffffff' : it.color,
        textShadow: bright
          ? '0 0 7px rgba(255,255,255,0.95), 0 0 3px rgba(255,255,255,0.8)'
          : `0 0 5px ${rgba(it.color, 0.85)}`,
      }}
    >
      {it.icon}
    </span>
  );
}

// Dashed bar as a repeating gradient — used for maybe/superposition state
const MAYBE_BAR_STYLE = {
  background: 'repeating-linear-gradient(to bottom, #818cf8 0px, #818cf8 4px, transparent 4px, transparent 8px)',
  width: '3px',
  flexShrink: 0,
};

export default function DayCell({
  year, month, day, valid,
  dayData, isWeekend, isBankHoliday,
  isSelected, isFillHighlight, isPast,
  isToday,
  isYearBoundary,
  blockPos,
  onMouseDown, onMouseEnter, onDoubleClick,
  onFillHandleMouseDown,
  layer = 'away',
  leaveTypeMap = {},
}) {
  if (!valid) {
    return <div className="w-28 h-9 bg-gray-50 border border-gray-100" />;
  }

  const weekdayAbbr = getWeekdayAbbr(year, month, day);
  const baseState   = dayData?.baseState;
  const tags        = dayData?.tags   || [];
  const note        = dayData?.note   || '';
  const maybes      = dayData?.maybes || [];
  const hasMaybes     = maybes.length > 0;
  const spaceTags     = tags.filter(t => t?.type === 'space' || t?.type === 'intention');
  const primarySpace  = spaceTags.length ? resolveSpaceKind(spaceTags[0].kind) : null;
  const isAway        = dayData?.away === true;
  const hasData       = !!(baseState || tags.length || note || hasMaybes || isAway);
  const busy          = isDayBusy(dayData);

  // Resolve the leave type for this day's base state (gray fallback if removed).
  const baseColor = baseState ? (leaveTypeMap[baseState]?.color || ORPHAN_COLOR) : null;
  const muted     = isWeekend || isBankHoliday;

  // ── Background ────────────────────────────────────────────────────────────
  // Base-state days get an inline hex tint; everything else stays Tailwind classes.
  // A committed Space day gets a rich gradient "gem" fill (darkSpace = white text).
  let bgClass = 'bg-white';
  let baseBgColor = null;
  let cellBackground = null; // inline gradient (committed Space day)
  let darkSpace = false;
  if (layer === 'away') {
    if (baseState) {
      baseBgColor = deriveBaseBg(baseColor, { muted, layer });
    } else if (isAway) {
      // Away without leave (weekend trip etc.) — warm amber tint
      bgClass = isWeekend ? 'bg-orange-50' : 'bg-amber-50';
    } else if (hasMaybes) {
      if (isBankHoliday) bgClass = 'bg-teal-50';
      else if (isWeekend) bgClass = 'bg-gray-100';
      else bgClass = 'bg-indigo-50';
    } else if (isBankHoliday) {
      bgClass = 'bg-blue-100';
    } else if (isWeekend) {
      bgClass = 'bg-gray-100';
    }
  } else if (layer === 'space') {
    if (primarySpace) {
      // The reward: a saturated gradient gem in the Build/Rest colour.
      cellBackground = `linear-gradient(135deg, ${rgba(primarySpace.color, 0.95)} 0%, ${rgba(primarySpace.color, 0.62)} 100%)`;
      darkSpace = true;
    } else if (baseState) {
      // Holiday/WFA visible but muted — you can see it, can't ignore it
      baseBgColor = deriveBaseBg(baseColor, { muted, layer });
    } else if (isBankHoliday) bgClass = 'bg-blue-50';
    else if (isWeekend) bgClass = 'bg-gray-50';
    else bgClass = 'bg-white';
  }

  // ── Seam style — only in travel layer ────────────────────────────────────
  // Reuse the full-strength type colour so vertical blocks read seamless.
  const seamStyle = layer === 'away' && (blockPos === 'mid' || blockPos === 'end') && baseState
    ? { borderTopColor: rgba(baseColor, 0.55) }
    : {};

  // ── Accent bar ────────────────────────────────────────────────────────────
  let accentBar = null;
  if (layer === 'away') {
    const barTop    = blockPos === 'start' || blockPos === 'solo' ? 'rounded-t-sm' : '';
    const barBottom = blockPos === 'end'   || blockPos === 'solo' ? 'rounded-b-sm' : '';
    if (baseState) {
      accentBar = (
        <div
          className={`shrink-0 ${barTop} ${barBottom}`}
          style={{ width: 3, background: baseColor }}
        />
      );
    } else if (hasMaybes) {
      accentBar = <div className="shrink-0" style={MAYBE_BAR_STYLE} />;
    }
  }

  // ── Deadline tag ──────────────────────────────────────────────────────────
  const deadlineTag = tags.find(t => t?.type === 'deadline' || t === 'deadline');
  const hasDeadline = !!deadlineTag;
  const deadlineLabel = deadlineTag?.label || '';

  // ── Sub-label ─────────────────────────────────────────────────────────────
  let subLabel = '';
  let subLabelStyle = {};
  let subLabelClass = 'text-gray-500';

  if (layer === 'away') {
    subLabel = deadlineLabel || note || (hasMaybes ? maybes[0] : '') || (isAway && !baseState ? 'away' : '');
    if (deadlineLabel) subLabelClass = 'text-red-500';
    else if (hasMaybes && !note) subLabelClass = 'text-indigo-400 italic';
    else if (isAway && !baseState && !note) subLabelClass = 'text-orange-400';
  } else if (layer === 'space') {
    if (primarySpace) {
      subLabel = primarySpace.label;
      subLabelStyle = { color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.18)' };
    } else {
      subLabel = note;
    }
  }

  return (
    <div
      className={`
        w-28 h-9 border flex flex-row items-stretch select-none relative group transition-all
        ${isPast ? 'border-gray-100 cursor-default opacity-40' : 'border-gray-200 cursor-pointer hover:brightness-95'}
        ${bgClass}
        ${isSelected      ? 'ring-2 ring-blue-500 ring-inset z-10' : ''}
        ${isFillHighlight ? 'ring-2 ring-blue-200 ring-inset z-10 brightness-90' : ''}
        ${isToday && !isSelected && !isFillHighlight ? 'ring-2 ring-gray-900 ring-inset z-20' : ''}
        ${isYearBoundary  ? 'border-l-[3px] border-l-gray-500' : ''}
      `}
      style={{
        ...seamStyle,
        ...(baseBgColor ? { backgroundColor: baseBgColor } : {}),
        ...(cellBackground ? { background: cellBackground } : {}),
        // A soft outer glow makes protected time literally shine — but box-shadow
        // is how the selection/today ring is drawn, so only glow when no ring is active.
        ...(darkSpace && !isSelected && !isFillHighlight && !isToday && !isPast
          ? { boxShadow: `0 0 8px ${rgba(primarySpace.color, 0.55)}`, zIndex: 5 }
          : {}),
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onDoubleClick={onDoubleClick}
    >
      {/* Glossy sheen + soft glow for a committed Space day */}
      {darkSpace && (
        <span className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 28% 18%, rgba(255,255,255,0.45), rgba(255,255,255,0) 62%)' }} />
      )}

      {accentBar}

      {/* Public-holiday marker — base state hides the usual blue cell, so flag it */}
      {isBankHoliday && baseState && (
        <span className="absolute pointer-events-none rounded-full" title="Public holiday"
          style={{ bottom: 2, left: 2, width: 4, height: 4, background: BANKHOL_MARKER }} />
      )}

      {/* Cell content */}
      <div className="relative z-10 flex flex-col justify-center px-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-1 leading-none">
          <span className={`text-[9px] font-medium w-4 shrink-0 ${darkSpace ? 'text-white/80' : 'text-gray-400'}`}>{weekdayAbbr}</span>
          {isToday ? (
            <span className="text-[11px] font-bold text-white leading-none bg-gray-900 rounded px-1 -my-0.5" title="Today">{day}</span>
          ) : (
            <span className={`text-[11px] font-bold leading-none ${darkSpace ? 'text-white' : 'text-gray-700'}`}>{day}</span>
          )}

          {/* Maybe badge — away and space only */}
          {hasMaybes && (
            <span className={`ml-auto text-[8px] font-bold leading-none ${darkSpace ? 'text-white/90' : 'text-indigo-400'}`} title={maybes.join(' · ')}>
              ?{maybes.length > 1 ? maybes.length : ''}
            </span>
          )}

          {/* Build/Rest gem — the reward, front and centre on the Space layer */}
          {layer === 'space' && primarySpace && (
            <span className={hasMaybes ? '' : 'ml-auto'}>
              <SpaceGem it={primarySpace} size={12} bright />
            </span>
          )}
        </div>

        {subLabel && (
          <div
            className={`text-[9px] truncate leading-none mt-0.5 pl-5 font-medium ${Object.keys(subLabelStyle).length === 0 ? subLabelClass : ''}`}
            style={subLabelStyle}
          >
            {subLabel}
          </div>
        )}
      </div>

      {/* Deadline: red top stripe + corner triangle */}
      {hasDeadline && (
        <>
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-500 z-10 pointer-events-none" />
          <div
            className="absolute top-0 right-0 z-10 pointer-events-none"
            title={deadlineLabel ? `Deadline: ${deadlineLabel}` : 'Deadline'}
            style={{ width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 16px 16px 0', borderColor: 'transparent #ef4444 transparent transparent' }}
          />
        </>
      )}

      {/* Away icon — shown on all layers when away flag is set */}
      {isAway && !isPast && (
        <span className="absolute pointer-events-none"
          style={{ top: 2, right: layer === 'away' && hasDeadline ? 18 : 3, fontSize: 8, lineHeight: 1, opacity: 0.7 }}
          title="Away">
          ✈
        </span>
      )}

      {/* Build/Rest gem on non-Space layers — protected time shines everywhere */}
      {layer !== 'space' && primarySpace && !isAway && !isPast && (
        <span className="absolute" style={{ top: 1, right: hasDeadline ? 17 : 2 }}>
          <SpaceGem it={primarySpace} size={12} />
        </span>
      )}

      {/* Busy marker — the day is spoken for. Space days show their gem instead;
          away days show ✈ instead. */}
      {busy && !isAway && !isPast && !primarySpace && (
        <span className="absolute pointer-events-none rounded-full" title="Busy"
          style={{ top: 3, right: hasDeadline ? 18 : 3, width: 5, height: 5, background: 'rgba(55,65,81,0.55)' }} />
      )}

      {/* Fill handle */}
      {hasData && (
        <div
          className="absolute bottom-0 right-0 w-3 h-3 flex items-end justify-end opacity-0 group-hover:opacity-100 transition-opacity z-20"
          title="Drag to fill"
          onMouseDown={e => { e.stopPropagation(); onFillHandleMouseDown && onFillHandleMouseDown(e); }}
        >
          <div className="w-2 h-2 bg-blue-500 rounded-tl-sm cursor-crosshair" />
        </div>
      )}
    </div>
  );
}
