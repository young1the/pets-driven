import { describe, expect, it } from "vitest";
import {
  buildLaunchLine,
  parseLaunchLine,
  promptForShell,
  sessionCommandForPet,
} from "@/app/session-launch-line";
import {
  createEmptyPetsDrivenState,
  type PetAgentProvider,
  type PetsDrivenState,
} from "@/app-state/pets-driven-state";

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

describe("the launch line one pet runs", () => {
  function stateWith(
    agentProvider: PetAgentProvider | undefined,
    overrides: Partial<PetsDrivenState> = {},
  ): PetsDrivenState {
    return {
      ...createEmptyPetsDrivenState(),
      pets: [
        {
          id: "pet-1",
          workingDirectoryId: null,
          assetId: "cato",
          profileId: "profile-1",
          name: "Rex",
          adoptedAt: 0,
          archived: false,
          visible: true,
          agentProvider,
        },
      ],
      ...overrides,
    };
  }

  it("hands a pet with no agent of its own the app-wide line verbatim", () => {
    const state = stateWith(undefined, { sessionCommand: "cmd /k claude --resume" });

    // Verbatim, flags and all — re-deriving it would drop what the user typed.
    expect(sessionCommandForPet(state, "pet-1")).toBe("cmd /k claude --resume");
  });

  it("wraps a pet's own agent for the shell picked in settings", () => {
    const state = stateWith("codex", {
      sessionCommand: "cmd /k claude",
      terminalShell: "pwsh",
    });

    expect(sessionCommandForPet(state, "pet-1")).toBe("pwsh -NoExit -Command codex");
  });

  it("reads the shell back out of the app-wide line when none is configured", () => {
    const state = stateWith("codex", {
      sessionCommand: '/bin/bash -lc "claude; exec bash"',
      terminalShell: null,
    });

    expect(sessionCommandForPet(state, "pet-1")).toBe('/bin/bash -lc "codex; exec bash"');
  });

  it("falls back to the app-wide line for a pet that is not in state", () => {
    const state = stateWith("codex", { sessionCommand: "cmd /k claude" });

    expect(sessionCommandForPet(state, "pet-missing")).toBe("cmd /k claude");
  });
});
