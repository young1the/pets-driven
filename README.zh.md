<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

<img src="apps/desktop/src-tauri/icons/128x128@2x.png" alt="Pets Driven" width="120" />

<h1>Pets Driven</h1>

告诉你 Claude Code 和 Codex CLI 助手在干什么的桌面宠物

[![Latest release](https://img.shields.io/github/v/release/young1the/pets-driven?sort=semver&color=F95E9E&label=release)](https://github.com/young1the/pets-driven/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/young1the/pets-driven/total?color=16B8A6)](https://github.com/young1the/pets-driven/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20%2B%20React-24C8DB.svg)

[English](./README.md) · [한국어](./README.ko.md) · [日本語](./README.ja.md) · **简体中文**

[怎么用](#-怎么用) · [Petdex 集成](#-petdex-集成) · [功能](#-功能) · [下载](#-下载)

</div>

**Pets Driven** 是一款面向 AI 编程助手用户的 Windows 桌面宠物应用。**Claude Code** 和 **OpenAI Codex CLI** 的钩子会把助手正在做的事直接交给宠物，所以看一眼桌面就知道任务是在跑、在等你、已完成，还是失败了——不用为了一个不知道什么时候结束的任务，一直盯着终端。一个项目目录配一只宠物，即使同时跑好几个助手，也能一眼看清。它用 Tauri 和 React 构建，采用 MIT 许可证，并自带一个功能与应用完全对等的 `pdd` 命令行工具。

## 🎬 怎么用

### 1. 挑一只宠物，绑定到项目

<img src="docs/assets/part1.gif" alt="挑选一只宠物并把它送上桌面" width="720" />

一个目录一只宠物。从卡片里挑中一只，它就会走上你的桌面。

### 2. 终端照常用

<img src="docs/assets/part2.gif" alt="一只宠物对终端里运行的助手做出反应" width="720" />

像往常一样运行你的助手，宠物会替你把状态显示出来。

### 3. 没在跑任务时，也能拎出来玩

<img src="docs/assets/part3.gif" alt="与任务无关地把宠物拎出来在桌面上玩耍" width="720" />

不管有没有活在跑，宠物都待在桌面上。把它们拎起来、抛着玩、喂点零食。

### 4. 干完了，宠物会叫你

<img src="docs/assets/part4.gif" alt="一只宠物对完成的任务做出反应" width="720" />

完成、失败、等待中，都会让宠物停下来提醒你。摸摸它，或者点它一下。

## 🐾 Petdex 集成

Pets Driven 与 [Petdex](https://petdex.dev) 集成。截至 2026 年 8 月 24 日，Petdex 上已有超过 4,579 个开源宠物素材。

```bash
npx petdex install <slug>
```

用这条命令安装的宠物会存放在 `~/.petdex/pets`。Pets Driven 会自动发现这个目录，并在引导流程和宠物选择界面里列出其中的宠物，随时可以绑定到工作目录。

## 🧩 它还能这样

|  |  |
| :-- | :-- |
| <img src="docs/assets/codex.gif" alt="一只宠物陪着 Codex CLI 一起运行" width="380" /> | **Codex 同样支持**<br/>不只支持 Claude Code。在 OpenAI Codex CLI 里，宠物也通过同样的钩子做出反应。 |
| <img src="docs/assets/play.gif" alt="宠物们自己凑在一起玩耍" width="380" /> | **不管它们，它们自己会玩**<br/>闲下来的时候，宠物们会互相打招呼、聊天、追来追去。它们并不是只在你看着的时候才活着。 |
| <img src="docs/assets/orca.gif" alt="每个 Orca 工作树都孵出一只宠物" width="380" /> | **可以配合 Orca 使用**<br/>在工作树钩子里写两行——`pdd hatch` 和 `pdd delete`——就够了。每个工作树都会有自己的宠物，清掉工作树时宠物也一并消失。<br/>→ [配置方法](./crates/pets-driven-cli/README.md#orca-worktree-hooks) |

---

## ✨ 功能

- 🔔 **活干完了会通知你**
- 🧠 **真的有个小脑袋**、👥 **宠物之间会社交**、🎭 **性格与外观素材**
- ⌨️ **命令行也能做全套** — 光靠 `pdd` 就能孵化宠物、改名字、换外观、调性格、删除它。应用关着也照样能用，JSON 输出可以直接接进脚本。安装程序会一并安装它并加入 PATH。 → [完整命令列表](./crates/pets-driven-cli/README.md)
- 🤖 **助手自己就能操作** — 内置了 Claude Code 和 Codex 两边的插件。`hatch` 创建宠物，`bring` 把仓库拉进工作树，`carry` 把工作交接给下一个助手。钩子会把助手事件转发给应用，宠物随之反应。 → [浏览插件](./plugins/pets-driven)

## ⬇️ 下载

[![Download for Windows](https://img.shields.io/badge/Download-Windows%20Installer-F95E9E?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/young1the/pets-driven/releases/latest/download/PetsDriven-windows-x64-setup.exe)

点上面的徽章就能直接下载最新的安装程序。运行 `.exe` 就装好了。
想先看看里面有什么？去看 **[最新发布](https://github.com/young1the/pets-driven/releases/latest)**。

> macOS 和 Linux 的构建还没有发布。应用是用 [Tauri](https://tauri.app) 做的，所以这两个平台已经在路线图上。
> 在那之前，请从源码构建。

## 📄 许可证

[MIT](./LICENSE) © 2026 pets-driven contributors.
