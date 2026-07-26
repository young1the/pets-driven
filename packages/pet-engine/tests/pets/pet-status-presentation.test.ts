import { presentPetStatus } from "@pets-driven/pet-engine/pets/rendering/pet-status-presentation";
import { describe, expect, it } from "vitest";

describe("presentPetStatus", () => {
  it("hides the capsule when no agent channel overlay is present", () => {
    const presentation = presentPetStatus("running", null);

    expect(presentation.showCapsule).toBe(false);
    expect(presentation.mood).toBe("working");
  });

  it("maps idle pets to a napping mood with zzz emote", () => {
    const presentation = presentPetStatus("idle", null);

    expect(presentation.mood).toBe("sleepy");
    expect(presentation.emote).toBe("zzz");
  });

  it("maps waiting pets to confused with a question emote", () => {
    const presentation = presentPetStatus("waiting", null);

    expect(presentation.mood).toBe("confused");
    expect(presentation.emote).toBe("question");
    expect(presentation.label).toBe("Waiting");
  });

  it("maps failed pets to confused with an exclaim emote", () => {
    const presentation = presentPetStatus("failed", null);

    expect(presentation.mood).toBe("confused");
    expect(presentation.emote).toBe("exclaim");
  });

  it("maps playful intents to celebratory moods", () => {
    expect(presentPetStatus("jumping", null).emote).toBe("sparkle");
    expect(presentPetStatus("waving", null).mood).toBe("happy");
    expect(presentPetStatus("review", null).mood).toBe("thinking");
  });

  it("lets an attention overlay override mood, label and emote", () => {
    const presentation = presentPetStatus("running", { kind: "attention", label: "WAIT" });

    expect(presentation).toEqual({
      mood: "confused",
      tone: "work",
      label: "WAIT",
      labelKey: null,
      message: null,
      emote: "exclaim",
      showCapsule: true,
    });
  });

  it("shows agent channel status in the speech bubble", () => {
    const presentation = presentPetStatus("idle", {
      kind: "agent-channel",
      status: "working",
      label: "Working",
      message: null,
    });

    expect(presentation).toEqual({
      mood: "working",
      tone: "work",
      label: "Working",
      labelKey: "working",
      message: null,
      emote: "none",
      showCapsule: true,
    });
  });

  it("keeps the intent mood for status overlays and shows their label", () => {
    const presentation = presentPetStatus("idle", { kind: "status", label: "!" });

    expect(presentation.mood).toBe("sleepy");
    expect(presentation.label).toBe("!");
    expect(presentation.emote).toBe("zzz");
    expect(presentation.showCapsule).toBe(true);
  });

  it("names the session partner on the ambient social label", () => {
    const presentation = presentPetStatus("running-right", null, "chatting", "Otto");

    expect(presentation.labelKey).toBe("chattingWith");
    expect(presentation.label).toBe("Chatting with Otto");
    expect(presentation.labelParams).toEqual({ name: "Otto" });
  });

  it("maps social activities to their partner-aware variants", () => {
    expect(presentPetStatus("running-right", null, "playing", "Bo").labelKey).toBe("playingWith");
    expect(presentPetStatus("waving", null, "dancing", "Bo").labelKey).toBe("dancingWith");
    expect(presentPetStatus("running-right", null, "makingFriends", "Bo").labelKey).toBe(
      "makingFriendsWith",
    );
  });

  it("leaves the plain label when there is no partner or the activity is non-social", () => {
    expect(presentPetStatus("running-right", null, "chatting", null).labelKey).toBe("chatting");
    expect(presentPetStatus("running-right", null, "exploring", "Otto").labelKey).toBe("exploring");
    expect(
      presentPetStatus("running-right", null, "exploring", "Otto").labelParams,
    ).toBeUndefined();
  });

  it("carries speech overlay text into the capsule label", () => {
    const presentation = presentPetStatus("running-right", {
      kind: "speech",
      label: "Otto's on it…",
    });

    expect(presentation.label).toBe("Otto's on it…");
    expect(presentation.mood).toBe("working");
    expect(presentation.showCapsule).toBe(true);
  });

  it("does not show a status capsule just because a pet is traveling", () => {
    const presentation = presentPetStatus("running-right", null);

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

  it("lets the canonical activity label ambient intents", () => {
    const presentation = presentPetStatus("running-right", null, "chasingCursor");

    expect(presentation.label).toBe("Chasing the cursor");
    expect(presentation.labelKey).toBe("chasingCursor");
    expect(presentation.mood).toBe("excited");
    expect(presentation.emote).toBe("sparkle");
  });

  it("activity replaces the idle zzz presentation", () => {
    const presentation = presentPetStatus("idle", null, "beingPetted");

    expect(presentation.mood).toBe("love");
    expect(presentation.emote).toBe("heart");
    expect(presentation.labelKey).toBe("beingPetted");
  });

  it("shows signature activity labels on reused task animation rows", () => {
    const watch = presentPetStatus("waiting", null, "keepingWatch");
    expect(watch.labelKey).toBe("keepingWatch");
    expect(watch.mood).toBe("love");

    const peek = presentPetStatus("review", null, "peeking");
    expect(peek.labelKey).toBe("peeking");
    expect(peek.mood).toBe("thinking");

    const routine = presentPetStatus("running", null, "followingRoutine");
    expect(routine.labelKey).toBe("followingRoutine");

    const comfort = presentPetStatus("waving", null, "offeringComfort");
    expect(comfort.labelKey).toBe("offeringComfort");
  });

  it("never lets activity override task-owned intents", () => {
    const waiting = presentPetStatus("waiting", null, "exploring");
    expect(waiting.label).toBe("Waiting");
    expect(waiting.mood).toBe("confused");

    const failed = presentPetStatus("failed", null, "exploring");
    expect(failed.label).toBe("Stuck");
  });

  it("agent-channel overlays still own the capsule over an activity", () => {
    const presentation = presentPetStatus(
      "idle",
      {
        kind: "agent-channel",
        status: "working",
        label: "Working",
        message: null,
      },
      "exploring",
    );

    expect(presentation.label).toBe("Working");
    expect(presentation.labelKey).toBe("working");
  });

  it("speech overlays keep their free text but inherit the activity mood", () => {
    const presentation = presentPetStatus(
      "running-right",
      { kind: "speech", label: "Otto's on it…" },
      "makingFriends",
    );

    expect(presentation.label).toBe("Otto's on it…");
    expect(presentation.labelKey).toBeNull();
    expect(presentation.mood).toBe("love");
  });

  it("keeps the capsule shown while working even with no overlay", () => {
    const presentation = presentPetStatus("running", null, null, null, true);

    expect(presentation.showCapsule).toBe(true);
    // No overriding activity/label of its own, so it falls back to "Working".
    expect(presentation.label).toBe("Working");
    expect(presentation.labelKey).toBe("working");
    expect(presentation.mood).toBe("working");
  });

  it("prefers the ambient activity label over the Working fallback while working", () => {
    const presentation = presentPetStatus("running", null, "exploring", null, true);

    expect(presentation.showCapsule).toBe(true);
    expect(presentation.label).toBe("Exploring");
    expect(presentation.labelKey).toBe("exploring");
  });

  it("names the working pose instead of a flat Working capsule", () => {
    const headsDown = presentPetStatus("running", null, "headsDown", null, true);
    expect(headsDown.label).toBe("Heads down");
    expect(headsDown.tone).toBe("work");

    const dawdling = presentPetStatus("idle", null, "dawdling", null, true);
    expect(dawdling.label).toBe("Taking it easy");
    expect(dawdling.emote).toBe("zzz");
  });

  /**
   * The working poses borrow the review/failed rows between work passes. Those
   * rows are task-owned, so without the signature exemption a pondering pet
   * would read as "Reviewing" and an anxious one as "Stuck".
   */
  it("keeps the working label on the task rows its choreography borrows", () => {
    const mulling = presentPetStatus("review", null, "mullingOver", null, true);
    expect(mulling.labelKey).toBe("mullingOver");
    expect(mulling.label).toBe("Mulling it over");

    const fussing = presentPetStatus("failed", null, "fussingOver", null, true);
    expect(fussing.labelKey).toBe("fussingOver");
    expect(fussing.emote).toBe("sweat");
  });

  /**
   * Color is reserved for the work lifecycle, so a spoken line must not drop a
   * working pet to the neutral ambient tone — going grey mid-task reads as the
   * task having been released.
   */
  it("keeps the work tone and label when a working pet speaks an ambient line", () => {
    const presentation = presentPetStatus(
      "running",
      { kind: "agent-channel", status: null, label: null, message: "hi there" },
      "headsDown",
      null,
      true,
    );

    expect(presentation.tone).toBe("work");
    expect(presentation.labelKey).toBe("headsDown");
    expect(presentation.message).toBe("hi there");
  });

  it("falls back to the Working label for a working pet with a line but no activity", () => {
    const presentation = presentPetStatus(
      "running",
      { kind: "agent-channel", status: null, label: null, message: "hi there" },
      null,
      null,
      true,
    );

    expect(presentation.tone).toBe("work");
    expect(presentation.labelKey).toBe("working");
  });

  it("keeps a non-working pet's spoken line ambient", () => {
    const presentation = presentPetStatus(
      "idle",
      { kind: "agent-channel", status: null, label: null, message: "hi there" },
      "chatting",
      null,
      false,
    );

    expect(presentation.tone).toBe("ambient");
    expect(presentation.labelKey).toBe("chatting");
  });

  it("still hides the capsule for an idle (not working) pet with no overlay", () => {
    const presentation = presentPetStatus("running", null, "exploring", null, false);

    expect(presentation.showCapsule).toBe(false);
  });

  describe("tone", () => {
    it("marks the agent work lifecycle states as work tone", () => {
      expect(presentPetStatus("running", null, null, null, true).tone).toBe("work");
      expect(
        presentPetStatus("idle", {
          kind: "agent-channel",
          status: "waiting",
          label: "Waiting",
          message: null,
        }).tone,
      ).toBe("work");
      expect(
        presentPetStatus("idle", {
          kind: "agent-channel",
          status: "completed",
          label: "Done",
          message: null,
        }).tone,
      ).toBe("work");
      expect(
        presentPetStatus("idle", {
          kind: "agent-channel",
          status: "failed",
          label: "Failed",
          message: null,
        }).tone,
      ).toBe("work");
      expect(presentPetStatus("running", { kind: "attention", label: "WAIT" }).tone).toBe("work");
    });

    it("marks ambient play, idle and spoken lines as ambient tone", () => {
      expect(presentPetStatus("idle", null).tone).toBe("ambient");
      expect(presentPetStatus("running-right", null, "chasingCursor").tone).toBe("ambient");
      expect(presentPetStatus("idle", null, "beingPetted").tone).toBe("ambient");
      expect(
        presentPetStatus("idle", {
          kind: "agent-channel",
          status: null,
          label: null,
          message: "hi there",
        }).tone,
      ).toBe("ambient");
      expect(
        presentPetStatus("running-right", { kind: "speech", label: "Otto's on it…" }).tone,
      ).toBe("ambient");
    });
  });
});
