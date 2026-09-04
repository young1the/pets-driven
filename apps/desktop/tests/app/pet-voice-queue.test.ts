import { describe, expect, it, vi } from "vitest";
import type { PetVoiceSynthesisProfile } from "@/app/voice/pet-voice-profile";
import { PetVoiceQueue, type PetVoiceRequest } from "@/app/voice/pet-voice-queue";

const profile: PetVoiceSynthesisProfile = {
  pitch: 1.4,
  speed: 4,
  randomness: 0.1,
  melodyRate: 0.05,
  melodyAmplitude: 0.1,
  spaceDelay: 0.03,
  punctuationDelay: 0.3,
};

function request(
  petId: string,
  priority: PetVoiceRequest["priority"],
  utteranceId = petId,
): PetVoiceRequest {
  return { petId, priority, utteranceId, text: petId, profile };
}

function controllableOutput() {
  const resolvers: Array<() => void> = [];
  return {
    output: {
      setVolume: vi.fn(),
      stop: vi.fn(),
      speak: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    },
    finishNext() {
      resolvers.shift()?.();
    },
  };
}

describe("PetVoiceQueue", () => {
  it("serializes equal-priority pets through one output", async () => {
    const controlled = controllableOutput();
    const queue = new PetVoiceQueue(controlled.output);

    queue.enqueue(request("pet-a", 2));
    queue.enqueue(request("pet-b", 2));
    expect(controlled.output.speak).toHaveBeenCalledTimes(1);

    controlled.finishNext();
    await Promise.resolve();
    await Promise.resolve();
    expect(controlled.output.speak).toHaveBeenLastCalledWith("pet-b", profile);
  });

  it("lets attention interrupt a lower-priority completion", () => {
    const controlled = controllableOutput();
    const queue = new PetVoiceQueue(controlled.output);

    queue.enqueue(request("completed", 2));
    queue.enqueue(request("waiting", 3));

    expect(controlled.output.stop).toHaveBeenCalledTimes(1);
    expect(controlled.output.speak).toHaveBeenLastCalledWith("waiting", profile);
  });

  it("stops and removes speech for a muted pet", async () => {
    const controlled = controllableOutput();
    const queue = new PetVoiceQueue(controlled.output);

    queue.enqueue(request("pet-a", 2, "a-1"));
    queue.enqueue(request("pet-a", 2, "a-2"));
    queue.enqueue(request("pet-b", 2));
    queue.removePet("pet-a");

    expect(controlled.output.stop).toHaveBeenCalledTimes(1);
    expect(controlled.output.speak).toHaveBeenLastCalledWith("pet-b", profile);
  });
});
