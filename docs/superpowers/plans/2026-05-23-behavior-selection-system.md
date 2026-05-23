# Behavior Selection System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arrival 직후 펫이 "다음에 뭘 할지" 스스로 고르는 `BehaviorSelectionSystem`을 추가한다. 펫의 `BehaviorPreference`(curiosity/sociability/playfulness/shyness) 가중치와 결정적(seeded) 난수를 결합해 후보 행동을 점수화하고, 가장 높은 점수의 후보를 `IntentState`/`MotionTarget`/`JumpActionState`/`ClimbIntentState`로 커밋한다. 그 결정은 `BehaviorDecisionState`(source=`autonomous`)로 클레임된다.

**Why this slice:** Climb 정교화보다 "선택" 자체가 펫의 살아 보임을 좌우한다. Arrival 이후 `intent=idle` & `motionTarget=null` 상태가 곧바로 다음 행동으로 흘러가게 하는 단일 결정 지점을 만든다. 이 결정 지점이 생기면, 차후 collision/personality 기반 회피, agent-event 종료 후 다음 행동 선택 등도 같은 시스템 안에서 확장할 수 있다.

**Architecture:**
- 위치: `features/behavior/` (priority 4 = autonomous). 기존 `runAutonomousBehaviorSystem`(idle speech 전용) 바로 앞에 `runBehaviorSelectionSystem`을 추가한다.
- 입력: `IntentState`, `MotionTarget`, `WandersOnArrival`, `BehaviorPreference`, `Transform`, `ActivityState`, `IdleConversation`(optional), `CanJump`/`CanWallClimb`(optional capability gates), `UserAnchor`.
- 출력: `IntentState.intent`, `MotionTarget.targetEntityId/targetPosition`, optional `JumpActionState.phase="requested"`, optional `ClimbIntentState`, `BehaviorDecisionState`(source=`autonomous`).
- Trigger 조건: 클레임 없음 ∧ `intent==="idle"` ∧ `motionTarget.targetPosition===null` (즉, 막 도착했거나 처음부터 idle).
- 결정성: `RandomSource`를 받아 tie-break과 wander 위치 결정. 테스트에서 `createSeededRandom(seed)`로 같은 결과 재현 가능.

**Tech Stack:** TypeScript, Vitest, seeded random, React playground (action timeline + BehaviorLab).

---

## File Map

```text
src/
  features/
    behavior/
      components.ts          (수정: BehaviorPreference 추가)
      systems.ts             (수정: runBehaviorSelectionSystem 추가)
  core/
    components.ts            (수정: BehaviorPreferenceComponent export)
    create-world.ts          (수정: BehaviorSelectionSystem 단계 등록)
    scenario-fixtures.ts     (수정: 데모 펫에 BehaviorPreference 부여)
  pets/
    personalities/
      factories.ts           (수정: 세 personality에 BehaviorPreference 추가)
  playground/
    browser/
      playground-app.tsx     (수정: 타임라인에 behavior selection 로그)
      behavior-lab.tsx       (수정: BehaviorPreference 패널)
tests/
  features/
    behavior/
      behavior-selection-system.test.ts   (신규)
  pets/
    personalities.test.ts                  (있으면 수정, 없으면 신규)
  smoke/
    playground-app.test.tsx                (수정: timeline에 selection entry)
```

---

## Task 1: `BehaviorPreference` 컴포넌트 도입

**Files:**
- Modify: `src/features/behavior/components.ts`
- Modify: `src/core/components.ts`
- Modify: `src/pets/personalities/factories.ts`
- Modify: `src/core/scenario-fixtures.ts`
- Test: `tests/pets/personalities.test.ts`

- [ ] **Step 1: Write failing personality tests**

```ts
// tests/pets/personalities.test.ts
import { describe, expect, it } from "vitest";
import {
  createPlayfulPersonality,
  createAttentivePersonality,
  createReservedPersonality,
} from "@/pets/personalities/factories";

function findPreference(components: ReturnType<typeof createPlayfulPersonality>) {
  return components.find((c) => c.type === "BehaviorPreference");
}

describe("personality factories produce BehaviorPreference", () => {
  it("playful has high playfulness and curiosity", () => {
    const pref = findPreference(createPlayfulPersonality());
    expect(pref).toEqual({
      type: "BehaviorPreference",
      curiosity: 0.7,
      sociability: 0.4,
      playfulness: 0.9,
      shyness: 0.1,
    });
  });

  it("attentive has high sociability", () => {
    const pref = findPreference(createAttentivePersonality());
    expect(pref?.sociability).toBeGreaterThan(0.7);
    expect(pref?.playfulness).toBeLessThan(0.5);
  });

  it("reserved has high shyness and low playfulness", () => {
    const pref = findPreference(createReservedPersonality());
    expect(pref?.shyness).toBeGreaterThan(0.6);
    expect(pref?.playfulness).toBeLessThan(0.3);
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
npm.cmd test -- tests/pets/personalities.test.ts
```

Expected: FAIL — `BehaviorPreference` 컴포넌트 타입이 아직 없음.

- [ ] **Step 3: Add component type**

```ts
// src/features/behavior/components.ts (append)

/**
 * Personality weights consumed by BehaviorSelectionSystem.
 * Each axis is 0..1; values are tendencies, not absolutes.
 */
export type BehaviorPreferenceComponent = {
  type: "BehaviorPreference";
  curiosity: number;    // 새 위치 탐색 선호 (먼 wander 가중치)
  sociability: number;  // user anchor 접근 선호
  playfulness: number;  // jump/climb 같은 액션 선호
  shyness: number;      // 가까이 머묾, 후퇴 선호
};
```

- [ ] **Step 4: Export from core/components.ts**

```ts
// src/core/components.ts
export type {
  // ...existing
  BehaviorPreferenceComponent,
} from "@/features/behavior/components";

// SimulationComponent union에 추가
import type { BehaviorPreferenceComponent } from "@/features/behavior/components";

export type SimulationComponent =
  | // ...existing
  | BehaviorPreferenceComponent;
```

- [ ] **Step 5: Add to personality factories**

```ts
// src/pets/personalities/factories.ts
export const createPlayfulPersonality: PersonalityFactory = () => [
  // ...existing MovementProfile / IdleConversation / CompletionBehavior
  {
    type: "BehaviorPreference",
    curiosity: 0.7,
    sociability: 0.4,
    playfulness: 0.9,
    shyness: 0.1,
  },
];

export const createAttentivePersonality: PersonalityFactory = () => [
  // ...existing
  {
    type: "BehaviorPreference",
    curiosity: 0.3,
    sociability: 0.85,
    playfulness: 0.3,
    shyness: 0.2,
  },
];

export const createReservedPersonality: PersonalityFactory = () => [
  // ...existing
  {
    type: "BehaviorPreference",
    curiosity: 0.2,
    sociability: 0.2,
    playfulness: 0.15,
    shyness: 0.75,
  },
];
```

- [ ] **Step 6: Seed scenario fixtures**

`src/core/scenario-fixtures.ts`의 `createFixturePet`에 기본값 추가 (개별 펫 components에서 override 가능):

```ts
// createFixturePet의 기본 components 배열 끝부분
{
  type: "BehaviorPreference" as const,
  curiosity: 0.5,
  sociability: 0.5,
  playfulness: 0.5,
  shyness: 0.2,
},
```

그리고 `pet-a` ~ `pet-d`를 각각의 성격에 맞춰 override:
- Alice(pet-a): playful (curiosity 0.7, playfulness 0.9, sociability 0.4)
- Bob(pet-b): attentive (sociability 0.85)
- Charlie(pet-c): playful (climb 좋아함)
- Dana(pet-d): reserved (shyness 0.75)

- [ ] **Step 7: Run tests to verify GREEN**

```bash
npm.cmd test -- tests/pets/personalities.test.ts
npm.cmd test
```

Expected: PASS. 기존 모든 테스트가 그대로 통과해야 한다(`BehaviorPreference`는 아직 어디서도 읽히지 않음).

- [ ] **Step 8: Commit**

```bash
git add src/features/behavior/components.ts src/core/components.ts src/pets/personalities/factories.ts src/core/scenario-fixtures.ts tests/pets/personalities.test.ts
git commit -m "feat: add BehaviorPreference component to personalities"
```

---

## Task 2: `runBehaviorSelectionSystem` — 후보 점수화와 결정

**Files:**
- Modify: `src/features/behavior/systems.ts`
- Test: `tests/features/behavior/behavior-selection-system.test.ts` (신규)

### 후보 목록 (this slice)

| 후보             | 조건                                    | 베이스 점수 | 가중치 축      |
|------------------|----------------------------------------|------------|--------------|
| `wander-near`    | 항상 (default fallback)                | 0.3        | curiosity·0.3 + shyness·0.4 |
| `wander-far`     | 항상                                    | 0.3        | curiosity·0.7 |
| `seek-user`      | `UserAnchor` 존재                      | 0.3        | sociability·0.9 − shyness·0.4 |
| `request-jump`   | `CanJump` 존재 ∧ `JumpActionState.phase === "ready"` | 0.2 | playfulness·0.6 |
| `request-climb`  | `CanWallClimb` 존재 ∧ 근처에 `ClimbableSurface` | 0.2 | playfulness·0.7 + curiosity·0.2 |
| `idle-stay`      | 항상                                    | 0.25       | shyness·0.5 |

최종 점수 = `base + weighted` + `random.next() * 0.05`(tie-break jitter). 가장 높은 후보 선택.

- [ ] **Step 1: Write failing system tests**

```ts
// tests/features/behavior/behavior-selection-system.test.ts
import { describe, expect, it } from "vitest";
import { createComponentStore } from "@/core/component-store";
import { runBehaviorSelectionSystem } from "@/features/behavior/systems";
import { createManualClock } from "@/shared/time/manual-clock";
import { createSeededRandom } from "@/shared/random/seeded-random";

function makeStore(prefOverride: Partial<{
  curiosity: number; sociability: number; playfulness: number; shyness: number;
}>) {
  return createComponentStore([
    {
      id: "user-anchor",
      components: [
        { type: "UserAnchor" },
        { type: "Transform", position: { x: 480, y: 500 } },
      ],
    },
    {
      id: "pet",
      components: [
        { type: "Transform", position: { x: 200, y: 200 } },
        { type: "IntentState", intent: "idle" },
        { type: "MotionTarget", targetEntityId: null, targetPosition: null },
        { type: "ActivityState", lastActiveAt: 0 },
        { type: "WandersOnArrival", arrivalRadius: 16 },
        {
          type: "BehaviorPreference",
          curiosity: 0.5,
          sociability: 0.5,
          playfulness: 0.5,
          shyness: 0.2,
          ...prefOverride,
        },
      ],
    },
  ]);
}

describe("BehaviorSelectionSystem", () => {
  it("does nothing while the pet still has a motion target", () => {
    const store = makeStore({});
    store.setComponent("pet", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: 600, y: 500 },
    });

    runBehaviorSelectionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    expect(store.getComponent("pet", "BehaviorDecisionState")).toBeUndefined();
  });

  it("picks seek-user when sociability dominates", () => {
    const store = makeStore({ sociability: 0.95, shyness: 0.05 });

    runBehaviorSelectionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    const intent = store.getComponent("pet", "IntentState");
    const motion = store.getComponent("pet", "MotionTarget");
    expect(intent?.intent).toBe("seek");
    expect(motion?.targetEntityId).toBe("user-anchor");

    const claim = store.getComponent("pet", "BehaviorDecisionState");
    expect(claim?.source).toBe("autonomous");
    expect(claim?.reason).toBe("seek-user");
  });

  it("picks wander-far when curiosity dominates", () => {
    const store = makeStore({
      curiosity: 0.95,
      sociability: 0.1,
      playfulness: 0.1,
      shyness: 0.05,
    });

    runBehaviorSelectionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    const intent = store.getComponent("pet", "IntentState");
    const motion = store.getComponent("pet", "MotionTarget");
    expect(intent?.intent).toBe("active");
    expect(motion?.targetPosition).not.toBeNull();
    // wander-far 는 펫 위치에서 충분히 떨어진 곳
    const dx = (motion?.targetPosition?.x ?? 0) - 200;
    const dy = (motion?.targetPosition?.y ?? 0) - 200;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(200);
  });

  it("requests a jump when playfulness dominates and CanJump is ready", () => {
    const store = makeStore({ playfulness: 0.95, shyness: 0.05 });
    store.setComponent("pet", { type: "CanJump", impulse: 0.009 });
    store.setComponent("pet", {
      type: "JumpActionState",
      phase: "ready",
      cooldownMs: 0,
    });

    runBehaviorSelectionSystem(
      store,
      createManualClock(0),
      createSeededRandom(7),
      { width: 960, height: 540 },
    );

    const jump = store.getComponent("pet", "JumpActionState");
    expect(jump?.phase).toBe("requested");
    expect(store.getComponent("pet", "BehaviorDecisionState")?.reason).toBe(
      "request-jump",
    );
  });

  it("respects existing higher-priority claims", () => {
    const store = makeStore({});
    store.setComponent("pet", {
      type: "BehaviorDecisionState",
      source: "agent-event",
      decidedAt: 0,
      expiresAt: 10_000,
      reason: "task.started",
    });

    runBehaviorSelectionSystem(
      store,
      createManualClock(0),
      createSeededRandom(1),
      { width: 960, height: 540 },
    );

    // 클레임 source가 그대로 agent-event 여야 함 (autonomous로 덮어쓰지 않음)
    expect(store.getComponent("pet", "BehaviorDecisionState")?.source).toBe(
      "agent-event",
    );
  });

  it("is deterministic for the same seed", () => {
    const a = makeStore({});
    const b = makeStore({});

    runBehaviorSelectionSystem(a, createManualClock(0), createSeededRandom(42), { width: 960, height: 540 });
    runBehaviorSelectionSystem(b, createManualClock(0), createSeededRandom(42), { width: 960, height: 540 });

    expect(a.getComponent("pet", "MotionTarget"))
      .toEqual(b.getComponent("pet", "MotionTarget"));
    expect(a.getComponent("pet", "BehaviorDecisionState")?.reason)
      .toBe(b.getComponent("pet", "BehaviorDecisionState")?.reason);
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

```bash
npm.cmd test -- tests/features/behavior/behavior-selection-system.test.ts
```

Expected: FAIL — `runBehaviorSelectionSystem` export 없음.

- [ ] **Step 3: Implement the system**

`src/features/behavior/systems.ts`에 추가:

```ts
// ── helpers ──────────────────────────────────────────────────────────────

type Candidate = {
  reason: string;
  score: number;
  apply(ctx: ApplyCtx): void;
};

type ApplyCtx = {
  components: ComponentStore;
  id: string;
  petX: number;
  petY: number;
  bounds: { width: number; height: number };
  random: RandomSource;
  userAnchor: { id: string; x: number; y: number } | null;
};

function scoreWanderNear(pref: BehaviorPreferenceComponent): number {
  return 0.3 + pref.curiosity * 0.3 + pref.shyness * 0.4;
}
function scoreWanderFar(pref: BehaviorPreferenceComponent): number {
  return 0.3 + pref.curiosity * 0.7;
}
function scoreSeekUser(pref: BehaviorPreferenceComponent): number {
  return 0.3 + pref.sociability * 0.9 - pref.shyness * 0.4;
}
function scoreJump(pref: BehaviorPreferenceComponent): number {
  return 0.2 + pref.playfulness * 0.6;
}
function scoreClimb(pref: BehaviorPreferenceComponent): number {
  return 0.2 + pref.playfulness * 0.7 + pref.curiosity * 0.2;
}
function scoreIdleStay(pref: BehaviorPreferenceComponent): number {
  return 0.25 + pref.shyness * 0.5;
}

function pickWanderPosition(
  ctx: ApplyCtx,
  range: "near" | "far",
): { x: number; y: number } {
  const margin = 48;
  const angle = ctx.random.next() * Math.PI * 2;
  const radius =
    range === "near"
      ? 60 + ctx.random.next() * 80   // 60–140 px
      : 200 + ctx.random.next() * 200; // 200–400 px
  return {
    x: clamp(ctx.petX + Math.cos(angle) * radius, margin, ctx.bounds.width - margin),
    y: clamp(ctx.petY + Math.sin(angle) * radius, margin, ctx.bounds.height - margin),
  };
}

// ── system ───────────────────────────────────────────────────────────────

export function runBehaviorSelectionSystem(
  components: ComponentStore,
  clock: Clock,
  random: RandomSource,
  bounds: { width: number; height: number },
): void {
  const now = clock.now();

  // user anchor 1회 lookup
  let userAnchor: { id: string; x: number; y: number } | null = null;
  components.query(["UserAnchor", "Transform"], (id, [, transform]) => {
    if (!userAnchor) {
      userAnchor = { id, x: transform.position.x, y: transform.position.y };
    }
  });

  components.query(
    ["IntentState", "MotionTarget", "Transform", "BehaviorPreference"],
    (id, [intent, motion, transform, pref]) => {
      // Trigger 조건
      if (intent.intent !== "idle") return;
      if (motion.targetPosition !== null) return;
      if (motion.targetEntityId !== null) return;
      if (isClaimed(components, id, "autonomous", now)) return;

      const ctx: ApplyCtx = {
        components,
        id,
        petX: transform.position.x,
        petY: transform.position.y,
        bounds,
        random,
        userAnchor,
      };

      const candidates: Candidate[] = [];

      candidates.push({
        reason: "wander-near",
        score: scoreWanderNear(pref) + random.next() * 0.05,
        apply: (c) => {
          c.components.setComponent(c.id, {
            type: "MotionTarget",
            targetEntityId: null,
            targetPosition: pickWanderPosition(c, "near"),
          });
          setIntent(c, "active");
        },
      });

      candidates.push({
        reason: "wander-far",
        score: scoreWanderFar(pref) + random.next() * 0.05,
        apply: (c) => {
          c.components.setComponent(c.id, {
            type: "MotionTarget",
            targetEntityId: null,
            targetPosition: pickWanderPosition(c, "far"),
          });
          setIntent(c, "active");
        },
      });

      if (userAnchor) {
        candidates.push({
          reason: "seek-user",
          score: scoreSeekUser(pref) + random.next() * 0.05,
          apply: (c) => {
            if (!c.userAnchor) return;
            c.components.setComponent(c.id, {
              type: "MotionTarget",
              targetEntityId: c.userAnchor.id,
              targetPosition: { x: c.userAnchor.x, y: c.userAnchor.y },
            });
            setIntent(c, "seek");
          },
        });
      }

      const canJump = components.getComponent(id, "CanJump");
      const jumpState = components.getComponent(id, "JumpActionState");
      if (canJump && jumpState?.phase === "ready") {
        candidates.push({
          reason: "request-jump",
          score: scoreJump(pref) + random.next() * 0.05,
          apply: (c) => {
            c.components.setComponent(c.id, {
              type: "JumpActionState",
              phase: "requested",
              cooldownMs: jumpState.cooldownMs,
            });
            setIntent(c, "active");
          },
        });
      }

      // request-climb 후보: 근처에 ClimbableSurface 있을 때만
      const canClimb = components.getComponent(id, "CanWallClimb");
      if (canClimb) {
        const surface = nearestClimbableSurface(components, ctx);
        if (surface) {
          candidates.push({
            reason: "request-climb",
            score: scoreClimb(pref) + random.next() * 0.05,
            apply: (c) => {
              c.components.setComponent(c.id, {
                type: "ClimbIntentState",
                phase: "approaching",
                surfaceEntityId: surface.id,
                targetY: surface.y - 80,
              });
              setIntent(c, "active");
            },
          });
        }
      }

      candidates.push({
        reason: "idle-stay",
        score: scoreIdleStay(pref) + random.next() * 0.05,
        apply: () => {
          // 의도적으로 no-op (intent=idle 유지, target=null 유지)
        },
      });

      const winner = candidates.reduce((best, c) => (c.score > best.score ? c : best));
      winner.apply(ctx);
      claim(components, id, "autonomous", now, winner.reason);
    },
  );
}

function setIntent(ctx: ApplyCtx, intent: PetIntent) {
  ctx.components.setComponent(ctx.id, { type: "IntentState", intent });
}

function nearestClimbableSurface(
  components: ComponentStore,
  ctx: ApplyCtx,
): { id: string; x: number; y: number } | null {
  let best: { id: string; x: number; y: number; dist: number } | null = null;
  components.query(["ClimbableSurface", "Transform"], (id, [, transform]) => {
    const dx = transform.position.x - ctx.petX;
    const dy = transform.position.y - ctx.petY;
    const dist = Math.hypot(dx, dy);
    if (dist > 400) return;
    if (!best || dist < best.dist) {
      best = { id, x: transform.position.x, y: transform.position.y, dist };
    }
  });
  return best ? { id: best.id, x: best.x, y: best.y } : null;
}
```

> 주의: `isClaimed`/`claim`/`CLAIM_DURATION_MS`는 같은 파일 안 기존 헬퍼를 재사용. `BehaviorPreferenceComponent`/`PetIntent` import 추가.

- [ ] **Step 4: Run tests to verify GREEN**

```bash
npm.cmd test -- tests/features/behavior/behavior-selection-system.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/behavior/systems.ts tests/features/behavior/behavior-selection-system.test.ts
git commit -m "feat: add BehaviorSelectionSystem with personality-weighted scoring"
```

---

## Task 3: Arrival → Selection 통합

목적: `ArrivalBehaviorSystem`이 intent을 `idle`로 되돌리고 motion을 비운 직후, 같은 step의 BEHAVIOR 단계에서 `BehaviorSelectionSystem`이 다음 후보를 고른다.

**Files:**
- Modify: `src/core/create-world.ts`
- Test: `tests/features/behavior/behavior-selection-system.test.ts` (통합 케이스 추가)

- [ ] **Step 1: Add a failing integration test**

```ts
// tests/features/behavior/behavior-selection-system.test.ts (append)
import { createDemoScenario } from "@/core/scenario-fixtures";

describe("BehaviorSelectionSystem (integration via world.step)", () => {
  it("picks a new behavior after arrival", () => {
    const { world, clock } = createDemoScenario();

    // pet-a (Alice)에게 가까운 wander target 직접 부여
    const before = world.snapshot().pets.find((p) => p.id === "pet-a");
    world.setComponent("pet-a", {
      type: "MotionTarget",
      targetEntityId: null,
      targetPosition: { x: (before?.position.x ?? 600) + 4, y: before?.position.y ?? 500 },
    });
    world.setComponent("pet-a", { type: "IntentState", intent: "active" });

    // 도착할 때까지 충분히 step. ArrivalBehaviorSystem이 motion을 비우고
    // intent을 (seek였다면) idle로 돌리고, 그 다음 frame에 selection이 새 후보를 골라야 한다.
    for (let i = 0; i < 60; i += 1) {
      clock.advanceBy(16);
      world.step(16);
    }

    const claim = world.getComponent("pet-a", "BehaviorDecisionState");
    expect(claim?.source).toBe("autonomous");
    // 유효한 선택 reason 중 하나
    expect([
      "wander-near",
      "wander-far",
      "seek-user",
      "request-jump",
      "request-climb",
      "idle-stay",
    ]).toContain(claim?.reason);
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

```bash
npm.cmd test -- tests/features/behavior/behavior-selection-system.test.ts
```

Expected: FAIL — `BehaviorSelectionSystem`이 아직 step 파이프라인에 등록되지 않음.

- [ ] **Step 3: Register the system in create-world**

```ts
// src/core/create-world.ts
import {
  // ...existing
  runBehaviorSelectionSystem,
} from "@/features/behavior/systems";

// stepSystems 배열에서 CollisionBehaviorSystem 직후, AutonomousBehaviorSystem 직전에 삽입:
{
  name: "BehaviorSelectionSystem",
  dependsOn: ["CollisionBehaviorSystem"],
  reads: [
    "IntentState",
    "MotionTarget",
    "Transform",
    "BehaviorPreference",
    "UserAnchor",
    "CanJump",
    "JumpActionState",
    "CanWallClimb",
    "ClimbableSurface",
  ],
  writes: [
    "IntentState",
    "MotionTarget",
    "JumpActionState",
    "ClimbIntentState",
    "BehaviorDecisionState",
  ],
  update(ctx) {
    runBehaviorSelectionSystem(ctx.components, ctx.clock, ctx.random, ctx.bounds);
  },
},
// AutonomousBehaviorSystem의 dependsOn을 "BehaviorSelectionSystem"으로 갱신:
{
  name: "AutonomousBehaviorSystem",
  dependsOn: ["BehaviorSelectionSystem"],
  // ...rest
},
```

> Note: `ArrivalBehaviorSystem`은 그대로 UPDATE 단계에 남는다. 한 step 안에서의 흐름은:
> 1. BEHAVIOR: agent-event → collision → **selection** → autonomous(speech)
> 2. UPDATE: locomotion mode → climb approach → **arrival** (motion 비움/intent=idle) → ...
>
> 도착이 발생한 그 step에서는 selection이 못 본다. 다음 step의 BEHAVIOR 단계에서 selection이 처음으로 보고, autonomous 클레임 (500ms) 안에서 행동을 커밋한다.

- [ ] **Step 4: Run the test to verify GREEN**

```bash
npm.cmd test -- tests/features/behavior/behavior-selection-system.test.ts
npm.cmd test
```

Expected: PASS. 전체 스위트도 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/create-world.ts tests/features/behavior/behavior-selection-system.test.ts
git commit -m "feat: wire BehaviorSelectionSystem into world step pipeline"
```

---

## Task 4: 플레이그라운드 노출 — Action Timeline & BehaviorLab

목적: 어떤 결정이 언제 일어났는지 사람이 눈으로 확인할 수 있어야 한다. `BehaviorDecisionState.source/reason` 변화는 timeline에, 현재 `BehaviorPreference` 가중치는 BehaviorLab 패널에.

**Files:**
- Modify: `src/playground/browser/playground-app.tsx`
- Modify: `src/playground/browser/behavior-lab.tsx`
- Modify: `tests/smoke/playground-app.test.tsx`

- [ ] **Step 1: Add a failing smoke test**

`tests/smoke/playground-app.test.tsx`에 케이스 추가:

```tsx
it("logs behavior selection entries into the action timeline", async () => {
  render(<PlaygroundApp />);
  // 자동 재생 중 적당 시간 후, timeline에 'behavior:' 시작 entry가 하나 이상 있어야 한다.
  await waitFor(
    () => {
      const items = screen.getAllByTestId(/action-timeline/i);
      const text = items.map((n) => n.textContent ?? "").join("\n");
      expect(text).toMatch(/behavior:/);
    },
    { timeout: 2000 },
  );
});
```

(현재 smoke 테스트 구조에 맞게 selector는 기존 코드 스타일에 맞춰 조정.)

- [ ] **Step 2: Run the test to verify RED**

```bash
npm.cmd test -- tests/smoke/playground-app.test.tsx
```

Expected: FAIL — 아직 timeline에 behavior 로그가 안 들어감.

- [ ] **Step 3: Extend `diffSnapshot` in playground-app.tsx**

```ts
// src/playground/browser/playground-app.tsx

type Snapshot = ...;

// snapshot에 behavior decision 정보가 노출되어야 함.
// 가장 간단한 방법: snapshot pet 항목에 lastDecision { source, reason, decidedAt } 추가.
// → create-world.ts의 getPetSnapshots에서 BehaviorDecisionState를 읽어 첨부.
```

`src/core/create-world.ts`의 `getPetSnapshots` 수정:

```ts
function getPetSnapshots(componentStore: ComponentStore) {
  return componentStore
    .query("PetIdentity", "AgentBinding", "IntentState", "SpeechState", "Transform")
    .map((entity) => {
      // ...existing
      const decision = componentStore.getComponent(entity.id, "BehaviorDecisionState");
      return {
        // ...existing fields
        decision: decision
          ? { source: decision.source, reason: decision.reason, decidedAt: decision.decidedAt }
          : null,
      };
    });
}
```

`world-snapshot.ts`의 `PetSnapshot` 타입에 `decision` 필드 추가(이미 옵션이면 그대로).

그 다음 `diffSnapshot`에서:

```ts
const prevDecision = prevPet.decision;
const nextDecision = pet.decision;
const decidedChanged =
  prevDecision?.decidedAt !== nextDecision?.decidedAt ||
  prevDecision?.reason !== nextDecision?.reason ||
  prevDecision?.source !== nextDecision?.source;
if (nextDecision && decidedChanged) {
  entries.push({
    t,
    petName: pet.name,
    label: `behavior: ${nextDecision.source}/${nextDecision.reason}`,
  });
}
```

- [ ] **Step 4: BehaviorLab에 preference 패널 추가**

```tsx
// src/playground/browser/behavior-lab.tsx
const INSPECTED_COMPONENTS: SimulationComponentType[] = [
  // ...existing
  "BehaviorPreference",
  "BehaviorDecisionState",
];
```

`INSPECTED_COMPONENTS`만 늘려도 기존 자동 표시 로직이 0..1 weights와 현재 claim을 출력함. 별도 UI 변경 없이도 즉시 보임.

- [ ] **Step 5: Run smoke test to verify GREEN**

```bash
npm.cmd test -- tests/smoke/playground-app.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/playground/browser/playground-app.tsx src/playground/browser/behavior-lab.tsx src/core/create-world.ts src/core/world-snapshot.ts tests/smoke/playground-app.test.tsx
git commit -m "feat: surface behavior selection in playground timeline and BehaviorLab"
```

---

## Task 5: Final verification

- [ ] **Step 1: Full unit suite**

```bash
npm.cmd test
```

Expected: PASS.

- [ ] **Step 2: Build**

```bash
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 3: E2E (있다면)**

```bash
npm.cmd run test:e2e
```

Expected: PASS.

- [ ] **Step 4: Visual confirmation**

브라우저 플레이그라운드를 띄우고 자동 재생 상태에서 확인:

- Alice (playful): 도착 후 자주 jump 요청, 가끔 wander-far
- Bob (attentive): 도착 후 빈번하게 seek-user
- Charlie (playful + climb): 벽 근처에서 request-climb 비중 증가
- Dana (reserved): 도착 후 idle-stay 또는 wander-near 비중 증가
- Action timeline에 `behavior: autonomous/<reason>` entry가 도착 직후 등장
- BehaviorLab의 `BehaviorDecisionState` panel에 현재 선택과 만료 시각이 보임

- [ ] **Step 5: Commit any final touch-ups**

(필요시) 가중치 미세조정·시각적 미세 버그 수정. 빈 commit은 만들지 않는다.

---

## 후속 확장 (이 plan 범위 밖)

이 slice가 안정되면 같은 `BehaviorSelectionSystem` 안에서 자연스럽게 확장 가능한 것들:

1. **Trigger 확장**: arrival 외에 `task.completed` 직후, `idle 시간 > idleAfterMs` 직후도 selection 진입점으로 추가.
2. **Collision personality 반응**: `runCollisionBehaviorSystem`이 `BehaviorPreference`를 읽고 `shyness` 높으면 더 멀리 도망, `playfulness` 높으면 부딪힘 직후 `request-jump`로 분기.
3. **Social proximity 후보**: `seek-other-pet` 후보를 sociability·high에서 추가 (가까운 다른 펫을 target).
4. **Speech 우선순위 묶기**: 현재 결정과 reason을 `SpeechProfile`의 키로 사용해 (`wander-far` 시 다른 대사, `request-jump` 시 다른 대사) 행동·말 정합성 확보.
5. **Telemetry**: snapshot에 누적 선택 분포 카운터를 두어 BehaviorLab에서 "Alice는 최근 20번 중 jump 8 / wander 7 / seek 5"처럼 확인.

---

## 결정 사항 요약 (왜 이렇게 설계했나)

- **personality는 단일 컴포넌트(`BehaviorPreference`)**: 분리하면 query 부담만 늘고 점수화에서 어차피 한꺼번에 읽는다. 4축이면 충분히 펫 색깔 차이가 난다.
- **0..1 weights + base score + jitter**: 점수 비교가 의미 있는 단위로 일정해진다. jitter는 동일 상황에서 살짝 다른 선택을 만들어 결정성과 다양성을 양립.
- **autonomous priority(4) 클레임만 사용**: 새로운 priority 도입 없이 기존 `BEHAVIOR_PRIORITY`/`CLAIM_DURATION_MS` 모델을 그대로 활용. agent-event/collision은 여전히 selection을 덮어쓸 수 있다.
- **ArrivalBehaviorSystem은 그대로 두고, trigger는 "idle ∧ no target"으로 표현**: 별도 event 컴포넌트를 만들지 않아 churn이 없고, 첫 step 처음부터 펫이 가만히 있다면 그 자체로 selection 진입.
- **deterministic random + seeded test**: 점수가 가중치 차이로 결정되지만 tie-break은 항상 같은 seed에서 같은 결과여야 한다. 회귀 테스트가 가능해진다.
- **playground 노출은 기존 자동 component panel + diff 기반 timeline 재사용**: 새 UI 컴포넌트 없이 즉시 가시화.
