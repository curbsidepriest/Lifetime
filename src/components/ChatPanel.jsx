import React, { useState, useRef, useEffect } from 'react';
import { getBudgetsForYear } from '../utils/storage.js';

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap
          ${isUser
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-white text-gray-800 border border-gray-100 shadow-sm rounded-bl-sm'
          }`}
      >
        {msg.content}
        {msg.toolHint && (
          <p className="text-[10px] mt-1 opacity-60 italic">{msg.toolHint}</p>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex justify-start mb-2">
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-3 py-2.5 flex gap-1">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ChatPanel({ isOpen, onClose, days, budgets, leaveTypes = [], stats, onDaysChange }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hey! I can help you plan your year. Try asking me things like \"book next week as WFA\", \"what's my holiday balance?\", or \"mark the 4th July weekend as away\".",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText, loading]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setLoading(true);
    setStreamText('');

    // Build message history for API (exclude the welcome message if it's the first)
    const apiMessages = history.map(m => ({ role: m.role, content: m.content }));

    // Per-year, per-type balances the assistant can quote directly (folds in the
    // "consumed at setup" baseline so mid-year balances are correct).
    const budgetSummary = {};
    for (const year of Object.keys(stats.byYear || {})) {
      const { budget, consumed } = getBudgetsForYear(budgets, leaveTypes, Number(year));
      budgetSummary[year] = {};
      for (const t of leaveTypes) {
        const used  = (stats.byYear[year].used?.[t.id] || 0) + (consumed[t.id] || 0);
        const total = budget[t.id];
        budgetSummary[year][t.id] = {
          label: t.label,
          budget: total,
          used,
          consumed: consumed[t.id] || 0,
          left: total != null ? total - used : null,
        };
      }
    }

    const plannerData = {
      days,
      budgets,
      leaveTypes: leaveTypes.map(t => ({ id: t.id, label: t.label, maxConsecutive: t.maxConsecutive })),
      budgetSummary,
      stats,
      today: new Date().toISOString().slice(0, 10),
    };

    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const resp = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, plannerData }),
      });

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let toolHint = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop();

        for (const part of parts) {
          const lines = part.split('\n');
          const eventLine = lines.find(l => l.startsWith('event: '));
          const dataLine = lines.find(l => l.startsWith('data: '));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7);
          const data = JSON.parse(dataLine.slice(5));

          if (event === 'delta') {
            accumulated += data.text;
            setStreamText(accumulated);
          } else if (event === 'tool') {
            if (data.name === 'read_planner') toolHint = 'Reading your planner…';
            if (data.name === 'update_days') {
              toolHint = `Updating ${data.updates?.length} day(s)…`;
            }
          } else if (event === 'done') {
            if (data.pendingUpdates?.length > 0) {
              applyUpdates(data.pendingUpdates);
            }
            setMessages(prev => [
              ...prev,
              { role: 'assistant', content: accumulated || '(done)', toolHint },
            ]);
            setStreamText('');
          } else if (event === 'error') {
            setMessages(prev => [
              ...prev,
              { role: 'assistant', content: `Error: ${data.message}` },
            ]);
            setStreamText('');
          }
        }
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Could not reach the server. Is it running? (${err.message})` },
      ]);
      setStreamText('');
    }

    setLoading(false);
  }

  function applyUpdates(updates) {
    const newDays = { ...days };
    for (const u of updates) {
      if (u.clearAll) {
        delete newDays[u.date];
        continue;
      }
      const existing = newDays[u.date] || { baseState: null, tags: [], note: '', maybes: [], away: false };
      const updated = { ...existing, tags: [...(existing.tags || [])] };

      if (u.baseState === 'clear') updated.baseState = null;
      else if (u.baseState) updated.baseState = u.baseState;

      // Location flag (away/home) — independent of leave
      if (typeof u.away === 'boolean') updated.away = u.away;

      // Free-text note — empty string clears it
      if (typeof u.note === 'string') updated.note = u.note;

      if (u.removeTags) {
        updated.tags = updated.tags.filter(t => {
          const ttype = typeof t === 'string' ? t : t.type;
          return !u.removeTags.includes(ttype);
        });
      }
      if (u.addTags) {
        for (const tag of u.addTags) {
          // Match the popover's rules: one space tag (build/rest mutually exclusive),
          // one deadline. Strip conflicting existing tags before adding.
          if (tag?.type === 'space') {
            updated.tags = updated.tags.filter(t => t?.type !== 'space' && t?.type !== 'intention');
          } else if (tag?.type === 'deadline') {
            updated.tags = updated.tags.filter(t => !(t?.type === 'deadline' || t === 'deadline'));
          }
          updated.tags.push(tag);
        }
      }
      newDays[u.date] = updated;
    }
    onDaysChange(newDays);
  }

  if (!isOpen) return null;

  return (
    <div className="w-80 flex flex-col bg-gray-50 border-l border-gray-200 h-full shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-sm font-semibold text-gray-800">Planner AI</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col">
        {messages.map((m, i) => <Message key={i} msg={m} />)}
        {loading && !streamText && <TypingDots />}
        {streamText && (
          <div className="flex justify-start mb-2">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap bg-white text-gray-800 border border-gray-100 shadow-sm">
              {streamText}
              <span className="inline-block w-0.5 h-3.5 bg-gray-400 ml-0.5 animate-pulse align-middle" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 bg-white border-t border-gray-200 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Ask or plan something…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-gray-50"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="w-8 h-8 rounded-xl bg-blue-500 text-white flex items-center justify-center disabled:opacity-40 hover:bg-blue-600 transition-colors shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
