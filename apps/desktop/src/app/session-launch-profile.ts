export type LaunchProfileId = "cmd" | "powershell" | "git-bash" | "custom";

export type SessionLaunchSettings = {
  profile: LaunchProfileId;
  command: string;
  launchLine: string;
};

export const DEFAULT_LAUNCH_COMMAND = "claude";

const GIT_BASH_PROGRAM = "C:\\Program Files\\Git\\bin\\bash.exe";

export const LAUNCH_PROFILE_OPTIONS: Array<{
  value: LaunchProfileId;
  label: string;
}> = [
  { value: "cmd", label: "Command Prompt" },
  { value: "powershell", label: "PowerShell" },
  { value: "git-bash", label: "Git Bash" },
  { value: "custom", label: "Custom" },
];

function commandOrDefault(command: string): string {
  return command.trim() || DEFAULT_LAUNCH_COMMAND;
}

function stripBashKeepAlive(command: string): string {
  return command.replace(/;\s*exec\s+bash\s*$/i, "").trim();
}

function extractBashCommand(line: string): string | null {
  const match = line.match(/\s-lc\s+"([^"]*)"/i);
  if (!match) {
    return null;
  }

  return commandOrDefault(stripBashKeepAlive(match[1]));
}

export function buildLaunchLine(
  profile: LaunchProfileId,
  command: string,
): string {
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
    return `"${GIT_BASH_PROGRAM}" --login -i -c "${commandOrDefault(
      settings.command,
    )}; exec bash"`;
  }

  return settings.launchLine;
}

export function parseLaunchLine(line: string): SessionLaunchSettings {
  const launchLine = line.trim() || buildLaunchLine("cmd", DEFAULT_LAUNCH_COMMAND);

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

export function previewCwdForLaunchProfile(
  profile: LaunchProfileId,
  path: string,
): string {
  if (profile === "git-bash") {
    return `~/${path}`;
  }

  return `C:\\pets\\${path}`;
}
