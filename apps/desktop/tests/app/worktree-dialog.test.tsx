import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AddedWorktree, WorktreePlan } from "@/app/desktop-gateway";
import { WorktreeDialog } from "@/app/main-window/worktree-dialog";

/**
 * The dialog's whole job is to answer two questions before the button is
 * pressed — where is this folder going, and will the branch be created or
 * picked up — and to hand git's refusals over unedited when it cannot.
 */

const PLAN: WorktreePlan = {
  repo: "D:/work/proj",
  path: "D:/work/proj-worktrees/feat-login",
  branch: "feat/login",
  branchExists: false,
  pathOccupied: false,
};

const ADDED: AddedWorktree = {
  path: PLAN.path,
  branch: PLAN.branch,
  repo: PLAN.repo,
  createdBranch: true,
};

function setup(overrides: { plan?: Partial<WorktreePlan>; onCreate?: unknown } = {}) {
  const gateway = {
    listRepoWorktrees: vi.fn().mockResolvedValue([]),
    planRepoWorktree: vi.fn().mockResolvedValue({ ...PLAN, ...overrides.plan }),
  };
  const onCreate =
    (overrides.onCreate as WorktreeDialogCreate) ??
    vi.fn().mockResolvedValue({ worktree: ADDED, petError: null });
  const props = {
    open: true,
    onClose: vi.fn(),
    gateway,
    onCreate,
    repo: "D:/work/proj",
    petName: "Rex",
  };

  render(<WorktreeDialog {...props} />);

  return props;
}

type WorktreeDialogCreate = Parameters<typeof WorktreeDialog>[0]["onCreate"];

/** Type the branch that every case starts from. */
function typeBranch(value = "feat/login") {
  fireEvent.change(screen.getByLabelText("Branch"), { target: { value } });
}

function createButton() {
  return screen.getByRole("button", { name: "Create" });
}

describe("WorktreeDialog", () => {
  it("shows the folder the worktree will land in, and that the branch is new", async () => {
    setup();
    typeBranch();

    expect(await screen.findByText(PLAN.path)).toBeInTheDocument();
    expect(screen.getByText(/A new branch, created for this worktree/)).toBeInTheDocument();
  });

  it("says an existing branch is checked out as it stands, and asks for no base", async () => {
    setup({ plan: { branchExists: true } });
    typeBranch();

    expect(await screen.findByText(/already exists and will be checked out/)).toBeInTheDocument();
    // Starting point is meaningless for a branch that already has one.
    expect(screen.queryByLabelText("Start the branch at")).not.toBeInTheDocument();
  });

  it("refuses to create into a folder that already holds files", async () => {
    setup({ plan: { pathOccupied: true } });
    typeBranch();

    await screen.findByText(/That folder already holds files/);
    expect(createButton()).toBeDisabled();
  });

  it("creates the worktree with the branch and base it was given", async () => {
    const onCreate = vi.fn().mockResolvedValue({ worktree: ADDED, petError: null });
    setup({ onCreate });
    typeBranch();
    await screen.findByText(PLAN.path);

    fireEvent.change(screen.getByLabelText("Start the branch at"), {
      target: { value: "origin/main" },
    });
    fireEvent.click(createButton());

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        repo: "D:/work/proj",
        branch: "feat/login",
        base: "origin/main",
      }),
    );
    expect(await screen.findByText(/its pet has moved in/)).toBeInTheDocument();
  });

  it("shows git's own refusal when the folder could not be made", async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(new Error("fatal: 'feat/login' is already checked out at 'D:/other'"));
    setup({ onCreate });
    typeBranch();
    await screen.findByText(PLAN.path);

    fireEvent.click(createButton());

    expect(await screen.findByText(/already checked out at 'D:\/other'/)).toBeInTheDocument();
  });

  it("reports a worktree that was made but got no pet", async () => {
    const onCreate = vi
      .fn()
      .mockResolvedValue({ worktree: ADDED, petError: "folder already has pet pet-1" });
    setup({ onCreate });
    typeBranch();
    await screen.findByText(PLAN.path);

    fireEvent.click(createButton());

    // The folder is not rolled back, so the dialog reports it as made.
    expect(await screen.findByText(/no pet could be adopted for it/)).toBeInTheDocument();
    expect(screen.getByText(ADDED.path)).toBeInTheDocument();
  });

  it("says so when the folder is in no git repository", async () => {
    const gatewayError = new Error("no git repository at D:/work/proj (git: fatal: …)");
    const props = setup();
    props.gateway.listRepoWorktrees.mockRejectedValueOnce(gatewayError);
    props.gateway.planRepoWorktree.mockRejectedValueOnce(gatewayError);
    typeBranch();

    expect(await screen.findByText(/no git repository at D:\/work\/proj/)).toBeInTheDocument();
  });
});
