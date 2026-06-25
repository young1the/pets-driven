# AgentTaskState FSM — 에이전트 작업 상태 통합 표현

작성일: 2026-06-25

## 배경 / 문제

`UserPromptSubmit` 훅이 ingress까지 정상 도착하고 라우팅도 통과하지만(같은 cwd의
`Stop`/done 이벤트는 카드 상태를 "Done"으로 바꿈), 카드에 보이는 상태가 전혀 바뀌지
않았다. 원인은 에이전트 작업 라이프사이클이 **하나의 일관된 상태로 모델링되어 있지
않다**는 것이다. 현재 라이프사이클이 세 군데에 흩어져 있다:

- `IntentState.intent`(`idle`/`active`/`seek`) — 암묵적 "working" 신호
- `HeldAgentState`(`waiting`/`failed`/`completed`) — **`working`/`idle` 상태가 빠짐**
- `BehaviorDecisionState` claim + speech

`task.started`(UserPromptSubmit) 처리는 `HeldAgentState`를 제거하고 `intent=active`만
세팅한다(`packages/pet-engine/src/features/behavior/systems.ts:198-204`). 카드 상태를
계산하는 `petStatusFromSnapshot`은 오직 `heldAgentState.kind`만 읽고, 없으면 in-world
펫을 기본 "Working"으로 표시한다(`apps/desktop/src/app-state/pet-card-status.ts:36-53`).
따라서 배포된 펫은 평소에도 영구 "Working"이고, `task.started`가 와도 "Working" →
"Working"이라 가시적 변화가 0이다.

또한 `HeldAgentState`는 **두 가지 관심사를 한 컴포넌트에 혼합**한다:

1. 상태 지속(다음 이벤트까지 유지)
2. 이동 정지(`runAgentEventHoldSystem`이 held 펫을 멈춤,
   `systems.ts:246-249`; autonomous는 held 펫을 건너뜀, `systems.ts:906`)

## 목표

에이전트 작업 라이프사이클을 **단일 FSM 컴포넌트 `AgentTaskState`**로 통합한다.
`working`을 1급 상태로 만들고, 카드/오버레이/애니메이션을 그 상태의 순수 함수로
바꾼다. behavior tree는 도입하지 않는다 — 이것은 "지금 무슨 액션을 할까"(행동 선택)가
아니라 "에이전트가 지금 어떤 상태인가"(상태 표현) 문제이며 FSM이 맞는 도구다.

비목표: 펫의 자율 이동/충돌 반응 선택 로직(utility AI + 우선순위 claim) 변경. 그대로
둔다.

## 설계

### 1. 컴포넌트

`HeldAgentStateComponent`(`packages/pet-engine/src/features/behavior/components.ts:48-56`)를
`AgentTaskStateComponent`로 교체한다.

```ts
export type AgentTaskStatus =
  | "idle"
  | "working"
  | "waiting"
  | "completed"
  | "failed";

export type AgentTaskStateComponent = {
  type: "AgentTaskState";
  status: AgentTaskStatus;
  since: number; // 상태 진입 시각(clock.now())
  summary?: string; // 말풍선/배지용 마지막 이벤트 요약
};
```

**idle 표현 = 컴포넌트 부재.** non-idle일 때만 컴포넌트가 존재한다(기존
`HeldAgentState`의 "없으면 not-held" 패턴 유지). idle로의 전이는 `removeComponent`.
read 사이트는 `getComponent(...)?.status ?? "idle"`로 균일하게 처리한다. 이유:

- init 변경 최소(pet-entity-builder/scenario-fixtures에 항상-존재 컴포넌트를 추가할
  필요 없음).
- idle 전이가 제거와 대칭적이라 단순.

### 2. 전이표 (마지막 이벤트 wins)

| 트리거                                          | → status               |
| ----------------------------------------------- | ---------------------- |
| `task.started` (UserPromptSubmit)               | `working`              |
| `task.waiting` (PermissionRequest/Notification) | `waiting`              |
| `task.failed` (PostToolUseFailure/StopFailure)  | `failed`               |
| `task.completed` (Stop/TaskCompleted)           | `completed`            |
| 사용자 상호작용 (control hit / drag hit)        | `idle` (컴포넌트 제거) |

- `working`은 **다음 에이전트 이벤트까지 유지**된다. 자동 idle 복귀(타임아웃) 없음.
- 모든 전이는 무조건 목표 status로 set(마지막 이벤트가 이김). 프레임 단위 우선순위
  중재는 기존 `BehaviorDecisionState` claim이 계속 담당한다 — FSM status는 단지 가장
  최근 에이전트 이벤트를 반영한다.
- 전이 시점에 `IntentState.intent`도 함께 갱신한다(아래 파생 규칙). 이는 기존 이벤트
  핸들러가 이미 하던 패턴이다.

### 3. 파생 규칙 (status 하나에서)

기존에 `HeldAgentState`가 뭉쳐 담던 "이동 정지"를 status 파생 규칙으로 분리한다.

**이동 정지 + autonomous skip**: `status ∈ {waiting, failed, completed}`일 때만.
`working`/`idle`은 정상 이동·배회.

- `runAgentEventHoldSystem`: `HeldAgentState` 보유 → 정지 대신, `AgentTaskState.status`가
  정지 대상 집합에 속할 때 정지.
- autonomous skip(`systems.ts:906`의 `if (HeldAgentState) return`): 동일하게 status
  기반으로.

**이동 intent**:

- `working` → `active` (running)
- `completed` → `CompletionBehavior.intentAfterCompletion` (`idle`/`seek`, 성격 기반,
  `features/agent/components.ts:16-19`)
- `waiting`/`failed` → `idle` (어차피 정지)
- `idle` → `idle` (autonomous가 인계)

**애니메이션** (`getPetAnimationState`, `core/create-world.ts:214-278`):
status로 분기 — `failed`→`failed`, `completed`→`review`, `waiting`→`waiting`,
`working`→`running`, `idle`→기존 배회/idle 로직.

**스냅샷** (`core/world-snapshot.ts`): `heldAgentState?: HeldAgentStateSnapshot` 필드를
`agentTask?: AgentTaskSnapshot`로 교체.

```ts
export type AgentTaskSnapshot = {
  status: AgentTaskStatus;
  label: "WAIT" | "FAIL" | "DONE" | null; // 오버레이 배지용(working/idle은 null)
  summary?: string;
};
```

배지 라벨은 `waiting`→"WAIT", `failed`→"FAIL", `completed`→"DONE"만, `working`/`idle`은
`null`(오버레이 배지 미표시, 시각 변화 없음).

**카드 상태** (`apps/desktop/src/app-state/pet-card-status.ts`):

- 스냅샷 없음 → Idle (미배포)
- `agentTask` 없음/`idle` → **Idle**
- `working` → **Working** (`info`)
- `waiting` → Needs you (`warning`)
- `failed` → Needs you (`danger`)
- `completed` → Done (`success`)

**오버레이 배지** (`apps/desktop/src/pet-window/pet-window-projection.ts:138-141`):
`pet.agentTask?.label`이 non-null일 때만 배지 emit.

### 4. 동작 변화 (의도된 개선)

현재는 배포된 펫이 전부 영구 "Working"(기본값)이다. FSM 후:

- 배포됐지만 에이전트 조용함(`agentTask` 부재) → **"Idle"**
- `task.started` 수신 → **"Working"** (다음 이벤트까지)

즉 "배포 중 + 에이전트 유휴"와 "실제 작업 중"을 카드가 구분한다. 이것이 핵심 개선이자
원래 버그의 근본 해결이다. **모든 배포 펫의 평소 라벨이 Working → Idle로 바뀌는** 가시적
변화가 있으나 의도된 것이다.

### 5. 사용자 상호작용 클리어

`features/interaction/systems.ts:43,47,91-92`의 `clearHeldAgentState`는
`AgentTaskState`를 제거(→ idle)하도록 갱신한다. 의미: 사용자가 펫을 잡으면 held 상태가
풀려 idle로 복귀(기존과 동일한 의도, 단 목적지가 명시적으로 idle).

## 영향 받는 파일

펫 엔진:

- `packages/pet-engine/src/features/behavior/components.ts` — 컴포넌트 정의 교체
- `packages/pet-engine/src/features/behavior/systems.ts` — 이벤트 핸들러 전이,
  hold/freeze 파생, autonomous skip
- `packages/pet-engine/src/features/agent/components.ts` — `CompletionBehavior` 유지
- `packages/pet-engine/src/features/interaction/systems.ts` — clear → idle
- `packages/pet-engine/src/core/create-world.ts` — 애니메이션 파생, 스냅샷 빌드
- `packages/pet-engine/src/core/world-snapshot.ts` — 스냅샷 타입
- `packages/pet-engine/src/core/components.ts` — 컴포넌트 유니온
- `packages/pet-engine/src/core/pet-entity-builder.ts`,
  `core/scenario-fixtures.ts` — 필요 시 init(부재=idle이라 변경 최소)

데스크톱 앱:

- `apps/desktop/src/app-state/pet-card-status.ts` — status→배지 매핑
- `apps/desktop/src/pet-window/pet-window-projection.ts` — 오버레이 배지
- `apps/desktop/src/playground/browser/{canvas-renderer,decision-showcase-adapter,
decision-showcase-app,pet-status-list}.{ts,tsx}` — 디버그 뷰 갱신

## 테스트 전략

- 전이표: 각 트리거 → 기대 status 단위 테스트(기존
  `tests/features/behavior/*.test.ts` 확장).
- 파생 규칙: `waiting/failed/completed`만 이동 정지·autonomous skip; `working/idle`은
  이동 허용.
- `task.started` → `working` → 카드 "Working" 회귀 테스트(원 버그 재현/방지).
- 사용자 상호작용 → idle 복귀.
- 스냅샷 `agentTask` 라벨 매핑(`working`/`idle`은 배지 null).

## 미해결 / 확인 필요

없음(설계 합의 완료). 구현 중 발견 시 plan에 반영.
