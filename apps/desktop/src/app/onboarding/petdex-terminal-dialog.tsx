import { Dialog } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import { EmbeddedTerminal } from "@/app/main-window/embedded-terminal";
import "@/app/onboarding/petdex-terminal-dialog.css";

export interface PetdexTerminalDialogProps {
  open: boolean;
  onClose: () => void;
  /** Working directory for the shell; null uses the process default. */
  cwd: string | null;
  /** Default terminal shell to spawn; null/empty falls back to the OS default. */
  shell?: string | null;
  /** Whether the PTY is available (running inside Tauri). */
  available: boolean;
}

/**
 * A modal that drops the in-app terminal onto the pet-picker so the user can
 * run `npx petdex install <name>` (and friends) without leaving onboarding.
 * The terminal mounts only while open — the Dialog unmounts its children on
 * close, which tears down the PTY session.
 */
export function PetdexTerminalDialog({
  open,
  onClose,
  cwd,
  shell = null,
  available,
}: PetdexTerminalDialogProps) {
  const { t } = useTranslation("desktop");

  return (
    <Dialog
      className="pd-petdex-term-dialog"
      onClose={onClose}
      open={open}
      title={t("onboarding.terminalTitle")}
    >
      <p className="pd-petdex-term__hint">{t("onboarding.terminalHint")}</p>
      <div className="pd-petdex-term__frame">
        {available ? (
          <EmbeddedTerminal
            className="pd-petdex-term__view"
            cwd={cwd}
            exitedLabel={t("terminal.exited")}
            shell={shell}
          />
        ) : (
          <div className="pd-petdex-term__unavailable">{t("terminal.unavailable")}</div>
        )}
      </div>
    </Dialog>
  );
}
