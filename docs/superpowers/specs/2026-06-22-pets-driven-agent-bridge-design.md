# Pets-Driven Agent Bridge Plugin — Design

Date: 2026-06-22

## Purpose

A Claude Code plugin that acts as the **Hook Bridge** described in `CONTEXT.md`:
it forwards Claude Code lifecycle hook events to the running pets-driven desktop
app so the **Pet** bound to the current **Working Directory** can express agent
work state. No desktop-app changes are required — the app already runs an HTTP
ingress that routes events by `cwd`.

## Scope

- **Agent:** Claude Code only. Codex/Cursor are out of scope for this version
  but the folder layout leaves room to add sibling harness configs later.
- **In scope:** lifecycle event forwarding + a manual `attach` ping command.
- **Out of scope:** Terminal Channel registration, personality-setup skill, and
  any desktop-app/ingress modification.

## Existing app contract (unchanged)

The desktop app (`apps/desktop/src-tauri/src/lib.rs`) listens on
`http://127.0.0.1:43187/claude-hook` and accepts `POST` with a JSON body. It
only reads:

- `hook_event_name` — mapped to an agent event type by the existing adapter
  (`apps/desktop/src/adapters/agent-events/claude-hook-adapter.ts`).
- `cwd` — resolved to a **Registered Working Directory** (longest-prefix match),
  then to the bound **Pet**. Unregistered `cwd` is silently dropped.

The plugin produces exactly that payload shape.

## Plugin layout

```
plugins/
  .claude-plugin/
    marketplace.json          # registers this folder as a local marketplace (1 plugin)
  pets-driven/
    .claude-plugin/plugin.json
    hooks/
      hooks.json              # which lifecycle hooks to forward
      run-hook.cmd            # cross-platform polyglot wrapper (finds bash on Windows)
      forward                 # bash: POST stdin JSON, or synthesize an attach ping
    commands/
      attach.md               # /pets-driven:attach — manual ping
    README.md
```

Install path:

```
claude plugin marketplace add ./plugins
claude plugin install pets-driven
```

## Forwarding

Claude Code passes hook input as JSON on stdin, already containing
`hook_event_name`, `cwd`, and `session_id`. The ingress needs exactly those
fields, so `forward` (no argument) **pipes stdin straight to the ingress** with
no transformation:

```
curl -s -m 2 -X POST http://127.0.0.1:43187/claude-hook \
  -H "Content-Type: application/json" --data-binary @-
```

The script always ends with `exit 0`: if the app is not running, curl fails
quietly and the agent is never blocked or shown an error.

### Forwarded events

PreToolUse/PostToolUse fire several times per second and the adapter maps both
to the non-attention `task.started`, so forwarding them is high-noise and
low-value. Only the three meaningful lifecycle transitions are forwarded:

| Claude hook        | Adapter mapping  | Pet expression          |
| ------------------ | ---------------- | ----------------------- |
| `UserPromptSubmit` | `task.started`   | starts working          |
| `Notification`     | `task.waiting`   | attention (permission/idle) |
| `Stop`             | `task.completed` | Review Hold (completed) |

`hooks.json` registers one `command` hook per event name, each invoking
`run-hook.cmd forward`.

## Attach command

`/pets-driven:attach` (`commands/attach.md`) is a manual ping mirroring the
app's existing "Poke pet" button. The command body instructs Claude to run:

```
"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" forward attach
```

When `forward` receives the `attach` argument it ignores stdin and synthesizes:

```json
{ "hook_event_name": "Notification", "cwd": "<$PWD>", "message": "Agent attached" }
```

This produces a `task.waiting` attention hold on the bound pet, giving the user
a visible confirmation that the bridge and routing work. A single `forward`
script serves both modes (stdin passthrough vs. synthesized attach) — no extra
file.

## Endpoint coupling

The ingress URL `http://127.0.0.1:43187/claude-hook` is hardcoded in `forward`
and matches `CLAUDE_HOOK_INGRESS_PORT` / `CLAUDE_HOOK_INGRESS_PATH` in
`lib.rs`. A `# ponytail:` comment in the script names this coupling so a future
port change updates both sides.

## Verification

The non-trivial logic is the `forward` script's two modes. It carries one
runnable bash self-check (`forward --self-check`): start a throwaway local
listener (`python -m http.server` one-liner or `nc`), run `forward attach`
against it, and assert the captured POST body
contains `"hook_event_name":"Notification"` and the current `cwd`. If neither
`python` nor `nc` is available, the check prints a skip notice and exits 0. No
test framework, no fixtures.

Manual end-to-end check, documented in the README: with the desktop app
running and a pet adopted on the current folder, run `/pets-driven:attach` and
watch the pet enter its attention state.

## Risks / notes

- Hooks fire for **every** Claude Code session in any directory; the ingress
  drops unregistered `cwd`, so untracked projects cost only a 2-second-capped
  loopback POST that fails fast when the app is down.
- Windows is the primary environment; the polyglot `run-hook.cmd` (reused
  verbatim from the superpowers plugin) locates Git Bash to run `forward`.
