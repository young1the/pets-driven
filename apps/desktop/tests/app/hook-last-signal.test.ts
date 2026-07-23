import { initI18nForTesting } from "@pets-driven/i18n/testing";
import { describe, expect, it } from "vitest";
import { describeHookLastSignal } from "@/app/main-window/hook-last-signal";

const NOW = 1_700_000_000_000;

function translator(locale: "en" | "ko" = "en") {
  const instance = initI18nForTesting(locale);
  const fixed = instance.getFixedT(locale, "desktop");

  return (key: string, options?: Record<string, unknown>) => String(fixed(key, options));
}

function signal(
  overrides: Partial<{
    lastEventAt: number | null;
    receivedCount: number;
    lastEventName: string | null;
  }> = {},
) {
  return {
    lastEventAt: NOW,
    receivedCount: 1,
    lastEventName: "PreToolUse",
    ...overrides,
  };
}

describe("describeHookLastSignal", () => {
  it("says nothing has arrived before the first hook", () => {
    const t = translator();

    expect(describeHookLastSignal(signal({ lastEventAt: null, receivedCount: 0 }), t, NOW)).toBe(
      "Last signal: nothing has arrived yet",
    );
  });

  it("names the event, its age and the running total", () => {
    const t = translator();

    expect(describeHookLastSignal(signal({ receivedCount: 12 }), t, NOW + 3 * 60_000)).toBe(
      "Last signal: PreToolUse · 3m ago · 12 received",
    );
  });

  it("reads a fresh signal as just now rather than counting seconds", () => {
    const t = translator();

    expect(describeHookLastSignal(signal(), t, NOW + 4_000)).toBe(
      "Last signal: PreToolUse · just now · 1 received",
    );
  });

  it("scales the age through seconds, minutes, hours and days", () => {
    const t = translator();
    const at = (elapsedMs: number) => describeHookLastSignal(signal(), t, NOW + elapsedMs);

    expect(at(25_000)).toContain("25s ago");
    expect(at(90_000)).toContain("1m ago");
    expect(at(5 * 3_600_000)).toContain("5h ago");
    expect(at(3 * 86_400_000)).toContain("3d ago");
  });

  it("never reads as a signal from the future when the clock runs backwards", () => {
    const t = translator();

    expect(describeHookLastSignal(signal(), t, NOW - 60_000)).toContain("just now");
  });

  it("falls back to a placeholder when the payload carried no event name", () => {
    const t = translator();

    expect(describeHookLastSignal(signal({ lastEventName: null }), t, NOW)).toBe(
      "Last signal: unnamed event · just now · 1 received",
    );
  });

  it("translates the whole line, not just its label", () => {
    const t = translator("ko");

    expect(describeHookLastSignal(signal({ receivedCount: 7 }), t, NOW + 2 * 60_000)).toBe(
      "마지막 신호: PreToolUse · 2분 전 · 누적 7건",
    );
  });
});
