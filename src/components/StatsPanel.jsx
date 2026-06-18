import React from 'react';
import { getBudgetsForYear, DEFAULT_LEAVE_TYPES } from '../utils/storage.js';

function DonutRing({ pct, color, size = 40, stroke = 4 }) {
  const r    = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
    </svg>
  );
}

function MiniStat({ label, used, total, hexColor, warn }) {
  const pct       = total ? Math.min((used / total) * 100, 100) : 0;
  const remaining = total != null ? total - used : null;
  const over      = total != null && used > total;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-white border ${warn || over ? 'border-red-200' : 'border-gray-100'} shadow-sm`}>
      <div className="relative flex items-center justify-center shrink-0">
        <DonutRing pct={pct} color={hexColor} />
        <span className="absolute text-[8px] font-bold text-gray-600">{Math.round(pct)}%</span>
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-none mb-0.5">{label}</span>
        <div className="flex items-baseline gap-0.5">
          <span className="text-base font-bold text-gray-800 leading-none">{used}</span>
          {total != null && <span className="text-[10px] text-gray-400">/ {total}d</span>}
        </div>
        {remaining != null && (
          <span className={`text-[10px] leading-none mt-0.5 ${over ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
            {over ? `${used - total} over` : `${remaining} left`}
          </span>
        )}
      </div>
    </div>
  );
}

function YearBlock({ year, yearStats, budgets, leaveTypes }) {
  const { budget, consumed } = getBudgetsForYear(budgets, leaveTypes, year);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">{year}</span>
      <div className="flex gap-1.5">
        {leaveTypes.map(t => {
          const used   = (yearStats.used?.[t.id] || 0) + (consumed[t.id] || 0);
          const streak = yearStats.maxConsecutive?.[t.id] || 0;
          const over   = t.maxConsecutive != null && streak > t.maxConsecutive;
          return (
            <MiniStat key={t.id} label={t.label} used={used} total={budget[t.id]} hexColor={t.color} warn={over} />
          );
        })}
      </div>
    </div>
  );
}

export default function StatsPanel({ stats, budgets, leaveTypes = DEFAULT_LEAVE_TYPES }) {
  const years = Object.keys(stats.byYear).map(Number).sort();

  return (
    <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 shrink-0">
      <div className="flex items-start gap-6 flex-wrap">
        {/* Title */}
        <div className="flex flex-col justify-center pt-4">
          <p className="text-[11px] font-bold text-gray-800 leading-tight">Annual</p>
          <p className="text-[11px] font-bold text-gray-800 leading-tight">Planner</p>
        </div>

        {/* Per-year blocks */}
        {years.map(year => (
          <YearBlock key={year} year={year} yearStats={stats.byYear[year]} budgets={budgets} leaveTypes={leaveTypes} />
        ))}

        {/* Divider + summary */}
        <div className="flex items-center self-stretch">
          <div className="w-px bg-gray-200 h-full mx-1" />
        </div>
        <div className="flex flex-col justify-center gap-1 pt-4">
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-gray-800">{stats.freeWeekends}</span>
            <span className="text-xs text-gray-400">free weekends ahead</span>
          </div>
        </div>
      </div>
    </div>
  );
}
