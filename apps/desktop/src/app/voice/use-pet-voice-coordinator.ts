import type { WorldSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import { PET_SPEECH_KEY_PREFIX } from "@pets-driven/pet-engine/pets/personalities/voice-profiles";
import { sanitizePetVoiceSettings } from "@pets-driven/pet-engine/pets/profiles/pet-voice";
import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import { AnimaleseVoicePlayer } from "@/app/voice/animalese-voice-player";
import type { PetVoicePreferences } from "@/app/voice/pet-voice-preferences";
import { voiceProfileForPersonality } from "@/app/voice/pet-voice-profile";
import { type PetVoicePriority, PetVoiceQueue } from "@/app/voice/pet-voice-queue";
import type { PetsDrivenState } from "@/app-state/pets-driven-state";

type Translate = (key: string) => string;

function shouldSpeak(
  source: string,
  status: string | null,
  preferences: PetVoicePreferences,
): boolean {
  if (source === "interaction") return true;
  if (status === "waiting" || status === "completed" || status === "failed") return true;
  if (status === "working") return preferences.speakTaskStarted;
  if (source === "idle") return preferences.speakIdle;
  if (source === "social") return preferences.speakSocial;
  return false;
}

function priorityFor(source: string, status: string | null): PetVoicePriority {
  if (source === "interaction") return 4;
  if (status === "waiting" || status === "failed") return 3;
  return 2;
}

function getVoiceQueue(ref: MutableRefObject<PetVoiceQueue | null>): PetVoiceQueue {
  if (!ref.current) {
    ref.current = new PetVoiceQueue(new AnimaleseVoicePlayer());
  }
  return ref.current;
}

export function usePetVoiceCoordinator(params: {
  stateRef: MutableRefObject<PetsDrivenState>;
  translate: Translate;
  preferences: PetVoicePreferences;
}) {
  const translateRef = useRef(params.translate);
  translateRef.current = params.translate;
  const queueRef = useRef<PetVoiceQueue | null>(null);
  const preferencesRef = useRef(params.preferences);
  preferencesRef.current = params.preferences;
  const lastUtteranceByPetRef = useRef<Map<string, string>>(new Map());

  const stop = useCallback(() => {
    queueRef.current?.stop();
  }, []);

  const stopPet = useCallback((petId: string) => {
    queueRef.current?.removePet(petId);
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    queueRef.current?.setVolume(params.preferences.volume);
    if (params.preferences.muted) stop();
  }, [params.preferences.muted, params.preferences.volume, stop]);

  const onWorldSnapshot = useCallback(
    (snapshot: WorldSnapshot) => {
      for (const pet of snapshot.pets) {
        const state = params.stateRef.current;
        const record = state.pets.find((candidate) => candidate.id === pet.id);
        const profile = record
          ? state.petProfiles.find((candidate) => candidate.id === record.profileId)
          : undefined;
        if (!record || !profile) continue;

        const voice = sanitizePetVoiceSettings(pet.id, profile.voice);
        if (voice.muted) {
          queueRef.current?.removePet(pet.id);
        }

        const channel = pet.agentChannel;
        if (!channel?.message) continue;

        const utteranceKey = [
          channel.source,
          channel.status ?? "speech",
          channel.updatedAt,
          channel.message,
        ].join(":");
        if (lastUtteranceByPetRef.current.get(pet.id) === utteranceKey) continue;
        lastUtteranceByPetRef.current.set(pet.id, utteranceKey);

        // Muting is not pausing: remember the current line while silent so
        // unmuting a settled pet does not unexpectedly play stale speech.
        if (voice.muted) continue;
        if (!shouldSpeak(channel.source, channel.status, preferencesRef.current)) continue;
        if (preferencesRef.current.muted) continue;

        const text = channel.message.startsWith(`${PET_SPEECH_KEY_PREFIX}.`)
          ? translateRef.current(channel.message)
          : channel.message;
        const queue = getVoiceQueue(queueRef);
        queue.setVolume(preferencesRef.current.volume);
        const synthesisProfile = voiceProfileForPersonality(profile.personality, voice.pitch);
        queue.enqueue({
          utteranceId: `${pet.id}:${utteranceKey}`,
          petId: pet.id,
          text,
          profile: synthesisProfile,
          priority: priorityFor(channel.source, channel.status),
        });
      }
    },
    [params.stateRef],
  );

  const previewPet = useCallback(
    (petId: string) => {
      const state = params.stateRef.current;
      const record = state.pets.find((candidate) => candidate.id === petId);
      const profile = record
        ? state.petProfiles.find((candidate) => candidate.id === record.profileId)
        : undefined;
      if (!record || !profile) return;

      const voice = sanitizePetVoiceSettings(petId, profile.voice);
      const line = translateRef.current(
        `petSpeech.${profile.personalityId ?? "playful"}.completed.0`,
      );
      const queue = getVoiceQueue(queueRef);
      queue.setVolume(preferencesRef.current.volume);
      queue.enqueue({
        utteranceId: `preview:${petId}:${performance.now()}`,
        petId,
        text: line,
        profile: voiceProfileForPersonality(profile.personality, voice.pitch),
        priority: 5,
      });
    },
    [params.stateRef],
  );

  return { onWorldSnapshot, previewPet, stop, stopPet };
}
