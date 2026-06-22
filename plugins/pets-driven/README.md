# pets-driven (Claude Code plugin)

Forwards Claude Code lifecycle events to the [pets-driven](../../) desktop app
so the pet bound to your project folder reacts while an agent works in it.

## Install

```bash
claude plugin marketplace add ./plugins
claude plugin install pets-driven
```

## What it forwards

| Claude hook        | Pet reaction                  |
| ------------------ | ----------------------------- |
| `UserPromptSubmit` | starts working                |
| `Notification`     | asks for attention            |
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
