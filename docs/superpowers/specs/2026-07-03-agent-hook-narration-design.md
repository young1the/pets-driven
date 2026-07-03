# Agent-Hook Narration for Pet Status — Design

Date: 2026-07-03

## Purpose

The pet's status card already has a `message` line wired end-to-end
(`AgentChannelState.message` → `PetStatusPresentation.message` → status card),
but it is currently dead: the write path hardcodes `message: null`, and the
existing Hook Bridge plugin forwards Claude Code hook payloads unchanged, so
there is no natural-language text describing what the agent actually did.

This feature makes the pet narrate real work: each time the pet's status
changes (working / waiting / completed), a Claude Code **agent hook**
(`type: "agent"`) looks at what actually happened this turn and writes one
in-character sentence, which flows through the existing Hook Bridge → ingress
→ adapter pipeline into the status card.

## Scope

- **In scope:** `UserPromptSubmit` (→ working), `Notification` (→ waiting),
  `Stop` (→ completed) — the three hook events that already drive
  `AgentTaskState` status transitions via the Hook Bridge plugin.
- **Out of scope:** `SubagentStop`/`SubagentStart` narration (would add a 4th
  LLM call per subagent; deferred), `PreToolUse`/`PostToolUse` (high-frequency,
  already excluded from forwarding for noise reasons), using the
  `AgentChannelSource` literal `"agent-hook"` for tagging (no consumer branches
  on `source` today), gating/blocking behavior (these hooks never return
  `ok:false` — narration only, never blocks the turn).

## Changes

### 1. `plugins/pets-driven/hooks/hooks.json`

Replace the `type: "command"` entries for `UserPromptSubmit`, `Notification`,
and `Stop` with `type: "agent"` entries. Each keeps `async: true` (never blocks
the user-visible turn) and gets a status-specific prompt:

| Hook | Status | Prompt intent |
| --- | --- | --- |
| `UserPromptSubmit` | working | Summarize the just-received request in one casual, in-character sentence. |
| `Notification` | waiting | Summarize why the agent is waiting (permission/attention) in one sentence. |
| `Stop` | completed | Summarize what was actually done this turn (diff/tool calls), one sentence. |

Each prompt instructs the spawned subagent to:
1. Write the one-line summary.
2. Run `"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" forward summary "<text>"` via
   its Bash tool to forward it.
3. Return `{"ok": true, "reason": "<same text>"}`.

Timeout: keep it modest (e.g. 30s) since it's async and only produces a
best-effort narration; a slow or failed hook must never block or error the
turn.

### 2. `plugins/pets-driven/hooks/forward`

Add a new mode: `forward summary "<hook_event_name>" "<text>"` that builds

```json
{"hook_event_name":"<name>","cwd":"<$PWD, escaped>","summary":"<text, escaped>"}
```

and POSTs it to the existing ingress (`http://127.0.0.1:43187/claude-hook`),
reusing the existing `post`/`json_escape` helpers. Same fire-and-forget
semantics as `attach`/the default passthrough mode — curl failure is silent,
script always exits 0.

### 3. `apps/desktop/src/adapters/agent-events/claude-hook-adapter.ts`

No change needed. `summaryForHook()` already reads `summary` first, before
falling back to canned text, for every `ClaudeHookEventName` already in scope.

### 4. `packages/pet-engine/src/features/behavior/systems.ts`

`setAgentTaskState` currently hardcodes `message: null` when writing
`AgentChannelState` (line ~186). Change to `message: event.summary ?? null`.
This is the load-bearing fix: without it, the rest of this pipeline produces
text that never reaches the screen, since the UI (`pet-status-presentation.ts`)
already reads `overlay.message` correctly.

## Data flow (end to end)

```
Claude Code hook event (UserPromptSubmit/Notification/Stop)
  → type:"agent" hook spawns subagent, writes one-line narration
  → subagent runs `forward summary "<name>" "<text>"` (Bash tool call)
  → POST to http://127.0.0.1:43187/claude-hook
  → createAgentEventFromClaudeHook (unchanged) reads `summary`
  → AgentEvent { type, sourceId, at, summary }
  → toWorldEvent → AgentWorldEvent
  → behavior/systems.ts: setAgentTaskState writes
    AgentChannelState { status, label, message: summary }
  → world-snapshot → pet-window overlay → PetStatusPresentation
  → status card shows label + narrated message
```

## Risks / notes

- Cost: up to 3 extra LLM calls per turn, in every directory where the plugin
  is installed and a session is active — not just registered pets-driven
  projects. The ingress already silently drops events for unregistered `cwd`,
  but the LLM call happens before that filtering, so the cost is paid
  regardless of whether a pet is listening. Accepted per user direction; no
  pre-check gating in this slice.
- Failure mode: if the agent hook times out or the subagent fails to call
  `forward`, no message is sent — the status card simply falls back to the
  existing canned label (e.g. "Working"/"Waiting"/"Done") with no message
  line, same as today. No new failure mode introduced.
- The narration text is best-effort and unverified (no test asserts its
  content, only that the plumbing delivers whatever `summary` is provided).
