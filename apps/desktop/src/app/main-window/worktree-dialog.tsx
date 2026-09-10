import { Button, Dialog, Input } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import { useEffect, useRef, useState } from "react";
import type { AddedWorktree, RepoWorktree, WorktreePlan } from "@/app/desktop-gateway";
import "@/app/main-window/worktree-dialog.css";

/**
 * "New worktree": a branch of a repository, in a folder of its own, with a pet
 * standing in it.
 *
 * The dialog is deliberately two fields. Where the folder goes is derived, not
 * asked — the preview line under the inputs is the answer, refreshed from the
 * backend as the branch is typed, so the folder about to be made is on screen
 * before the button is pressed rather than explained in a hint. The same
 * preview is where "that branch already exists" and "something is already in
 * that folder" surface, because both change what the button will do and neither
 * is worth a second round of typing to discover.
 *
 * Git's own refusals are shown verbatim. They name paths, branches and
 * checkouts the user recognises, and a translated paraphrase of "fatal: 'x' is
 * already checked out at 'y'" would say less.
 */

/** What the dialog needs of the gateway, so a test can hand it a small fake. */
export type WorktreeDialogGateway = {
  pickDirectory(): Promise<string | null>;
  listRepoWorktrees(repo: string): Promise<RepoWorktree[]>;
  planRepoWorktree(input: { repo: string; branch: string }): Promise<WorktreePlan>;
};

export interface WorktreeDialogProps {
  open: boolean;
  onClose: () => void;
  gateway: WorktreeDialogGateway;
  /**
   * Create the worktree and adopt its pet. Rejects with git's own message when
   * the folder could not be made; resolves with `petError` set when the folder
   * exists but the pet could not be adopted, which is not a failure of the
   * worktree.
   */
  onCreate: (input: {
    repo: string;
    branch: string;
    base?: string | null;
  }) => Promise<{ worktree: AddedWorktree; petError: string | null }>;
  /** The repository to start on — the last one used, when there is one. */
  initialRepo?: string;
  /** Remember the repository for next time. */
  onRepoUsed?: (repo: string) => void;
}

/** How long to wait after a keystroke before asking git where the folder goes. */
const PLAN_DEBOUNCE_MS = 250;

export function WorktreeDialog({
  open,
  onClose,
  gateway,
  onCreate,
  initialRepo = "",
  onRepoUsed,
}: WorktreeDialogProps) {
  const { t } = useTranslation("desktop");
  const [repo, setRepo] = useState(initialRepo);
  const [branch, setBranch] = useState("");
  const [base, setBase] = useState("");
  const [plan, setPlan] = useState<WorktreePlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [worktrees, setWorktrees] = useState<RepoWorktree[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ path: string; petError: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  // Every async answer is stamped with the request that asked for it, so a slow
  // reply for a branch the user has already retyped is dropped instead of
  // overwriting the newer one.
  const requestRef = useRef(0);

  useEffect(() => {
    if (open) {
      setRepo(initialRepo);
      setBranch("");
      setBase("");
      setPlan(null);
      setPlanError(null);
      setWorktrees([]);
      setError(null);
      setCreated(null);
    }
  }, [open, initialRepo]);

  // The repository's existing worktrees: context for the folder about to join
  // them, and the first thing that says whether this folder is a repository at
  // all.
  useEffect(() => {
    if (!open || repo.trim().length === 0) {
      setWorktrees([]);
      return;
    }

    requestRef.current += 1;
    const request = requestRef.current;
    let cancelled = false;

    gateway
      .listRepoWorktrees(repo.trim())
      .then((list) => {
        if (!cancelled && request === requestRef.current) {
          setWorktrees(list);
          setPlanError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setWorktrees([]);
          setPlanError(messageOf(reason));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, repo, gateway]);

  // Where the folder would go, refreshed as the branch is typed. Debounced
  // because each answer costs a git call.
  useEffect(() => {
    if (!open || repo.trim().length === 0 || branch.trim().length === 0) {
      setPlan(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      requestRef.current += 1;
      const request = requestRef.current;

      gateway
        .planRepoWorktree({ repo: repo.trim(), branch: branch.trim() })
        .then((next) => {
          if (!cancelled && request === requestRef.current) {
            setPlan(next);
            setPlanError(null);
          }
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setPlan(null);
            setPlanError(messageOf(reason));
          }
        });
    }, PLAN_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, repo, branch, gateway]);

  async function pickRepo() {
    const picked = await gateway.pickDirectory();
    if (picked) {
      setRepo(picked);
    }
  }

  async function create() {
    setBusy(true);
    setError(null);

    try {
      const result = await onCreate({
        repo: repo.trim(),
        branch: branch.trim(),
        // A base only means anything for a branch being created; the backend
        // refuses it for one that already exists, so it is not sent.
        base: plan?.branchExists ? null : base.trim() || null,
      });

      onRepoUsed?.(repo.trim());
      setCreated({ path: result.worktree.path, petError: result.petError });
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }

  const ready = repo.trim().length > 0 && branch.trim().length > 0 && !plan?.pathOccupied && !busy;

  return (
    <Dialog onClose={onClose} open={open} title={t("worktree.title")}>
      {created ? (
        <div className="pd-worktree__done">
          <p className="pd-worktree__lead">{t("worktree.created")}</p>
          <code className="pd-worktree__path">{created.path}</code>
          {created.petError ? (
            <p className="pd-worktree__warn">
              {t("worktree.petFailed", { reason: created.petError })}
            </p>
          ) : null}
          <div className="pd-worktree__actions">
            <Button onClick={() => setCreated(null)} size="sm" variant="neutral">
              {t("worktree.another")}
            </Button>
            <Button onClick={onClose} size="sm" variant="accent">
              {t("worktree.done")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="pd-worktree__lead">{t("worktree.lead")}</p>

          <div className="pd-worktree__repo">
            <Input
              label={t("worktree.repo")}
              onChange={(event) => setRepo(event.target.value)}
              placeholder={t("worktree.repoPlaceholder")}
              size="sm"
              value={repo}
            />
            <Button onClick={() => void pickRepo()} size="sm" variant="neutral">
              {t("worktree.browse")}
            </Button>
          </div>

          <Input
            label={t("worktree.branch")}
            onChange={(event) => setBranch(event.target.value)}
            placeholder="feat/login"
            size="sm"
            value={branch}
          />

          {/* Only for a branch being created: an existing one is checked out
              where it already stands, so there is nothing to start it at. */}
          {plan && !plan.branchExists ? (
            <Input
              hint={t("worktree.baseHint")}
              label={t("worktree.base")}
              onChange={(event) => setBase(event.target.value)}
              placeholder="origin/main"
              size="sm"
              value={base}
            />
          ) : null}

          <div className="pd-worktree__preview">
            {planError ? (
              <span className="pd-worktree__warn">{planError}</span>
            ) : plan ? (
              <>
                <span className="pd-worktree__previewLabel">{t("worktree.willLandIn")}</span>
                <code className="pd-worktree__path">{plan.path}</code>
                {plan.pathOccupied ? (
                  <span className="pd-worktree__warn">{t("worktree.occupied")}</span>
                ) : plan.branchExists ? (
                  <span className="pd-worktree__note">{t("worktree.existingBranch")}</span>
                ) : (
                  <span className="pd-worktree__note">{t("worktree.newBranch")}</span>
                )}
              </>
            ) : (
              <span className="pd-worktree__previewLabel">{t("worktree.previewHint")}</span>
            )}
          </div>

          {worktrees.length > 0 ? (
            <details className="pd-worktree__existing">
              <summary>{t("worktree.existing", { n: worktrees.length })}</summary>
              <ul>
                {worktrees.map((worktree) => (
                  <li key={worktree.path}>
                    <span className="pd-worktree__branch">
                      {worktree.branch ?? t("worktree.detached")}
                    </span>
                    <code>{worktree.path}</code>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {error ? <p className="pd-worktree__error">{error}</p> : null}

          <div className="pd-worktree__actions">
            <Button onClick={onClose} size="sm" variant="neutral">
              {t("worktree.cancel")}
            </Button>
            <Button disabled={!ready} onClick={() => void create()} size="sm" variant="accent">
              {busy ? t("worktree.creating") : t("worktree.create")}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** Whatever a rejected gateway call threw, as something a person can read. */
function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
