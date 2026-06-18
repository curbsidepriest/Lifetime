import { useEffect } from 'react';
import { exportAllData, importAllData } from '../utils/storage';

// Generate a stable, collision-resistant id for a new leave type.
function newTypeId() { return `type_${Math.random().toString(36).slice(2, 8)}`; }
function newLensId() { return `lens_${Math.random().toString(36).slice(2, 8)}`; }

// Parse a text input into a number, or null when blank/invalid.
function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function Section({ title, hint, children }) {
  return (
    <div className="px-5 py-4 border-b border-gray-100">
      <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">{title}</p>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5 mb-3">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </div>
  );
}

const inputCls = 'text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 bg-white';

export default function SettingsModal({
  isOpen, onClose,
  leaveTypes, onLeaveTypesChange,
  budgets, onBudgetsChange,
  lifeLenses, onLifeLensesChange,
  spaceTargets, onSpaceTargetsChange,
  stats,
}) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    if (isOpen) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ── Leave types ────────────────────────────────────────────────────────────
  function patchType(id, patch) {
    onLeaveTypesChange(leaveTypes.map(t => t.id === id ? { ...t, ...patch } : t));
  }
  function setDefaultBudget(id, value) {
    onBudgetsChange({ ...budgets, byType: { ...budgets.byType, [id]: numOrNull(value) ?? 0 } });
  }
  function addType() {
    const id = newTypeId();
    onLeaveTypesChange([...leaveTypes, { id, label: 'New type', color: '#60a5fa', maxConsecutive: null }]);
    onBudgetsChange({ ...budgets, byType: { ...budgets.byType, [id]: 0 } });
  }
  function removeType(id) {
    onLeaveTypesChange(leaveTypes.filter(t => t.id !== id));
  }

  // ── Per-year budget / consumed ───────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const years = [...new Set([
    ...Object.keys(stats?.byYear || {}).map(Number),
    currentYear, currentYear + 1,
  ])].sort();

  function setPerYear(year, field, id, value) {
    const next = JSON.parse(JSON.stringify(budgets.perYear || {}));
    if (!next[year]) next[year] = { budget: {}, consumed: {} };
    if (!next[year][field]) next[year][field] = {};
    const n = numOrNull(value);
    if (n == null) delete next[year][field][id];
    else next[year][field][id] = n;
    onBudgetsChange({ ...budgets, perYear: next });
  }
  const py = (year, field, id) => budgets.perYear?.[year]?.[field]?.[id] ?? '';

  // ── Life lenses ──────────────────────────────────────────────────────────────
  function patchLens(id, patch) {
    onLifeLensesChange(lifeLenses.map(l => l.id === id ? { ...l, ...patch } : l));
  }
  function addLens() {
    onLifeLensesChange([...lifeLenses, { id: newLensId(), label: 'New lens', everyYears: 1 }]);
  }
  function removeLens(id) {
    onLifeLensesChange(lifeLenses.filter(l => l.id !== id));
  }

  // ── Space targets ────────────────────────────────────────────────────────────
  function setSpaceTarget(kind, value) {
    const n = numOrNull(value);
    onSpaceTargetsChange({
      ...spaceTargets,
      [kind]: { ...(spaceTargets[kind] || { period: 'week' }), target: n ?? 0 },
    });
  }

  // ── Backup & restore ─────────────────────────────────────────────────────────
  function handleExport() {
    const payload = exportAllData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-importing the same file later
    if (!file) return;
    if (!window.confirm('Import will REPLACE your current planner data with the contents of this backup. Continue?')) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const n = importAllData(JSON.parse(reader.result));
        window.alert(`Restored ${n} item${n === 1 ? '' : 's'}. The app will now reload.`);
        window.location.reload();
      } catch (err) {
        window.alert('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      style={{ background: 'rgba(17,24,39,0.45)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col"
        style={{ maxHeight: '88vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
          <p className="text-sm font-bold text-gray-800">Settings</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto">

          {/* ── Leave types ─────────────────────────────────────────────────── */}
          <Section title="Leave types" hint="Your kinds of leave. Each has a colour, an annual budget, and an optional max consecutive-days limit.">
            <div className="flex flex-col gap-2">
              {leaveTypes.map(t => (
                <div key={t.id} className="flex items-center gap-2">
                  <input type="color" value={t.color}
                    onChange={e => patchType(t.id, { color: e.target.value })}
                    className="w-7 h-7 rounded border border-gray-200 shrink-0 cursor-pointer p-0" title="Colour" />
                  <input type="text" value={t.label}
                    onChange={e => patchType(t.id, { label: e.target.value })}
                    className={`${inputCls} flex-1 min-w-0`} placeholder="Label" />
                  <input type="number" value={budgets.byType?.[t.id] ?? ''}
                    onChange={e => setDefaultBudget(t.id, e.target.value)}
                    className={`${inputCls} w-16`} title="Days per year" placeholder="days" />
                  <input type="number" value={t.maxConsecutive ?? ''}
                    onChange={e => patchType(t.id, { maxConsecutive: numOrNull(e.target.value) })}
                    className={`${inputCls} w-16`} title="Max consecutive days (optional)" placeholder="max" />
                  <button onClick={() => removeType(t.id)}
                    className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0 px-1" title="Remove">×</button>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-1.5 px-9 text-[9px] text-gray-400 uppercase tracking-wide">
              <span className="flex-1">label</span><span className="w-16">days/yr</span><span className="w-16">max row</span><span className="w-4" />
            </div>
            <button onClick={addType}
              className="mt-2 text-xs text-blue-500 hover:text-blue-600 font-semibold">+ Add leave type</button>
          </Section>

          {/* ── Per-year overrides ──────────────────────────────────────────── */}
          <Section title="Per-year budgets & mid-year start"
            hint="Override the annual budget for a specific year, and record days already used before you started using the planner (so balances are right when you start mid-year). Blank = use the default.">
            <div className="flex flex-col gap-4">
              {years.map(year => (
                <div key={year}>
                  <p className="text-[10px] font-bold text-gray-500 mb-1.5">{year}</p>
                  <div className="flex flex-col gap-1.5">
                    {leaveTypes.map(t => (
                      <div key={t.id} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.color }} />
                        <span className="text-xs text-gray-600 flex-1 min-w-0 truncate">{t.label}</span>
                        <input type="number" value={py(year, 'budget', t.id)}
                          onChange={e => setPerYear(year, 'budget', t.id, e.target.value)}
                          className={`${inputCls} w-20`} placeholder={`${budgets.byType?.[t.id] ?? 0} budget`} title="Budget override" />
                        <input type="number" value={py(year, 'consumed', t.id)}
                          onChange={e => setPerYear(year, 'consumed', t.id, e.target.value)}
                          className={`${inputCls} w-20`} placeholder="0 used" title="Already used at setup" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Life lenses ─────────────────────────────────────────────────── */}
          <Section title="Life lenses" hint="Different ways of counting the time you have left. Use a cadence in years (e.g. 0.25 = seasons, 4 = World Cups). Add an anchor year for fixed-cycle events.">
            <div className="flex flex-col gap-2">
              {lifeLenses.map(l => (
                <div key={l.id} className="flex items-center gap-2">
                  <input type="text" value={l.label}
                    onChange={e => patchLens(l.id, { label: e.target.value })}
                    className={`${inputCls} flex-1 min-w-0`} placeholder="Label" />
                  <input type="number" step="any" value={l.everyYears}
                    onChange={e => patchLens(l.id, { everyYears: numOrNull(e.target.value) ?? 1 })}
                    className={`${inputCls} w-20`} title="Every N years" placeholder="every" />
                  <input type="number" value={l.anchor ?? ''}
                    onChange={e => patchLens(l.id, { anchor: numOrNull(e.target.value) })}
                    className={`${inputCls} w-20`} title="Anchor year (optional)" placeholder="anchor" />
                  <button onClick={() => removeLens(l.id)}
                    className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0 px-1" title="Remove">×</button>
                </div>
              ))}
            </div>
            <button onClick={addLens}
              className="mt-2 text-xs text-blue-500 hover:text-blue-600 font-semibold">+ Add lens</button>
          </Section>

          {/* ── Space targets ───────────────────────────────────────────────── */}
          <Section title="Space targets" hint="Intentional Build / Rest days you aim for each week.">
            <div className="flex gap-4">
              {['build', 'rest'].map(kind => (
                <div key={kind} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 capitalize w-12">{kind}</span>
                  <input type="number" value={spaceTargets?.[kind]?.target ?? ''}
                    onChange={e => setSpaceTarget(kind, e.target.value)}
                    className={`${inputCls} w-16`} />
                  <span className="text-[10px] text-gray-400">/ week</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Backup & restore ────────────────────────────────────────────── */}
          <Section title="Backup & restore" hint="Your planner is stored only in this browser. Export a backup file to keep it safe; import it to restore, or to move your data to another browser or device.">
            <div className="flex items-center gap-2">
              <button onClick={handleExport}
                className="text-xs bg-gray-800 text-white rounded-lg px-3 py-2 font-semibold hover:bg-gray-700">
                Export backup
              </button>
              <label className="text-xs border border-gray-300 rounded-lg px-3 py-2 font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer">
                Import backup
                <input type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
              </label>
            </div>
          </Section>

        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end shrink-0">
          <button onClick={onClose}
            className="text-xs bg-gray-800 text-white rounded-lg px-4 py-2 font-semibold hover:bg-gray-700">Done</button>
        </div>
      </div>
    </div>
  );
}
