import type { PetVoiceSynthesisProfile } from "@/app/voice/pet-voice-profile";

const SAMPLE_RATE = 22_050;
const SAMPLE_DURATION_MS = 120;
const PHONEMES = ["a", "e", "i", "o", "u", "ba", "da", "ga", "ka", "ma", "na", "pa"];
const PUNCTUATIONS = [".", ",", "!", "?", "'", '"', "(", ")", "~", "。", "、", "！", "？"];

type AnimaleseModule = typeof import("animalese-tts");
type MemorySamplerInstance = InstanceType<AnimaleseModule["MemorySampler"]>;

let animaleseModulePromise: Promise<AnimaleseModule> | null = null;
let samplerPromise: Promise<MemorySamplerInstance> | null = null;

function loadAnimaleseModule(): Promise<AnimaleseModule> {
  // Voice is optional and most routes never use it. Keep the synthesis library
  // out of the startup chunk and load it only for the first audible utterance.
  animaleseModulePromise ??= import("animalese-tts");
  return animaleseModulePromise;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

/**
 * Build an original, deterministic voice sprite instead of shipping samples
 * whose provenance may be tied to another game. Each phoneme is a short,
 * softly enveloped harmonic chirp with a slightly different formant.
 */
function createProceduralVoiceSprite(): {
  wav: ArrayBuffer;
  sprites: Record<string, { startMs: number; durationMs: number }>;
} {
  const samplesPerPhoneme = Math.round((SAMPLE_RATE * SAMPLE_DURATION_MS) / 1000);
  const totalSamples = samplesPerPhoneme * PHONEMES.length;
  const wav = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(wav);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, totalSamples * 2, true);

  const sprites: Record<string, { startMs: number; durationMs: number }> = {};
  for (let phonemeIndex = 0; phonemeIndex < PHONEMES.length; phonemeIndex += 1) {
    const phoneme = PHONEMES[phonemeIndex];
    sprites[phoneme] = {
      startMs: phonemeIndex * SAMPLE_DURATION_MS,
      durationMs: SAMPLE_DURATION_MS,
    };

    const fundamental = 185 + phonemeIndex * 11;
    const formant = 520 + (phonemeIndex % 5) * 115;
    for (let localIndex = 0; localIndex < samplesPerPhoneme; localIndex += 1) {
      const time = localIndex / SAMPLE_RATE;
      const progress = localIndex / Math.max(1, samplesPerPhoneme - 1);
      const envelope = Math.sin(Math.PI * progress) ** 1.35;
      const chirp = fundamental * (1 + progress * 0.08);
      const sample =
        Math.sin(2 * Math.PI * chirp * time) * 0.56 +
        Math.sin(2 * Math.PI * formant * time) * 0.24 +
        Math.sin(2 * Math.PI * (formant * 1.7) * time) * 0.1;
      const pcm = Math.round(Math.max(-1, Math.min(1, sample * envelope * 0.72)) * 32767);
      const sampleIndex = phonemeIndex * samplesPerPhoneme + localIndex;
      view.setInt16(44 + sampleIndex * 2, pcm, true);
    }
  }

  return { wav, sprites };
}

function phonemeIndexForCharacter(character: string): number {
  let hash = 0;
  for (let index = 0; index < character.length; index += 1) {
    hash = (hash * 31 + character.charCodeAt(index)) >>> 0;
  }
  return hash % PHONEMES.length;
}

function createUniversalAnalyzer(): import("animalese-tts").TextAnalyzer {
  return {
    analyze(text) {
      return text.split("").map((character) => {
        if (/\s/u.test(character)) {
          return [{ phoneme: " ", mergeWithNext: false }];
        }
        if (PUNCTUATIONS.includes(character)) {
          return [{ phoneme: character, mergeWithNext: false }];
        }
        return [{ phoneme: PHONEMES[phonemeIndexForCharacter(character)], mergeWithNext: false }];
      });
    },
  };
}

async function loadSampler(module: AnimaleseModule): Promise<MemorySamplerInstance> {
  if (!samplerPromise) {
    samplerPromise = (async () => {
      const { wav, sprites } = createProceduralVoiceSprite();
      const sampler = new module.MemorySampler(wav, sprites, { silenceThreshold: 0.001 });
      await sampler.load();
      return sampler;
    })();
  }
  return samplerPromise;
}

/** One cancellable player and gain stage for every pet in the main WebView. */
export class AnimaleseVoicePlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private generation = 0;
  private volume = 0.7;

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gain) {
      this.gain.gain.value = this.volume;
    }
  }

  stop(): void {
    this.generation += 1;
    if (this.activeSource) {
      this.activeSource.stop();
      this.activeSource = null;
    }
  }

  async speak(text: string, profile: PetVoiceSynthesisProfile): Promise<void> {
    this.stop();
    const generation = this.generation;
    const module = await loadAnimaleseModule();
    if (generation !== this.generation) return;

    const sampler = await loadSampler(module);
    if (generation !== this.generation) return;

    const engine = new module.AnimaleseEngine({
      analyzer: createUniversalAnalyzer(),
      sampler,
      effect: new module.PitchManager({
        pitch: profile.pitch,
        speed: profile.speed,
        randomness: profile.randomness,
        melodyRate: profile.melodyRate,
        melodyAmplitude: profile.melodyAmplitude,
      }),
      spaceDelay: profile.spaceDelay,
      punctuationDelay: profile.punctuationDelay,
      punctuations: PUNCTUATIONS,
    });

    for await (const output of engine.synthesize(text).speak()) {
      if (generation !== this.generation) return;
      const buffer =
        output.buffer instanceof Float32Array
          ? output.buffer
          : module.AudioConverter.int16ToFloat32(output.buffer);
      if (buffer.length > 0) {
        await this.playChunk(buffer, sampler.sampleRate ?? SAMPLE_RATE, generation);
      }
    }
  }

  private async playChunk(
    samples: Float32Array,
    sampleRate: number,
    generation: number,
  ): Promise<void> {
    const context = this.getContext();
    if (context.state === "suspended") {
      await context.resume();
    }
    if (generation !== this.generation) return;

    const audioBuffer = context.createBuffer(1, samples.length, sampleRate);
    audioBuffer.copyToChannel(Float32Array.from(samples), 0);
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gain as GainNode);
    this.activeSource = source;

    await new Promise<void>((resolve) => {
      source.onended = () => {
        if (this.activeSource === source) {
          this.activeSource = null;
        }
        resolve();
      };
      source.start();
    });
  }

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(this.context.destination);
    }
    return this.context;
  }
}
