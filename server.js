import Anthropic from '@anthropic-ai/sdk';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// Fallback leave types if the client doesn't send any (shouldn't happen in practice).
const DEFAULT_LEAVE_TYPES = [
  { id: 'holiday', label: 'Holiday', maxConsecutive: null },
  { id: 'unpaid',  label: 'Unpaid',  maxConsecutive: null },
  { id: 'wfa',     label: 'WFA',     maxConsecutive: 30 },
];

// Tools are built per request so the baseState enum matches the user's configured
// leave types (which can be renamed, added, or removed in Settings).
function buildTools(leaveTypes) {
  const ids = leaveTypes.map(t => t.id);
  const labelList = leaveTypes.map(t => `"${t.id}" (${t.label})`).join(', ');
  return [
  {
    name: 'read_planner',
    description: 'Read the current planner data — all days with their base states and tags, the configured leave types, per-year budget balances, and computed stats. Call this first before answering any question about the user\'s schedule.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'update_days',
    description: 'Set or clear data for one or more specific dates. Only call this when the user explicitly asks to add, book, mark, plan, or remove something. Each field is optional — only include the fields you actually want to change for that day; omitted fields are left untouched.',
    input_schema: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          description: 'Array of day updates to apply',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'ISO date string YYYY-MM-DD' },
              baseState: {
                type: 'string',
                enum: [...ids, 'clear'],
                description: `Leave type for the day. Valid leave-type ids: ${labelList}. Use "clear" to remove any existing leave. Omit to leave it unchanged. A day can only have ONE leave type.`,
              },
              away: {
                type: 'boolean',
                description: 'Location flag. true = away/travelling, false = home. Set true for any trip (e.g. a holiday abroad, a weekend away). Independent of leave — a day can be both "holiday" leave and "away". Omit to leave unchanged.',
              },
              note: {
                type: 'string',
                description: 'What\'s on — the thing that consumes/defines the day (e.g. "dinner with Sam", "travelling to Lisbon", "Mum visiting"). This is where occasions, destinations and details go; there are no "event" tags. Setting this makes the day "busy". Pass an empty string to clear it. Omit to leave unchanged.',
              },
              addTags: {
                type: 'array',
                description: 'Tags to add. "space" tags mark intentional Build (deep/creative work) or Rest (recovery) days; build and rest are mutually exclusive on a single day. "deadline" marks something due, with a short label.',
                items: {
                  oneOf: [
                    { type: 'object', properties: { type: { type: 'string', enum: ['space'] }, kind: { type: 'string', enum: ['build', 'rest'] } }, required: ['type', 'kind'] },
                    { type: 'object', properties: { type: { type: 'string', enum: ['deadline'] }, label: { type: 'string' } }, required: ['type', 'label'] },
                  ],
                },
              },
              removeTags: {
                type: 'array',
                items: { type: 'string', enum: ['space', 'deadline'] },
                description: 'Tag types to remove from this day',
              },
              clearAll: {
                type: 'boolean',
                description: 'If true, wipe all data from this day (leave, location, note, tags, possibilities)',
              },
            },
            required: ['date'],
          },
        },
      },
      required: ['updates'],
    },
  },
  ];
}

function buildSystem(leaveTypes, plannerData) {
  const today = plannerData?.today || new Date().toISOString().slice(0, 10);
  const leaveLines = leaveTypes.map(t =>
    `   - "${t.id}" — ${t.label}${t.maxConsecutive != null ? ` (max ${t.maxConsecutive} consecutive days)` : ''}`
  ).join('\n');
  const balances = plannerData?.budgetSummary
    ? JSON.stringify(plannerData.budgetSummary)
    : '(call read_planner)';

  return `You are a smart personal planning assistant embedded in the user's annual planner app.

Today's date: ${today}.

The planner covers a rolling 12-month window from the current month. Each day is described by these independent dimensions:

1. Leave (baseState) — at most one of the user's configured leave types (see list below), identified by its id. A day has no leave by default.
2. Location (away) — a boolean. "Away" means travelling/not home; otherwise the day is at home. This is SEPARATE from leave: a day can have leave AND be away (a trip abroad), or be away without any leave (a weekend trip).
3. What's on (stored as "note") — the thing that consumes/defines the day (e.g. "dinner with Sam", "travelling to Lisbon", "Mum visiting"). This is where occasions, destinations and details live. There is NO "event" tag — if the user mentions a place, occasion, or detail, put it here.
4. Space tags — intentional-time markers: Build (deep/creative work) or Rest (recovery). Build and Rest are mutually exclusive on a given day.
5. Deadline tag — marks something due, with a short label.
6. Possibilities (maybes) — tentative, not-yet-decided plans.

BUSY vs FREE: a day is "busy" if it has leave, is away, has a Space day (Build/Rest), has a "what's on" entry, or has ANY possibility (even one). A deadline does NOT make a day busy. A bare weekend or public holiday with nothing on it is free. stats.freeWeekends and stats.freeDaysAhead count free time over the rolling planning horizon (the next stats.horizonMonths months, ~6); to judge a specific day or a different range, apply this rule to the day data from read_planner.

The user's configured leave types (use the id as baseState):
${leaveLines || '   (none configured)'}

Weekends and Berlin public holidays are shown automatically — you never set those.

IMPORTANT — how to map common requests:
- "I'm away to X" / "trip to X" → set away = true AND put the destination in "what's on" (the note field). Do NOT create an event tag (they don't exist).
- "book a holiday" → use the matching leave-type id as baseState. If it's also a trip somewhere, additionally set away = true and put the place in "what's on".
- Match the user's words to the closest configured leave type by its label; use that type's id.
- Only set the fields the user actually asked for; leave other fields untouched.

Per-year balances (already include any "consumed at setup" baseline; budget/used/left are days, by year then leave-type id):
${balances}

Use these balances directly when answering questions about how much leave is left — do NOT assume default budgets, since the user may have custom budgets and a mid-year start. read_planner returns the same data plus the full day grid.

When the user asks to add or plan something, call update_days with the right dates. When they ask questions about their schedule, read_planner first if you need the day grid, then answer precisely. Be concise and friendly, and describe what you did using the app's real vocabulary (the leave type's label / away / what's on / Build / Rest / deadline) — never mention "event tags". If the user says "next weekend" or "this Friday", resolve that to specific dates before calling tools.

Never invent dates — always derive them from today's date shown above.`;
}

app.post('/api/chat', async (req, res) => {
  const { messages, plannerData } = req.body;
  const leaveTypes = (plannerData?.leaveTypes?.length ? plannerData.leaveTypes : DEFAULT_LEAVE_TYPES);
  const tools  = buildTools(leaveTypes);
  const system = buildSystem(leaveTypes, plannerData);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  function send(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    const claudeMessages = [...messages];
    let pendingUpdates = null;

    // Agentic loop — keep going until no more tool calls
    while (true) {
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system,
        tools,
        messages: claudeMessages,
      });

      let assistantText = '';
      let toolUses = [];
      let currentToolUse = null;
      let currentToolInput = '';

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = { id: event.content_block.id, name: event.content_block.name };
            currentToolInput = '';
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            assistantText += event.delta.text;
            send('delta', { text: event.delta.text });
          } else if (event.delta.type === 'input_json_delta') {
            currentToolInput += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            currentToolUse.input = JSON.parse(currentToolInput || '{}');
            toolUses.push(currentToolUse);
            currentToolUse = null;
            currentToolInput = '';
          }
        }
      }

      // Build assistant message content
      const assistantContent = [];
      if (assistantText) assistantContent.push({ type: 'text', text: assistantText });
      for (const tu of toolUses) {
        assistantContent.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
      }
      if (assistantContent.length > 0) {
        claudeMessages.push({ role: 'assistant', content: assistantContent });
      }

      if (toolUses.length === 0) break; // done

      // Process tool calls
      const toolResults = [];
      for (const tu of toolUses) {
        let result;
        if (tu.name === 'read_planner') {
          result = JSON.stringify(plannerData);
          send('tool', { name: 'read_planner' });
        } else if (tu.name === 'update_days') {
          pendingUpdates = tu.input.updates;
          result = JSON.stringify({ ok: true, updated: tu.input.updates.length });
          send('tool', { name: 'update_days', updates: tu.input.updates });
        }
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
      }
      claudeMessages.push({ role: 'user', content: toolResults });
    }

    send('done', { pendingUpdates });
    res.end();
  } catch (err) {
    send('error', { message: err.message });
    res.end();
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Planner API running on port ${PORT}`));
