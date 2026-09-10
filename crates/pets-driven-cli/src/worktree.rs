//! `pdd worktree`: the shared worktree operations, plus the pet that lives in
//! the folder.
//!
//! The git behavior — where a worktree goes, what git is asked, which requests
//! are refused — is `pets-driven-git`, which the desktop app runs too, so both
//! surfaces refuse the same things for the same reasons. What lives here is the
//! CLI's share of it: the JSON envelopes, the pet bound to each folder, and the
//! one refusal that is a command-line concern (removing the folder the shell is
//! standing in).

use std::io::Write;

use pets_driven_core::{PetsDrivenCore, WorkingDirectoryPath};
use pets_driven_git::{
    add_worktree, is_inside, list_worktrees, main_worktree, plan_worktree, remove_worktree,
    worktree_root_from_env, worktree_toplevel, Git,
};
use serde_json::Value;

use crate::{error_json, hatch_pet, hatch_request, print_json, PetOptions};

// ---- add -------------------------------------------------------------------

/// What `pdd worktree add` was asked for.
pub(crate) struct AddOptions {
    /// The repository to branch from — any of its worktrees will do.
    pub(crate) repo: String,
    pub(crate) branch: String,
    /// An explicit folder for the worktree, overriding the derived one.
    pub(crate) path: Option<String>,
    /// What a newly created branch starts at; an existing branch has none.
    pub(crate) base: Option<String>,
    /// Create the folder without adopting a pet for it.
    pub(crate) no_pet: bool,
    pub(crate) pet: PetOptions,
}

pub(crate) fn run_add<O: Write>(
    core: &PetsDrivenCore,
    git: &dyn Git,
    origin: &str,
    options: AddOptions,
    out: &mut O,
) -> i32 {
    report(add(core, git, origin, options), out)
}

fn add(
    core: &PetsDrivenCore,
    git: &dyn Git,
    origin: &str,
    options: AddOptions,
) -> Result<Value, String> {
    // Resolved here rather than left to the plan so the refusal can say what to
    // do about it: the likeliest folder to run this in is a pet's own, which is
    // an ordinary folder that may well have no git in it.
    let repository = main_worktree(git, &options.repo).map_err(|message| {
        format!("{message} — run `git init` there, or pass --repo to name the repository to branch from")
    })?;

    let plan = plan_worktree(
        git,
        &repository,
        &options.branch,
        options.path.as_deref(),
        worktree_root_from_env().as_deref(),
    )?;
    let added = add_worktree(git, &plan, options.base.as_deref())?;

    // The worktree exists from here on, so a failed adoption is reported beside
    // it rather than as the command failing: the folder is the deliverable and
    // is not rolled back.
    let (pet, pet_error) = if options.no_pet {
        (Value::Null, Value::Null)
    } else {
        let folder = WorkingDirectoryPath::new(added.path.clone());
        let request = hatch_request(core, Some(folder), options.pet);

        match hatch_pet(core, request, origin) {
            Ok(pet) => (pet, Value::Null),
            Err(error) => (Value::Null, Value::String(error.to_string())),
        }
    };

    Ok(serde_json::json!({
        "ok": true,
        "worktree": added,
        "pet": pet,
        "petError": pet_error,
    }))
}

// ---- rm --------------------------------------------------------------------

/// What `pdd worktree rm` was asked for.
pub(crate) struct RemoveOptions {
    /// The worktree folder to remove.
    pub(crate) path: String,
    /// Remove it even though it holds uncommitted work.
    pub(crate) force: bool,
    /// Leave the pet in state instead of deleting it with its folder.
    pub(crate) keep_pet: bool,
    /// The directory the command itself is running in, which cannot be removed
    /// out from under the shell that sits in it.
    pub(crate) process_cwd: String,
}

pub(crate) fn run_rm<O: Write>(
    core: &PetsDrivenCore,
    git: &dyn Git,
    origin: &str,
    options: RemoveOptions,
    out: &mut O,
) -> i32 {
    report(remove(core, git, origin, options), out)
}

fn remove(
    core: &PetsDrivenCore,
    git: &dyn Git,
    origin: &str,
    options: RemoveOptions,
) -> Result<Value, String> {
    // Windows keeps a handle on the current directory of a shell, so a removal
    // from inside the folder fails halfway: git deletes what it can and leaves
    // the folder behind, still registered. The app never stands in a folder, so
    // this refusal is the CLI's alone.
    let folder = worktree_toplevel(git, &options.path)?;
    if is_inside(&folder, &options.process_cwd) {
        return Err(format!(
            "cd out of {folder} before removing it — a shell sitting in a folder keeps it from being deleted"
        ));
    }

    let removed = remove_worktree(git, &folder, options.force)?;

    // The folder is gone; a pet still pointing at it has nothing left to watch,
    // so a failed removal is reported beside the result rather than as the
    // command failing.
    let (pet, pet_error) = if options.keep_pet {
        (Value::Null, Value::Null)
    } else {
        match crate::remove_pet_bound_to(core, origin, &removed.path) {
            Ok(pet_id) => (pet_id.map_or(Value::Null, Value::String), Value::Null),
            Err(error) => (Value::Null, Value::String(error.to_string())),
        }
    };

    Ok(serde_json::json!({
        "ok": true,
        "removed": { "path": removed.path, "repo": removed.repo, "pet": pet },
        "petError": pet_error,
    }))
}

// ---- ls --------------------------------------------------------------------

pub(crate) fn run_ls<O: Write>(core: &PetsDrivenCore, git: &dyn Git, repo: &str, out: &mut O) -> i32 {
    report(list(core, git, repo), out)
}

fn list(core: &PetsDrivenCore, git: &dyn Git, repo: &str) -> Result<Value, String> {
    let entries = list_worktrees(git, repo)?;
    let repository = entries[0].path.clone();

    let worktrees = entries
        .iter()
        .map(|entry| {
            let mut value = serde_json::to_value(entry).unwrap_or(Value::Null);

            // A state read that fails leaves the worktree listed with no pet:
            // the folders are the answer here, and the pet is the join.
            let pet = core
                .pet_by_working_directory(&entry.path)
                .ok()
                .flatten()
                .map_or(Value::Null, |view| view.into_value());

            if let Some(object) = value.as_object_mut() {
                object.insert("pet".to_string(), pet);
            }

            value
        })
        .collect::<Vec<_>>();

    Ok(serde_json::json!({ "ok": true, "repo": repository, "worktrees": worktrees }))
}

/// Print a command's outcome in the shared envelope: the value it produced, or
/// the failure envelope and exit 1.
fn report<O: Write>(outcome: Result<Value, String>, out: &mut O) -> i32 {
    match outcome {
        Ok(value) => {
            print_json(out, &value);
            0
        }
        Err(message) => {
            print_json(out, &error_json(message));
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    use pets_driven_core::MemoryStateRepository;
    use pets_driven_git::testing::{failed, succeeded, ScriptedGit, LISTING};

    /// A loopback port that refuses instantly, so the best-effort show/hide
    /// ping around an adoption fails fast without a running app.
    const REFUSED: &str = "127.0.0.1:1";

    /// The worktree the shared LISTING has beside its repository.
    const WORKTREE: &str = "D:/work/proj-worktrees/feat-login";

    fn core_with_empty_state() -> PetsDrivenCore {
        PetsDrivenCore::new(Arc::new(MemoryStateRepository::new()))
    }

    fn pet_options() -> PetOptions {
        PetOptions { name: None, asset: None, personality: None, agent: None }
    }

    /// Adopt a pet bound to `folder`, the way `worktree add` would have.
    fn hatch_at(core: &PetsDrivenCore, folder: &str) -> String {
        let request = hatch_request(core, Some(WorkingDirectoryPath::new(folder)), pet_options());
        let pet = hatch_pet(core, request, REFUSED).expect("the folder is free");

        pet["id"].as_str().expect("a hatched pet has an id").to_string()
    }

    fn add_options(branch: &str, path: &str) -> AddOptions {
        AddOptions {
            repo: "D:/work/proj".to_string(),
            branch: branch.to_string(),
            path: Some(path.to_string()),
            base: None,
            no_pet: false,
            pet: pet_options(),
        }
    }

    fn remove_options(path: &str) -> RemoveOptions {
        RemoveOptions {
            path: path.to_string(),
            force: false,
            keep_pet: false,
            // Somewhere else entirely: removing the folder a shell sits in is
            // its own refusal, tested on its own.
            process_cwd: "D:/elsewhere".to_string(),
        }
    }

    fn adding_git() -> ScriptedGit {
        ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            // `--verify --quiet` exits non-zero for a branch that does not exist.
            ("rev-parse --verify", failed("")),
            ("worktree add", succeeded("")),
        ])
    }

    fn removing_git() -> ScriptedGit {
        ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --show-toplevel", succeeded(WORKTREE)),
            ("status --porcelain", succeeded("")),
            ("worktree remove", succeeded("")),
        ])
    }

    fn answer(out: &[u8]) -> Value {
        serde_json::from_slice(out).expect("the answer is JSON")
    }

    #[test]
    fn add_makes_the_worktree_and_adopts_a_pet_for_the_new_folder() {
        let core = core_with_empty_state();
        let git = adding_git();

        let mut out = Vec::new();
        let code = run_add(&core, &git, REFUSED, add_options("feat/x", "D:/trees/feat-x"), &mut out);
        let answer = answer(&out);

        assert_eq!(code, 0);
        assert!(git.ran("worktree add D:/trees/feat-x -b feat/x"));
        assert_eq!(answer["worktree"]["createdBranch"], true);
        assert_eq!(answer["worktree"]["repo"], "D:/work/proj");
        assert_eq!(answer["pet"]["cwd"], "D:/trees/feat-x");
        assert_eq!(answer["petError"], Value::Null);
        // The pet is in state, bound to the folder git just made.
        assert!(core.pet_by_working_directory("D:/trees/feat-x").unwrap().is_some());
    }

    #[test]
    fn add_reports_a_failed_adoption_beside_the_worktree_it_made() {
        let core = core_with_empty_state();
        // The folder already has a pet, so the worktree succeeds and the
        // adoption cannot. The folder is the deliverable and is not rolled back.
        hatch_at(&core, "D:/trees/feat-x");

        let mut out = Vec::new();
        let code =
            run_add(&core, &adding_git(), REFUSED, add_options("feat/x", "D:/trees/feat-x"), &mut out);
        let answer = answer(&out);

        assert_eq!(code, 0);
        assert_eq!(answer["worktree"]["path"], "D:/trees/feat-x");
        assert_eq!(answer["pet"], Value::Null);
        assert!(answer["petError"].as_str().unwrap().contains("already has pet"));
    }

    #[test]
    fn add_without_a_pet_leaves_state_alone() {
        let core = core_with_empty_state();
        let options = AddOptions { no_pet: true, ..add_options("feat/x", "D:/trees/feat-x") };

        let mut out = Vec::new();
        assert_eq!(run_add(&core, &adding_git(), REFUSED, options, &mut out), 0);

        assert_eq!(answer(&out)["pet"], Value::Null);
        assert!(core.pet_by_working_directory("D:/trees/feat-x").unwrap().is_none());
    }

    #[test]
    fn add_in_a_folder_with_no_git_says_what_to_do_about_it() {
        let core = core_with_empty_state();
        let git = ScriptedGit::new(vec![(
            "worktree list",
            failed("fatal: not a git repository (or any of the parent directories): .git"),
        )]);

        let mut out = Vec::new();
        let code = run_add(&core, &git, REFUSED, add_options("feat/x", "D:/trees/feat-x"), &mut out);
        let message = answer(&out)["error"].as_str().unwrap().to_string();

        assert_eq!(code, 1);
        assert!(message.contains("no git repository at D:/work/proj"));
        assert!(message.contains("git init"));
    }

    #[test]
    fn a_refused_worktree_adopts_nothing() {
        let core = core_with_empty_state();
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", failed("")),
            ("worktree add", failed("fatal: 'feat/x' is already checked out at 'D:/other'")),
        ]);

        let mut out = Vec::new();
        let code = run_add(&core, &git, REFUSED, add_options("feat/x", "D:/trees/feat-x"), &mut out);

        assert_eq!(code, 1);
        assert!(answer(&out)["error"].as_str().unwrap().contains("already checked out"));
        assert!(core.pet_by_working_directory("D:/trees/feat-x").unwrap().is_none());
    }

    #[test]
    fn rm_deletes_the_worktree_and_the_pet_bound_to_it() {
        let core = core_with_empty_state();
        let pet_id = hatch_at(&core, WORKTREE);
        let git = removing_git();

        let mut out = Vec::new();
        let code = run_rm(&core, &git, REFUSED, remove_options(WORKTREE), &mut out);

        assert_eq!(code, 0);
        assert!(git.ran(&format!("worktree remove {WORKTREE}")));
        assert_eq!(answer(&out)["removed"]["pet"], pet_id);
        assert!(core.pet_by_working_directory(WORKTREE).unwrap().is_none());
    }

    #[test]
    fn rm_of_a_worktree_with_no_pet_is_not_a_failure() {
        let core = core_with_empty_state();

        let mut out = Vec::new();
        let code = run_rm(&core, &removing_git(), REFUSED, remove_options(WORKTREE), &mut out);

        assert_eq!(code, 0);
        assert_eq!(answer(&out)["removed"]["pet"], Value::Null);
        assert_eq!(answer(&out)["petError"], Value::Null);
    }

    #[test]
    fn rm_keeps_the_pet_when_asked_to() {
        let core = core_with_empty_state();
        hatch_at(&core, WORKTREE);
        let options = RemoveOptions { keep_pet: true, ..remove_options(WORKTREE) };

        assert_eq!(run_rm(&core, &removing_git(), REFUSED, options, &mut Vec::new()), 0);
        assert!(core.pet_by_working_directory(WORKTREE).unwrap().is_some());
    }

    #[test]
    fn rm_refuses_to_delete_the_folder_it_is_running_in() {
        let core = core_with_empty_state();
        let git = removing_git();
        let options = RemoveOptions {
            // A shell sitting inside the worktree, spelled the other way round:
            // the comparison folds separators and case the way the core does.
            process_cwd: "d:\\work\\proj-worktrees\\feat-login\\src".to_string(),
            ..remove_options(WORKTREE)
        };

        let mut out = Vec::new();
        let code = run_rm(&core, &git, REFUSED, options, &mut out);

        assert_eq!(code, 1);
        assert!(answer(&out)["error"].as_str().unwrap().contains("cd out of"));
        assert!(!git.ran("worktree remove"));
    }

    #[test]
    fn ls_joins_every_worktree_with_the_pet_bound_to_it() {
        let core = core_with_empty_state();
        let pet_id = hatch_at(&core, WORKTREE);
        let git = ScriptedGit::new(vec![("worktree list", succeeded(LISTING))]);

        let mut out = Vec::new();
        let code = run_ls(&core, &git, "D:/work/proj", &mut out);
        let answer = answer(&out);
        let worktrees = answer["worktrees"].as_array().expect("a list of worktrees");

        assert_eq!(code, 0);
        assert_eq!(answer["repo"], "D:/work/proj");
        assert_eq!(worktrees.len(), 2);
        // The repository itself has no pet here; the worktree does.
        assert_eq!(worktrees[0]["main"], true);
        assert_eq!(worktrees[0]["pet"], Value::Null);
        assert_eq!(worktrees[1]["branch"], "feat/login");
        assert_eq!(worktrees[1]["pet"]["id"], pet_id);
    }
}
