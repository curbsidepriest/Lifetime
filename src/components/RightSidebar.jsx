import React, { useState } from 'react';

const LS_BIRTHDAY = 'planner_birthday';
const LS_LIFESPAN = 'planner_lifespan';

// Rotating quotes — keyed by week-of-year mod length
const QUOTES = [
  { text: "The average human life is about 4,000 weeks.", author: "Oliver Burkeman" },
  { text: "It is not that we have a short time to live, but that we waste a great deal of it.", author: "Seneca" },
  { text: "Most of what we say and do is not essential. Eliminate it, and you'll have more time and more tranquillity.", author: "Marcus Aurelius" },
  { text: "You have exactly one life in which to do everything you'll ever do. Act accordingly.", author: "Colin Wright" },
  { text: "The trouble is, you think you have time.", author: "Jack Kornfield" },
  { text: "Do not spoil what you have by desiring what you have not.", author: "Epicurus" },
  { text: "Reflect upon your present blessings, of which every man has many; not on your past misfortunes, of which all men have some.", author: "Charles Dickens" },
];

function getWeekOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date - start) / (7 * 24 * 3600 * 1000));
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function computeLifeStats(birthday, lifespan, lifeLenses = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const birth = new Date(birthday);
  birth.setHours(0, 0, 0, 0);

  const msPerWeek  = 7 * 24 * 3600 * 1000;
  const livedWeeks = Math.floor((today - birth) / msPerWeek);
  const totalWeeks = lifespan * 52;

  let livedMonths = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
  if (today.getDate() < birth.getDate()) livedMonths--;

  const livedYears     = Math.floor(livedMonths / 12);
  const livedRemMonths = livedMonths % 12;
  const remainingYears = lifespan - livedYears - 1;
  const currentYear    = today.getFullYear();
  const endYear        = currentYear + remainingYears;

  // Cadence stats — configurable lenses, each with its own rhythm so the numbers differ.
  // Anchored lenses (e.g. World Cups) count fixed-cycle years ahead; the rest are
  // simply how many whole cadence-periods fit in the remaining years.
  const remaining = Math.max(0, remainingYears);
  function describe(everyYears) {
    if (everyYears === 1) return 'every year';
    if (everyYears < 1)   return `~${(1 / everyYears).toFixed(everyYears < 0.1 ? 0 : 1)}/yr`;
    return `every ${everyYears} years`;
  }
  const cadence = lifeLenses.map(lens => {
    let count;
    if (lens.anchor != null) {
      count = 0;
      for (let y = lens.anchor; y <= endYear; y += lens.everyYears) if (y > currentYear) count++;
    } else {
      count = lens.everyYears > 0 ? Math.floor(remaining / lens.everyYears) : 0;
    }
    return { label: lens.label, count, note: describe(lens.everyYears) };
  });

  return {
    livedWeeks,
    totalWeeks,
    currentWeekIndex: livedWeeks,
    livedYears,
    livedRemMonths,
    remainingYears,
    statsText: `${livedYears}y ${livedRemMonths}m lived · ${remainingYears}y remaining`,
    burkeman: `Week ${livedWeeks.toLocaleString()} of ~${totalWeeks.toLocaleString()}`,
    cadence,
  };
}

// ── Life in weeks grid ────────────────────────────────────────────────────────
function WeekGrid({ totalWeeks, livedWeeks }) {
  const cells = [];
  for (let i = 0; i < totalWeeks; i++) {
    let bg;
    if (i < livedWeeks)      bg = '#374151'; // lived — gray-700
    else if (i === livedWeeks) bg = '#3b82f6'; // current — blue
    else                       bg = '#f3f4f6'; // future — gray-100
    cells.push(
      <div key={i} style={{ width: 3, height: 3, background: bg, border: i >= livedWeeks + 1 ? '1px solid #e5e7eb' : 'none' }} />
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(52, 3px)', gap: 1 }}>
      {cells}
    </div>
  );
}

// ── Relationship stats ────────────────────────────────────────────────────────
const REL_LABELS = { parent: 'Parent', partner: 'Partner', child: 'Child' };
const PARENT_LIFESPAN  = 85;
const PARTNER_LIFESPAN = 88;

function computeRelStats(rel) {
  const now     = new Date();
  const age     = now.getFullYear() - rel.birthYear;

  if (rel.type === 'parent') {
    const remaining = Math.max(0, PARENT_LIFESPAN - age);
    if (remaining === 0) return null;
    const urgency = remaining <= 5 ? 'text-red-500' : remaining <= 15 ? 'text-amber-500' : 'text-gray-500';
    return {
      stat: `~${remaining} more ${remaining === 1 ? 'year' : 'years'} if they reach ${PARENT_LIFESPAN}`,
      sub:  remaining <= 5 ? 'Cherish every moment.' : remaining <= 15 ? 'The window is narrowing.' : null,
      urgency,
    };
  }

  if (rel.type === 'partner') {
    const remaining = Math.max(0, PARTNER_LIFESPAN - age);
    if (remaining === 0) return null;
    return {
      stat: `~${remaining} more years together`,
      sub:  null,
      urgency: 'text-gray-500',
    };
  }

  if (rel.type === 'child') {
    const childAge = age;
    if (childAge < 18) {
      const summers = 18 - childAge;
      const flavor  = childAge <= 4  ? 'These are the years they\'ll remember forever.'
                    : childAge <= 10 ? 'The golden years.'
                    : childAge <= 14 ? 'Still so much ahead.'
                    : 'Almost grown — treasure it.';
      return {
        stat:   `~${summers} more summer${summers === 1 ? '' : 's'} before ${rel.name || 'they'} turn${summers === 1 ? 's' : ''} 18`,
        sub:    flavor,
        urgency: summers <= 3 ? 'text-amber-500' : 'text-gray-500',
      };
    } else {
      return {
        stat: `${childAge} years old — your adult child`,
        sub:  null,
        urgency: 'text-gray-500',
      };
    }
  }
  return null;
}

// ── Relationship form ─────────────────────────────────────────────────────────
function RelationshipForm({ onAdd, onCancel }) {
  const [type,      setType]      = useState('parent');
  const [name,      setName]      = useState('');
  const [birthYear, setBirthYear] = useState('');

  function handleSubmit() {
    const yr = parseInt(birthYear);
    if (!yr || yr < 1900 || yr > new Date().getFullYear()) return;
    onAdd({ id: crypto.randomUUID(), type, name: name.trim(), birthYear: yr });
    setName('');
    setBirthYear('');
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100 mt-2">
      <div className="flex gap-1">
        {['parent', 'partner', 'child'].map(t => (
          <button key={t} onClick={() => setType(t)}
            className={`flex-1 text-[10px] py-1 rounded font-semibold transition-all ${
              type === t ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
            }`}>
            {REL_LABELS[t]}
          </button>
        ))}
      </div>
      <input type="text" value={name} onChange={e => setName(e.target.value)}
        placeholder={type === 'parent' ? 'Mum / Dad (optional)' : type === 'partner' ? 'Name (optional)' : 'Name'}
        className="text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 bg-white" />
      <input type="number" value={birthYear} onChange={e => setBirthYear(e.target.value)}
        placeholder="Birth year (e.g. 1958)"
        className="text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 bg-white" />
      <div className="flex gap-1.5">
        <button onClick={handleSubmit}
          className="flex-1 text-[11px] bg-gray-800 text-white rounded px-2 py-1.5 font-semibold hover:bg-gray-700">
          Add
        </button>
        <button onClick={onCancel}
          className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1.5">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RightSidebar({ isOpen, onToggle, relationships = [], onRelationshipsChange, lifeLenses = [] }) {
  const [birthday,       setBirthday]       = useState(() => localStorage.getItem(LS_BIRTHDAY) || '');
  const [lifespan,       setLifespan]       = useState(() => parseInt(localStorage.getItem(LS_LIFESPAN) || '90'));
  const [inputDate,      setInputDate]      = useState('');
  const [editingBday,    setEditingBday]    = useState(false);
  const [showRelForm,    setShowRelForm]    = useState(false);

  const today       = new Date();
  const weekOfYear  = getWeekOfYear(today);
  const quote       = QUOTES[weekOfYear % QUOTES.length];
  const birthdayDate = parseDate(birthday);
  const stats       = birthdayDate ? computeLifeStats(birthdayDate, lifespan, lifeLenses) : null;

  function saveBirthday() {
    if (!inputDate) return;
    localStorage.setItem(LS_BIRTHDAY, inputDate);
    setBirthday(inputDate);
    setEditingBday(false);
  }

  function addRelationship(rel) {
    onRelationshipsChange([...relationships, rel]);
    setShowRelForm(false);
  }

  function removeRelationship(id) {
    onRelationshipsChange(relationships.filter(r => r.id !== id));
  }

  if (!isOpen) {
    return (
      <div className="w-7 shrink-0 flex flex-col items-center bg-white border-l border-gray-200">
        <button onClick={onToggle}
          className="mt-4 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 text-base leading-none"
          title="Expand">
          ‹
        </button>
      </div>
    );
  }

  return (
    <div className="w-60 shrink-0 flex flex-col h-full bg-white border-l border-gray-200 overflow-y-auto">

      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-black text-gray-800 uppercase tracking-widest">This is your life.</p>
          <p className="text-[10px] text-gray-400 mt-0.5">One shot. Make it count.</p>
        </div>
        <button onClick={onToggle}
          className="mt-0.5 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 text-base leading-none">
          ›
        </button>
      </div>

      {/* Birthday input */}
      <div className="px-4 py-3 border-b border-gray-100">
        {!birthdayDate || editingBday ? (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-gray-500">When were you born?</p>
            <input type="date" value={inputDate} onChange={e => setInputDate(e.target.value)}
              className="text-[11px] border border-gray-200 rounded px-2 py-1.5 w-full focus:outline-none focus:border-blue-400" />
            <div className="flex gap-1.5">
              <button onClick={saveBirthday}
                className="flex-1 text-[11px] bg-gray-800 text-white rounded px-2 py-1.5 hover:bg-gray-700 font-semibold">
                Save
              </button>
              {editingBday && (
                <button onClick={() => setEditingBday(false)}
                  className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1.5">
                  Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">{birthday}</span>
            <button onClick={() => { setInputDate(birthday); setEditingBday(true); }}
              className="text-[10px] text-gray-400 hover:text-gray-600 underline">
              edit
            </button>
          </div>
        )}
      </div>

      {stats && (
        <>
          {/* Life in weeks */}
          <div className="px-4 py-4 border-b border-gray-100">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Life in Weeks</p>
            <WeekGrid totalWeeks={stats.totalWeeks} livedWeeks={stats.livedWeeks} />
            <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">{stats.statsText}</p>
            <p className="text-[10px] text-gray-400 mt-1">{stats.burkeman}</p>

            {/* Cadence stats */}
            <div className="mt-3 flex flex-col gap-1.5">
              {stats.cadence.map((item, i) => (
                <div key={i} className="flex items-baseline justify-between" title={item.note}>
                  <span className="text-[10px] text-gray-500">{item.label}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[15px] font-black text-gray-800 leading-none">{item.count.toLocaleString()}</span>
                    <span className="text-[9px] text-gray-400">left</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* What matters */}
          <div className="px-4 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">What matters</p>
              <button onClick={() => setShowRelForm(f => !f)}
                className="text-[10px] text-gray-400 hover:text-gray-600 font-bold leading-none">
                {showRelForm ? '×' : '+'}
              </button>
            </div>

            {relationships.length === 0 && !showRelForm && (
              <p className="text-[10px] text-gray-400 italic leading-relaxed">
                Add your parents, children, or partner to see how much time you have together.
              </p>
            )}

            <div className="flex flex-col gap-3">
              {relationships.map(rel => {
                const rs = computeRelStats(rel);
                if (!rs) return null;
                return (
                  <div key={rel.id} className="group">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-[11px] font-semibold text-gray-700 leading-none">
                          {rel.name || REL_LABELS[rel.type]}
                          <span className="text-[9px] font-normal text-gray-400 ml-1.5">
                            {REL_LABELS[rel.type].toLowerCase()} · {new Date().getFullYear() - rel.birthYear}y
                          </span>
                        </p>
                        <p className={`text-[10px] mt-1 leading-snug ${rs.urgency}`}>{rs.stat}</p>
                        {rs.sub && <p className="text-[9px] text-gray-400 italic mt-0.5">{rs.sub}</p>}
                      </div>
                      <button onClick={() => removeRelationship(rel.id)}
                        className="text-gray-300 hover:text-red-400 text-sm ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {showRelForm && (
              <RelationshipForm
                onAdd={addRelationship}
                onCancel={() => setShowRelForm(false)}
              />
            )}
          </div>
        </>
      )}

      {/* Quote — pb-16 clears the fixed AI pill */}
      <div className="px-4 py-5 pb-16 mt-auto">
        <p className="text-[11px] text-gray-600 leading-relaxed italic">"{quote.text}"</p>
        <p className="text-[10px] text-gray-400 mt-2">— {quote.author}</p>
      </div>
    </div>
  );
}
