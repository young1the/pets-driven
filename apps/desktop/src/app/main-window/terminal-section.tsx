import { FolderIcon, RefreshIcon } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import { lazy, Suspense, useState } from "react";
import "@/app/main-window/terminal-section.css";

// xterm (plus its fit addon and CSS) is a heavy dependency that only matters
// once the terminal tab is actually opened, so keep it out of the main chunk.
const EmbeddedTerminal = lazy(() =>
  import("@/app/main-window/embedded-terminal").then((m) => ({ default: m.EmbeddedTerminal })),
);

export interface TerminalSectionProps {
  /** Opens the OS folder picker; resolves to null when cancelled. */
  pickDirectory: () => Promise<string | null>;
  /** Whether the app is running inside Tauri (PTY available). */
  available: boolean;
  /** Working folder to open the first terminal in; null = process default. */
  initialCwd?: string | null;
  /** Default terminal shell to spawn; null/empty falls back to the OS default. */
  shell?: string | null;
}

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function TerminalSection({
  pickDirectory,
  available,
  initialCwd = null,
  shell = null,
}: TerminalSectionProps) {
  const { t } = useTranslation("desktop");
  const [cwd, setCwd] = useState<string | null>(initialCwd);
  // Bumped to force a clean remount of the terminal (new PTY) on "restart".
  const [restartNonce, setRestartNonce] = useState(0);

  async function chooseFolder() {
    const path = await pickDirectory();
    if (path) {
      setCwd(path);
      setRestartNonce((value) => value + 1);
    }
  }

  return (
    <div className="pd-eterm">
      <div className="pd-eterm__frame">
        <div className="pd-eterm__bar">
          <span aria-hidden className="pd-eterm__dots">
            <span />
            <span />
            <span />
          </span>
          <button
            className="pd-eterm__folder"
            onClick={() => void chooseFolder()}
            title={cwd ?? undefined}
            type="button"
          >
            <FolderIcon size={14} />
            <span className="pd-eterm__folder-name">
              {cwd ? folderName(cwd) : t("terminal.defaultFolder")}
            </span>
          </button>
          <button
            className="pd-eterm__restart"
            onClick={() => setRestartNonce((value) => value + 1)}
            type="button"
          >
            <RefreshIcon size={14} />
            {t("terminal.restart")}
          </button>
        </div>

        {available ? (
          <Suspense fallback={<div className="pd-eterm__view" />}>
            <EmbeddedTerminal
              className="pd-eterm__view"
              cwd={cwd}
              exitedLabel={t("terminal.exited")}
              key={`${cwd ?? ""}:${shell ?? ""}:${restartNonce}`}
              shell={shell}
            />
          </Suspense>
        ) : (
          <div className="pd-eterm__unavailable">{t("terminal.unavailable")}</div>
        )}
      </div>
    </div>
  );
}
