import React, { useState, useCallback } from 'react';
import Grid from './components/Grid.jsx';
import Sidebar from './components/Sidebar.jsx';
import RightSidebar from './components/RightSidebar.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import ResolveModal from './components/ResolveModal.jsx';
import {
  loadDays, saveDays, loadBudgets, saveBudgets,
  loadLeaveTypes, saveLeaveTypes,
  loadSpaceTargets, saveSpaceTargets,
  loadRelationships, saveRelationships,
  loadLifeLenses, saveLifeLenses,
  loadCanopies, saveCanopies,
} from './utils/storage.js';
import { computeStats } from './utils/stats.js';
import { todayKey } from './utils/dates.js';
import { reconcileStreamLinks } from './utils/streams.js';

export default function App() {
  // Reconcile day→stream links at load so pre-existing Build days reflect their stream.
  const [days,          setDays]          = useState(() => reconcileStreamLinks(loadDays(), loadCanopies()));
  const [budgets,       setBudgets]       = useState(() => loadBudgets());
  const [leaveTypes,    setLeaveTypes]    = useState(() => loadLeaveTypes());
  const [spaceTargets,  setSpaceTargets]  = useState(() => loadSpaceTargets());
  const [relationships, setRelationships] = useState(() => loadRelationships());
  const [lifeLenses,    setLifeLenses]    = useState(() => loadLifeLenses());
  const [canopies,      setCanopies]      = useState(() => loadCanopies());
  const [chatOpen,      setChatOpen]      = useState(false);
  const [leftOpen,      setLeftOpen]      = useState(true);
  const [rightOpen,     setRightOpen]     = useState(true);
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [resolveOpen,   setResolveOpen]   = useState(false);
  const [layer,         setLayer]         = useState('away');

  const today = todayKey();
  const unresolvedCount = Object.entries(days)
    .filter(([key, d]) => key >= today && (d?.maybes || []).length > 0).length;

  // Any day edit (toggle Build, fill-drag, Delete, AI) re-derives stream links so a
  // Build day in a stream's range is linked (placedInstances +1), and is unlinked otherwise.
  const handleDaysChange = useCallback((newDays) => {
    const reconciled = reconcileStreamLinks(newDays, canopies);
    setDays(reconciled);
    saveDays(reconciled);
  }, [canopies]);

  function handleBudgetsChange(b)       { setBudgets(b);       saveBudgets(b); }
  function handleLeaveTypesChange(t)    { setLeaveTypes(t);    saveLeaveTypes(t); }
  function handleSpaceTargetsChange(t)  { setSpaceTargets(t);  saveSpaceTargets(t); }
  function handleRelationshipsChange(r) { setRelationships(r); saveRelationships(r); }
  function handleLifeLensesChange(l)    { setLifeLenses(l);    saveLifeLenses(l); }
  // When a stream is shortened, shifted, or deleted, re-derive day links: days that
  // left its scope are returned to the open pool (link cleared, placedInstances −1).
  function handleCanopiesChange(c) {
    setCanopies(c);
    saveCanopies(c);
    setDays(prev => {
      const reconciled = reconcileStreamLinks(prev, c);
      if (reconciled !== prev) saveDays(reconciled);
      return reconciled;
    });
  }

  const stats = computeStats(days, leaveTypes);

  return (
    <>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar
          stats={stats}
          budgets={budgets}
          leaveTypes={leaveTypes}
          spaceTargets={spaceTargets}
          days={days}
          onDaysChange={handleDaysChange}
          isOpen={leftOpen}
          onToggle={() => setLeftOpen(o => !o)}
          layer={layer}
          canopies={canopies}
          onCanopiesChange={handleCanopiesChange}
        />
        <div className="flex flex-1 overflow-hidden">
          <Grid
            days={days}
            onDaysChange={handleDaysChange}
            layer={layer}
            onLayerChange={setLayer}
            leaveTypes={leaveTypes}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenResolve={() => setResolveOpen(true)}
            unresolvedCount={unresolvedCount}
            canopies={canopies}
            onCanopiesChange={handleCanopiesChange}
          />
          <ChatPanel
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
            days={days}
            budgets={budgets}
            leaveTypes={leaveTypes}
            stats={stats}
            onDaysChange={handleDaysChange}
          />
        </div>
        <RightSidebar
          isOpen={rightOpen}
          onToggle={() => setRightOpen(o => !o)}
          relationships={relationships}
          onRelationshipsChange={handleRelationshipsChange}
          lifeLenses={lifeLenses}
        />
      </div>

      {/* Floating AI pill */}
      <button
        onClick={() => setChatOpen(o => !o)}
        className={`fixed bottom-5 right-6 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all z-50 ${
          chatOpen ? 'bg-gray-800 text-white' : 'text-white'
        }`}
        style={chatOpen
          ? { boxShadow: '0 4px 24px rgba(0,0,0,0.24)' }
          : { background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)', boxShadow: '0 4px 28px rgba(99,102,241,0.45)' }
        }
      >
        {chatOpen ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Close
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            AI Assistant
          </>
        )}
      </button>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        leaveTypes={leaveTypes}
        onLeaveTypesChange={handleLeaveTypesChange}
        budgets={budgets}
        onBudgetsChange={handleBudgetsChange}
        lifeLenses={lifeLenses}
        onLifeLensesChange={handleLifeLensesChange}
        spaceTargets={spaceTargets}
        onSpaceTargetsChange={handleSpaceTargetsChange}
        stats={stats}
      />

      <ResolveModal
        isOpen={resolveOpen}
        onClose={() => setResolveOpen(false)}
        days={days}
        onDaysChange={handleDaysChange}
      />
    </>
  );
}
