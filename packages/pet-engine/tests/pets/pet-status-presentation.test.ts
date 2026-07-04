import { describe, expect, it } from "vitest";
import { presentPetStatus } from "@pets-driven/pet-engine/pets/rendering/pet-status-presentation";

describe("presentPetStatus", () => {
  it("hides the capsule when no agent channel overlay is present", () => {
    const presentation = presentPetStatus({ kind: "working" }, null);

    expect(presentation.showCapsule).toBe(false);
    expect(presentation.mood).toBe("working");
  });

  it("maps idle pets to a napping mood with zzz emote", () => {
    const presentation = presentPetStatus({ kind: "idle" }, null);

    expect(presentation.mood).toBe("sleepy");
    expect(presentation.emote).toBe("zzz");
  });

  it("maps waiting pets to confused with a question emote", () => {
    const presentation = presentPetStatus({ kind: "waiting" }, null);

    expect(presentation.mood).toBe("confused");
    expect(presentation.emote).toBe("question");
    expect(presentation.label).toBe("Waiting");
  });

  it("maps failed pets to confused with an exclaim emote", () => {
    const presentation = presentPetStatus({ kind: "failed" }, null);

    expect(presentation.mood).toBe("confused");
    expect(presentation.emote).toBe("exclaim");
  });

  it("maps playful intents to celebratory moods", () => {
    expect(presentPetStatus({ kind: "jumping" }, null).emote).toBe("sparkle");
    expect(presentPetStatus({ kind: "waving" }, null).mood).toBe("happy");
    expect(presentPetStatus({ kind: "review" }, null).mood).toBe("thinking");
  });

  it("lets an attention overlay override mood, label and emote", () => {
    const presentation = presentPetStatus(
      { kind: "working" },
      { kind: "attention", label: "WAIT" },
    );

    expect(presentation).toEqual({
      mood: "confused",
      label: "WAIT",
      labelKey: null,
      message: null,
      emote: "exclaim",
      showCapsule: true,
    });
  });

  it("shows agent channel status in the speech bubble", () => {
    const presentation = presentPetStatus(
      { kind: "idle" },
      {
        kind: "agent-channel",
        status: "working",
        label: "Working",
        message: null,
      },
    );

    expect(presentation).toEqual({
      mood: "working",
      label: "Working",
      labelKey: "working",
      message: null,
      emote: "none",
      showCapsule: true,
    });
  });

  it("keeps the intent mood for status overlays and shows their label", () => {
    const presentation = presentPetStatus(
      { kind: "idle" },
      { kind: "status", label: "!" },
    );

    expect(presentation.mood).toBe("sleepy");
    expect(presentation.label).toBe("!");
    expect(presentation.emote).toBe("zzz");
    expect(presentation.showCapsule).toBe(true);
  });

  it("carries speech overlay text into the capsule label", () => {
    const presentation = presentPetStatus(
      { kind: "travel", direction: "right" },
      { kind: "speech", label: "Otto's on it…" },
    );

    expect(presentation.label).toBe("Otto's on it…");
    expect(presentation.mood).toBe("working");
    expect(presentation.showCapsule).toBe(true);
  });

  it("does not show a status capsule just because a pet is traveling", () => {
    const presentation = presentPetStatus(
      { kind: "travel", direction: "right" },
      null,
    );

    expect(presentation.mood).toBe("working");
    expect(presentation.label).toBeNull();
    expect(presentation.showCapsule).toBe(false);
  });

  it("falls back to a working mood without an intent", () => {
    const presentation = presentPetStatus(undefined, {
      kind: "status",
      label: "!",
    });

    expect(presentation.mood).toBe("working");
    expect(presentation.showCapsule).toBe(true);
  });
});
