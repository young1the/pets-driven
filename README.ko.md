<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

<img src="apps/desktop/src-tauri/icons/128x128@2x.png" alt="Pets Driven" width="120" />

<h1>Pets Driven</h1>

멀티 에이전트를 위한 데스크톱 앱

[![Latest release](https://img.shields.io/github/v/release/young1the/pets-driven?sort=semver&color=F95E9E&label=release)](https://github.com/young1the/pets-driven/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/young1the/pets-driven/total?color=16B8A6)](https://github.com/young1the/pets-driven/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20%2B%20React-24C8DB.svg)

[English](./README.md) · **한국어**

[이렇게 써요](#-이렇게-써요) · [Petdex 연동](#-petdex-연동) · [기능](#-기능) · [다운로드](#-다운로드)

</div>

## 🎬 이렇게 써요

### 1. 펫을 뽑아 프로젝트에 붙여요

<img src="docs/assets/part1.gif" alt="펫을 골라 데스크톱으로 내보내는 화면" width="720" />

디렉터리 하나에 펫 하나예요. 카드에서 고르면 데스크톱으로 나와요.

### 2. 터미널은 평소대로 써요

<img src="docs/assets/part2.gif" alt="터미널에서 에이전트를 실행하자 펫이 반응하는 화면" width="720" />

에이전트를 평소처럼 돌리면 펫이 그 작업 상태를 대신 보여줘요.

### 3. 일 안 시켜도 꺼내서 놀아요

<img src="docs/assets/part3.gif" alt="작업과 무관하게 펫을 꺼내 데스크톱에서 노는 화면" width="720" />

작업 중이 아니어도 펫은 데스크톱에 있어요. 꺼내고, 던지고, 간식도 줘요.

### 4. 끝나면 펫이 불러요

<img src="docs/assets/part4.gif" alt="작업 완료에 반응하는 펫" width="720" />

완료·실패·대기는 펫이 멈춰 서서 알려요. 쓰다듬거나 클릭해주세요.

## 🐾 Petdex 연동

Pets Driven은 [Petdex](https://petdex.dev)와 연동돼요. Petdex에는 2026년 8월 24일 기준 4,579개 이상의 오픈소스 펫 에셋이 올라와 있어요.

```bash
npx petdex install <slug>
```

명령어로 설치한 펫은 `~/.petdex/pets`에 저장되고, Pets Driven이 이 폴더를 자동으로 찾아 온보딩과 펫 선택 화면에 보여줘요. Petdex에서 마음에 드는 펫을 설치한 다음 작업 디렉터리에 바로 연결할 수 있어요.

## 🧩 이것도 돼요

|  |  |
| :-- | :-- |
| <img src="docs/assets/codex.gif" alt="Codex CLI와 함께 동작하는 펫" width="380" /> | **Codex도 지원해요**<br/>Claude Code 전용이 아니에요. OpenAI Codex CLI에서도 같은 훅으로 펫이 반응해요. |
| <img src="docs/assets/play.gif" alt="자기들끼리 어울려 노는 펫들" width="380" /> | **놔두면 자기들끼리 놀아요**<br/>시킬 일이 없으면 펫끼리 인사하고, 수다 떨고, 쫓아다녀요. 볼 때만 사는 게 아니에요. |
| <img src="docs/assets/orca.gif" alt="Orca worktree마다 펫이 하나씩 생기는 화면" width="380" /> | **Orca와 연동돼요**<br/>worktree 훅에 `pdd hatch`와 `pdd delete` 두 줄만 넣으면 돼요. worktree마다 펫이 하나씩 생기고, 정리하면 같이 사라져요.<br/>→ [설정 방법](./crates/pets-driven-cli/README.md#orca-worktree-hooks) |

---

## ✨ 기능

- 🔔 **작업이 끝나면 알려줘요**
- 🧠 **진짜 작은 마음**, 👥 **펫끼리 어울려요**, 🎭 **성격과 에셋**
- ⌨️ **CLI로도 다 돼요** — `pdd` 하나로 펫을 만들고, 이름·외형·성격을 바꾸고, 지워요. 앱이 꺼져 있어도 동작하고 결과가 JSON이라 스크립트에 그대로 물려요. 설치 파일에 함께 들어가고 PATH에도 자동으로 등록돼요. → [명령어 전체 보기](./crates/pets-driven-cli/README.md)
- 🤖 **에이전트가 직접 다뤄요** — Claude Code와 Codex용 플러그인을 함께 제공해요. `hatch`로 펫을 만들고, `bring`으로 레포를 worktree에 가져오고, `carry`로 하던 일을 다음 에이전트에게 넘겨요. 훅이 에이전트 이벤트를 앱으로 흘려보내서 펫이 반응하고요. → [플러그인 보기](./plugins/pets-driven)

## ⬇️ 다운로드

[![Download for Windows](https://img.shields.io/badge/Download-Windows%20Installer-F95E9E?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/young1the/pets-driven/releases/latest/download/PetsDriven-windows-x64-setup.exe)

위 배지를 누르면 최신 버전 설치 파일을 바로 받아요. `.exe`를 실행하면 끝이에요.
변경 내역을 먼저 보고 싶다면 **[최신 릴리스](https://github.com/young1the/pets-driven/releases/latest)**를 확인해요.

> macOS·Linux 빌드는 아직 배포 전이에요. [Tauri](https://tauri.app)로 만들어서 로드맵에는 있어요.
> 그전까지는 소스에서 빌드해 주세요.

## 📄 라이선스

[MIT](./LICENSE) © 2026 pets-driven contributors.
