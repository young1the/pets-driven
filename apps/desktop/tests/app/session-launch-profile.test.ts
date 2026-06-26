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
    expect(
      parseLaunchLine(
        '"C:\\Tools\\Git\\bin\\bash.exe" -lc "claude; exec bash"',
      ),
    ).toEqual({
      profile: "custom",
      command: "claude",
      launchLine: '"C:\\Tools\\Git\\bin\\bash.exe" -lc "claude; exec bash"',
    });
  });

  it("turns a preset launch line into an equivalent custom line", () => {
    const customLine = customizeLaunchLine(
      parseLaunchLine("cmd /k claude --resume"),
    );

    expect(customLine).toBe('"cmd" /k claude --resume');
    expect(parseLaunchLine(customLine).profile).toBe("custom");
  });
});
