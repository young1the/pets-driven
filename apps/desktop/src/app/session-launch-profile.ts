export type LaunchProfileId = "cmd" | "powershell" | "git-bash" | "custom";

export type SessionLaunchSettings = {
  profile: LaunchProfileId;
  command: string;
  launchLine: string;
};

export const DEFAULT_LAUNCH_COMMAND = "claude";

const GIT_BASH_PROGRAM = "C:\\Program Files\\Git\\bin\\bash.exe";

/**
 * Launch profiles for the shell picker. `labelKey` points at a
 * `launchProfile.*` entry in the desktop translation bundle so the UI can
 * localize the label; the ids themselves stay stable.
 */
export const LAUNCH_PROFILE_OPTIONS: Array<{
  value: LaunchProfileId;
  labelKey: "cmd" | "powershell" | "gitBash" | "custom";
}> = [
  { value: "cmd", labelKey: "cmd" },
  { value: "powershell", labelKey: "powershell" },
  { value: "git-bash", labelKey: "gitBash" },
  { value: "custom", labelKey: "custom" },
];

// Keep the command exactly as typed (including trailing spaces, so a user can
// type "claude " and then append a flag) and only substitute the default when
// it is blank. Trimming here would eat the trailing space on every keystroke,
// making flags impossible to type since the value round-trips through here.
function commandOrDefault(command: string): string {
  return command.trim().length > 0 ? command : DEFAULT_LAUNCH_COMMAND;
}

function stripBashKeepAlive(command: string): string {
  return command.replace(/;\s*exec\s+bash\s*$/i, "");
}

function extractBashCommand(line: string): string | null {
  const match = line.match(/\s-lc\s+"([^"]*)"/i);
  if (!match) {
    return null;
  }

  return commandOrDefault(stripBashKeepAlive(match[1]));
}

export function buildLaunchLine(profile: LaunchProfileId, command: string): string {
  const innerCommand = commandOrDefault(command);

  if (profile === "cmd") {
    return `cmd /k ${innerCommand}`;
  }

  if (profile === "powershell") {
    return `powershell -NoExit -Command ${innerCommand}`;
  }

  if (profile === "git-bash") {
    return `"${GIT_BASH_PROGRAM}" -lc "${innerCommand}; exec bash"`;
  }

  return innerCommand;
}

export function customizeLaunchLine(settings: SessionLaunchSettings): string {
  if (settings.profile === "cmd") {
    return `"cmd" /k ${commandOrDefault(settings.command)}`;
  }

  if (settings.profile === "powershell") {
    return `"powershell" -NoExit -Command ${commandOrDefault(settings.command)}`;
  }

  if (settings.profile === "git-bash") {
    return `"${GIT_BASH_PROGRAM}" --login -i -c "${commandOrDefault(settings.command)}; exec bash"`;
  }

  return settings.launchLine;
}

export function parseLaunchLine(line: string): SessionLaunchSettings {
  // Only fall back to the default when the line is blank; keep it verbatim
  // otherwise so a trailing space typed by the user survives the round trip.
  const launchLine = line.trim().length > 0 ? line : buildLaunchLine("cmd", DEFAULT_LAUNCH_COMMAND);

  const cmdMatch = launchLine.match(/^cmd(?:\.exe)?\s+\/k\s+(.+)$/i);
  if (cmdMatch) {
    return {
      profile: "cmd",
      command: commandOrDefault(cmdMatch[1]),
      launchLine,
    };
  }

  const powershellMatch = launchLine.match(
    /^(?:powershell|powershell\.exe|pwsh|pwsh\.exe)\s+-NoExit\s+-Command\s+(.+)$/i,
  );
  if (powershellMatch) {
    return {
      profile: "powershell",
      command: commandOrDefault(powershellMatch[1]),
      launchLine,
    };
  }

  const gitBashMatch = launchLine.match(
    /^"C:\\Program Files\\Git\\bin\\bash\.exe"\s+-lc\s+"([^"]*)"$/i,
  );
  if (gitBashMatch) {
    return {
      profile: "git-bash",
      command: commandOrDefault(stripBashKeepAlive(gitBashMatch[1])),
      launchLine,
    };
  }

  return {
    profile: "custom",
    command: extractBashCommand(launchLine) ?? DEFAULT_LAUNCH_COMMAND,
    launchLine,
  };
}

export function promptForLaunchProfile(profile: LaunchProfileId): string {
  if (profile === "git-bash") {
    return "$";
  }

  if (profile === "powershell") {
    return "PS>";
  }

  if (profile === "custom") {
    return ">";
  }

  return "C:\\>";
}

export function previewCwdForLaunchProfile(profile: LaunchProfileId, path: string): string {
  if (profile === "git-bash") {
    return `~/${path}`;
  }

  return `C:\\pets\\${path}`;
}
