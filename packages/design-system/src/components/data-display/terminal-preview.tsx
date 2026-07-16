import "./terminal-preview.css";

/**
 * The "soft terminal" preview block: a muted working-directory line above a
 * prompt + command line. Presentational; callers resolve the strings.
 */
export interface TerminalPreviewProps {
  cwd?: string;
  prompt: string;
  command: string;
  className?: string;
}

export function TerminalPreview({ cwd, prompt, command, className = "" }: TerminalPreviewProps) {
  return (
    <div className={["pd-terminal", className].filter(Boolean).join(" ")}>
      {cwd && <div className="pd-terminal__cwd">{cwd}</div>}
      <div>
        <span className="pd-terminal__prompt">{prompt}</span>{" "}
        <span className="pd-terminal__command">{command}</span>
      </div>
    </div>
  );
}
