//! The desktop adapters over `pets-driven-git`.
//!
//! Making a worktree is two things the app already knows how to do separately:
//! a folder appears, and a pet is bound to it. Only the first is here — these
//! commands create, list, and remove the *folder*, and the webview adopts or
//! deletes the pet through the state commands it already uses. That keeps one
//! adoption path (the same random asset and personality a hand-adopted pet
//! gets) instead of a second one buried in a git command.
//!
//! The behavior itself — where a worktree goes, which requests are refused
//! before git is asked — lives in `pets-driven-git`, which the `pdd` CLI runs
//! too, so the app and the command line refuse the same things for the same
//! reasons.
//!
//! Git is slow enough to matter (a checkout of a large repository is seconds,
//! not milliseconds), so every command hands the work to a blocking thread
//! rather than holding the webview's main thread.

use pets_driven_git::{
    add_worktree, plan_removal, plan_worktree, remove_worktree, worktree_root_from_env,
    AddedWorktree, RemovedWorktree, SystemGit, WorktreeEntry, WorktreePlan, WorktreeRemoval,
};

use crate::state_commands;

/// Where new worktrees go: the environment override first (a per-shell escape
/// hatch the CLI honours too), then the folder set in Settings, and otherwise
/// none — which puts each worktree beside the repository it branches from.
fn worktree_root(app: &tauri::AppHandle) -> Option<String> {
    worktree_root_from_env().or_else(|| state_commands::worktree_directory(app))
}

/// Every worktree of the repository `repo` belongs to, the repository's own
/// worktree first. Fails when the folder is not in a git repository at all,
/// which is the ordinary state of a pet's folder — the message names the
/// folder that was looked at.
#[tauri::command]
pub(crate) async fn list_repo_worktrees(repo: String) -> Result<Vec<WorktreeEntry>, String> {
    blocking(move || pets_driven_git::list_worktrees(&SystemGit, &repo)).await
}

/// Where a worktree for `branch` would go, worked out without creating
/// anything. The dialog calls this as the user types, so the folder it is about
/// to make is on screen before the button is pressed, along with whether the
/// branch already exists (it would be checked out as it stands) and whether
/// something is already in the way.
#[tauri::command]
pub(crate) async fn plan_repo_worktree(
    app: tauri::AppHandle,
    repo: String,
    branch: String,
    path: Option<String>,
) -> Result<WorktreePlan, String> {
    let root = worktree_root(&app);

    blocking(move || plan_worktree(&SystemGit, &repo, &branch, path.as_deref(), root.as_deref()))
        .await
}

/// Create the worktree. The caller adopts the pet for the returned folder
/// afterwards; nothing here writes state.
#[tauri::command]
pub(crate) async fn add_repo_worktree(
    app: tauri::AppHandle,
    repo: String,
    branch: String,
    path: Option<String>,
    base: Option<String>,
) -> Result<AddedWorktree, String> {
    let root = worktree_root(&app);

    blocking(move || {
        // Re-planned inside the same blocking hop rather than taking the plan
        // from the webview: the folder is created from what git says now, not
        // from what a preview said while the user was still typing.
        let plan = plan_worktree(&SystemGit, &repo, &branch, path.as_deref(), root.as_deref())?;

        add_worktree(&SystemGit, &plan, base.as_deref())
    })
    .await
}

/// What removing the worktree `path` sits in would take away, worked out
/// without removing anything. Asked when a pet is about to be deleted, so the
/// question "should its folder go too?" is only put when there is a worktree to
/// take away — and so the answer can say what would be lost with it.
///
/// Fails when the folder is in no git repository, which is the ordinary state
/// of a pet's folder: the caller reads that as "nothing to ask about" rather
/// than as something to report.
#[tauri::command]
pub(crate) async fn plan_repo_worktree_removal(path: String) -> Result<WorktreeRemoval, String> {
    blocking(move || plan_removal(&SystemGit, &path)).await
}

/// Remove the worktree at `path`. `force` throws away uncommitted work in it,
/// which the removal otherwise refuses; nothing here touches the pet standing
/// in the folder, which the caller deletes through the state commands after
/// the folder is gone.
#[tauri::command]
pub(crate) async fn remove_repo_worktree(
    path: String,
    force: bool,
) -> Result<RemovedWorktree, String> {
    blocking(move || remove_worktree(&SystemGit, &path, force)).await
}

/// Run one git-backed operation off the main thread. A panic in the blocking
/// task surfaces as an ordinary command failure rather than taking the app with
/// it.
async fn blocking<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .unwrap_or_else(|error| Err(error.to_string()))
}
