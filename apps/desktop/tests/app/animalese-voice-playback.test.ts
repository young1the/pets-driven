import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimaleseVoicePlayer } from "@/app/voice/animalese-voice-player";

const playback = vi.hoisted(() => ({
  buffers: [] as Float32Array[],
  starts: vi.fn(),
}));

vi.mock("animalese-tts", () => {
  class Analyzer {}
  class WebSampler {
    sampleRate = 48_000;
    async load() {}
  }
  class AnimaleseEngine {
    synthesize() {
      return {
        async *speak() {
          yield { buffer: new Float32Array([0.1, 0.2]) };
          yield { buffer: new Float32Array([0.3]) };
        },
      };
    }
  }

  return {
    AnimaleseEngine,
    AudioConverter: { int16ToFloat32: (buffer: Int16Array) => Float32Array.from(buffer) },
    EnglishAnalyzer: Analyzer,
    JapaneseAnalyzer: Analyzer,
    KoreanAnalyzer: Analyzer,
    PitchManager: class {},
    WebSampler,
  };
});

class AudioContextStub {
  state = "running";
  destination = {};

  createGain() {
    return { connect: vi.fn(), gain: { value: 0 } };
  }

  createBuffer() {
    return {
      copyToChannel(buffer: Float32Array) {
        playback.buffers.push(Float32Array.from(buffer));
      },
    };
  }

  createBufferSource() {
    const source: {
      buffer: unknown;
      connect: ReturnType<typeof vi.fn>;
      onended: (() => void) | null;
      start: () => void;
      stop: () => void;
    } = {
      buffer: null,
      connect: vi.fn(),
      onended: null,
      start() {
        playback.starts();
        queueMicrotask(() => source.onended?.());
      },
      stop() {
        source.onended?.();
      },
    };
    return source;
  }

  async resume() {}
}

describe("Animalese voice playback", () => {
  beforeEach(() => {
    playback.buffers.length = 0;
    playback.starts.mockClear();
    vi.stubGlobal("AudioContext", AudioContextStub);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("plays every synthesized chunk as one continuous utterance", async () => {
    const player = new AnimaleseVoicePlayer();

    await player.speak("Hello", {
      pitch: 1.4,
      speed: 3,
      randomness: 0.04,
      melodyRate: 0.04,
      melodyAmplitude: 0.05,
      spaceDelay: 0.04,
      punctuationDelay: 0.25,
    });

    expect(playback.starts).toHaveBeenCalledTimes(1);
    expect(playback.buffers).toHaveLength(1);
    expect(Array.from(playback.buffers[0])).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
    ]);
  });
});
