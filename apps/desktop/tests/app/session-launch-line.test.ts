import { describe, expect, it } from "vitest";
import { buildLaunchLine, parseLaunchLine, promptForShell } from "@/app/session-launch-line";

describe("session launch lines", () => {
  it("parses a command prompt launch line into its shell and inner command", () => {
    expect(parseLaunchLine("cmd /k claude --resume")).toEqual({
      shell: "cmd",
      command: "claude --resume",
      launchLine: "cmd /k claude --resume",
    });
  });

  it("wraps the command for the shell it is given", () => {
    expect(buildLaunchLine("powershell", "claude --resume")).toBe(
      "powershell -NoExit -Command claude --resume",
    );
    expect(buildLaunchLine("C:\\Program Files\\Git\\bin\\bash.exe", "claude")).toBe(
      '"C:\\Program Files\\Git\\bin\\bash.exe" -lc "claude; exec bash"',
    );
  });

  it("round-trips a quoted shell path with spaces", () => {
    const line = buildLaunchLine("C:\\Program Files\\Git\\bin\\bash.exe", "claude --resume");

    expect(parseLaunchLine(line)).toEqual({
      shell: "C:\\Program Files\\Git\\bin\\bash.exe",
      command: "claude --resume",
      launchLine: line,
    });
  });

  it("keeps a hand-written launch line readable instead of discarding it", () => {
    expect(parseLaunchLine("wt -d . powershell")).toEqual({
      shell: "wt",
      command: "-d . powershell",
      launchLine: "wt -d . powershell",
    });
  });

  it("preserves a trailing space so a flag can be appended to the command", () => {
    const line = buildLaunchLine("cmd", "claude ");
    expect(line).toBe("cmd /k claude ");
    // The value round-trips through parse on every keystroke; the trailing
    // space must survive so the user can go on to type "--resume".
    expect(parseLaunchLine(line).command).toBe("claude ");
  });

  it("falls back to the default shell and command when either is blank", () => {
    expect(buildLaunchLine("", "   ")).toBe("cmd /k claude");
    expect(parseLaunchLine("").command).toBe("claude");
  });

  it("draws a prompt that matches the shell family", () => {
    expect(promptForShell("")).toBe("C:\\>");
    expect(promptForShell("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("PS>");
    expect(promptForShell("/bin/zsh")).toBe("$");
    expect(promptForShell("wt")).toBe(">");
  });
});
