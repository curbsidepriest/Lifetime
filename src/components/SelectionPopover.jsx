import React, { useState, useRef, useEffect } from 'react';
import { SPACE_TYPES } from '../utils/storage.js';

function hexToRgb(hex) {
  if (typeof hex !== 'string') return { r: 156, g: 163, b: 175 };
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return { r: 156, g: 163, b: 175 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgba(hex, a) { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

function blank() { return { baseState: null, tags: [], note: '', maybes: [], away: false }; }

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{children}</p>
  );
}

export default function SelectionPopover({ position, selectedKeys, days, leaveTypes = [], onPatch, onCommit, onClose, canopies = [] }) {
  const singleKey = selectedKeys.length === 1 ? selectedKeys[0] : null;

  // The macro "Season / Chapter" (canopy) covering this selection, if any.
  const activeCanopy = canopies.find(c =>
    c.start && c.end && selectedKeys.some(k => k >= c.start && k <= c.end)
  ) || null;

  const [maybeInput,        setMaybeInput]        = useState('');
  const [note,              setNote]              = useState('');
  const [deadlineInput,     setDeadlineInput]     = useState('');
  const [showDeadlineInput, setShowDeadlineInput] = useState(false);
  const noteRef  = useRef(note);

  useEffect(() => {
    const fresh = singleKey ? (days[singleKey]?.note || '') : '';
    if (fresh !== noteRef.current) { setNote(fresh); noteRef.current = fresh; }
  }, [singleKey, days]);

  const ref = useRef(null);
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // ── patch ─────────────────────────────────────────────────────────────────
  function patch(fn) {
    const updates = {};
    for (const key of selectedKeys) updates[key] = fn(days[key] || blank(), key);
    onPatch(updates);
  }

  // ── leave state ───────────────────────────────────────────────────────────
  function applyBaseState(state) { patch(ex => ({ ...ex, baseState: state })); }
  function clearBase()           { patch(ex => ({ ...ex, baseState: null })); }

  // ── deadline ──────────────────────────────────────────────────────────────
  function setDeadline(label) {
    patch(ex => ({
      ...ex,
      tags: [...(ex.tags || []).filter(t => !(t?.type === 'deadline' || t === 'deadline')),
             { type: 'deadline', label: label.trim() }],
    }));
    setDeadlineInput('');
    setShowDeadlineInput(false);
  }
  function removeDeadline() {
    patch(ex => ({ ...ex, tags: (ex.tags || []).filter(t => !(t?.type === 'deadline' || t === 'deadline')) }));
  }

  // ── note ──────────────────────────────────────────────────────────────────
  function saveNote() {
    if (!singleKey) return;
    onPatch({ [singleKey]: { ...(days[singleKey] || blank()), note: note.trim() } });
    noteRef.current = note.trim();
  }

  // ── maybes ────────────────────────────────────────────────────────────────
  function addMaybe() {
    const val = maybeInput.trim();
    if (!val) return;
    patch(ex => {
      const ms = ex.maybes || [];
      return ms.includes(val) ? ex : { ...ex, maybes: [...ms, val] };
    });
    setMaybeInput('');
  }
  function removeMaybe(opt)  { patch(ex => ({ ...ex, maybes: (ex.maybes || []).filter(m => m !== opt) })); }
  function resolveAs(opt)    { patch(ex => ({ ...ex, note: ex.note || opt, maybes: [] })); }

  // ── space (build/rest — mutually exclusive) ───────────────────────────────
  function toggleSpace(kind) {
    const opposite = kind === 'build' ? 'rest' : 'build';
    patch(ex => {
      const tags  = ex.tags || [];
      const hasIt = tags.some(t => (t?.type === 'space' || t?.type === 'intention') && t.kind === kind);
      const stripped = tags.filter(t => !((t?.type === 'space' || t?.type === 'intention') && (t.kind === kind || t.kind === opposite)));
      return {
        ...ex,
        tags: hasIt ? stripped : [...stripped, { type: 'space', kind }],
      };
    });
  }

  // ── away ──────────────────────────────────────────────────────────────────
  function setAwayFlag(val) { patch(ex => ({ ...ex, away: val })); }

  // ── clear all ─────────────────────────────────────────────────────────────
  function clearAll() {
    const updates = {};
    for (const key of selectedKeys) updates[key] = blank();
    onCommit(updates);
  }

  // ── derived ───────────────────────────────────────────────────────────────
  const currentBaseState = (() => {
    const states = selectedKeys.map(k => days[k]?.baseState || null);
    return states.every(s => s === states[0]) ? states[0] : 'mixed';
  })();
  const currentAway = selectedKeys.every(k => days[k]?.away === true);
  const buildActive = selectedKeys.length > 0 && selectedKeys.every(k =>
    (days[k]?.tags || []).some(t => (t?.type === 'space' || t?.type === 'intention') && t.kind === 'build')
  );
  const allMaybes   = [...new Set(selectedKeys.flatMap(k => days[k]?.maybes || []))];
  const existingDeadline = singleKey
    ? (days[singleKey]?.tags || []).find(t => t?.type === 'deadline' || t === 'deadline')
    : null;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: position.y, left: position.x, zIndex: 1000, width: 280 }}
      className="bg-white border border-gray-200 rounded-xl shadow-xl flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex justify-between items-center px-4 pt-3.5 pb-2.5 border-b border-gray-100 shrink-0">
        <span className="text-xs font-semibold text-gray-600">
          {selectedKeys.length} day{selectedKeys.length !== 1 ? 's' : ''}
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ maxHeight: 'calc(90vh - 60px)' }}>

        {/* ── Active season (canopy) ────────────────────────────────────────── */}
        {activeCanopy && (
          <div className="flex items-center gap-1.5 -mt-0.5" title="Macro season covering these days">
            <span className="inline-block rounded-full shrink-0"
              style={{ width: 5, height: 5, background: activeCanopy.color }} />
            <span className="text-[10px] tracking-wide truncate" style={{ color: rgba('#6b7280', 0.75) }}>
              {activeCanopy.title}
            </span>
          </div>
        )}

        {/* ── Location ──────────────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Location</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={() => setAwayFlag(false)}
              className={`text-xs py-1.5 px-3 rounded-lg font-semibold border transition-all ${
                !currentAway ? 'bg-gray-900 text-white border-transparent' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}>
              🏠 Home
            </button>
            <button onClick={() => setAwayFlag(true)}
              className={`text-xs py-1.5 px-3 rounded-lg font-semibold border transition-all ${
                currentAway ? 'bg-orange-500 text-white border-transparent' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}>
              ✈ Away
            </button>
          </div>
        </div>

        <div className="border-t border-gray-100" />

        {/* ── Leave ─────────────────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Leave</SectionLabel>
          {leaveTypes.length === 0 ? (
            <p className="text-[10px] text-gray-400 italic">No leave types — add some in Settings.</p>
          ) : (
            <div className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${Math.min(leaveTypes.length, 3)}, minmax(0,1fr))` }}>
              {leaveTypes.map(t => {
                const active = currentBaseState === t.id;
                return (
                  <button key={t.id}
                    onClick={() => active ? clearBase() : applyBaseState(t.id)}
                    className="text-xs py-1.5 px-2 rounded-md font-medium text-gray-700 transition-all"
                    style={{
                      background: rgba(t.color, 0.55),
                      boxShadow: active ? `0 0 0 2px ${rgba(t.color, 0.95)}` : 'none',
                    }}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
          {currentBaseState && currentBaseState !== 'mixed' && (
            <button onClick={clearBase}
              className="mt-1.5 w-full text-xs py-1 px-2 rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors">
              Clear leave
            </button>
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* ── Space ─────────────────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Space</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {SPACE_TYPES.map(it => {
              const hasIt = selectedKeys.every(k =>
                (days[k]?.tags || []).some(t => (t?.type === 'space' || t?.type === 'intention') && t.kind === it.kind)
              );
              return (
                <button key={it.kind} onClick={() => toggleSpace(it.kind)}
                  className={`text-xs py-1.5 px-3 rounded-lg text-left flex items-center gap-2 border transition-all font-semibold ${
                    hasIt ? 'border-transparent text-white' : 'border-gray-200 text-gray-700 bg-white hover:bg-gray-50'
                  }`}
                  style={hasIt ? { background: it.color } : {}}>
                  <span style={{ fontSize: 11, color: hasIt ? 'white' : it.color }}>{it.icon}</span>
                  {it.label}
                </button>
              );
            })}
          </div>
          {buildActive && (
            <p className="mt-1.5 text-[10px] leading-snug text-blue-500/80 bg-blue-50 border border-blue-100 rounded-md px-2 py-1">
              {activeCanopy
                ? <>This Build block feeds directly into your <span className="font-semibold">{activeCanopy.title}</span> season goal.</>
                : <>This Build block feeds directly into the overarching season goal.</>}
            </p>
          )}
        </div>

        <div className="border-t border-gray-100" />

        {/* ── What's on ─────────────────────────────────────────────────────── */}
        {singleKey && (
          <div>
            <SectionLabel>What's on</SectionLabel>
            <input type="text" value={note}
              onChange={e => { setNote(e.target.value); noteRef.current = e.target.value; }}
              onKeyDown={e => e.key === 'Enter' && saveNote()}
              onBlur={saveNote}
              placeholder="What's on? e.g. dinner with Sam"
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-400 placeholder-gray-400"
            />
          </div>
        )}

        {/* ── Deadline ──────────────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Deadline</SectionLabel>
          {existingDeadline ? (
            <div className="flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-lg border bg-red-50 border-red-200 text-red-700">
              <span className="shrink-0">🔴</span>
              <input
                type="text"
                defaultValue={existingDeadline?.label || ''}
                onBlur={e => setDeadline(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setDeadline(e.target.value)}
                placeholder="What's due?"
                className="flex-1 bg-transparent outline-none text-red-700 placeholder-red-300 min-w-0 font-medium"
              />
              <button onClick={removeDeadline} className="text-red-300 hover:text-red-500 text-sm leading-none shrink-0">×</button>
            </div>
          ) : showDeadlineInput ? (
            <div className="flex gap-1">
              <input autoFocus type="text" value={deadlineInput}
                onChange={e => setDeadlineInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') setDeadline(deadlineInput); if (e.key === 'Escape') setShowDeadlineInput(false); }}
                placeholder="What's due?"
                className="flex-1 text-xs border border-red-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-red-500 bg-red-50 text-red-700 placeholder-red-300"
              />
              <button onClick={() => setDeadline(deadlineInput)} className="text-xs bg-red-500 text-white px-2.5 py-1.5 rounded-lg hover:bg-red-600 font-semibold">Add</button>
              <button onClick={() => setShowDeadlineInput(false)} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
            </div>
          ) : (
            <button onClick={() => setShowDeadlineInput(true)}
              className="flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-lg w-full text-left border border-dashed border-red-200 hover:bg-red-50 text-red-400 transition-colors">
              🔴 + Add deadline
            </button>
          )}
        </div>

        {/* ── Possibilities ─────────────────────────────────────────────────── */}
        <div>
          <SectionLabel>Possibilities <span className="text-indigo-300 font-normal normal-case tracking-normal">— uncertain</span></SectionLabel>
          {allMaybes.length > 0 && (
            <div className="flex flex-col gap-1 mb-1.5">
              {allMaybes.map(opt => (
                <div key={opt} className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 rounded-md px-2 py-1">
                  <span className="text-[10px] font-medium text-indigo-500 mr-auto truncate">? {opt}</span>
                  <button onClick={() => resolveAs(opt)} className="text-[9px] text-indigo-400 hover:text-green-500 font-bold shrink-0 mr-1" title="Resolve">✓</button>
                  <button onClick={() => removeMaybe(opt)} className="text-[10px] text-gray-300 hover:text-red-400 shrink-0">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <input type="text" value={maybeInput}
              onChange={e => setMaybeInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addMaybe()}
              placeholder="Add a possibility…"
              className="flex-1 text-xs border border-indigo-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400 bg-indigo-50 placeholder-indigo-300"
            />
            <button onClick={addMaybe} disabled={!maybeInput.trim()}
              className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-600 px-2.5 py-1.5 rounded-lg disabled:opacity-40">
              Add
            </button>
          </div>
        </div>

        {/* ── Clear all ─────────────────────────────────────────────────────── */}
        <button onClick={clearAll}
          className="w-full text-xs py-1.5 px-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors mt-1">
          Clear all
        </button>

      </div>
    </div>
  );
}
