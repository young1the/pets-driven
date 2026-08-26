<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

<img src="apps/desktop/src-tauri/icons/128x128@2x.png" alt="Pets Driven" width="120" />

<h1>Pets Driven</h1>

Claude Code・Codex CLI エージェントの状態を教えてくれるデスクトップペット

[![Latest release](https://img.shields.io/github/v/release/young1the/pets-driven?sort=semver&color=F95E9E&label=release)](https://github.com/young1the/pets-driven/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/young1the/pets-driven/total?color=16B8A6)](https://github.com/young1the/pets-driven/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20%2B%20React-24C8DB.svg)

[English](./README.md) · [한국어](./README.ko.md) · **日本語** · [简体中文](./README.zh.md)

[使い方](#-使い方) · [Petdex 連携](#-petdex-連携) · [機能](#-機能) · [ダウンロード](#-ダウンロード)

</div>

**Pets Driven** は、AI コーディングエージェントを使う人のための Windows デスクトップペットアプリです。**Claude Code** と **OpenAI Codex CLI** のフックがエージェントの動きをそのままペットに渡すので、デスクトップを一目見るだけで、実行中か、返事待ちか、完了か、失敗かが分かります。いつ終わるか分からないタスクのためにターミナルを眺め続ける必要はありません。ディレクトリごとに一匹だから、エージェントを同時に何本走らせても一目で見分けられます。Tauri と React 製、MIT ライセンス、そしてアプリと同じことがすべてできる `pdd` CLI が同梱されています。

## 🎬 使い方

### 1. ペットを選んでプロジェクトに紐づける

<img src="docs/assets/part1.gif" alt="ペットを選んでデスクトップに送り出す様子" width="720" />

ディレクトリひとつにペット一匹。カードから選ぶと、そのままデスクトップへ歩き出します。

### 2. ターミナルはいつも通りに使う

<img src="docs/assets/part2.gif" alt="ターミナルで動くエージェントに反応するペット" width="720" />

いつもどおりエージェントを動かせば、ペットがその状態を代わりに見せてくれます。

### 3. 何も動いていなくても、連れ出して遊べる

<img src="docs/assets/part3.gif" alt="タスクと関係なくペットを連れ出してデスクトップで遊ぶ様子" width="720" />

作業中でなくてもペットはデスクトップにいます。つまみ上げて、放り投げて、おやつをあげてください。

### 4. 終わったらペットが呼んでくれる

<img src="docs/assets/part4.gif" alt="完了したタスクに反応するペット" width="720" />

完了・失敗・待機のどれでも、ペットが立ち止まって知らせます。撫でるか、クリックしてあげてください。

## 🐾 Petdex 連携

Pets Driven は [Petdex](https://petdex.dev) と連携しています。Petdex には 2026年8月24日時点で 4,579 個を超えるオープンソースのペットアセットが公開されています。

```bash
npx petdex install <slug>
```

このコマンドで入れたペットは `~/.petdex/pets` に保存されます。Pets Driven はこのフォルダを自動で見つけて、オンボーディングとペット選択の画面に一覧表示するので、そのまま作業ディレクトリに紐づけられます。

## 🧩 こんなこともできます

|  |  |
| :-- | :-- |
| <img src="docs/assets/codex.gif" alt="Codex CLI と並んで動くペット" width="380" /> | **Codex にも対応**<br/>Claude Code 専用ではありません。OpenAI Codex CLI でも同じフックでペットが反応します。 |
| <img src="docs/assets/play.gif" alt="自分たちだけで遊ぶペットたち" width="380" /> | **放っておくと勝手に遊びます**<br/>やることがないと、ペットたちは挨拶したり、おしゃべりしたり、追いかけっこをします。見ているときだけ生きているわけではありません。 |
| <img src="docs/assets/orca.gif" alt="Orca の worktree ごとに孵化するペット" width="380" /> | **Orca と連携できます**<br/>worktree のフックに `pdd hatch` と `pdd delete` の 2 行を書くだけ。worktree ごとにペットが 1 匹生まれ、worktree を片付けるとペットも一緒に消えます。<br/>→ [設定方法](./crates/pets-driven-cli/README.md#orca-worktree-hooks) |

---

## ✨ 機能

- 🔔 **作業が終わったら知らせてくれる**
- 🧠 **ちゃんと小さな心がある**、👥 **ペット同士で交流する**、🎭 **性格とアセット**
- ⌨️ **CLI だけで全部できる** — `pdd` ひとつでペットを孵化させ、名前・見た目・性格を変え、削除できます。アプリを閉じたままでも動き、JSON 出力はそのままスクリプトに繋げられます。インストーラーに同梱され、PATH にも自動で登録されます。 → [コマンド一覧](./crates/pets-driven-cli/README.md)
- 🤖 **エージェント自身が操作する** — Claude Code と Codex 用のプラグインが付属します。`hatch` でペットを作り、`bring` でリポジトリを worktree に持ち込み、`carry` で作業を次のエージェントへ引き継ぎます。フックがエージェントのイベントをアプリへ流し、ペットが反応します。 → [プラグインを見る](./plugins/pets-driven)

## ⬇️ ダウンロード

[![Download for Windows](https://img.shields.io/badge/Download-Windows%20Installer-F95E9E?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/young1the/pets-driven/releases/latest/download/PetsDriven-windows-x64-setup.exe)

上のバッジから最新のインストーラーを直接ダウンロードできます。`.exe` を実行すれば完了です。
中身を先に確認したい場合は **[最新リリース](https://github.com/young1the/pets-driven/releases/latest)** をご覧ください。

> macOS・Linux 向けビルドはまだ配布していません。[Tauri](https://tauri.app) で作っているので、ロードマップには入っています。
> それまではソースからビルドしてください。

## 📄 ライセンス

[MIT](./LICENSE) © 2026 pets-driven contributors.
