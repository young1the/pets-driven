import type { WorldSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import { createPlayfulPersonality } from "@pets-driven/pet-engine/pets/personalities/factories";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePetVoiceCoordinator } from "@/app/voice/use-pet-voice-coordinator";
import type { PetsDrivenState } from "@/app-state/pets-driven-state";

const output = vi.hoisted(() => ({
  setVolume: vi.fn(),
  speak: vi.fn(() => Promise.resolve()),
  stop: vi.fn(),
}));

vi.mock("@/app/voice/animalese-voice-player", () => ({
  AnimaleseVoicePlayer: class {
    setVolume = output.setVolume;
    speak = output.speak;
    stop = output.stop;
  },
}));

function state(options: { muted?: boolean; personalityId?: "playful" } = {}): PetsDrivenState {
  return {
    schemaVersion: 1,
    pets: [
      {
        id: "pet-1",
        workingDirectoryId: null,
        assetId: "cato",
        profileId: "profile-1",
        name: "Mochi",
        adoptedAt: 1,
        archived: false,
        visible: true,
      },
    ],
    petProfiles: [
      {
        id: "profile-1",
        petAssetId: "cato",
        personalityId: options.personalityId,
        personality: createPlayfulPersonality(),
        voice: { pitch: 1.42, muted: options.muted ?? false },
      },
    ],
    registeredWorkingDirectories: [],
    sessionCommand: "cmd /k claude",
    terminalShell: null,
    petSourceDirectory: null,
  };
}

function snapshot(options: {
  message: string;
  source?: "agent-task" | "idle" | "social" | "interaction";
  status?: "working" | "waiting" | "completed" | "failed" | null;
  updatedAt?: number;
}): WorldSnapshot {
  return {
    width: 100,
    height: 100,
    bodies: [],
    climbableSurfaces: [],
    pets: [
      {
        id: "pet-1",
        sourceId: "source-1",
        name: "Mochi",
        steering: "stand",
        locomotion: "idle",
        speech: options.message,
        position: { x: 0, y: 0 },
        contact: { grounded: true, climbableSurfaceId: null },
        motionTarget: null,
        decision: null,
        pendingReaction: null,
        agentChannel: {
          source: options.source ?? "agent-task",
          status: options.status === undefined ? "completed" : options.status,
          label: null,
          message: options.message,
          updatedAt: options.updatedAt ?? 1,
          expiresAt: null,
        },
      },
    ],
  };
}

describe("pet voice coordinator", () => {
  beforeEach(() => {
    output.setVolume.mockClear();
    output.speak.mockClear();
    output.stop.mockClear();
  });

  it("translates and speaks a lifecycle line only once", async () => {
    const stateRef = { current: state({ personalityId: "playful" }) };
    const { result } = renderHook(() =>
      usePetVoiceCoordinator({
        stateRef,
        translate: (key) => `translated:${key}`,
        preferences: {
          muted: false,
          volume: 0.6,
          speakTaskStarted: false,
          speakIdle: false,
          speakSocial: false,
        },
      }),
    );
    const completed = snapshot({ message: "petSpeech.playful.completed.3" });

    await act(async () => {
      result.current.onWorldSnapshot(completed);
      await Promise.resolve();
      result.current.onWorldSnapshot(completed);
    });

    expect(output.setVolume).toHaveBeenCalledWith(0.6);
    expect(output.speak).toHaveBeenCalledTimes(1);
    expect(output.speak).toHaveBeenCalledWith(
      "translated:petSpeech.playful.completed.3",
      expect.objectContaining({ pitch: 1.42 }),
    );
  });

  it("keeps working and ambient lines silent while speaking direct interaction", async () => {
    const stateRef = { current: state({ personalityId: "playful" }) };
    const { result } = renderHook(() =>
      usePetVoiceCoordinator({
        stateRef,
        translate: (key) => key,
        preferences: {
          muted: false,
          volume: 0.7,
          speakTaskStarted: false,
          speakIdle: false,
          speakSocial: false,
        },
      }),
    );

    await act(async () => {
      result.current.onWorldSnapshot(
        snapshot({ message: "Starting", status: "working", updatedAt: 1 }),
      );
      result.current.onWorldSnapshot(
        snapshot({ message: "Just wandering", source: "idle", status: null, updatedAt: 2 }),
      );
      result.current.onWorldSnapshot(
        snapshot({ message: "Hello", source: "interaction", status: null, updatedAt: 3 }),
      );
      await Promise.resolve();
    });

    expect(output.speak).toHaveBeenCalledTimes(1);
    expect(output.speak).toHaveBeenCalledWith("Hello", expect.any(Object));
  });

  it.each([
    ["task-started", { message: "Starting", status: "working" as const }, "speakTaskStarted"],
    ["idle", { message: "Just wandering", source: "idle" as const, status: null }, "speakIdle"],
    ["social", { message: "Nice weather", source: "social" as const, status: null }, "speakSocial"],
  ] as const)("speaks %s dialogue when its optional category is enabled", async (_, line, key) => {
    const stateRef = { current: state({ personalityId: "playful" }) };
    const { result } = renderHook(() =>
      usePetVoiceCoordinator({
        stateRef,
        translate: (translationKey) => translationKey,
        preferences: {
          muted: false,
          volume: 0.7,
          speakTaskStarted: false,
          speakIdle: false,
          speakSocial: false,
          [key]: true,
        },
      }),
    );

    await act(async () => {
      result.current.onWorldSnapshot(snapshot(line));
      await Promise.resolve();
    });

    expect(output.speak).toHaveBeenCalledWith(line.message, expect.any(Object));
  });

  it("does not replay a settled line that arrived while the pet was muted", async () => {
    const stateRef = { current: state({ muted: true, personalityId: "playful" }) };
    const { result } = renderHook(() =>
      usePetVoiceCoordinator({
        stateRef,
        translate: (key) => key,
        preferences: {
          muted: false,
          volume: 0.7,
          speakTaskStarted: false,
          speakIdle: false,
          speakSocial: false,
        },
      }),
    );
    const completed = snapshot({ message: "Done", updatedAt: 1 });

    await act(async () => {
      result.current.onWorldSnapshot(completed);
      stateRef.current = state({ muted: false, personalityId: "playful" });
      result.current.onWorldSnapshot(completed);
      await Promise.resolve();
    });

    expect(output.speak).not.toHaveBeenCalled();

    await act(async () => {
      result.current.onWorldSnapshot(snapshot({ message: "Done again", updatedAt: 2 }));
      await Promise.resolve();
    });
    expect(output.speak).toHaveBeenCalledTimes(1);
  });

  it("previews legacy pets even when global and per-pet mute are enabled", async () => {
    const stateRef = { current: state({ muted: true }) };
    const { result } = renderHook(() =>
      usePetVoiceCoordinator({
        stateRef,
        translate: (key) => `translated:${key}`,
        preferences: {
          muted: true,
          volume: 0.25,
          speakTaskStarted: false,
          speakIdle: false,
          speakSocial: false,
        },
      }),
    );

    await act(async () => {
      result.current.previewPet("pet-1");
      await Promise.resolve();
    });

    expect(output.setVolume).toHaveBeenCalledWith(0.25);
    expect(output.speak).toHaveBeenCalledWith(
      "translated:petSpeech.playful.completed.0",
      expect.objectContaining({ pitch: 1.42 }),
    );
  });
});
