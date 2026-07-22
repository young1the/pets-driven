/**
 * The double-click launch line: one command line that opens a terminal in a
 * pet's folder and runs the agent command inside it.
 *
 * The shell is not a separate choice here — it is the shell picked in settings
 * (`terminalShell`), so the in-app terminal and the external session always open
 * the same program. This module only knows how to wrap a command for a given
 * shell, and how to read the command back out of a stored line.
 */

export type SessionLaunchSettings = {
  /** Shell executable the line runs. Empty only for a blank/unparseable line. */
  shell: string;
  command: string;
  launchLine: string;
};

export const DEFAULT_LAUNCH_COMMAND = "claude";

/** Stand-in shell for "system default", which start_session resolves on Windows. */
const DEFAULT_SHELL = "cmd";

/** How a shell wants a command handed to it, derived from its executable name. */
export type ShellFamily = "cmd" | "powershell" | "bash" | "wsl" | "other";

export function shellFamily(shellPath: string): ShellFamily {
  const file = (shellPath.trim().split(/[\\/]/).pop() ?? "").toLowerCase();

  if (/^cmd(\.exe)?$/.test(file)) {
    return "cmd";
  }

  if (/^(powershell|pwsh)(\.exe)?$/.test(file)) {
    return "powershell";
  }

  if (/^wsl(\.exe)?$/.test(file)) {
    return "wsl";
  }

  // sh, bash, zsh, ksh, fish, csh, ash, dash — all take `-c "…"`.
  if (/^(a|ba|c|da|fi|k|z)?sh(\.exe)?$/.test(file)) {
    return "bash";
  }

  return "other";
}

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

function quoteProgram(shellPath: string): string {
  return /\s/.test(shellPath) ? `"${shellPath}"` : shellPath;
}

/** Wrap `command` so `shellPath` runs it and then stays open for the user. */
export function buildLaunchLine(shellPath: string, command: string): string {
  const innerCommand = commandOrDefault(command);
  const shell = shellPath.trim() || DEFAULT_SHELL;
  const program = quoteProgram(shell);

  switch (shellFamily(shell)) {
    case "cmd":
      return `${program} /k ${innerCommand}`;
    case "powershell":
      return `${program} -NoExit -Command ${innerCommand}`;
    case "bash":
      return `${program} -lc "${innerCommand}; exec bash"`;
    case "wsl":
      return `${program} -e bash -lc "${innerCommand}; exec bash"`;
    default:
      return `${program} ${innerCommand}`;
  }
}

/** Program plus the rest of the line, honoring a quoted path with spaces. */
const PROGRAM_PATTERN = /^\s*(?:"([^"]+)"|(\S+))\s*([\s\S]*)$/;

function commandFor(shell: string, rest: string): string {
  switch (shellFamily(shell)) {
    case "cmd": {
      const match = rest.match(/^\/[kc]\s*([\s\S]*)$/i);
      return commandOrDefault(match ? match[1] : rest);
    }
    case "powershell": {
      const match = rest.match(/^-NoExit\s+-Command\s*([\s\S]*)$/i);
      return commandOrDefault(match ? match[1] : rest);
    }
    case "bash":
    case "wsl": {
      // Matches -c, -lc and the --login -i -c form alike.
      const match = rest.match(/-l?c\s+"([^"]*)"/i);
      return commandOrDefault(stripBashKeepAlive(match ? match[1] : rest));
    }
    default:
      return commandOrDefault(rest);
  }
}

/**
 * Read a stored launch line back into the shell it runs and the agent command
 * inside it. Unrecognized lines still yield their program and a best-effort
 * command, so a hand-written line survives the round trip.
 */
export function parseLaunchLine(line: string): SessionLaunchSettings {
  // Only fall back to the default when the line is blank; keep it verbatim
  // otherwise so a trailing space typed by the user survives the round trip.
  const launchLine =
    line.trim().length > 0 ? line : buildLaunchLine(DEFAULT_SHELL, DEFAULT_LAUNCH_COMMAND);
  const match = launchLine.match(PROGRAM_PATTERN);

  if (!match) {
    return { shell: "", command: DEFAULT_LAUNCH_COMMAND, launchLine };
  }

  const shell = match[1] ?? match[2] ?? "";

  return { shell, command: commandFor(shell, match[3] ?? ""), launchLine };
}

/** The prompt drawn in the settings preview for a shell. */
export function promptForShell(shellPath: string): string {
  switch (shellFamily(shellPath.trim() || DEFAULT_SHELL)) {
    case "powershell":
      return "PS>";
    case "bash":
    case "wsl":
      return "$";
    case "cmd":
      return "C:\\>";
    default:
      return ">";
  }
}
