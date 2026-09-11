import { Button, Checkbox, Dialog } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import { useEffect, useState } from "react";
import type { WorktreeRemoval } from "@/app/desktop-gateway";
import "@/app/main-window/delete-pet-dialog.css";

/**
 * "Send this pet home for good?" — and, when the folder it was standing in is a
 * worktree, whether that folder should go with it.
 *
 * The question is only worth asking about a folder the app made: a worktree is
 * a checkout created for one piece of work, and a pet is deleted when that work
 * is over, so leaving the folder behind leaves something no screen mentions
 * again. Every *other* folder a pet may be bound to — a repository, a plain
 * directory — is the user's own and is never offered up, which is what `main`
 * on the plan decides.
 *
 * The folder is asked about rather than assumed, and the box starts unchecked:
 * deleting a pet is a state change the user can undo by adopting another, and
 * deleting a checkout is not.
 *
 * Nothing here waits on git before the question appears. The dialog opens on
 * the press and asks about the folder in the background, so a pet with no
 * folder — or one in no repository — is confirmed at once, and the worktree
 * choice appears when git has answered.
 */

/** What the dialog needs of the gateway, so a test can hand it a small fake. */
export type DeletePetDialogGateway = {
  planRepoWorktreeRemoval(path: string): Promise<WorktreeRemoval>;
};

export interface DeletePetDialogProps {
  open: boolean;
  onClose: () => void;
  gateway: DeletePetDialogGateway;
  petName: string;
  /** The folder the pet is bound to; null when it watches nothing. */
  folder: string | null;
  /**
   * Delete the pet, taking its worktree folder with it when asked. Rejects with
   * git's own message when the folder could not be removed — the pet is then
   * still there, and the dialog stays open showing what git said.
   */
  onDelete: (input: { removeWorktree: boolean; force: boolean }) => Promise<void>;
}

export function DeletePetDialog({
  open,
  onClose,
  gateway,
  petName,
  folder,
  onDelete,
}: DeletePetDialogProps) {
  const { t } = useTranslation("desktop");
  const [removal, setRemoval] = useState<WorktreeRemoval | null>(null);
  const [removeWorktree, setRemoveWorktree] = useState(false);
  const [discardChanges, setDiscardChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setRemoval(null);
      setRemoveWorktree(false);
      setDiscardChanges(false);
      setError(null);
    }
  }, [open]);

  // What taking the folder away would cost, asked while the user reads the
  // question. A folder in no git repository is the ordinary case and not
  // something to report: there is simply no worktree to offer.
  useEffect(() => {
    if (!open || !folder) {
      setRemoval(null);
      return;
    }

    let cancelled = false;

    gateway
      .planRepoWorktreeRemoval(folder)
      .then((plan) => {
        if (!cancelled) {
          setRemoval(plan);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRemoval(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, folder, gateway]);

  // The repository a pet happens to stand in is not a worktree anyone made for
  // it, and git refuses to remove it anyway — so it is never offered.
  const removable = removal && !removal.main ? removal : null;
  // Uncommitted work is thrown away by a forced removal and by nothing else, so
  // it takes a second, separate yes.
  const needsDiscard = Boolean(removable?.dirty) && removeWorktree;
  const ready = !busy && (!needsDiscard || discardChanges);

  async function confirm() {
    setBusy(true);
    setError(null);

    try {
      await onDelete({
        removeWorktree: Boolean(removable) && removeWorktree,
        force: needsDiscard && discardChanges,
      });
      onClose();
    } catch (reason) {
      // Git's own refusal: it names the folder and what is in the way, and a
      // paraphrase would say less. The pet is still there to try again from.
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={onClose} open={open} title={t("deletePet.title", { name: petName })}>
      <p className="pd-delete-pet__lead">{t("deletePet.lead", { name: petName })}</p>

      {removable ? (
        <div className="pd-delete-pet__worktree">
          <Checkbox
            checked={removeWorktree}
            label={t("deletePet.alsoRemove")}
            onChange={(event) => setRemoveWorktree(event.target.checked)}
          />
          <code className="pd-delete-pet__path">{removable.path}</code>
          <span className="pd-delete-pet__note">
            {removable.branch
              ? t("deletePet.onBranch", { branch: removable.branch })
              : t("deletePet.detached")}
          </span>

          {needsDiscard ? (
            <div className="pd-delete-pet__dirty">
              <span className="pd-delete-pet__warn">{t("deletePet.dirty")}</span>
              <Checkbox
                checked={discardChanges}
                label={t("deletePet.discard")}
                onChange={(event) => setDiscardChanges(event.target.checked)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="pd-delete-pet__error">{error}</p> : null}

      <div className="pd-delete-pet__actions">
        <Button onClick={onClose} size="sm" variant="neutral">
          {t("deletePet.cancel")}
        </Button>
        <Button
          className="pd-delete-pet__danger"
          disabled={!ready}
          onClick={() => void confirm()}
          size="sm"
        >
          {removable && removeWorktree ? t("deletePet.confirmBoth") : t("deletePet.confirm")}
        </Button>
      </div>
    </Dialog>
  );
}
