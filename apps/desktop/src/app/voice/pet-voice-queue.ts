import type { PetVoiceSynthesisProfile } from "@/app/voice/pet-voice-profile";

export type PetVoicePriority = 1 | 2 | 3 | 4 | 5;

export type PetVoiceRequest = {
  utteranceId: string;
  petId: string;
  text: string;
  profile: PetVoiceSynthesisProfile;
  priority: PetVoicePriority;
};

export interface PetVoiceOutput {
  setVolume(volume: number): void;
  speak(text: string, profile: PetVoiceSynthesisProfile): Promise<void>;
  stop(): void;
}

/**
 * Serialize every pet through one speaker. Higher-priority attention may
 * interrupt a lower-priority line; equal-priority lines wait in arrival order.
 */
export class PetVoiceQueue {
  private active: { request: PetVoiceRequest; token: number } | null = null;
  private pending: PetVoiceRequest[] = [];
  private token = 0;

  constructor(private readonly output: PetVoiceOutput) {}

  setVolume(volume: number): void {
    this.output.setVolume(volume);
  }

  enqueue(request: PetVoiceRequest): void {
    if (this.active?.request.utteranceId === request.utteranceId) return;
    if (this.pending.some((candidate) => candidate.utteranceId === request.utteranceId)) return;

    if (!this.active) {
      this.start(request);
      return;
    }

    if (request.priority > this.active.request.priority) {
      this.output.stop();
      this.start(request);
      return;
    }

    // A newer state for the same pet supersedes speech that has not started.
    this.pending = this.pending.filter((candidate) => candidate.petId !== request.petId);
    this.pending.push(request);
  }

  removePet(petId: string): void {
    this.pending = this.pending.filter((request) => request.petId !== petId);
    if (this.active?.request.petId !== petId) return;

    this.output.stop();
    this.active = null;
    this.token += 1;
    this.startNext();
  }

  stop(): void {
    this.pending = [];
    this.active = null;
    this.token += 1;
    this.output.stop();
  }

  private start(request: PetVoiceRequest): void {
    const token = ++this.token;
    this.active = { request, token };
    void this.output
      .speak(request.text, request.profile)
      .catch(() => {
        // Voice is enhancement-only. Output-device or synthesis failures must
        // never disturb hook handling, simulation, or visible dialogue.
      })
      .finally(() => {
        if (this.active?.token !== token) return;
        this.active = null;
        this.startNext();
      });
  }

  private startNext(): void {
    if (this.active || this.pending.length === 0) return;

    let nextIndex = 0;
    for (let index = 1; index < this.pending.length; index += 1) {
      if (this.pending[index].priority > this.pending[nextIndex].priority) {
        nextIndex = index;
      }
    }
    const [next] = this.pending.splice(nextIndex, 1);
    this.start(next);
  }
}
