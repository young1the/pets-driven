# AgentTaskState FSM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에이전트 작업 라이프사이클을 단일 `AgentTaskState` FSM 컴포넌트로 통합해, `working`을 1급 상태로 만들고 카드/오버레이/애니메이션을 그 상태의 순수 함수로 바꾼다.

**Architecture:** 기존 `HeldAgentState`(waiting/failed/completed만)를 `AgentTaskState`(idle/working/waiting/completed/failed)로 교체한다. "상태 지속"과 "이동 정지"를 분리: 상태는 컴포넌트로 지속되고, 이동 정지는 `status ∈ {waiting,failed,completed}`에서만 파생된다. 컴파일을 단계마다 녹색으로 유지하기 위해 새 컴포넌트를 먼저 추가하고 소비처를 차례로 이전한 뒤 마지막에 `HeldAgentState`를 제거한다.

**Tech Stack:** TypeScript, ECS(component-store), vitest. 펫 엔진 패키지 `@pets-driven/pet-engine`, 데스크톱 앱 패키지 `pets-driven`.

## Global Constraints

- idle 표현 = 컴포넌트 부재. non-idle일 때만 `AgentTaskState`가 존재한다. read는 항상 `?.status ?? "idle"`.
- 전이는 마지막 이벤트 wins. 프레임 단위 우선순위 중재는 기존 `BehaviorDecisionState` claim이 계속 담당한다(변경 금지).
- `working`은 다음 에이전트 이벤트까지 유지. 자동 idle 타임아웃 없음.
- 자율 이동/충돌 선택 로직(utility AI + claim)은 변경하지 않는다.
- 펫 엔진 테스트: `pnpm --filter @pets-driven/pet-engine test <path>`. 데스크톱: `pnpm --filter pets-driven test <path>`.
- 커밋 메시지는 `[기타]` 접두어, `Co-Authored-By` 금지. 커밋 전 prettier 실행.

---

### Task 1: `AgentTaskState` 컴포넌트와 순수 파생 헬퍼

**Files:**

- Create: `packages/pet-engine/src/features/agent/agent-task-state.ts`
- Modify: `packages/pet-engine/src/core/components.ts` (컴포넌트 유니온에 추가)
- Test: `packages/pet-engine/tests/features/agent/agent-task-state.test.ts`

**Interfaces:**

- Produces:
  - `type AgentTaskStatus = "idle" | "working" | "waiting" | "completed" | "failed"`
  - `type AgentTaskStateComponent = { type: "AgentTaskState"; status: AgentTaskStatus; since: number; summary?: string }`
  - `function statusFreezesMovement(status: AgentTaskStatus): boolean`
  - `function agentTaskBadgeLabel(status: AgentTaskStatus): "WAIT" | "FAIL" | "DONE" | null`

- [ ] **Step 1: Write the failing test**

`packages/pet-engine/tests/features/agent/agent-task-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  statusFreezesMovement,
  agentTaskBadgeLabel,
} from "@pets-driven/pet-engine/features/agent/agent-task-state";

describe("statusFreezesMovement", () => {
  it("freezes only waiting, failed, completed", () => {
    expect(statusFreezesMovement("waiting")).toBe(true);
    expect(statusFreezesMovement("failed")).toBe(true);
    expect(statusFreezesMovement("completed")).toBe(true);
    expect(statusFreezesMovement("working")).toBe(false);
    expect(statusFreezesMovement("idle")).toBe(false);
  });
});

describe("agentTaskBadgeLabel", () => {
  it("maps held statuses to badge labels, none for working/idle", () => {
    expect(agentTaskBadgeLabel("waiting")).toBe("WAIT");
    expect(agentTaskBadgeLabel("failed")).toBe("FAIL");
    expect(agentTaskBadgeLabel("completed")).toBe("DONE");
    expect(agentTaskBadgeLabel("working")).toBeNull();
    expect(agentTaskBadgeLabel("idle")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pets-driven/pet-engine test tests/features/agent/agent-task-state.test.ts`
Expected: FAIL — cannot resolve `features/agent/agent-task-state`.

- [ ] **Step 3: Write minimal implementation**

`packages/pet-engine/src/features/agent/agent-task-state.ts`:

```ts
export type AgentTaskStatus =
  | "idle"
  | "working"
  | "waiting"
  | "completed"
  | "failed";

/** Single source of truth for an agent's task lifecycle. Absent = idle. */
export type AgentTaskStateComponent = {
  type: "AgentTaskState";
  status: AgentTaskStatus;
  since: number;
  summary?: string;
};

const FREEZING_STATUSES: ReadonlySet<AgentTaskStatus> = new Set([
  "waiting",
  "failed",
  "completed",
]);

/** waiting/failed/completed hold the pet still; working/idle move freely. */
export function statusFreezesMovement(status: AgentTaskStatus): boolean {
  return FREEZING_STATUSES.has(status);
}

/** Overlay badge text; working/idle show no badge. */
export function agentTaskBadgeLabel(
  status: AgentTaskStatus,
): "WAIT" | "FAIL" | "DONE" | null {
  switch (status) {
    case "waiting":
      return "WAIT";
    case "failed":
      return "FAIL";
    case "completed":
      return "DONE";
    default:
      return null;
  }
}
```

`packages/pet-engine/src/core/components.ts`: import 블록(현재 line 80-81 근처)에 `AgentTaskStateComponent`를 추가하고 컴포넌트 유니온(현재 `HeldAgentStateComponent`가 있는 `| ...` 목록)에 `| AgentTaskStateComponent` 한 줄 추가. `HeldAgentStateComponent`는 아직 남겨둔다.

```ts
// import 추가 (agent 컴포넌트 import 줄과 함께)
import type { AgentTaskStateComponent } from "@pets-driven/pet-engine/features/agent/agent-task-state";

// 유니온에 추가
  | AgentTaskStateComponent
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pets-driven/pet-engine test tests/features/agent/agent-task-state.test.ts`
Expected: PASS (4 assertions group, 2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/pet-engine/src/features/agent/agent-task-state.ts packages/pet-engine/src/core/components.ts packages/pet-engine/tests/features/agent/agent-task-state.test.ts
git commit -m "[기타] AgentTaskState 컴포넌트와 파생 헬퍼 추가"
```

---

### Task 2: 이벤트 핸들러가 `AgentTaskState`를 기록

**Files:**

- Modify: `packages/pet-engine/src/features/behavior/systems.ts:148-240` (`holdAgentState`, `runAgentEventBehaviorSystem`)
- Test: `packages/pet-engine/tests/features/behavior/agent-task-state-transition.test.ts`

**Interfaces:**

- Consumes: `AgentTaskStateComponent` (Task 1)
- Produces: 각 에이전트 이벤트 → `AgentTaskState.status` 전이. `task.started`→working, `task.waiting`→waiting, `task.failed`→failed, `task.completed`→completed. `IntentState.intent`은 기존대로 동시 갱신.

이 태스크는 `AgentTaskState`를 **추가로** 기록하고 기존 `HeldAgentState` 기록도 잠시 유지한다(소비처 이전 전까지 컴파일/기존 테스트 녹색 유지). Task 5에서 `HeldAgentState` 기록을 제거한다.

- [ ] **Step 1: Write the failing test**

`packages/pet-engine/tests/features/behavior/agent-task-state-transition.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runAgentEventBehaviorSystem } from "@pets-driven/pet-engine/features/behavior/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";
import type { AgentWorldEvent } from "@pets-driven/pet-engine/features/events/world-event";

function makeStore() {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "AgentBinding", sourceId: "agent-a" },
        { type: "IntentState", intent: "idle" as const },
        {
          type: "SpeechProfile",
          idleCompanion: "hi",
          attentionNeeded: "look",
          taskStarted: "working",
          taskCompleted: "done",
        },
        { type: "SpeechState", speech: null, expiresAt: null },
        { type: "ActivityState", lastActiveAt: 0 },
        { type: "CompletionBehavior", intentAfterCompletion: "seek" as const },
      ],
    },
  ]);
}

function agentEvent(type: AgentWorldEvent["type"]): AgentWorldEvent {
  return {
    kind: "agent",
    type,
    sourceId: "agent-a",
    at: 100,
    summary: undefined,
  };
}

describe("runAgentEventBehaviorSystem → AgentTaskState", () => {
  it("task.started sets status working and intent active", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentEventBehaviorSystem(store, [agentEvent("task.started")], clock);
    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe("working");
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("active");
  });

  it("task.completed sets status completed and intent from CompletionBehavior", () => {
    const store = makeStore();
    const clock = createManualClock(100);
    runAgentEventBehaviorSystem(store, [agentEvent("task.completed")], clock);
    expect(store.getComponent("pet", "AgentTaskState")?.status).toBe(
      "completed",
    );
    expect(store.getComponent("pet", "IntentState")?.intent).toBe("seek");
  });

  it("task.waiting sets status waiting; task.failed sets status failed", () => {
    const waitStore = makeStore();
    runAgentEventBehaviorSystem(
      waitStore,
      [agentEvent("task.waiting")],
      createManualClock(100),
    );
    expect(waitStore.getComponent("pet", "AgentTaskState")?.status).toBe(
      "waiting",
    );

    const failStore = makeStore();
    runAgentEventBehaviorSystem(
      failStore,
      [agentEvent("task.failed")],
      createManualClock(100),
    );
    expect(failStore.getComponent("pet", "AgentTaskState")?.status).toBe(
      "failed",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pets-driven/pet-engine test tests/features/behavior/agent-task-state-transition.test.ts`
Expected: FAIL — `AgentTaskState` 컴포넌트가 세팅되지 않음(`undefined`).

- [ ] **Step 3: Write minimal implementation**

`packages/pet-engine/src/features/behavior/systems.ts`의 `holdAgentState` 헬퍼(현재 line 148-162) 바로 아래에 `setAgentTaskState` 헬퍼를 추가:

```ts
function setAgentTaskState(
  components: ComponentStore,
  id: string,
  status: "working" | "waiting" | "completed" | "failed",
  event: { at: number; summary?: string },
): void {
  components.setComponent(id, {
    type: "AgentTaskState",
    status,
    since: event.at,
    summary: event.summary,
  });
}
```

`runAgentEventBehaviorSystem`의 각 분기(현재 line 198-236)에 `setAgentTaskState` 호출을 추가한다(기존 `holdAgentState`/`removeComponent("HeldAgentState")`는 유지):

```ts
if (event.type === "task.started") {
  components.removeComponent(id, "HeldAgentState");
  setAgentTaskState(components, id, "working", event);
  intent.intent = "active";
  setSpeech(speech, event.summary ?? speechProfile.taskStarted, now);
  activity.lastActiveAt = event.at;
  claim(components, id, "agent-event", now, "task.started");
}

if (event.type === "task.waiting" || event.type === "attention.requested") {
  intent.intent = "idle";
  stopPetMovement(components, physics, id);
  holdAgentState(components, id, "waiting", event.type, event);
  setAgentTaskState(components, id, "waiting", event);
  setSpeech(speech, event.summary ?? speechProfile.attentionNeeded, now);
  claim(components, id, "agent-event", now, event.type);
}

if (event.type === "task.failed") {
  intent.intent = "idle";
  stopPetMovement(components, physics, id);
  holdAgentState(components, id, "failed", "task.failed", event);
  setAgentTaskState(components, id, "failed", event);
  setSpeech(speech, event.summary ?? "Task failed", now);
  activity.lastActiveAt = event.at;
  claim(components, id, "agent-event", now, "task.failed");
}

if (event.type === "task.completed") {
  intent.intent = completionBehavior.intentAfterCompletion;
  stopPetMovement(components, physics, id);
  holdAgentState(components, id, "completed", "task.completed", event);
  setAgentTaskState(components, id, "completed", event);
  setSpeech(speech, event.summary ?? speechProfile.taskCompleted, now);
  activity.lastActiveAt = event.at;
  claim(components, id, "agent-event", now, "task.completed");
}
```

> 참고: `attention.requested`도 `waiting`으로 매핑된다(기존 의미 유지).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pets-driven/pet-engine test tests/features/behavior/agent-task-state-transition.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full behavior suite to confirm no regression**

Run: `pnpm --filter @pets-driven/pet-engine test tests/features/behavior`
Expected: PASS(전부). 기존 `HeldAgentState` 기반 테스트도 여전히 녹색.

- [ ] **Step 6: Commit**

```bash
git add packages/pet-engine/src/features/behavior/systems.ts packages/pet-engine/tests/features/behavior/agent-task-state-transition.test.ts
git commit -m "[기타] 에이전트 이벤트 핸들러가 AgentTaskState 전이를 기록"
```

---

### Task 3: 이동 정지·자율 스킵을 status에서 파생

**Files:**

- Modify: `packages/pet-engine/src/features/behavior/systems.ts:242-249` (`runAgentEventHoldSystem`)
- Modify: `packages/pet-engine/src/features/behavior/systems.ts:906` (자율 스킵 가드)
- Test: `packages/pet-engine/tests/features/behavior/agent-task-freeze.test.ts`

**Interfaces:**

- Consumes: `statusFreezesMovement` (Task 1), `AgentTaskState` (Task 2)

- [ ] **Step 1: Write the failing test**

`packages/pet-engine/tests/features/behavior/agent-task-freeze.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runAgentEventHoldSystem } from "@pets-driven/pet-engine/features/behavior/systems";

function makeStore(status: "working" | "waiting") {
  return createComponentStore([
    {
      id: "pet",
      components: [
        { type: "AgentTaskState", status, since: 0 },
        {
          type: "MotionTarget",
          targetEntityId: null,
          targetPosition: { x: 9, y: 9 },
        },
      ],
    },
  ]);
}

describe("runAgentEventHoldSystem freezes by status", () => {
  it("freezes a waiting pet (clears motion target)", () => {
    const store = makeStore("waiting");
    const velocities: Array<{ x: number; y: number }> = [];
    runAgentEventHoldSystem(store, {
      setVelocity: (_id, v) => velocities.push({ x: v.x ?? 0, y: v.y ?? 0 }),
    });
    expect(
      store.getComponent("pet", "MotionTarget")?.targetPosition,
    ).toBeNull();
  });

  it("does not freeze a working pet", () => {
    const store = makeStore("working");
    runAgentEventHoldSystem(store, { setVelocity: () => {} });
    expect(store.getComponent("pet", "MotionTarget")?.targetPosition).toEqual({
      x: 9,
      y: 9,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pets-driven/pet-engine test tests/features/behavior/agent-task-freeze.test.ts`
Expected: FAIL — working 펫도 정지됨(현재 `runAgentEventHoldSystem`은 `HeldAgentState` 기준이라 `AgentTaskState`를 안 봄 → 둘 다 정지 안 함 → 첫 테스트 실패).

- [ ] **Step 3: Write minimal implementation**

`systems.ts` 상단 import에 헬퍼 추가:

```ts
import { statusFreezesMovement } from "@pets-driven/pet-engine/features/agent/agent-task-state";
```

`runAgentEventHoldSystem`(현재 line 242-249)을 status 기준으로 교체:

```ts
export function runAgentEventHoldSystem(
  components: ComponentStore,
  physics: VelocityWriter,
): void {
  components.forEach(["AgentTaskState"], (id, [task]) => {
    if (!statusFreezesMovement(task.status)) return;
    stopPetMovement(components, physics, id);
  });
}
```

자율 스킵 가드(현재 line 906)를 교체:

```ts
const agentTask = components.getComponent(id, "AgentTaskState");
if (agentTask && statusFreezesMovement(agentTask.status)) return;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pets-driven/pet-engine test tests/features/behavior/agent-task-freeze.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full behavior suite**

Run: `pnpm --filter @pets-driven/pet-engine test tests/features/behavior`
Expected: PASS. (Task 2에서 `AgentTaskState`를 병행 기록하므로 freeze/skip가 동일하게 동작.)

- [ ] **Step 6: Commit**

```bash
git add packages/pet-engine/src/features/behavior/systems.ts packages/pet-engine/tests/features/behavior/agent-task-freeze.test.ts
git commit -m "[기타] 이동 정지와 자율 스킵을 AgentTaskState status에서 파생"
```

---

### Task 4: 사용자 상호작용 클리어 → idle

**Files:**

- Modify: `packages/pet-engine/src/features/interaction/systems.ts:43,47,91-93`
- Test: `packages/pet-engine/tests/features/interaction/agent-task-clear.test.ts`

**Interfaces:**

- Consumes: `AgentTaskState` (Task 1)

- [ ] **Step 1: Write the failing test**

`packages/pet-engine/tests/features/interaction/agent-task-clear.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createComponentStore } from "@pets-driven/pet-engine/core/component-store";
import { runInteractionSystem } from "@pets-driven/pet-engine/features/interaction/systems";
import { createManualClock } from "@pets-driven/pet-engine/shared/time/manual-clock";

describe("user interaction clears AgentTaskState to idle", () => {
  it("removes AgentTaskState when a controllable pet is pressed", () => {
    const store = createComponentStore([
      {
        id: "pet",
        components: [
          { type: "Transform", position: { x: 0, y: 0 } },
          { type: "Body", shape: "rectangle", width: 40, height: 40 },
          { type: "CanControl" },
          { type: "AgentTaskState", status: "waiting", since: 0 },
        ],
      },
      {
        id: "user-interaction",
        components: [{ type: "KeyboardControlTarget", entityId: null }],
      },
    ]);

    runInteractionSystem(
      store,
      [
        {
          kind: "pointer",
          type: "pointer.down",
          pointerId: 1,
          at: 0,
          position: { x: 0, y: 0 },
          button: 0,
        },
      ],
      createManualClock(0),
    );

    expect(store.getComponent("pet", "AgentTaskState")).toBeUndefined();
  });
});
```

> 주의: `runInteractionSystem`의 정확한 이름/시그니처와 hit-test에 필요한 컴포넌트(`Body`/`CanControl` 등)는 `features/interaction/systems.ts` 상단 export와 `hitTest` 구현을 먼저 확인해 맞춘다. 위 컴포넌트 모양이 다르면 해당 파일의 기존 테스트(`tests/features/interaction/*.test.ts`)에서 셋업을 복사한다.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pets-driven/pet-engine test tests/features/interaction/agent-task-clear.test.ts`
Expected: FAIL — `clearHeldAgentState`는 `AgentTaskState`가 아니라 `HeldAgentState`만 제거하므로 컴포넌트가 그대로 남음.

- [ ] **Step 3: Write minimal implementation**

`features/interaction/systems.ts`의 `clearHeldAgentState`(line 91-93)를 교체하고 호출부(line 43,47) 이름을 맞춘다:

```ts
function clearAgentTaskState(components: ComponentStore, id: string): void {
  components.removeComponent(id, "AgentTaskState");
}
```

line 43: `if (controlHit) clearAgentTaskState(components, controlHit.id);`
line 47: `clearAgentTaskState(components, dragHit.id);`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pets-driven/pet-engine test tests/features/interaction/agent-task-clear.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the interaction suite**

Run: `pnpm --filter @pets-driven/pet-engine test tests/features/interaction`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/pet-engine/src/features/interaction/systems.ts packages/pet-engine/tests/features/interaction/agent-task-clear.test.ts
git commit -m "[기타] 사용자 상호작용이 AgentTaskState를 idle로 클리어"
```

---

### Task 5: 스냅샷·애니메이션을 status로 이전하고 `HeldAgentState` 기록 제거

**Files:**

- Modify: `packages/pet-engine/src/core/world-snapshot.ts:40,61-65` (스냅샷 타입)
- Modify: `packages/pet-engine/src/core/create-world.ts:76-121` (`getPetSnapshots`), `:214-279` (`getPetAnimationState`)
- Modify: `packages/pet-engine/src/features/behavior/systems.ts` (Task 2에서 남겨둔 `holdAgentState` 호출 + `removeComponent("HeldAgentState")` 제거)
- Test: `packages/pet-engine/tests/core/agent-task-snapshot.test.ts`

**Interfaces:**

- Produces: 스냅샷에 `agentTask?: { status: AgentTaskStatus; label: "WAIT"|"FAIL"|"DONE"|null; summary?: string }`. `heldAgentState` 필드 제거.

- [ ] **Step 1: Write the failing test**

`packages/pet-engine/tests/core/agent-task-snapshot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDemoScenario } from "@pets-driven/pet-engine/core/scenario-fixtures";

describe("snapshot surfaces agentTask", () => {
  it("a working pet has agentTask.status working and null badge label", () => {
    const { world } = createDemoScenario();
    world.pushEvent({
      kind: "agent",
      type: "task.started",
      sourceId: "agent-a",
      at: 0,
    });
    world.step(16);
    const pet = world.snapshot().pets.find((p) => p.sourceId === "agent-a");
    expect(pet?.agentTask?.status).toBe("working");
    expect(pet?.agentTask?.label).toBeNull();
  });

  it("a completed pet has DONE badge label", () => {
    const { world } = createDemoScenario();
    world.pushEvent({
      kind: "agent",
      type: "task.completed",
      sourceId: "agent-a",
      at: 0,
    });
    world.step(16);
    const pet = world.snapshot().pets.find((p) => p.sourceId === "agent-a");
    expect(pet?.agentTask?.status).toBe("completed");
    expect(pet?.agentTask?.label).toBe("DONE");
  });
});
```

> `createDemoScenario`의 sourceId가 `agent-a`가 아니면 `scenario-fixtures.ts`에서 실제 sourceId를 확인해 맞춘다.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pets-driven/pet-engine test tests/core/agent-task-snapshot.test.ts`
Expected: FAIL — `pet.agentTask`가 `undefined`(스냅샷이 아직 `heldAgentState`만 노출).

- [ ] **Step 3: Write minimal implementation**

`core/world-snapshot.ts`: `heldAgentState` 필드(line 40)와 `HeldAgentStateSnapshot` 타입(line 61-65)을 교체:

```ts
import type { AgentTaskStatus } from "@pets-driven/pet-engine/features/agent/agent-task-state";

// PetSnapshot 안에서:
  /** Agent task lifecycle surfaced to UI. Absent = idle. */
  agentTask?: AgentTaskSnapshot | null;

// 타입 정의:
export type AgentTaskSnapshot = {
  status: AgentTaskStatus;
  label: "WAIT" | "FAIL" | "DONE" | null;
  summary?: string;
};
```

`core/create-world.ts` `getPetSnapshots`(line 83, 106-116): `heldAgentState` 조회/빌드를 `agentTask`로 교체:

```ts
import { agentTaskBadgeLabel } from "@pets-driven/pet-engine/features/agent/agent-task-state";

// line 83 교체:
        const agentTask = componentStore.getComponent(entity.id, "AgentTaskState");

// line 106-116 교체:
          agentTask: agentTask
            ? {
                status: agentTask.status,
                label: agentTaskBadgeLabel(agentTask.status),
                summary: agentTask.summary,
              }
            : null,
```

`getPetAnimationState`(line 224-250): `heldAgentState` 분기를 `agentTask.status`로 교체:

```ts
const agentTask = componentStore.getComponent(id, "AgentTaskState");
if (agentTask?.status === "failed") return "failed";
if (agentTask?.status === "completed") return "review";
if (agentTask?.status === "waiting") return "waiting";
if (agentTask?.status === "working") return "running";
```

(이어지는 `decision?.reason === "task.failed"` 등 기존 분기와 jump/motion/intent 로직은 그대로 둔다.)

`features/behavior/systems.ts`: Task 2에서 남겨둔 `holdAgentState(...)` 4개 호출과 `task.started` 분기의 `components.removeComponent(id, "HeldAgentState")` 한 줄을 삭제한다. `holdAgentState` 헬퍼 함수 정의(line 148-162)도 더 이상 호출되지 않으면 삭제한다.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @pets-driven/pet-engine test tests/core/agent-task-snapshot.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full engine suite + typecheck**

Run: `pnpm --filter @pets-driven/pet-engine test`
Run: `pnpm --filter @pets-driven/pet-engine typecheck`
Expected: 둘 다 PASS. `heldAgentState`를 읽던 엔진 테스트가 있으면 `agentTask`로 갱신한다.

- [ ] **Step 6: Commit**

```bash
git add packages/pet-engine/src/core/world-snapshot.ts packages/pet-engine/src/core/create-world.ts packages/pet-engine/src/features/behavior/systems.ts packages/pet-engine/tests/core/agent-task-snapshot.test.ts
git commit -m "[기타] 스냅샷·애니메이션을 AgentTaskState status로 이전"
```

---

### Task 6: 데스크톱 카드·오버레이 배지 이전 (원 버그 회귀 테스트 포함)

**Files:**

- Modify: `apps/desktop/src/app-state/pet-card-status.ts:29-54`
- Modify: `apps/desktop/src/pet-window/pet-window-projection.ts:138-141`
- Test: `apps/desktop/tests/app-state/pet-card-status.test.ts` (없으면 생성)

**Interfaces:**

- Consumes: 스냅샷 `agentTask` (Task 5)

- [ ] **Step 1: Write the failing test**

`apps/desktop/tests/app-state/pet-card-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { petStatusFromSnapshot } from "@/app-state/pet-card-status";
import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";

function snapshot(agentTask: PetSnapshot["agentTask"]): PetSnapshot {
  return {
    id: "pet",
    sourceId: "agent-a",
    name: "Rex",
    intent: "idle",
    locomotion: "idle",
    speech: null,
    position: { x: 0, y: 0 },
    contact: { grounded: true, climbableSurfaceId: null },
    motionTarget: null,
    decision: null,
    pendingReaction: null,
    agentTask,
  };
}

describe("petStatusFromSnapshot", () => {
  it("no snapshot is Idle", () => {
    expect(petStatusFromSnapshot(undefined).label).toBe("Idle");
  });
  it("deployed but no agentTask is Idle (not Working)", () => {
    expect(petStatusFromSnapshot(snapshot(null)).label).toBe("Idle");
  });
  it("working agentTask is Working — the original bug fix", () => {
    expect(
      petStatusFromSnapshot(snapshot({ status: "working", label: null })).label,
    ).toBe("Working");
  });
  it("waiting/failed are Needs you; completed is Done", () => {
    expect(
      petStatusFromSnapshot(snapshot({ status: "waiting", label: "WAIT" }))
        .label,
    ).toBe("Needs you");
    expect(
      petStatusFromSnapshot(snapshot({ status: "failed", label: "FAIL" }))
        .label,
    ).toBe("Needs you");
    expect(
      petStatusFromSnapshot(snapshot({ status: "completed", label: "DONE" }))
        .label,
    ).toBe("Done");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter pets-driven test tests/app-state/pet-card-status.test.ts`
Expected: FAIL — "deployed but no agentTask is Idle"가 현재는 Working을 반환하고, `agentTask` 필드를 읽지 않아 working 케이스도 Working 기본값으로 우연히 통과/실패 혼재.

- [ ] **Step 3: Write minimal implementation**

`apps/desktop/src/app-state/pet-card-status.ts`의 `petStatusFromSnapshot`(line 29-54)을 교체:

```ts
export function petStatusFromSnapshot(
  snapshot: PetSnapshot | undefined,
): PetCardStatus {
  if (!snapshot) {
    return IDLE;
  }

  switch (snapshot.agentTask?.status) {
    case "working":
      return WORKING;
    case "waiting":
      return {
        label: "Needs you",
        tone: "warning",
        dotColor: "var(--butter-300)",
      };
    case "failed":
      return {
        label: "Needs you",
        tone: "danger",
        dotColor: "var(--coral-400)",
      };
    case "completed":
      return { label: "Done", tone: "success", dotColor: "var(--mint-300)" };
    default:
      return IDLE;
  }
}
```

`apps/desktop/src/pet-window/pet-window-projection.ts:138-141`: `heldAgentState` → `agentTask` + null 라벨 가드:

```ts
if (pet.agentTask && pet.agentTask.label) {
  // ...기존 배지 빌드, label: pet.agentTask.label
}
```

(해당 블록의 정확한 형태는 현재 코드에 맞춰 `pet.heldAgentState.label`을 `pet.agentTask.label`로 바꾸고, 조건을 `pet.agentTask?.label` non-null로 한다.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter pets-driven test tests/app-state/pet-card-status.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/app-state/pet-card-status.ts apps/desktop/src/pet-window/pet-window-projection.ts apps/desktop/tests/app-state/pet-card-status.test.ts
git commit -m "[기타] 카드·오버레이 배지를 AgentTaskState status로 이전 (working 표시 버그 수정)"
```

---

### Task 7: `HeldAgentState` 컴포넌트와 잔여 참조 제거

**Files:**

- Modify: `packages/pet-engine/src/features/behavior/components.ts:48-56` (`HeldAgentStateKind`, `HeldAgentStateComponent` 삭제)
- Modify: `packages/pet-engine/src/core/components.ts` (import + 유니온에서 `HeldAgentStateComponent` 제거)
- Modify: `apps/desktop/src/playground/browser/{decision-showcase-adapter.ts,decision-showcase-app.tsx,canvas-renderer.ts,pet-status-list.tsx}` (`heldAgentState`/`HeldAgentState` 참조를 `agentTask`로 이전)

**Interfaces:** 없음 (정리 태스크)

- [ ] **Step 1: 잔여 참조 검색**

Run: `git grep -n "HeldAgentState\|heldAgentState"`
Expected: 펫 엔진 `components.ts`/`core/components.ts`와 데스크톱 playground 4개 파일만 남음.

- [ ] **Step 2: 컴포넌트 정의·유니온 제거**

`features/behavior/components.ts`에서 `HeldAgentStateKind`(line 48)와 `HeldAgentStateComponent`(line 50-56) 삭제. `core/components.ts`의 import와 유니온에서 `HeldAgentStateComponent` 제거.

- [ ] **Step 3: playground 디버그 뷰 이전**

각 파일에서 `pet.heldAgentState?.kind` → `pet.agentTask?.status`, `pet.heldAgentState.label` → `pet.agentTask.label`로 이전. `decision-showcase-adapter.ts:172`의 `input.getComponent(input.pet.id, "HeldAgentState")` → `"AgentTaskState"`, `heldAgentState?.kind` → `agentTask?.status`. `working`이 새로 들어올 수 있으므로 status switch에 `working` 케이스가 필요하면 추가(없으면 default 처리).

- [ ] **Step 4: 타입체크 + 전체 테스트**

Run: `pnpm -r typecheck`
Run: `pnpm -r test`
Expected: 둘 다 PASS. (사전 존재하던 typecheck 이슈는 무관 — 새로 도입한 오류만 해결.)

- [ ] **Step 5: 잔여 참조 0 확인**

Run: `git grep -n "HeldAgentState\|heldAgentState"`
Expected: 결과 없음.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "[기타] HeldAgentState 컴포넌트와 잔여 참조 제거"
```

---

## Self-Review

- **Spec 커버리지:** 컴포넌트(Task1) · 전이표(Task2) · 이동정지/intent 파생(Task2,3) · 애니메이션/스냅샷(Task5) · 카드/오버레이(Task6) · 동작변화 Working→Idle(Task6 테스트로 고정) · 사용자 클리어(Task4) · 영향 파일 전부 태스크에 매핑됨. playground 디버그 뷰는 Task7에서 정리.
- **부재=idle:** read 사이트(스냅샷·카드·freeze·animation) 모두 `?.status ?? "idle"` 또는 null 가드로 처리.
- **타입 일관성:** `AgentTaskStatus`, `AgentTaskStateComponent`, `AgentTaskSnapshot`, `statusFreezesMovement`, `agentTaskBadgeLabel`, `setAgentTaskState`, `clearAgentTaskState` 이름이 태스크 간 일치.
- **마이그레이션 안전:** Task2~4는 `AgentTaskState`를 병행 기록하며 기존 `HeldAgentState` 동작을 유지 → 컴파일/테스트 단계별 녹색. Task5에서 엔진 소비처를 끊고, Task6에서 앱 소비처를, Task7에서 컴포넌트를 제거.
