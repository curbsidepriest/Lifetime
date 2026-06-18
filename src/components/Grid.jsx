import React, { useState, useEffect, useRef, useCallback } from 'react';
import DayCell from './DayCell.jsx';
import SelectionPopover from './SelectionPopover.jsx';
import SeasonTimeline from './SeasonTimeline.jsx';
import {
  getRolling12Months, daysInMonth, toDateKey,
  isWeekend, getBerlinHolidays, getMonthName, todayKey,
} from '../utils/dates.js';
import { isRestDay } from '../utils/streams.js';
import { SPACE_TYPES } from '../utils/storage.js';

const REST = SPACE_TYPES.find(s => s.kind === 'rest'); // independent recovery utility
function restRgba(a) { return `rgba(5,150,105,${a})`; } // REST.color #059669

const POPOVER_W = 280;
const POPOVER_H = 520; // conservative max height

function popoverPos(e) {
  const x = Math.min(e.clientX + 12, window.innerWidth - POPOVER_W - 8);
  const spaceBelow = window.innerHeight - e.clientY;
  const y = spaceBelow >= POPOVER_H
    ? e.clientY + 12                          // enough room — open downward
    : Math.max(8, e.clientY - POPOVER_H);     // too close to bottom — flip upward
  return { x, y };
}

function buildHolidaySet(months) {
  const years = [...new Set(months.map(m => m.year))];
  const holidays = new Set();
  for (const year of years) {
    for (const h of getBerlinHolidays(year)) holidays.add(h);
  }
  return holidays;
}

// blockPos for a given cell: looks at the same column above and below
function getBlockPos(baseState, prevBaseState, nextBaseState) {
  if (!baseState) return null;
  const sameAbove = prevBaseState === baseState;
  const sameBelow = nextBaseState === baseState;
  if (sameAbove && sameBelow) return 'mid';
  if (sameAbove) return 'end';
  if (sameBelow) return 'start';
  return 'solo';
}

export default function Grid({ days, onDaysChange, layer = 'away', onLayerChange, leaveTypes = [], onOpenSettings, onOpenResolve, unresolvedCount = 0, canopies = [], onCanopiesChange }) {
  const [showPast, setShowPast] = useState(false);
  const months   = getRolling12Months(showPast);
  const holidays = buildHolidaySet(months);
  const today    = todayKey();
  const leaveTypeMap = Object.fromEntries(leaveTypes.map(t => [t.id, t]));

  // Rest allocations per visible month column (independent of any stream), plus the
  // running total across the visible timeline. A month with zero Rest gets a nudge.
  const restByCol = months.map(({ year, month }) => {
    const dim = daysInMonth(year, month);
    let n = 0;
    for (let d = 1; d <= dim; d++) if (isRestDay(days[toDateKey(year, month, d)])) n++;
    return n;
  });
  const totalRest = restByCol.reduce((a, b) => a + b, 0);

  // ── Selection state ────────────────────────────────────────────────────────
  const [dragStart,  setDragStart]  = useState(null); // active while mouse held
  const [dragEnd,    setDragEnd]    = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selStart,   setSelStart]   = useState(null); // persisted after release
  const [selEnd,     setSelEnd]     = useState(null);
  const [popover,    setPopover]    = useState(null);
  // Tracks whether the mousedown landed inside the current selection
  const clickedInSelRef = useRef(false);

  // ── Fill-handle drag ───────────────────────────────────────────────────────
  const [fillSource,      setFillSource]      = useState(null);
  const [fillEndRow,      setFillEndRow]      = useState(null);
  const [isFillDragging,  setIsFillDragging]  = useState(false);

  const containerRef     = useRef(null);
  const timelineScrollRef = useRef(null);

  // Keep the macro timeline lane horizontally in lockstep with the day grid.
  function syncTimelineScroll() {
    if (timelineScrollRef.current && containerRef.current) {
      timelineScrollRef.current.scrollLeft = containerRef.current.scrollLeft;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getSelectedKeys(start, end) {
    if (!start || !end) return [];
    const minCol = Math.min(start.colIdx, end.colIdx);
    const maxCol = Math.max(start.colIdx, end.colIdx);
    const minRow = Math.min(start.rowIdx, end.rowIdx);
    const maxRow = Math.max(start.rowIdx, end.rowIdx);
    const keys = [];
    for (let col = minCol; col <= maxCol; col++) {
      const { year, month } = months[col];
      const dim = daysInMonth(year, month);
      for (let row = minRow; row <= maxRow; row++) {
        const day = row + 1;
        if (day <= dim) keys.push(toDateKey(year, month, day));
      }
    }
    return keys;
  }

  // Fill range: same column, rows between source and current end
  function getFillKeys(source, endRow) {
    if (!source || endRow == null) return [];
    const { colIdx, rowIdx } = source;
    const { year, month } = months[colIdx];
    const dim = daysInMonth(year, month);
    const minRow = Math.min(rowIdx, endRow);
    const maxRow = Math.max(rowIdx, endRow);
    const keys = [];
    for (let row = minRow; row <= maxRow; row++) {
      const day = row + 1;
      if (day <= dim) keys.push(toDateKey(year, month, day));
    }
    return keys;
  }

  // What's visually highlighted: live drag range > popover keys > persisted selection
  const liveKeys = isDragging ? getSelectedKeys(dragStart, dragEnd) : [];
  const displaySelectedSet = new Set(
    isDragging     ? liveKeys          :
    popover        ? popover.keys      :
    /* else */       getSelectedKeys(selStart, selEnd)
  );

  const fillKeys   = isFillDragging && fillSource ? getFillKeys(fillSource, fillEndRow) : [];
  const fillKeySet = new Set(fillKeys);

  // ── Event handlers ─────────────────────────────────────────────────────────
  function handleMouseDown(colIdx, rowIdx, key, e) {
    const currentSelKeys = getSelectedKeys(selStart, selEnd);
    const insideSel = key != null && currentSelKeys.includes(key);
    clickedInSelRef.current = insideSel;

    if (insideSel) {
      // Click inside existing selection — don't restart drag.
      // Selection stays intact; double-click will open the popover for all of it.
      setPopover(null);
      return;
    }

    // Click outside — start a new drag/selection
    setDragStart({ colIdx, rowIdx });
    setDragEnd({ colIdx, rowIdx });
    setIsDragging(true);
    setPopover(null);
  }

  function handleDoubleClick(key, e) {
    // Open popover for the full selection if this cell is in it; else just this cell
    const currentSelKeys = getSelectedKeys(selStart, selEnd);
    const keysToEdit = currentSelKeys.length > 1 && currentSelKeys.includes(key)
      ? currentSelKeys
      : [key];
    const { x, y } = popoverPos(e);
    setPopover({ position: { x, y }, keys: keysToEdit });
  }

  function handleMouseEnter(colIdx, rowIdx) {
    if (isDragging) setDragEnd({ colIdx, rowIdx });
    if (isFillDragging && fillSource && fillSource.colIdx === colIdx) {
      setFillEndRow(rowIdx);
    }
  }

  function handleFillHandleMouseDown(colIdx, rowIdx, dayData, e) {
    e.preventDefault();
    setIsDragging(false);
    setIsFillDragging(true);
    setFillSource({
      colIdx, rowIdx,
      data: dayData || { baseState: null, tags: [], note: '', maybes: [] },
    });
    setFillEndRow(rowIdx);
    setPopover(null);
  }

  useEffect(() => {
    function handleMouseUp(e) {
      // ── End selection drag ────────────────────────────────────────────────
      if (isDragging) {
        setIsDragging(false);
        const wasDrag = dragStart && dragEnd &&
          (dragStart.colIdx !== dragEnd.colIdx || dragStart.rowIdx !== dragEnd.rowIdx);

        if (wasDrag) {
          // Multi-cell drag → persist selection, NO auto-popover
          setSelStart(dragStart);
          setSelEnd(dragEnd);
        } else {
          // Single click
          if (clickedInSelRef.current) {
            // Clicked inside existing selection — keep it (enables double-click on range)
          } else {
            // Clicked outside selection — new single-cell selection
            setSelStart(dragStart);
            setSelEnd(dragEnd);
          }
        }
        return;
      }
      // ── End fill drag ─────────────────────────────────────────────────────
      if (isFillDragging) {
        setIsFillDragging(false);
        const keys = getFillKeys(fillSource, fillEndRow);
        if (keys.length > 1 && fillSource?.data) {
          const updates = {};
          for (const key of keys) updates[key] = { ...fillSource.data };
          onDaysChange({ ...days, ...updates });
        }
        setFillSource(null);
        setFillEndRow(null);
      }
    }
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging, dragStart, dragEnd, isFillDragging, fillSource, fillEndRow, days]);

  // ── Keyboard: ESC to deselect, Delete/Backspace to clear layer ───────────────
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setSelStart(null);
        setSelEnd(null);
        setPopover(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selStart || selEnd) && !popover) {
        const keys = getSelectedKeys(selStart, selEnd).filter(k => k >= today);
        if (!keys.length) return;
        const updates = {};
        for (const key of keys) {
          const ex = days[key] || {};
          if (layer === 'away') {
            updates[key] = { ...ex, baseState: null, maybes: [],
              tags: (ex.tags || []).filter(t => !(t?.type === 'deadline' || t === 'deadline')) };
          } else {
            updates[key] = { ...ex, maybes: [],
              tags: (ex.tags || []).filter(t => t?.type !== 'space' && t?.type !== 'intention') };
          }
        }
        onDaysChange({ ...days, ...updates });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selStart, selEnd, popover, days, layer, today, onDaysChange]);

  function closePopover() {
    setPopover(null);
    // Keep selStart/selEnd so the selection stays visible after editing
  }

  // Patch: update days but keep popover open (tags, notes, maybes)
  function handlePatch(updates) {
    onDaysChange({ ...days, ...updates });
  }

  // Commit: update days and close (clear all, or explicit done)
  function handleCommit(updates) {
    if (updates) onDaysChange({ ...days, ...updates });
    closePopover();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-4 py-2.5 border-b border-gray-200 bg-white shrink-0">
        {[
          { id: 'away',  label: 'Away',  icon: '✈' },
          { id: 'space', label: 'Space', icon: '◆' },
        ].map(tab => (
          <button key={tab.id} onClick={() => onLayerChange(tab.id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              layer === tab.id
                ? 'bg-gray-900 text-white'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}>
            <span>{tab.icon}</span>{tab.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setShowPast(p => !p)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              showPast ? 'bg-gray-200 text-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}>
            {showPast ? '← Hide past' : 'Show past'}
          </button>
          <button onClick={onOpenResolve} title="Loose ends — resolve possibilities"
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all text-indigo-500 hover:bg-indigo-50">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            Loose ends
            {unresolvedCount > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center text-[10px] font-bold text-white bg-indigo-500 rounded-full"
                style={{ minWidth: 16, height: 16, padding: '0 4px' }}>
                {unresolvedCount}
              </span>
            )}
          </button>
          <button onClick={onOpenSettings} title="Settings"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Macro "Season / Chapter" timeline — pinned above the grid, scrolls with it */}
      <div ref={timelineScrollRef}
        className="overflow-x-hidden shrink-0 bg-white border-b border-gray-200 pt-2 pb-1.5 px-4">
        <SeasonTimeline
          months={months}
          canopies={canopies}
          onCanopiesChange={onCanopiesChange}
          days={days}
        />
      </div>

      {/* Scrollable grid area */}
      <div className="flex-1 overflow-auto p-4" ref={containerRef} onScroll={syncTimelineScroll}>
      <div className="inline-flex">
        {/* Row header */}
        <div className="flex flex-col mr-1">
          <div className="h-9 w-8 mb-px" />
          {Array.from({ length: 31 }, (_, i) => (
            <div key={i}
              className="h-9 w-8 flex items-center justify-end pr-1 text-xs text-gray-400 font-medium"
              style={i > 0 ? { marginTop: '-1px' } : {}}>
              {i + 1}
            </div>
          ))}
          {/* Recovery row total — Rest days across the visible timeline */}
          <div className="h-6 w-8 mt-1 flex items-center justify-end pr-1 border-t border-gray-100"
            title={`${totalRest} Rest day${totalRest === 1 ? '' : 's'} across the visible range`}>
            <span className="text-[9px] font-bold leading-none flex items-center gap-px"
              style={{ color: totalRest > 0 ? REST.color : '#cbd5e1' }}>
              <span style={totalRest > 0 ? { textShadow: `0 0 5px ${restRgba(0.7)}` } : {}}>{REST.icon}</span>
              {totalRest}
            </span>
          </div>
        </div>

        {/* Month columns */}
        {months.map(({ year, month, isPast }, colIdx) => {
          const dim = daysInMonth(year, month);

          // Pre-build baseState array for this column to compute blockPos
          const colBaseStates = Array.from({ length: 31 }, (_, rowIdx) => {
            const day = rowIdx + 1;
            if (day > dim) return null;
            const key = toDateKey(year, month, day);
            return days[key]?.baseState ?? null;
          });

          const isYearBoundary = month === 0 && colIdx > 0;
          // Quarter start chips: Q1=Jan(0), Q2=Apr(3), Q3=Jul(6), Q4=Oct(9)
          const quarterNum = month === 0 ? 1 : month === 3 ? 2 : month === 6 ? 3 : month === 9 ? 4 : null;

          return (
            <div key={`${year}-${month}`} className={`flex flex-col mr-px ${isYearBoundary ? 'ml-4' : ''}`}>
              {/* Month header — year boundary gets a bold top border + prominent year label */}
              <div className={`h-9 w-28 flex flex-col items-center justify-center border mb-px relative
                ${isPast ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-200'}
                ${isYearBoundary ? 'border-l-[3px] border-l-gray-500' : ''}
              `}>
                {isYearBoundary ? (
                  <>
                    <span className="text-[10px] font-black text-gray-600 leading-none tracking-wide">{year}</span>
                    <span className={`text-[8px] leading-none mt-0.5 ${isPast ? 'text-gray-300' : 'text-gray-400'}`}>
                      {getMonthName(month).slice(0, 3).toUpperCase()}
                    </span>
                  </>
                ) : (
                  <>
                    <span className={`text-[9px] font-bold leading-none ${isPast ? 'text-gray-300' : 'text-gray-600'}`}>
                      {getMonthName(month).slice(0, 3).toUpperCase()}
                    </span>
                    <span className={`text-[8px] leading-none ${isPast ? 'text-gray-300' : 'text-gray-400'}`}>{year}</span>
                  </>
                )}
                {/* Quarter chip */}
                {quarterNum && (
                  <span className={`absolute top-1 right-1 text-[7px] font-black leading-none px-0.5 py-px rounded
                    ${isPast ? 'text-gray-300 bg-gray-100' : 'text-indigo-400 bg-indigo-50'}`}>
                    Q{quarterNum}
                  </span>
                )}
              </div>

              {/* Day cells */}
              {Array.from({ length: 31 }, (_, rowIdx) => {
                const day        = rowIdx + 1;
                const valid      = day <= dim;
                const key        = valid ? toDateKey(year, month, day) : null;
                const weekend    = valid ? isWeekend(year, month, day) : false;
                const bankHol    = valid ? holidays.has(key) : false;
                const dayData    = valid ? days[key] : null;

                const blockPos   = valid ? getBlockPos(
                  colBaseStates[rowIdx],
                  colBaseStates[rowIdx - 1] ?? null,
                  colBaseStates[rowIdx + 1] ?? null,
                ) : null;

                const isDayPast = valid && key < today;

                return (
                  // Uniform -1px top margin on every row >0 so ALL columns share identical
                  // total height regardless of block lengths — this is what keeps the grid aligned.
                  <div key={rowIdx} style={rowIdx > 0 ? { marginTop: '-1px' } : {}}>
                    <DayCell
                      year={year} month={month} day={day} valid={valid}
                      dayData={dayData}
                      isWeekend={weekend}
                      isBankHoliday={bankHol}
                      isSelected={valid && displaySelectedSet.has(key)}
                      isFillHighlight={valid && fillKeySet.has(key)}
                      isToday={valid && key === today}
                      blockPos={blockPos}
                      isPast={isDayPast}
                      isYearBoundary={isYearBoundary}
                      onMouseDown={valid ? e => handleMouseDown(colIdx, rowIdx, key, e) : undefined}
                      onMouseEnter={valid ? () => handleMouseEnter(colIdx, rowIdx) : undefined}
                      onDoubleClick={valid ? e => handleDoubleClick(key, e) : undefined}
                      onFillHandleMouseDown={valid ? e => handleFillHandleMouseDown(colIdx, rowIdx, dayData, e) : undefined}
                      layer={layer}
                      leaveTypeMap={leaveTypeMap}
                    />
                  </div>
                );
              })}

              {/* Recovery footer — Rest count, or a gentle nudge if this month has none */}
              {(() => {
                const restCount = restByCol[colIdx];
                return (
                  <div className="h-6 w-28 mt-1 flex items-center justify-center border-t border-gray-100"
                    title={restCount > 0
                      ? `${restCount} Rest day${restCount === 1 ? '' : 's'} this month`
                      : isPast ? '' : 'No Rest scheduled this month — protect some recovery time'}>
                    {restCount > 0 ? (
                      <span className="text-[10px] font-semibold leading-none flex items-center gap-0.5"
                        style={{ color: REST.color }}>
                        <span style={{ textShadow: `0 0 6px ${restRgba(0.75)}` }}>{REST.icon}</span>
                        {restCount > 1 && <span className="text-[8px]">{restCount}</span>}
                      </span>
                    ) : !isPast ? (
                      <span className="rounded-full" aria-hidden
                        style={{ width: 7, height: 7, border: `1px dashed ${restRgba(0.4)}`, opacity: 0.7 }} />
                    ) : null}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {popover && (
        <SelectionPopover
          position={popover.position}
          selectedKeys={popover.keys}
          days={days}
          leaveTypes={leaveTypes}
          onPatch={handlePatch}
          onCommit={handleCommit}
          onClose={closePopover}
          layer={layer}
          canopies={canopies}
        />
      )}
      </div>
    </div>
  );
}
