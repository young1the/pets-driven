import type { ComponentStore } from "@pets-driven/pet-engine/core/component-store";
import type { SimulationSystem } from "@pets-driven/pet-engine/core/simulation-system";
import type { WorldStepContext } from "@pets-driven/pet-engine/core/world-step-context";

// Keep a couple of seconds of history — enough for petting's ~1.5s oscillation
// window plus slack — without growing unbounded if the host stops feeding input.
const CURSOR_SAMPLE_WINDOW_MS = 2_000;
const CURSOR_MAX_SAMPLES = 128;

/**
 * Consumes the transient CursorInput component (written by the host once per
 * tick via world.feedCursorPosition()), appends a sample to CursorState, and
 * syncs the entity's Transform so seek-user and chase-cursor targeting track
 * the live cursor for free.
 */
export function runCursorInputSystem(components: ComponentStore): void {
  components.forEach(["CursorInput"], (id, [input]) => {
    const state = components.getComponent(id, "CursorState");
    const transform = components.getComponent(id, "Transform");

    const samples = state ? [...state.samples] : [];
    const last = samples[samples.length - 1];
    if (!last || input.at > last.at) {
      samples.push({ at: input.at, position: { ...input.position } });
    }

    const cutoff = input.at - CURSOR_SAMPLE_WINDOW_MS;
    const trimmed = samples.filter((sample) => sample.at >= cutoff).slice(-CURSOR_MAX_SAMPLES);

    components.setComponent(id, {
      type: "CursorState",
      position: { ...input.position },
      samples: trimmed,
    });

    if (transform) transform.position = { ...input.position };

    components.removeComponent(id, "CursorInput");
  });
}

export const CursorInputSystem: SimulationSystem<WorldStepContext> = {
  name: "CursorInputSystem",
  dependsOn: ["ContactSystem"],
  reads: ["CursorInput", "CursorState", "Transform"],
  writes: ["CursorState", "Transform", "CursorInput"],
  update(ctx) {
    runCursorInputSystem(ctx.components);
  },
};
