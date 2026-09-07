import type { PetVoiceSynthesisProfile } from "@/app/voice/pet-voice-profile";
import englishSprites from "@/assets/animalese/english-sprite.json";
import englishSpriteUrl from "@/assets/animalese/english-sprite.wav?url";
import japaneseSprites from "@/assets/animalese/japanese-sprite.json";
import japaneseSpriteUrl from "@/assets/animalese/japanese-sprite.wav?url";
import koreanSprites from "@/assets/animalese/korean-sprite.json";
import koreanSpriteUrl from "@/assets/animalese/korean-sprite.wav?url";

const DEFAULT_SAMPLE_RATE = 22_050;
const ENGLISH_PHONEMES = "abcdefghijklmnopqrstuvwxyz";
const PUNCTUATIONS = [".", ",", "!", "?", "'", '"', "(", ")", "~", "。", "、", "！", "？"];

type AnimaleseModule = typeof import("animalese-tts");
type WebSamplerInstance = InstanceType<AnimaleseModule["WebSampler"]>;
export type AnimaleseVoiceLanguage = "english" | "japanese" | "korean";

interface VoiceAssets {
  url: string;
  sprites: Record<string, { startMs: number; durationMs: number }>;
}

const VOICE_ASSETS: Record<AnimaleseVoiceLanguage, VoiceAssets> = {
  english: { url: englishSpriteUrl, sprites: englishSprites },
  japanese: { url: japaneseSpriteUrl, sprites: japaneseSprites },
  korean: { url: koreanSpriteUrl, sprites: koreanSprites },
};

let animaleseModulePromise: Promise<AnimaleseModule> | null = null;
const samplerPromises = new Map<AnimaleseVoiceLanguage, Promise<WebSamplerInstance>>();

function loadAnimaleseModule(): Promise<AnimaleseModule> {
  // Voice is optional and most routes never use it. Keep the synthesis library
  // out of the startup chunk and load it only for the first audible utterance.
  animaleseModulePromise ??= import("animalese-tts");
  return animaleseModulePromise;
}

export function detectAnimaleseVoiceLanguage(text: string): AnimaleseVoiceLanguage {
  if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u.test(text)) return "korean";
  if (/[\u3040-\u30ff]/u.test(text)) return "japanese";
  return "english";
}

function phonemeForUnsupportedCharacter(character: string): string {
  let hash = 0;
  for (let index = 0; index < character.length; index += 1) {
    hash = (hash * 31 + character.charCodeAt(index)) >>> 0;
  }
  return ENGLISH_PHONEMES[hash % ENGLISH_PHONEMES.length];
}

function createFallbackAnalyzer(): import("animalese-tts").TextAnalyzer {
  return {
    analyze(text) {
      return Array.from(text).map((character) => {
        if (/\s/u.test(character)) {
          return [{ phoneme: " ", mergeWithNext: false }];
        }
        if (PUNCTUATIONS.includes(character)) {
          return [{ phoneme: character, mergeWithNext: false }];
        }
        const normalized = character.toLowerCase();
        return [
          {
            phoneme: /[a-z]/u.test(normalized)
              ? normalized
              : phonemeForUnsupportedCharacter(character),
            mergeWithNext: false,
          },
        ];
      });
    },
  };
}

function createAnalyzer(
  module: AnimaleseModule,
  language: AnimaleseVoiceLanguage,
  text: string,
): import("animalese-tts").TextAnalyzer {
  if (language === "korean") return new module.KoreanAnalyzer();
  if (language === "japanese") return new module.JapaneseAnalyzer();
  if (/[A-Za-z]/u.test(text)) return new module.EnglishAnalyzer();
  return createFallbackAnalyzer();
}

async function loadSampler(
  module: AnimaleseModule,
  language: AnimaleseVoiceLanguage,
): Promise<WebSamplerInstance> {
  const existing = samplerPromises.get(language);
  if (existing) return existing;

  const pending = (async () => {
    const assets = VOICE_ASSETS[language];
    const sampler = new module.WebSampler(assets.url, assets.sprites, {
      maxRetries: 3,
      minSilenceDurationMs: 50,
    });
    await sampler.load();
    return sampler;
  })();
  samplerPromises.set(language, pending);

  try {
    return await pending;
  } catch (error) {
    samplerPromises.delete(language);
    throw error;
  }
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

    const language = detectAnimaleseVoiceLanguage(text);
    const sampler = await loadSampler(module, language);
    if (generation !== this.generation) return;

    const engine = new module.AnimaleseEngine({
      analyzer: createAnalyzer(module, language, text),
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
        await this.playChunk(buffer, sampler.sampleRate ?? DEFAULT_SAMPLE_RATE, generation);
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
