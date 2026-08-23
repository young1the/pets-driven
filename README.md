<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

<img src="apps/desktop/src-tauri/icons/128x128@2x.png" alt="Pets Driven" width="120" />

<h1>Pets Driven</h1>

A desktop app for multi-agent work

[![Latest release](https://img.shields.io/github/v/release/young1the/pets-driven?sort=semver&color=F95E9E&label=release)](https://github.com/young1the/pets-driven/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/young1the/pets-driven/total?color=16B8A6)](https://github.com/young1the/pets-driven/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20%2B%20React-24C8DB.svg)

**English** · [한국어](./README.ko.md)

[How you use it](#-how-you-use-it) · [Features](#-features) · [Download](#-download)

</div>

## 🎬 How you use it

### 1. Pick a pet and bind it to a project

<img src="docs/assets/part1.gif" alt="Choosing a pet and sending it out to the desktop" width="720" />

One pet per directory. Pick one from the cards and it walks out onto your desktop.

### 2. Use your terminal as usual

<img src="docs/assets/part2.gif" alt="A pet reacting to an agent running in the terminal" width="720" />

Run your agent the way you always do, and the pet shows its status for you.

### 3. Take one out and play, even with nothing running

<img src="docs/assets/part3.gif" alt="Taking a pet out to play on the desktop, unrelated to any task" width="720" />

Your pets are on the desktop whether or not work is running. Take them out, toss them around, hand them a treat.

### 4. When it's done, the pet calls you

<img src="docs/assets/part4.gif" alt="A pet reacting to a finished task" width="720" />

Completed, failed, and waiting all make the pet stop and flag you. Pet it or click it.

## 🧩 It does this too

|  |  |
| :-- | :-- |
| <img src="docs/assets/codex.gif" alt="A pet running alongside the Codex CLI" width="380" /> | **Codex works too**<br/>Not Claude Code only. Pets react through the same hooks in the OpenAI Codex CLI. |
| <img src="docs/assets/play.gif" alt="Pets playing together on their own" width="380" /> | **Leave them alone and they play**<br/>With nothing to do, pets greet each other, chat, and give chase. They don't only live while you're watching. |
| <img src="docs/assets/orca.gif" alt="A pet hatching for each Orca worktree" width="380" /> | **Works with Orca**<br/>Two lines in your worktree hooks — `pdd hatch` and `pdd delete` — are all it takes. Every worktree gets its own pet, and clearing the worktree clears the pet with it.<br/>→ [How to set it up](./crates/pets-driven-cli/README.md#orca-worktree-hooks) |

---

## ✨ Features

- 🔔 **It tells you when work finishes**
- 🧠 **A real little mind**, 👥 **pets socialize**, 🎭 **personalities & assets**
- ⌨️ **The CLI does all of it** — `pdd` alone hatches a pet, renames it, re-skins it, re-tempers it, and deletes it. It works with the app closed, and its JSON output pipes straight into a script. The installer ships it and puts it on your PATH. → [Full command list](./crates/pets-driven-cli/README.md)
- 🤖 **Agents drive it themselves** — plugins for both Claude Code and Codex are included. `hatch` creates a pet, `bring` pulls a repo into a worktree, and `carry` hands the work off to the next agent. Hooks forward agent events to the app, so the pet reacts. → [Browse the plugin](./plugins/pets-driven)

## ⬇️ Download

[![Download for Windows](https://img.shields.io/badge/Download-Windows%20Installer-F95E9E?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/young1the/pets-driven/releases/latest/download/PetsDriven-windows-x64-setup.exe)

The badge downloads the newest installer directly. Run the `.exe` and you're done.
Want to see what's in it first? Browse the **[latest release](https://github.com/young1the/pets-driven/releases/latest)**.

> macOS and Linux builds aren't published yet. The app is built with [Tauri](https://tauri.app), so they're on the roadmap.
> Until then, please build from source.

## 📄 License

[MIT](./LICENSE) © 2026 pets-driven contributors.
