import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorktreeRemoval } from "@/app/desktop-gateway";
import { DeletePetDialog } from "@/app/main-window/delete-pet-dialog";

/**
 * The dialog decides two things: whether the folder a pet stands in is even
 * worth offering to delete, and whether uncommitted work in it has been given
 * up on purpose.
 */

const REMOVAL: WorktreeRemoval = {
  path: "D:/work/proj-worktrees/feat-login",
  repo: "D:/work/proj",
  branch: "feat/login",
  main: false,
  dirty: false,
  locked: false,
};

function setup(
  overrides: {
    removal?: Partial<WorktreeRemoval> | null;
    folder?: string | null;
    onDelete?: (input: { removeWorktree: boolean; force: boolean }) => Promise<void>;
  } = {},
) {
  const planRepoWorktreeRemoval =
    overrides.removal === null
      ? vi.fn().mockRejectedValue(new Error("no git repository at D:/pet-folder"))
      : vi.fn().mockResolvedValue({ ...REMOVAL, ...overrides.removal });
  const props = {
    open: true,
    onClose: vi.fn(),
    gateway: { planRepoWorktreeRemoval },
    petName: "Rex",
    folder: overrides.folder === undefined ? REMOVAL.path : overrides.folder,
    onDelete: overrides.onDelete ?? vi.fn().mockResolvedValue(undefined),
  };

  render(<DeletePetDialog {...props} />);

  return props;
}

function deleteButton() {
  return screen.getByRole("button", { name: /^Delete pet/ });
}

describe("DeletePetDialog", () => {
  it("offers the pet's worktree, unchecked, with the branch that would go with it", async () => {
    setup();

    const box = await screen.findByLabelText("Delete the worktree folder too");
    expect(box).not.toBeChecked();
    expect(screen.getByText(REMOVAL.path)).toBeInTheDocument();
    expect(screen.getByText(/On branch feat\/login/)).toBeInTheDocument();
  });

  it("deletes the pet alone while the folder is left unchecked", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const props = setup({ onDelete });
    await screen.findByLabelText("Delete the worktree folder too");

    fireEvent.click(deleteButton());

    await waitFor(() =>
      expect(onDelete).toHaveBeenCalledWith({ removeWorktree: false, force: false }),
    );
    expect(props.onClose).toHaveBeenCalled();
  });

  it("takes the worktree with the pet once the box is checked", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    setup({ onDelete });

    fireEvent.click(await screen.findByLabelText("Delete the worktree folder too"));
    fireEvent.click(screen.getByRole("button", { name: "Delete pet and folder" }));

    await waitFor(() =>
      expect(onDelete).toHaveBeenCalledWith({ removeWorktree: true, force: false }),
    );
  });

  it("does not offer the repository a pet happens to stand in", async () => {
    setup({ removal: { path: "D:/work/proj", main: true, branch: "main" } });

    // Nothing to check — but the pet is still deletable.
    await waitFor(() => expect(deleteButton()).toBeEnabled());
    expect(screen.queryByLabelText("Delete the worktree folder too")).not.toBeInTheDocument();
  });

  it("asks nothing about a folder that is in no git repository", async () => {
    setup({ removal: null });

    await waitFor(() => expect(deleteButton()).toBeEnabled());
    expect(screen.queryByLabelText("Delete the worktree folder too")).not.toBeInTheDocument();
  });

  it("asks nothing about a pet with no folder at all", () => {
    const props = setup({ folder: null });

    expect(props.gateway.planRepoWorktreeRemoval).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Delete the worktree folder too")).not.toBeInTheDocument();
  });

  it("holds the delete until uncommitted work is given up on purpose", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    setup({ removal: { dirty: true }, onDelete });

    fireEvent.click(await screen.findByLabelText("Delete the worktree folder too"));
    expect(screen.getByText(/holds uncommitted changes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete pet and folder" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Throw the uncommitted changes away"));
    fireEvent.click(screen.getByRole("button", { name: "Delete pet and folder" }));

    await waitFor(() =>
      expect(onDelete).toHaveBeenCalledWith({ removeWorktree: true, force: true }),
    );
  });

  it("shows git's own refusal and keeps the pet when the folder could not go", async () => {
    const onDelete = vi
      .fn()
      .mockRejectedValue(new Error("D:/work/proj-worktrees/feat-login is locked"));
    const props = setup({ onDelete });

    fireEvent.click(await screen.findByLabelText("Delete the worktree folder too"));
    fireEvent.click(screen.getByRole("button", { name: "Delete pet and folder" }));

    expect(await screen.findByText(/is locked/)).toBeInTheDocument();
    // The pet is still there, so the dialog stays open on the choice.
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
