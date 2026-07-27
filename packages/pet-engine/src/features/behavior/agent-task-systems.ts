import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import {
  type AgentTaskStatus,
  statusFreezesMovement,
} from "@pets-driven/pet-engine/features/agent/agent-task-state";
import {
  claim,
  SPEECH_BUBBLE_DURATION_MS,
  stopPetMovement,
  type VelocityWriter,
} from "@pets-driven/pet-engine/features/behavior/claim";
import type {
  AgentWorldEvent,
  WorldEvent,
} from "@pets-driven/pet-engine/features/events/world-event";
import { recordPetExperience } from "@pets-driven/pet-engine/features/mood/systems";
import { resolveSpeechVariant } from "@pets-driven/pet-engine/pets/personalities/voice-profiles";
import type { RandomSource } from "@pets-driven/pet-engine/shared/random/seeded-random";
import { createSeededRandom } from "@pets-driven/pet-engine/shared/random/seeded-random";
import type { Clock } from "@pets-driven/pet-engine/shared/time/manual-clock";

/**
 * Priority-2 agent ingress: external agent events become task state, speech,
 * and a movement hold, plus the system that enforces that hold each tick.
 */

function setAgentTaskState(
  components: ComponentStore,
  id: string,
  status: "working" | "waiting" | "completed" | "failed",
  event: { at: number; summary?: string },
  message: string | null,
  now: number,
): void {
  components.setComponent(id, {
    type: "AgentTaskState",
    status,
    since: event.at,
    summary: event.summary,
  });
  components.setComponent(id, {
    type: "AgentChannelState",
    source: "agent-task",
    status,
    label: agentTaskChannelLabel(status),
    message,
    updatedAt: event.at,
    // Freezing statuses (waiting/failed/completed) persist until the user
    // acknowledges the pet by interacting with it. A non-freezing "working"
    // status lets its spoken line expire on the shared TTL (clock-relative, so
    // it matches the expiration system) while the status capsule itself stays.
    expiresAt: statusFreezesMovement(status) ? null : now + SPEECH_BUBBLE_DURATION_MS,
  });
}

function agentTaskChannelLabel(status: "working" | "waiting" | "completed" | "failed"): string {
  switch (status) {
    case "working":
      return "Working";
    case "waiting":
      return "Waiting";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
  }
}

// Priority 2: record external agent events onto the pet (task.started, etc.).
// This system only ingests agent facts — task/channel state, speech, activity,
// the priority claim, and the movement hold a freezing status implies. It does
// NOT touch Steering; movement/behavior is owned by the decision layer and
// user interaction.
export function runAgentTaskEventSystem(
  components: ComponentStore,
  events: WorldEvent[],
  clock: Clock,
  random: RandomSource = createSeededRandom(1),
): void {
  if (events.length === 0) return;
  const agentEvents = events.filter((event): event is AgentWorldEvent => event.kind === "agent");
  if (agentEvents.length === 0) return;
  const now = clock.now();

  components.forEach(
    ["AgentBinding", "SpeechProfile", "ActivityState"],
    (id, [agent, speechProfile, activity]) => {
      for (const event of agentEvents) {
        if (agent.sourceId !== event.sourceId) continue;

        if (event.type === "task.started") {
          setAgentTaskState(
            components,
            id,
            "working",
            event,
            event.summary ?? resolveSpeechVariant(speechProfile.taskStarted, random),
            now,
          );
          applyTaskMovementHold(components, id, "working", event.at);
          activity.lastActiveAt = event.at;
          releaseAgentEventClaim(components, id, now);
          recordPetExperience(components, id, "task-started", now);
        }

        if (event.type === "tool.used") {
          // A tool call on an already-working pet is a heartbeat, not news: it
          // must not re-speak the task-started line, re-take the 5s agent-event
          // claim (which starved the working poses entirely — tools fire far
          // faster than the claim expires), reset `since`, or log another
          // task-started experience. All it does is refresh the work.
          const current = components.getComponent(id, "AgentTaskState");
          if (current?.status === "completed" || current?.status === "failed") {
            continue;
          }

          recordAgentActivitySignal(components, id, event.activity, event.at);
          if (current?.status === "working") {
            activity.lastActiveAt = event.at;
            continue;
          }

          // Waiting is resumable after the user resolves attention. Terminal
          // states above stay terminal even when an async tool hook arrives late.
          setAgentTaskState(components, id, "working", event, null, now);
          applyTaskMovementHold(components, id, "working", event.at);
          activity.lastActiveAt = event.at;
          releaseAgentEventClaim(components, id, now);
        }

        if (event.type === "task.waiting" || event.type === "attention.requested") {
          setAgentTaskState(
            components,
            id,
            "waiting",
            event,
            event.summary ?? resolveSpeechVariant(speechProfile.attentionNeeded, random),
            now,
          );
          applyTaskMovementHold(components, id, "waiting", event.at);
          claim(components, id, "agent-event", now, event.type);
          recordPetExperience(components, id, "task-waiting", now);
        }

        if (event.type === "task.failed") {
          setAgentTaskState(components, id, "failed", event, event.summary ?? "Task failed", now);
          applyTaskMovementHold(components, id, "failed", event.at);
          activity.lastActiveAt = event.at;
          claim(components, id, "agent-event", now, "task.failed");
          recordPetExperience(components, id, "task-failed", now);
        }

        if (event.type === "task.completed") {
          setAgentTaskState(
            components,
            id,
            "completed",
            event,
            event.summary ?? resolveSpeechVariant(speechProfile.taskCompleted, random),
            now,
          );
          applyTaskMovementHold(components, id, "completed", event.at);
          activity.lastActiveAt = event.at;
          claim(components, id, "agent-event", now, "task.completed");
          recordPetExperience(components, id, "task-completed", now);
        }
      }
    },
  );
}

/**
 * Record the neutral activity hint carried by the latest agent pulse.
 * Unknown activity still advances the heartbeat so stale hints cannot affect
 * a later behavior decision.
 */
function recordAgentActivitySignal(
  components: ComponentStore,
  id: string,
  activity: "study" | "edit" | "run" | undefined,
  at: number,
): void {
  components.setComponent(id, {
    type: "AgentActivitySignal",
    activity: activity ?? null,
    at,
  });
}

function releaseAgentEventClaim(components: ComponentStore, id: string, now: number): void {
  const decision = components.getComponent(id, "BehaviorDecisionState");
  if (decision?.source === "agent-event" && decision.expiresAt > now) {
    decision.expiresAt = now;
  }
}

/**
 * Add or clear the movement hold in step with the status the pet just entered.
 * Freezing statuses (waiting/failed/completed) hold the pet still; moving
 * statuses (working/idle) clear any prior hold so the pet is free again. This
 * runs only on an agent-event edge, so a user release between events survives
 * untouched — the hold is not continuously re-derived from status.
 */
function applyTaskMovementHold(
  components: ComponentStore,
  id: string,
  status: AgentTaskStatus,
  at: number,
): void {
  if (statusFreezesMovement(status)) {
    components.setComponent(id, { type: "TaskMovementHold", since: at });
  } else {
    components.removeComponent(id, "TaskMovementHold");
  }
}

// Hold pets still while a TaskMovementHold is present — a freezing task the
// user has not released yet.
export function runTaskMovementHoldSystem(
  components: ComponentStore,
  physics: VelocityWriter,
): void {
  components.forEach(["TaskMovementHold"], (id) => {
    stopPetMovement(components, physics, id);
  });
}
