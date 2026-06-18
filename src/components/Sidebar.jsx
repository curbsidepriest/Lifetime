import React, { useState } from 'react';
import { getBudgetsForYear, SPACE_TYPES, CANOPY_COLORS } from '../utils/storage.js';
import { scheduleIntentions } from '../utils/schedule.js';
import { daysInMonth, toDateKey } from '../utils/dates.js';

const DARK = {
  bg:          '#111827',
  border:      '#374151',
  muted:       '#6b7280',
  dim:         '#9ca3af',
  secondary:   '#d1d5db',
  primary:     '#f3f4f6',
  bright:      '#ffffff',
  placeholder: 'rgba(255,255,255,0.35)',
};

function quarterTarget(cfg) {
  return cfg.period === 'week' ? cfg.target * 13 : cfg.target;
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function DarkBar({ used, total, color }) {
  const pct  = total ? Math.min((used / total) * 100, 100) : 0;
  const over = total != null && used > total;
  return (
    <div className="h-0.5 rounded-full overflow-hidden" style={{ background: DARK.border }}>
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: over ? '#f87171' : color }} />
    </div>
  );
}

// ── Stat row ──────────────────────────────────────────────────────────────────
function StatRow({ label, used, total, color, warn, warnMsg }) {
  const over = total != null && used > total;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between">
        <span style={{ fontSize: 10, color: DARK.dim }}>{label}</span>
        <div className="flex items-baseline gap-1">
          <span style={{ fontSize: 13, fontWeight: 700, color: DARK.bright, lineHeight: 1 }}>{used}</span>
          {total != null && <span style={{ fontSize: 10, color: DARK.muted }}>/ {total}</span>}
        </div>
      </div>
      {total != null && <DarkBar used={used} total={total} color={color} />}
      {total != null && (
        <span style={{ fontSize: 10, color: over ? '#f87171' : DARK.dim }}>
          {over ? `${used - total}d over` : `${total - used}d left`}
        </span>
      )}
      {warn && warnMsg && <span style={{ fontSize: 10, color: '#f87171' }}>{warnMsg}</span>}
    </div>
  );
}

// ── Away/Home bar ─────────────────────────────────────────────────────────────
function AwayHomeBar({ awayDays, year }) {
  const today    = new Date();
  const totalDays = 365;
  const homeDays  = Math.max(0, totalDays - awayDays);
  const awayPct = Math.min(100, (awayDays / totalDays) * 100);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Split bar */}
      <div className="flex rounded-full overflow-hidden" style={{ height: 6, background: DARK.border }}>
        <div style={{ width: `${awayPct}%`, background: '#f97316', transition: 'width 0.4s' }} />
      </div>
      {/* Labels */}
      <div className="flex justify-between items-baseline">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: '#f97316' }} />
          <span style={{ fontSize: 10, color: DARK.secondary }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: DARK.bright }}>{awayDays}</span>
            {' '}away
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: 10, color: DARK.dim }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: DARK.secondary }}>{homeDays}</span>
            {' '}home
          </span>
          <div className="w-2 h-2 rounded-full" style={{ background: DARK.border }} />
        </div>
      </div>
    </div>
  );
}

// ── Year section ──────────────────────────────────────────────────────────────
function YearSection({ year, yearStats, budgets, leaveTypes, isOpen, onToggle }) {
  const { budget, consumed } = getBudgetsForYear(budgets, leaveTypes, year);
  const isOverride = budgets.perYear?.[year];
  const usedOf     = id => (yearStats.used?.[id] || 0) + (consumed[id] || 0);

  return (
    <div>
      {/* Year header — always visible, click to toggle */}
      <button onClick={onToggle}
        className="w-full flex items-center justify-between group mb-1.5"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 10, fontWeight: 900, color: DARK.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {year}
          </span>
          {isOverride && <span style={{ fontSize: 9, color: '#fbbf24', fontWeight: 600 }}>custom limits</span>}
          {/* Mini summary when collapsed */}
          {!isOpen && (
            <span style={{ fontSize: 9, color: DARK.muted }}>
              {leaveTypes.slice(0, 2).map(t => `${usedOf(t.id)}${t.label[0].toLowerCase()}`).join(' · ')}
              {leaveTypes.length ? ' · ' : ''}{yearStats.away}d away
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: DARK.muted, lineHeight: 1 }}>
          {isOpen ? '▾' : '▸'}
        </span>
      </button>

      {isOpen && (
        <>
          {/* Leave budget */}
          <div className="flex flex-col gap-2.5 mb-4">
            {leaveTypes.length === 0 && (
              <span style={{ fontSize: 10, color: DARK.muted }}>No leave types configured.</span>
            )}
            {leaveTypes.map(t => {
              const streak = yearStats.maxConsecutive?.[t.id] || 0;
              const over   = t.maxConsecutive != null && streak > t.maxConsecutive;
              return (
                <StatRow key={t.id} label={t.label} used={usedOf(t.id)} total={budget[t.id]} color={t.color}
                  warn={over} warnMsg={over ? `Longest streak: ${streak}d` : null} />
              );
            })}
          </div>

          {/* Home vs Away */}
          <div className="pt-3 border-t" style={{ borderColor: DARK.border }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: DARK.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Location
            </p>
            <AwayHomeBar awayDays={yearStats.away} year={year} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Space section (Build + Rest health bar) ───────────────────────────────────
function SpaceSection({ stats, spaceTargets, days, onDaysChange }) {
  const today     = new Date();
  const thisYear  = today.getFullYear();
  const thisMonth = today.getMonth();

  // Collect last 4 weeks of data for a rolling health view
  const last4Keys = [];
  for (let w = 3; w >= 0; w--) {
    const d = new Date(today);
    d.setDate(d.getDate() - w * 7 - today.getDay()); // Sunday of each week
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    last4Keys.push(mKey);
  }

  // Sum build + rest for the rolling window
  const windowCounts = { build: 0, rest: 0 };
  for (const mKey of [...new Set(last4Keys)]) {
    const m = stats.spaceByMonth?.[mKey] || {};
    windowCounts.build += m.build || 0;
    windowCounts.rest  += m.rest  || 0;
  }

  // Target for 4 weeks
  const buildTarget4 = (spaceTargets.build?.target || 2) * 4;
  const restTarget4  = (spaceTargets.rest?.target  || 1) * 4;
  const total        = windowCounts.build + windowCounts.rest;

  // Nudge logic
  let nudge = null;
  if (windowCounts.build === 0 && windowCounts.rest === 0) {
    nudge = { text: 'No protected time in the last 4 weeks.', color: '#f87171' };
  } else if (windowCounts.rest === 0) {
    nudge = { text: 'No Rest days recently — running on empty.', color: '#fbbf24' };
  } else if (windowCounts.build === 0) {
    nudge = { text: 'No Build time recently — what will you make?', color: '#60a5fa' };
  } else if (total >= buildTarget4 + restTarget4) {
    nudge = { text: 'Good rhythm. Keep protecting this time.', color: '#4ade80' };
  }

  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [schedKind,     setSchedKind]     = useState('build');
  const [schedYear,     setSchedYear]     = useState(thisYear);
  const [schedQ,        setSchedQ]        = useState(Math.floor(thisMonth / 3) + 1);
  const [schedResult,   setSchedResult]   = useState(null);

  function handleSchedule() {
    const tgt = spaceTargets[schedKind]?.target || 2;
    const updated = scheduleIntentions({ days, kind: schedKind, year: schedYear, quarter: schedQ, targetCount: tgt * 13 });
    if (!updated) {
      setSchedResult('empty');
    } else {
      onDaysChange(updated);
      const added = Object.keys(updated).filter(k =>
        (updated[k]?.tags || []).some(t => t.kind === schedKind) &&
        !(days[k]?.tags || []).some(t => t.kind === schedKind)
      ).length;
      setSchedResult(`success:${added}`);
    }
    setTimeout(() => { setSchedResult(null); setSchedulerOpen(false); }, 2000);
  }

  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 900, color: DARK.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        Space — last 4 weeks
      </p>

      <div className="flex flex-col gap-3 mb-4">
        {SPACE_TYPES.map(it => {
          const count  = windowCounts[it.kind] || 0;
          const target = it.kind === 'build' ? buildTarget4 : restTarget4;
          return (
            <div key={it.kind} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span style={{ color: it.color, fontSize: 11, lineHeight: 1 }}>{it.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: DARK.secondary }}>{it.label}</span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span style={{ fontSize: 14, fontWeight: 700, color: DARK.bright, lineHeight: 1 }}>{count}</span>
                  <span style={{ fontSize: 9, color: DARK.muted }}>/ {target} days</span>
                </div>
              </div>
              <DarkBar used={count} total={target} color={it.color} />
            </div>
          );
        })}
      </div>

      {nudge && (
        <p style={{ fontSize: 10, color: nudge.color, marginBottom: 12, lineHeight: 1.4, fontStyle: 'italic' }}>
          {nudge.text}
        </p>
      )}

      {schedulerOpen ? (
        <div className="flex flex-col gap-2 p-2.5 rounded-lg"
          style={{ background: '#0f172a', border: `1px solid ${DARK.border}` }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: DARK.secondary }}>Fill in space</span>
          <div className="flex gap-1.5">
            <select value={schedKind} onChange={e => setSchedKind(e.target.value)}
              className="flex-1 rounded px-2 py-1.5 outline-none border"
              style={{ fontSize: 10, background: DARK.border, borderColor: DARK.muted, color: DARK.primary }}>
              {SPACE_TYPES.map(it => <option key={it.kind} value={it.kind}>{it.label}</option>)}
            </select>
            <select value={schedQ} onChange={e => setSchedQ(parseInt(e.target.value))}
              className="rounded px-2 py-1.5 outline-none border"
              style={{ fontSize: 10, background: DARK.border, borderColor: DARK.muted, color: DARK.primary }}>
              {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
            </select>
            <select value={schedYear} onChange={e => setSchedYear(parseInt(e.target.value))}
              className="rounded px-2 py-1.5 outline-none border"
              style={{ fontSize: 10, background: DARK.border, borderColor: DARK.muted, color: DARK.primary }}>
              {[thisYear, thisYear+1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {schedResult ? (
            <p style={{ fontSize: 10, color: schedResult.startsWith('success') ? '#4ade80' : '#fbbf24', textAlign: 'center' }}>
              {schedResult.startsWith('success') ? `✓ Placed ${schedResult.split(':')[1]} days` : 'No free slots found'}
            </p>
          ) : (
            <div className="flex gap-1.5">
              <button onClick={handleSchedule}
                className="flex-1 rounded px-2 py-1.5 font-semibold"
                style={{ fontSize: 10, background: '#2563eb', color: 'white' }}>
                Place
              </button>
              <button onClick={() => setSchedulerOpen(false)}
                style={{ fontSize: 10, color: DARK.dim, padding: '4px 8px' }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => setSchedulerOpen(true)}
          style={{ fontSize: 10, color: DARK.muted }}
          onMouseEnter={e => (e.currentTarget.style.color = DARK.secondary)}
          onMouseLeave={e => (e.currentTarget.style.color = DARK.muted)}>
          + Auto-fill quarter…
        </button>
      )}
    </div>
  );
}

// ── Superpositions hopper ───────────────────────────────────────────────────────
// A clutter-free home for macro ideas ("Season / Chapter" canopies) that haven't
// yet been collapsed onto specific calendar boundaries. Each lives here with a
// dashed outline and a soft "?" until it's given a start + end elsewhere.
function SuperpositionsHopper({ canopies = [], onCanopiesChange }) {
  const [open, setOpen]   = useState(true);
  const [input, setInput] = useState('');

  const loose = canopies.filter(c => !c.start || !c.end);

  function addSuperposition() {
    const title = input.trim();
    if (!title) return;
    const color = CANOPY_COLORS[canopies.length % CANOPY_COLORS.length];
    const id = `cnp-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
    onCanopiesChange([...canopies, { id, title, color, start: null, end: null }]);
    setInput('');
  }
  function removeSuperposition(id) {
    onCanopiesChange(canopies.filter(c => c.id !== id));
  }
  // Give an idea boundaries (the current month) so it lands on the timeline,
  // where its span can then be dragged/nudged. This "collapses" the superposition.
  function placeOnTimeline(id) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const start = toDateKey(y, m, 1);
    const end   = toDateKey(y, m, daysInMonth(y, m));
    onCanopiesChange(canopies.map(c => (c.id === id ? { ...c, start, end } : c)));
  }

  return (
    <div className="mt-4 pt-4 border-t flex flex-col gap-2" style={{ borderColor: DARK.border }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between group"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: 10, fontWeight: 900, color: DARK.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Superpositions
          </span>
          {loose.length > 0 && (
            <span style={{ fontSize: 9, color: DARK.muted, fontWeight: 700 }}>{loose.length}</span>
          )}
        </div>
        <span style={{ fontSize: 10, color: DARK.muted, lineHeight: 1 }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <>
          {loose.length === 0 ? (
            <p style={{ fontSize: 10, color: DARK.muted, fontStyle: 'italic', lineHeight: 1.4 }}>
              Park a big idea here — collapse it onto the calendar when it's ready.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {loose.map(c => (
                <div key={c.id}
                  className="group flex items-center gap-1.5 rounded-md px-2 py-1.5"
                  style={{ border: `1px dashed ${DARK.muted}`, background: 'rgba(255,255,255,0.02)' }}
                  title="Unassigned season — not yet on the calendar">
                  <span style={{ fontSize: 11, fontWeight: 800, color: c.color, lineHeight: 1 }}>?</span>
                  <span style={{ fontSize: 11, color: DARK.secondary, lineHeight: 1.2 }} className="mr-auto truncate">
                    {c.title}
                  </span>
                  <button onClick={() => placeOnTimeline(c.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    style={{ fontSize: 11, color: '#c4b5fd', lineHeight: 1 }}
                    title="Place on timeline">
                    ↗
                  </button>
                  <button onClick={() => removeSuperposition(c.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    style={{ fontSize: 12, color: DARK.muted, lineHeight: 1 }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                    onMouseLeave={e => (e.currentTarget.style.color = DARK.muted)}
                    title="Remove">
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-1 mt-0.5">
            <input type="text" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSuperposition()}
              placeholder="New idea…"
              className="flex-1 rounded px-2 py-1.5 outline-none"
              style={{ fontSize: 10, background: DARK.border, border: `1px dashed ${DARK.muted}`, color: DARK.primary }}
            />
            <button onClick={addSuperposition} disabled={!input.trim()}
              className="rounded px-2 py-1.5 font-semibold disabled:opacity-40"
              style={{ fontSize: 10, background: 'rgba(124,58,237,0.18)', color: '#c4b5fd' }}>
              Add
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────
export default function Sidebar({
  stats, budgets,
  leaveTypes = [],
  spaceTargets = {},
  days, onDaysChange,
  isOpen, onToggle,
  layer = 'away',
  canopies = [], onCanopiesChange,
}) {
  const years = Object.keys(stats.byYear).map(Number).sort();
  const [expandedYear, setExpandedYear] = useState(() => new Date().getFullYear());

  function toggleYear(year) {
    setExpandedYear(y => y === year ? null : year);
  }

  if (!isOpen) {
    return (
      <div className="w-7 shrink-0 flex flex-col items-center border-r"
        style={{ background: DARK.bg, borderColor: DARK.border }}>
        <button onClick={onToggle}
          className="mt-4 w-6 h-6 flex items-center justify-center text-base leading-none transition-colors"
          style={{ color: DARK.dim }}
          onMouseEnter={e => (e.currentTarget.style.color = DARK.secondary)}
          onMouseLeave={e => (e.currentTarget.style.color = DARK.dim)}>
          ›
        </button>
      </div>
    );
  }

  return (
    <div className="w-56 shrink-0 flex flex-col h-full border-r overflow-y-auto"
      style={{ background: DARK.bg, borderColor: DARK.border }}>

      {/* Header */}
      <div className="px-4 pt-5 pb-4 flex items-center justify-between border-b"
        style={{ borderColor: DARK.border }}>
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5"/>
              <rect x="14" y="3" width="7" height="7" rx="1.5"/>
              <rect x="3" y="14" width="7" height="7" rx="1.5"/>
              <rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>
          </div>
          <p style={{ fontSize: 13, fontWeight: 900, color: DARK.bright, letterSpacing: '-0.01em' }}>Lifetime</p>
        </div>
        <button onClick={onToggle}
          className="w-6 h-6 flex items-center justify-center text-base leading-none transition-colors"
          style={{ color: DARK.dim }}
          onMouseEnter={e => (e.currentTarget.style.color = DARK.secondary)}
          onMouseLeave={e => (e.currentTarget.style.color = DARK.dim)}>
          ‹
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col px-4 py-4 flex-1 gap-0">

        {/* ── TRAVEL LAYER ────────────────────────────────────────────────── */}
        {layer === 'away' && (
          <>
            {years.map((year, i) => (
              <React.Fragment key={year}>
                {i > 0 && <div className="my-3 border-t" style={{ borderColor: DARK.border }} />}
                <YearSection
                  year={year}
                  yearStats={stats.byYear[year]}
                  budgets={budgets}
                  leaveTypes={leaveTypes}
                  isOpen={expandedYear === year}
                  onToggle={() => toggleYear(year)}
                />
              </React.Fragment>
            ))}

            {/* Free time — rolling planning horizon */}
            <div className="mt-4 pt-4 border-t flex flex-col gap-2" style={{ borderColor: DARK.border }}>
              <p style={{ fontSize: 10, fontWeight: 900, color: DARK.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Free · next {stats.horizonMonths ?? 6} months
              </p>
              <div className="flex items-baseline justify-between">
                <span style={{ fontSize: 10, color: DARK.dim }}>Free weekends</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: DARK.bright, lineHeight: 1 }}>{stats.freeWeekends}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span style={{ fontSize: 10, color: DARK.dim }}>Free days</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: DARK.bright, lineHeight: 1 }}>{stats.freeDaysAhead}</span>
              </div>
            </div>

            {/* Travel legend */}
            <div className="mt-4 pt-4 border-t flex flex-col gap-1.5" style={{ borderColor: DARK.border }}>
              <p style={{ fontSize: 10, fontWeight: 900, color: DARK.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                Legend
              </p>
              {[
                ...leaveTypes.map(t => ({ label: t.label, color: t.color })),
                { label: 'Bank holiday', color: '#93c5fd' },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color, opacity: 0.7 }} />
                  <span style={{ fontSize: 10, color: DARK.dim }}>{label}</span>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0 border border-dashed"
                  style={{ borderColor: '#818cf8', background: 'rgba(99,102,241,0.12)' }} />
                <span style={{ fontSize: 10, color: DARK.dim }}>Possibility</span>
              </div>
            </div>
          </>
        )}

        {/* ── PURPOSE LAYER ───────────────────────────────────────────────── */}
        {layer === 'space' && (
          <>
            <SpaceSection
              stats={stats}
              spaceTargets={spaceTargets}
              days={days}
              onDaysChange={onDaysChange}
            />

            {/* Purpose legend */}
            <div className="mt-4 pt-4 border-t flex flex-col gap-1.5" style={{ borderColor: DARK.border }}>
              <p style={{ fontSize: 10, fontWeight: 900, color: DARK.dim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Legend</p>
              {SPACE_TYPES.map(it => (
                <div key={it.kind} className="flex items-center gap-2">
                  <span style={{ color: it.color, fontSize: 10, lineHeight: 1, width: 10, textAlign: 'center' }}>{it.icon}</span>
                  <span style={{ fontSize: 10, color: DARK.dim }}>{it.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Superpositions hopper (macro ideas, both layers) ─────────────── */}
        <SuperpositionsHopper canopies={canopies} onCanopiesChange={onCanopiesChange} />

      </div>
    </div>
  );
}
