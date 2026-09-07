import { describe, expect, it } from "vitest";
import { detectAnimaleseVoiceLanguage } from "@/app/voice/animalese-voice-player";

describe("Animalese voice language detection", () => {
  it("selects the Korean sample for Korean dialogue", () => {
    expect(detectAnimaleseVoiceLanguage("일이 끝났어! Review ready.")).toBe("korean");
  });

  it("selects the Japanese sample for Japanese dialogue", () => {
    expect(detectAnimaleseVoiceLanguage("準備できたよ！")).toBe("japanese");
  });

  it("selects the English sample for English dialogue", () => {
    expect(detectAnimaleseVoiceLanguage("Task complete!")).toBe("english");
  });

  it("uses the English sample as the neutral fallback", () => {
    expect(detectAnimaleseVoiceLanguage("任务完成了！")).toBe("english");
  });
});
