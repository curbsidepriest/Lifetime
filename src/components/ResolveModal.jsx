import React, { useEffect } from 'react';
import { todayKey, getWeekdayAbbr, getMonthName } from '../utils/dates.js';

// All upcoming days (today onward) that still carry unresolved possibilities,
// sorted ascending by date.
function collectUnresolved(days) {
  const today = todayKey();
  return Object.entries(days)
    .filter(([key, d]) => key >= today && (d?.maybes || []).length > 0)
    .map(([key, d]) => ({ key, maybes: d.maybes, note: d.note || '' }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));
}

function formatDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${getWeekdayAbbr(y, m - 1, d)} ${d} ${getMonthName(m - 1).slice(0, 3)} ${y}`;
}

export default function ResolveModal({ isOpen, onClose, days, onDaysChange }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    if (isOpen) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const items = collectUnresolved(days);

  function patchDay(key, fn) {
    const ex = days[key] || {};
    onDaysChange({ ...days, [key]: fn({ ...ex }) });
  }
  // Confirm "this is what happened": it becomes the day's What's on, the rest clear.
  function pick(key, opt)  { patchDay(key, d => ({ ...d, note: opt, maybes: [] })); }
  // Drop a single competing option.
  function drop(key, opt)  { patchDay(key, d => ({ ...d, maybes: (d.maybes || []).filter(m => m !== opt) })); }
  // None of them happened — clear all possibilities for the day.
  function dismiss(key)    { patchDay(key, d => ({ ...d, maybes: [] })); }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      style={{ background: 'rgba(17,24,39,0.45)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" style={{ maxHeight: '88vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-gray-800">Loose ends</p>
            <p className="text-[10px] text-gray-400">
              {items.length === 0 ? 'Nothing to resolve' : `${items.length} day${items.length === 1 ? '' : 's'} with unresolved possibilities`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {items.length === 0 ? (
            <p className="text-xs text-gray-400 italic text-center py-6">
              All clear — no unresolved possibilities ahead. ✨
            </p>
          ) : items.map(({ key, maybes, note }) => {
            const single = maybes.length === 1;
            return (
              <div key={key} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs font-bold text-gray-700">{formatDate(key)}</span>
                  {note && <span className="text-[10px] text-gray-400 truncate ml-2">on: {note}</span>}
                </div>

                <div className="flex flex-col gap-1.5">
                  {maybes.map(opt => (
                    <div key={opt} className="flex items-center gap-1.5 bg-white border border-indigo-100 rounded-lg px-2.5 py-1.5">
                      <span className="text-[11px] font-medium text-indigo-600 mr-auto truncate">? {opt}</span>
                      <button onClick={() => pick(key, opt)}
                        className="text-[10px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-md px-2 py-1 shrink-0">
                        {single ? 'Confirm' : 'This one'}
                      </button>
                      <button onClick={() => drop(key, opt)} title="Drop this option"
                        className="text-gray-300 hover:text-red-400 text-sm leading-none shrink-0 px-0.5">×</button>
                    </div>
                  ))}
                </div>

                <button onClick={() => dismiss(key)}
                  className="mt-2 text-[10px] text-gray-400 hover:text-gray-600">
                  {single ? 'Dismiss' : 'None of these happened'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end shrink-0">
          <button onClick={onClose}
            className="text-xs bg-gray-800 text-white rounded-lg px-4 py-2 font-semibold hover:bg-gray-700">Done</button>
        </div>
      </div>
    </div>
  );
}
