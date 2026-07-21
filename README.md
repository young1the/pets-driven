<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

<img src="apps/desktop/src-tauri/icons/128x128@2x.png" alt="Pets Driven" width="120" />

<h1>Pets Driven</h1>

<p><strong>Your coding agents, as desktop pets.</strong><br/>
A little companion lives on your desktop for each project. It walks, naps, and plays on its own —
and springs to attention the moment its agent needs you.</p>

[![Latest release](https://img.shields.io/github/v/release/young1the/pets-driven?sort=semver&color=F95E9E&label=release)](https://github.com/young1the/pets-driven/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/young1the/pets-driven/total?color=16B8A6)](https://github.com/young1the/pets-driven/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20%2B%20React-24C8DB.svg)

**English** · [한국어](./README.ko.md)

[Download](#-download) · [Features](#-features) · [Getting started](#-getting-started) · [Agent integration](#-agent-integration)

</div>

<!-- TODO(maintainer): drop a short demo GIF here — a pet wandering, then reacting to a finished agent task.
     This is the single most important asset for a desktop-pet README. -->
<div align="center">
  <img src="docs/assets/demo.gif" alt="A pet reacting to its agent finishing a task" width="640" />
</div>

---

## What is Pets Driven?

When you run a coding agent, its real work is buried in a terminal. **Pets Driven** gives that work
a face. Every project folder you register gets **one pet** — a small character that lives on your
desktop and stands in for exactly one agent execution.

The pet shows two things at once, on two independent axes:

- **What the agent is doing** — `working`, `waiting`, `completed`, `failed`, or `idle`, reported by
  the agent through a hook-driven event feed.
- **What the pet is doing** — wandering, hopping, chatting with a neighbor — an autonomous life the
  simulation computes on its own.

So a glance tells you both the mood of the room and the state of your work. When an agent finishes,
stalls, or needs a decision, the bound pet stops, shows an **attention badge**, and waits. You
acknowledge it by **petting** it — a small stroke gesture — and it settles back into its day.

> One pet ⇄ one working directory ⇄ one agent. No shared inbox, no ambiguous notifications —
> the folder is the identity.

## ✨ Features

- 🐾 **One pet per project** — each registered working directory gets a single pet bound to its agent, so parallel agents never blur together.
- 🖥️ **Lives on your desktop** — pets are transparent overlay windows that walk along your screen floor, above the taskbar, with click-through everywhere except the pet itself.
- 🔔 **Attention that you dismiss on purpose** — `waiting`, `failed`, and `completed` events raise an attention hold that stays until you *pet* it. Notifications don't quietly disappear.
- 🧠 **A real little mind** — a Drives → Decision → Locomotion → Steering pipeline (physics by Matter.js) drives autonomous behavior, colored by a short-lived **mood** that reacts to being petted, startled, or finishing work.
- 👥 **Pets socialize** — nearby pets greet, chat, and chase each other in transient group sessions, then wind down with a contented afterglow.
- 🖥️🖥️ **Multi-monitor aware** — one shared simulation world spans your whole virtual desktop, so pets roam across monitors as a single continuous space.
- 🎭 **Personalities & assets** — pick a look and a temperament at "birth," tune it later, or let an agent skill help map an asset to a personality preset.
- 🔌 **Agent-agnostic bridge** — a lightweight hook bridge forwards agent events by working directory, so pets react whether the terminal is inside the app or attached from outside.
- 🌏 **Localized** — English and Korean out of the box.

## ⬇️ Download

[![Download for Windows](https://img.shields.io/badge/Download-Windows%20Installer-F95E9E?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/young1the/pets-driven/releases/latest)

Grab the installer from the **[latest release](https://github.com/young1the/pets-driven/releases/latest)** —
download the `.exe` and run it. That link always points at the newest published version.

> macOS and Linux builds aren't published yet. The app is built with [Tauri](https://tauri.app), so
> they're on the roadmap — until then, [build from source](#-getting-started).

## 🚀 Getting started

> **Status:** early development. Prebuilt **Windows** installers live on the
> [releases page](https://github.com/young1the/pets-driven/releases/latest); macOS and Linux are on
> the roadmap. Prefer to hack on it? Build from source below.

### Prerequisites

- [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io) `10.x`
- The [Rust toolchain](https://www.rust-lang.org/tools/install) (for the Tauri desktop shell)
- Platform prerequisites for Tauri — see the [Tauri setup guide](https://tauri.app/start/prerequisites/)

### Run the desktop app

```bash
# 1. Install dependencies
pnpm install

# 2. Launch the Tauri desktop app (pets on your desktop)
pnpm dev

# Or preview the simulation in the browser playground (no native shell)
pnpm dev:playground
```

### Build

```bash
pnpm build            # bundle the desktop app
pnpm test             # run the test suites
pnpm check            # lint + format check (Biome)
```

## 🤖 Agent integration

Pets Driven ships a plugin ([`plugins/pets-driven`](./plugins/pets-driven)) that adds slash
commands and a hook bridge so your agent can hatch pets and report progress:

| Command | What it does |
|---------|--------------|
| **`hatch`** | Create a pet for the current folder — choose its asset and personality. |
| **`attach`** | Ping the pet bound to this folder to confirm the bridge is connected. |
| **`bring`** | Pull a project into an agent's folder (`git clone` or `git worktree`) and hand it to a pet. |
| **`carry`** | Summarize what an agent did and where the work lives into a compact handoff for the next agent. |

Events are matched to pets by **working directory**, not by trusting a provider's session id — so a
pet reacts even when its terminal is attached from outside the app.

## 📄 License

[MIT](./LICENSE) © 2026 pets-driven contributors.

<div align="center">
<sub>Built for developers who'd rather glance at a happy pet than scan a wall of logs.</sub>
</div>
