import { describe, expect, it } from "vitest";
import {
  buildLaunchLine,
  customizeLaunchLine,
  parseLaunchLine,
} from "@/app/session-launch-profile";

describe("session launch profiles", () => {
  it("parses command prompt launch lines into a profile and inner command", () => {
    expect(parseLaunchLine("cmd /k claude --resume")).toEqual({
      profile: "cmd",
      command: "claude --resume",
      launchLine: "cmd /k claude --resume",
    });
  });

  it("builds launch lines for preset shells from the inner command", () => {
    expect(buildLaunchLine("powershell", "claude --resume")).toBe(
      "powershell -NoExit -Command claude --resume",
    );
  });

  it("keeps unmatched launch lines as custom", () => {
    expect(parseLaunchLine('"C:\\Tools\\Git\\bin\\bash.exe" -lc "claude; exec bash"')).toEqual({
      profile: "custom",
      command: "claude",
      launchLine: '"C:\\Tools\\Git\\bin\\bash.exe" -lc "claude; exec bash"',
    });
  });

  it("preserves a trailing space so a flag can be appended to the command", () => {
    const line = buildLaunchLine("cmd", "claude ");
    expect(line).toBe("cmd /k claude ");
    // The value round-trips through parse on every keystroke; the trailing
    // space must survive so the user can go on to type "--resume".
    expect(parseLaunchLine(line).command).toBe("claude ");
  });

  it("still falls back to the default command when the input is blank", () => {
    expect(buildLaunchLine("cmd", "   ")).toBe("cmd /k claude");
    expect(parseLaunchLine("").command).toBe("claude");
  });

  it("turns a preset launch line into an equivalent custom line", () => {
    const customLine = customizeLaunchLine(parseLaunchLine("cmd /k claude --resume"));

    expect(customLine).toBe('"cmd" /k claude --resume');
    expect(parseLaunchLine(customLine).profile).toBe("custom");
  });
});
