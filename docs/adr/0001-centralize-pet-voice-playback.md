# ADR 0001: Centralize Pet Voice Playback in the Main App

- Status: Accepted
- Date: 2026-09-04

## Context

Pets already choose localized, personality-specific dialogue for idle, attention, task-started, task-completed, and acknowledgement moments. Provider adapters currently replace many of those lines with synthetic fallback summaries such as `Task completed` and `Permission required`. Pet windows render the resulting dialogue, but no surface owns audible speech.

The desktop can render pets in either one native window per pet or one shared overlay window. Playing audio from those presentation windows would duplicate playback policy and make global volume, interruption, and muting depend on the selected rendering mode. The deterministic pet engine also cannot own browser audio APIs or nondeterministic audio effects.

The selected synthesis library, `animalese-tts`, supports streamed browser synthesis, text analyzers, pitch and speed effects, per-character randomness, melody, and configurable spacing and punctuation pauses. Its bundled `WebPlayer` does not expose the source nodes needed for cancellation or centralized mixing.

## Decision

### Playback ownership

The main desktop app owns one `PetVoiceCoordinator` and one Web Audio mixer. Pet windows never synthesize or play audio. The pet engine decides what a pet says and emits a monotonically changing utterance revision; the main app resolves the localized line, applies voice settings, and plays it once.

The engine remains deterministic and headless. `animalese-tts`, `AudioContext`, and all playback queues stay in `apps/desktop`.

### Dialogue semantics

Agent status, personality dialogue, and provider detail are separate concepts:

- Status labels remain stable and scannable: working, waiting, completed, and failed.
- Personality dialogue is the short line shown in the speech bubble and synthesized as Animalese.
- A summary is provider detail only when the provider actually supplied it. Adapters do not invent fallback summaries.

Dialogue slots distinguish task started, input needed, attention needed, task completed, and task failed. Existing idle, social, interaction, and acknowledgement dialogue remains available.

### Default speech policy

Audible speech is enabled by default for:

- input and attention requests;
- task completion and failure;
- direct user interaction and acknowledgement.

Task-started and autonomous ambient dialogue, including idle and social chatter, are silent by default. Users can enable each of those three categories independently in Pets settings. Text bubbles are unaffected by the audible-speech policy.

### Voice identity and personality mapping

Each pet receives a stable pseudo-random base pitch at Pet Birth. The value is stored as part of the pet's profile, can be adjusted or randomized again, and does not change when the pet's personality changes.

The remaining synthesis parameters derive from the pet's OCEAN traits:

- confidence, derived from conscientiousness and inverse neuroticism, reduces randomness;
- extraversion increases speed;
- relaxed and introverted personalities use a lower speed and longer spacing pauses;
- openness and extraversion increase melodic movement;
- neurotic or impulsive personalities receive more pitch variation.

All derived values are clamped to an application-owned safe range. Library defaults are reference points, not persisted data.

### Audio controls

The app provides:

- per-pet mute and pitch controls;
- global mute and master volume;
- a voice preview in the pet editor;
- a quick per-pet mute action in the context menu.

Global mute and volume are device-local application preferences. Per-pet pitch and mute are durable pet-profile data. Preview is an explicit user action, so it bypasses both global and per-pet mute while still using the configured master volume.

Muting stops matching active playback and removes queued utterances. Acknowledging a settled pet state also removes queued speech for that state.

### Concurrency

Only one pet speaks at a time in the initial release. The queue prioritizes preview, direct interaction, failure and attention, completion, social dialogue, and idle dialogue in that order. Newer utterances replace stale queued utterances from the same pet.

## Consequences

- Both pet-window modes have identical audio behavior.
- The desktop needs an application-owned playback adapter instead of using `animalese-tts`'s `WebPlayer` directly.
- Persisted Rust and TypeScript state must evolve together for per-pet voice settings.
- Every audible utterance needs a stable identity so repeated snapshot projection cannot replay it.
- The prototype temporarily vendors the library demo's default English, Japanese, and Korean samples, pinned to an upstream commit. Audio provenance must be verified independently of the synthesis library's code license before release, and the samples must be replaced if that verification is not conclusive.
- Korean, English, and Japanese can use the library's analyzers. Chinese needs an explicit custom analyzer or an application-owned neutral Animalese fallback before voice ships as fully multilingual.

## Rollout

1. Ship a tracer path from task completion to personality dialogue to main-app playback.
2. Separate provider detail from fallback dialogue and add missing lifecycle slots.
3. Add stable pitch and OCEAN-derived voice parameters.
4. Add the global mixer, queue, mute, volume, context-menu action, and preview UI.
5. Complete multilingual handling, audio polish, and speaking animation.
