<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

<img src="apps/desktop/src-tauri/icons/128x128@2x.png" alt="Pets Driven" width="120" />

<h1>Pets Driven</h1>

<p><strong>코딩 에이전트를 데스크톱 펫으로.</strong><br/>
프로젝트마다 작은 컴패니언 하나가 데스크톱에 삽니다. 스스로 걷고, 졸고, 놀다가 —
자신의 에이전트가 당신을 필요로 하는 순간 번쩍 주의를 요청합니다.</p>

[![Latest release](https://img.shields.io/github/v/release/young1the/pets-driven?sort=semver&color=F95E9E&label=release)](https://github.com/young1the/pets-driven/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/young1the/pets-driven/total?color=16B8A6)](https://github.com/young1the/pets-driven/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20%2B%20React-24C8DB.svg)

[English](./README.md) · **한국어**

[다운로드](#-다운로드) · [기능](#-기능) · [시작하기](#-시작하기) · [에이전트 연동](#-에이전트-연동)

</div>

<!-- TODO(maintainer): 데모 GIF 삽입 — 펫이 돌아다니다가 에이전트 작업 완료에 반응하는 장면.
     데스크톱 펫 README에서 가장 중요한 자산입니다. -->
<div align="center">
  <img src="docs/assets/demo.gif" alt="에이전트 작업 완료에 반응하는 펫" width="640" />
</div>

---

## Pets Driven이란?

코딩 에이전트를 실행하면 실제 작업은 터미널 속에 파묻힙니다. **Pets Driven**은 그 작업에
얼굴을 부여합니다. 등록한 프로젝트 폴더마다 **펫 하나**가 생기고 — 데스크톱에 살면서 정확히
하나의 에이전트 실행을 대변하는 작은 캐릭터입니다.

펫은 서로 독립적인 두 축 위에서 두 가지를 동시에 보여줍니다:

- **에이전트가 무엇을 하고 있는지** — `working`(작업 중), `waiting`(대기), `completed`(완료),
  `failed`(실패), `idle`(유휴). hook 기반 이벤트 피드를 통해 에이전트가 직접 보고합니다.
- **펫이 무엇을 하고 있는지** — 돌아다니기, 폴짝 뛰기, 이웃과 수다 떨기. 시뮬레이션이 스스로
  계산하는 자율적인 삶입니다.

그래서 한 번 흘긋 보는 것만으로 방 전체의 분위기와 내 작업 상태를 함께 파악할 수 있습니다.
에이전트가 작업을 끝내거나, 멈추거나, 결정을 기다릴 때 해당 펫은 동작을 멈추고 **주의 배지**를
띄운 채 기다립니다. 당신은 펫을 **쓰다듬어서**(작은 스트로크 제스처) 이를 확인하고, 펫은 다시
자기 일상으로 돌아갑니다.

> 펫 하나 ⇄ 작업 디렉터리 하나 ⇄ 에이전트 하나. 공용 수신함도, 모호한 알림도 없습니다 —
> 폴더가 곧 정체성입니다.

## ✨ 기능

- 🐾 **프로젝트당 펫 하나** — 등록된 작업 디렉터리마다 에이전트에 묶인 펫이 하나씩 생겨, 병렬로 도는 에이전트들이 뒤섞이지 않습니다.
- 🖥️ **데스크톱 위에 삽니다** — 펫은 투명 오버레이 창으로, 작업표시줄 위 화면 바닥을 따라 걸어 다니며, 펫 본체를 제외한 모든 영역은 클릭이 통과합니다.
- 🔔 **직접 확인해야 사라지는 주의 요청** — `waiting`, `failed`, `completed` 이벤트는 주의 상태(attention hold)를 만들고, 당신이 *쓰다듬을* 때까지 유지됩니다. 알림이 슬그머니 사라지지 않습니다.
- 🧠 **진짜 작은 마음** — Drives → Decision → Locomotion → Steering 파이프라인(물리 엔진은 Matter.js)이 자율 행동을 이끌며, 쓰다듬김·놀람·작업 완료에 반응하는 짧은 **무드(mood)**가 색을 입힙니다.
- 👥 **펫끼리 어울립니다** — 가까운 펫들이 인사하고, 수다 떨고, 서로 쫓는 짧은 그룹 세션을 갖다가 흡족한 여운(afterglow)과 함께 마무리합니다.
- 🖥️🖥️ **멀티 모니터 인식** — 하나의 공유 시뮬레이션 월드가 가상 데스크톱 전체에 걸쳐 있어, 펫들이 여러 모니터를 하나의 연속된 공간처럼 돌아다닙니다.
- 🎭 **성격과 에셋** — "탄생" 시 외형과 기질을 고르고, 나중에 조정하거나, 에이전트 스킬의 도움을 받아 에셋을 성격 프리셋에 매핑할 수 있습니다.
- 🔌 **에이전트 비종속 브리지** — 가벼운 hook 브리지가 작업 디렉터리를 기준으로 에이전트 이벤트를 전달하므로, 터미널이 앱 안에 있든 밖에서 붙였든 펫이 반응합니다.
- 🌏 **다국어 지원** — 영어와 한국어를 기본 제공합니다.

## ⬇️ 다운로드

[![Download for Windows](https://img.shields.io/badge/Download-Windows%20Installer-F95E9E?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/young1the/pets-driven/releases/latest/download/PetsDriven-windows-x64-setup.exe)

위 배지를 누르면 가장 최근에 공개된 버전의 설치 파일이 바로 내려받아집니다 — `.exe`를 실행하면 끝입니다.
변경 내역을 먼저 보고 싶다면 **[최신 릴리스](https://github.com/young1the/pets-driven/releases/latest)**를 확인하세요.

> macOS·Linux 빌드는 아직 배포 전입니다. [Tauri](https://tauri.app)로 만들어졌기에 로드맵에
> 있으며, 그전까지는 [소스에서 빌드](#-시작하기)하세요.

## 🚀 시작하기

> **상태:** 초기 개발 단계. 미리 빌드된 **Windows** 설치 파일은
> [릴리스 페이지](https://github.com/young1the/pets-driven/releases/latest)에 있고, macOS와 Linux는
> 로드맵에 있습니다. 직접 손대며 개발하고 싶다면 아래에서 소스로 빌드하세요.

### 사전 준비

- [Node.js](https://nodejs.org)와 [pnpm](https://pnpm.io) `10.x`
- [Rust 툴체인](https://www.rust-lang.org/tools/install) (Tauri 데스크톱 셸용)
- Tauri 플랫폼 사전 준비 — [Tauri 설정 가이드](https://tauri.app/start/prerequisites/) 참고

### 데스크톱 앱 실행

```bash
# 1. 의존성 설치
pnpm install

# 2. Tauri 데스크톱 앱 실행 (데스크톱 위의 펫)
pnpm dev

# 또는 브라우저 플레이그라운드로 시뮬레이션 미리보기 (네이티브 셸 없이)
pnpm dev:playground
```

### 빌드

```bash
pnpm build            # 데스크톱 앱 번들
pnpm test             # 테스트 스위트 실행
pnpm check            # 린트 + 포맷 검사 (Biome)
```

## 🤖 에이전트 연동

Pets Driven은 플러그인([`plugins/pets-driven`](./plugins/pets-driven))을 제공하여, 에이전트가
펫을 부화시키고 진행 상황을 보고할 수 있도록 슬래시 명령과 hook 브리지를 추가합니다:

| 명령 | 하는 일 |
|------|---------|
| **`hatch`** | 현재 폴더에 펫 생성 — 에셋과 성격을 선택합니다. |
| **`bring`** | 에이전트 폴더로 프로젝트를 가져오고(`git clone` 또는 `git worktree`) 펫에 넘깁니다. |
| **`carry`** | 에이전트가 한 일과 그 작업의 위치를 다음 에이전트를 위한 간결한 인계문으로 요약합니다. |

이벤트는 프로바이더의 세션 id를 신뢰하는 대신 **작업 디렉터리**로 펫에 매칭됩니다 — 그래서
터미널을 앱 밖에서 붙였더라도 펫이 반응합니다.

## 📄 라이선스

[MIT](./LICENSE) © 2026 pets-driven contributors.

<div align="center">
<sub>로그 벽을 훑기보다 행복한 펫을 흘긋 보고 싶은 개발자를 위해 만들었습니다.</sub>
</div>
