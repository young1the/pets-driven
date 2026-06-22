# Pets-Driven Agent Bridge Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Claude Code plugin under `plugins/` that forwards Claude Code lifecycle hook events to the running pets-driven desktop app, plus a manual `/pets-driven:attach` ping command.

**Architecture:** A Claude Code plugin registered through a local marketplace. Hook config (`hooks.json`) invokes a cross-platform wrapper (`run-hook.cmd`) that runs a small bash script (`forward`). `forward` POSTs the hook's stdin JSON unchanged to the app's existing ingress (`http://127.0.0.1:43187/claude-hook`), or synthesizes an attach ping. No desktop-app changes.

**Tech Stack:** Claude Code plugin manifest/hooks/commands (JSON + Markdown), bash, curl. Polyglot `run-hook.cmd` reused verbatim from the superpowers plugin for Windows bash discovery.

## Global Constraints

- All files written to disk (code, comments, docs) are **English-only** (`AGENTS.md`).
- Primary environment is **Windows**; hooks must run via Git Bash through `run-hook.cmd`.
- Ingress endpoint is exactly `http://127.0.0.1:43187/claude-hook` — must match `CLAUDE_HOOK_INGRESS_PORT` (43187) and `CLAUDE_HOOK_INGRESS_PATH` (`/claude-hook`) in `apps/desktop/src-tauri/src/lib.rs`.
- Forwarding must **never block or fail** the agent: curl is silent, time-capped at 2s, and `forward` exits 0 in hook/attach modes even when the app is down.
- Forwarded events are exactly three: `UserPromptSubmit`, `Notification`, `Stop`. Do **not** forward `PreToolUse`/`PostToolUse`.
- Commit messages: `[기타] <English title>` first line, English `-` bullets, **no** `Co-Authored-By` line.

---

### Task 1: Plugin skeleton + local marketplace

**Files:**
- Create: `plugins/.claude-plugin/marketplace.json`
- Create: `plugins/pets-driven/.claude-plugin/plugin.json`

**Interfaces:**
- Produces: an installable (empty) plugin named `pets-driven`, source `./pets-driven`, discoverable via `claude plugin marketplace add ./plugins`.

- [ ] **Step 1: Create the marketplace manifest**

`plugins/.claude-plugin/marketplace.json`:

```json
{
  "name": "pets-driven",
  "description": "Local marketplace for the pets-driven agent bridge plugin.",
  "owner": {
    "name": "pets-driven"
  },
  "plugins": [
    {
      "name": "pets-driven",
      "description": "Forward Claude Code lifecycle events to the pets-driven desktop companion.",
      "version": "0.1.0",
      "source": "./pets-driven"
    }
  ]
}
```

- [ ] **Step 2: Create the plugin manifest**

`plugins/pets-driven/.claude-plugin/plugin.json`:

```json
{
  "name": "pets-driven",
  "description": "Forward Claude Code lifecycle events to the pets-driven desktop companion so the bound pet expresses agent work state.",
  "version": "0.1.0",
  "author": {
    "name": "pets-driven"
  },
  "keywords": ["pets-driven", "hooks", "companion", "agent-events"]
}
```

- [ ] **Step 3: Verify the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('plugins/.claude-plugin/marketplace.json','utf8')); JSON.parse(require('fs').readFileSync('plugins/pets-driven/.claude-plugin/plugin.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add plugins/.claude-plugin/marketplace.json plugins/pets-driven/.claude-plugin/plugin.json
git commit -m "[기타] Add pets-driven plugin skeleton and local marketplace"
```

---

### Task 2: Cross-platform wrapper + forward script (core logic + self-check)

**Files:**
- Create: `plugins/pets-driven/hooks/run-hook.cmd`
- Create: `plugins/pets-driven/hooks/forward`

**Interfaces:**
- Produces:
  - `run-hook.cmd <script-name> [args...]` — finds bash on Windows/Unix and runs `hooks/<script-name>` with `args`, inheriting stdin.
  - `forward` (no arg) — reads JSON from stdin, POSTs it unchanged to the ingress; exits 0.
  - `forward attach` — POSTs `{"hook_event_name":"Notification","cwd":"<$PWD>","message":"Agent attached"}`; exits 0.
  - `forward --self-check` — asserts the synthesized attach body; exits 0 on pass, 1 on fail.

- [ ] **Step 1: Write the failing test (run the not-yet-existing self-check)**

Run: `bash plugins/pets-driven/hooks/forward --self-check`
Expected: FAIL — `bash: .../forward: No such file or directory`

- [ ] **Step 2: Create the polyglot wrapper (verbatim from the superpowers plugin)**

`plugins/pets-driven/hooks/run-hook.cmd`:

```cmd
: << 'CMDBLOCK'
@echo off
REM Cross-platform polyglot wrapper for hook scripts.
REM On Windows: cmd.exe runs the batch portion, which finds and calls bash.
REM On Unix: the shell interprets this as a script (: is a no-op in bash).
REM
REM Hook scripts use extensionless filenames (e.g. "forward" not
REM "forward.sh") so Claude Code's Windows auto-detection -- which
REM prepends "bash" to any command containing .sh -- doesn't interfere.
REM
REM Usage: run-hook.cmd <script-name> [args...]

if "%~1"=="" (
    echo run-hook.cmd: missing script name >&2
    exit /b 1
)

set "HOOK_DIR=%~dp0"

REM Try Git for Windows bash in standard locations
if exist "C:\Program Files\Git\bin\bash.exe" (
    "C:\Program Files\Git\bin\bash.exe" "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if exist "C:\Program Files (x86)\Git\bin\bash.exe" (
    "C:\Program Files (x86)\Git\bin\bash.exe" "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

REM Try bash on PATH (e.g. user-installed Git Bash, MSYS2, Cygwin)
where bash >nul 2>nul
if %ERRORLEVEL% equ 0 (
    bash "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

REM No bash found - exit silently rather than error
REM (plugin still works, just without event forwarding)
exit /b 0
CMDBLOCK

# Unix: run the named script directly
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$1"
shift
exec bash "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
```

- [ ] **Step 3: Write the minimal `forward` implementation**

`plugins/pets-driven/hooks/forward`:

```bash
#!/usr/bin/env bash
# Forward Claude Code hook events to the pets-driven desktop app.
#
# Modes:
#   forward                read hook JSON from stdin, POST it unchanged
#   forward attach         synthesize a Notification ping for $PWD
#   forward --self-check   assert the synthesized attach body, then exit
#
# ponytail: the ingress URL is coupled to CLAUDE_HOOK_INGRESS_PORT (43187)
# and CLAUDE_HOOK_INGRESS_PATH (/claude-hook) in
# apps/desktop/src-tauri/src/lib.rs -- change both sides if the port moves.

INGRESS_URL="http://127.0.0.1:43187/claude-hook"

post() {
  # -s silent, -m 2 caps the wait so a stopped app never blocks the agent.
  curl -s -m 2 -X POST "$INGRESS_URL" \
    -H "Content-Type: application/json" --data-binary "$1" >/dev/null 2>&1
}

json_escape() {
  # Escape backslashes and double quotes so a path embeds safely in JSON.
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

attach_body() {
  printf '{"hook_event_name":"Notification","cwd":"%s","message":"Agent attached"}' \
    "$(json_escape "$PWD")"
}

self_check() {
  local out
  out="$(attach_body)"
  case "$out" in
    *'"hook_event_name":"Notification"'*) ;;
    *) echo "FAIL: missing hook_event_name in: $out" >&2; exit 1 ;;
  esac
  case "$out" in
    *"$(json_escape "$PWD")"*) ;;
    *) echo "FAIL: cwd not embedded in: $out" >&2; exit 1 ;;
  esac
  echo "self-check passed"
  exit 0
}

case "$1" in
  --self-check) self_check ;;
  attach) post "$(attach_body)" ;;
  *) post "$(cat)" ;;
esac

exit 0
```

- [ ] **Step 4: Run the self-check to verify it passes**

Run: `bash plugins/pets-driven/hooks/forward --self-check`
Expected: `self-check passed` and exit code 0.

- [ ] **Step 5: Verify a stdin POST fails fast when the app is down (no hang, exit 0)**

Run: `echo '{"hook_event_name":"Stop","cwd":"/tmp"}' | bash plugins/pets-driven/hooks/forward; echo "exit=$?"`
Expected: returns within ~2s, prints `exit=0` (no error output even though the app may not be running).

- [ ] **Step 6: Commit**

```bash
git add plugins/pets-driven/hooks/run-hook.cmd plugins/pets-driven/hooks/forward
git commit -m "[기타] Add cross-platform hook wrapper and event-forwarding script"
```

---

### Task 3: Register the forwarded lifecycle hooks

**Files:**
- Create: `plugins/pets-driven/hooks/hooks.json`

**Interfaces:**
- Consumes: `run-hook.cmd forward` from Task 2.
- Produces: `hooks.json` wiring `UserPromptSubmit`, `Notification`, `Stop` to the forwarder, each `async`.

- [ ] **Step 1: Create the hook config**

`plugins/pets-driven/hooks/hooks.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" forward",
            "async": true
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" forward",
            "async": true
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" forward",
            "async": true
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verify the JSON parses and registers exactly the three events**

Run: `node -e "const h=JSON.parse(require('fs').readFileSync('plugins/pets-driven/hooks/hooks.json','utf8')).hooks; const k=Object.keys(h).sort().join(','); if(k!=='Notification,Stop,UserPromptSubmit')throw new Error('unexpected events: '+k); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add plugins/pets-driven/hooks/hooks.json
git commit -m "[기타] Forward UserPromptSubmit, Notification, and Stop hooks to pets-driven"
```

---

### Task 4: Attach command + README

**Files:**
- Create: `plugins/pets-driven/commands/attach.md`
- Create: `plugins/pets-driven/README.md`

**Interfaces:**
- Consumes: `run-hook.cmd forward attach` from Task 2.
- Produces: the `/pets-driven:attach` slash command and user-facing docs.

- [ ] **Step 1: Create the attach command**

`plugins/pets-driven/commands/attach.md`:

````markdown
---
description: Ping the pets-driven pet bound to the current folder to confirm the bridge is connected.
allowed-tools: Bash(*)
---

Send a one-off attention ping to the pets-driven desktop app for the current
working directory by running:

```bash
"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" forward attach
```

After running it, tell the user to look at their pet. If the pets-driven
desktop app is running and a pet is adopted on this folder, the pet enters its
attention state. If nothing happens, remind them that the desktop app must be
running and the current folder must be adopted as a pet.
````

- [ ] **Step 2: Create the README**

`plugins/pets-driven/README.md`:

```markdown
# pets-driven (Claude Code plugin)

Forwards Claude Code lifecycle events to the [pets-driven](../../) desktop app
so the pet bound to your project folder reacts while an agent works in it.

## Install

```bash
claude plugin marketplace add ./plugins
claude plugin install pets-driven
```

## What it forwards

| Claude hook        | Pet reaction                |
| ------------------ | --------------------------- |
| `UserPromptSubmit` | starts working              |
| `Notification`     | asks for attention          |
| `Stop`             | shows a completed/review hold |

The pets-driven desktop app must be running; events for folders you have not
adopted as a pet are ignored. If the app is down, forwarding fails silently and
never blocks the agent.

## Verify the connection

With the app running and a pet adopted on the current folder, run:

```
/pets-driven:attach
```

The pet should enter its attention state.
```

- [ ] **Step 3: Verify the command frontmatter parses**

Run: `node -e "const s=require('fs').readFileSync('plugins/pets-driven/commands/attach.md','utf8'); if(!/^---[\s\S]*description:[\s\S]*---/.test(s))throw new Error('missing frontmatter'); if(!s.includes('run-hook.cmd\" forward attach'))throw new Error('missing attach invocation'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add plugins/pets-driven/commands/attach.md plugins/pets-driven/README.md
git commit -m "[기타] Add /pets-driven:attach command and plugin README"
```

---

## Manual end-to-end verification (after all tasks)

1. Start the desktop app (`pnpm tauri dev`) and adopt a pet on a test folder.
2. From that folder, run `claude plugin marketplace add ./plugins` then `claude plugin install pets-driven`.
3. Run `/pets-driven:attach` — the pet should enter its attention state.
4. Submit a prompt and let the agent stop — the pet should show working then a completed/review hold.
