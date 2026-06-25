# pets-driven (Claude Code plugin)

Forwards Claude Code lifecycle events to the [pets-driven](../../) desktop app
so the pet bound to your project folder reacts while an agent works in it.

## Install

```bash
claude plugin marketplace add ./plugins
claude plugin install pets-driven
```

## Install for Codex

```bash
codex plugin marketplace add ./plugins
codex
/plugins
```

Choose the `pets-driven` marketplace and install `pets-driven`. Start a new
Codex thread after installation so bundled skills and hooks are loaded.

## What it forwards

| Claude hook        | Pet reaction                  |
| ------------------ | ----------------------------- |
| `UserPromptSubmit` | starts working                |
| `Notification`     | asks for attention            |
| `Stop`             | shows a completed/review hold |

The pets-driven desktop app must be running; events for folders you have not
adopted as a pet are ignored. If the app is down, forwarding fails silently and
never blocks the agent.

For Codex, the plugin forwards `UserPromptSubmit`, `PermissionRequest`, and
`Stop` through the same pets-driven ingress.

## Verify the connection

With the app running and a pet adopted on the current folder, run:

```
/pets-driven:attach
```

The pet should enter its attention state.

## Create a pet from the CLI

With the app running, hatch a new pet for the current folder:

```
/pets-driven:hatch
```

The agent walks you through choosing an installed asset, a personality preset,
and a name, then asks the backend to create the pet. It appears on your desktop.
