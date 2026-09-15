//! # pets-driven-git
//!
//! Git worktree operations for pets-driven: where a worktree goes, what git is
//! asked to do, and which requests are refused before git is asked at all.
//!
//! Nothing here is persisted. Git already records which folders are worktrees
//! of which repository (`git worktree list`), so this crate reads that rather
//! than keeping a second registry in `state.v1.json` — a worktree created
//! outside pets-driven is still seen, and the pet a caller binds to the new
//! folder afterwards is an ordinary pet with an ordinary folder.
//!
//! The desktop app and the `pdd` CLI both go through here, so the two refuse
//! the same requests for the same reasons; what differs is only how each one
//! reports the answer. Every git call goes through the [`Git`] seam, so callers
//! test against [`testing::ScriptedGit`] instead of a real repository.

pub mod testing;

use std::process::Command;

use pets_driven_core::comparable_path;
use serde::Serialize;

/// An explicit home for new worktrees, so someone who wants them all in one
/// place does not name a folder every time.
pub const WORKTREE_ROOT_ENV: &str = "PETS_DRIVEN_WORKTREE_ROOT";

/// The suffix on the folder new worktrees land beside the repository in, when
/// neither an explicit path nor [`WORKTREE_ROOT_ENV`] says otherwise.
const WORKTREE_FOLDER_SUFFIX: &str = "-worktrees";

/// The slug a branch whose every character is unusable in a folder name falls
/// back to, so a path is always produced.
const FALLBACK_SLUG: &str = "worktree";

// ---- The git seam ----------------------------------------------------------

/// What one git invocation produced.
#[derive(Debug, Clone)]
pub struct GitOutput {
    pub status: i32,
    pub stdout: String,
    pub stderr: String,
}

impl GitOutput {
    pub fn succeeded(&self) -> bool {
        self.status == 0
    }

    /// Git's own account of a failure, which is on stderr for a `fatal:` and on
    /// stdout for a few porcelain refusals. Falls back to the exit code so an
    /// error is never reported as an empty string.
    pub fn failure_message(&self) -> String {
        for stream in [&self.stderr, &self.stdout] {
            let text = stream.trim();
            if !text.is_empty() {
                return text.to_string();
            }
        }

        format!("git exited with status {}", self.status)
    }
}

/// Running one git command in a folder.
pub trait Git {
    fn run(&self, dir: &str, args: &[&str]) -> Result<GitOutput, String>;
}

/// The real thing: `git -C <dir> <args…>`.
pub struct SystemGit;

impl Git for SystemGit {
    fn run(&self, dir: &str, args: &[&str]) -> Result<GitOutput, String> {
        let mut command = Command::new("git");
        command.arg("-C").arg(dir).args(args);

        // CREATE_NO_WINDOW: the desktop app is a GUI process, so every git call
        // would otherwise flash a console window open. Output is captured and
        // stdin is null, so the CLI loses nothing by it either.
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let output = command
            .output()
            .map_err(|error| match error.kind() {
                std::io::ErrorKind::NotFound => {
                    "git was not found on PATH — install it, or open a shell that has it".to_string()
                }
                _ => format!("could not run git: {error}"),
            })?;

        Ok(GitOutput {
            // A process killed by a signal reports no code; -1 stands for "not
            // zero" so the caller treats it as the failure it is.
            status: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        })
    }
}

/// Run git for its output: the trimmed stdout on success, git's own message on
/// failure.
fn capture(git: &dyn Git, dir: &str, args: &[&str]) -> Result<String, String> {
    let output = git.run(dir, args)?;

    if output.succeeded() {
        Ok(output.stdout.trim().to_string())
    } else {
        Err(output.failure_message())
    }
}

// ---- Reading the repository ------------------------------------------------

/// One entry of `git worktree list --porcelain`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeEntry {
    pub path: String,
    pub head: Option<String>,
    /// The short branch name (`refs/heads/x` → `x`); `None` when the worktree
    /// is detached or bare.
    pub branch: Option<String>,
    pub bare: bool,
    pub detached: bool,
    pub locked: bool,
    /// Whether this is the repository's own worktree — the folder the `.git`
    /// directory lives in, which cannot be removed as a worktree.
    pub main: bool,
}

impl WorktreeEntry {
    fn new(path: String, main: bool) -> Self {
        Self { path, head: None, branch: None, bare: false, detached: false, locked: false, main }
    }
}

/// Parse `git worktree list --porcelain`. Entries are blank-line separated and
/// open with a `worktree <path>` line; every later key belongs to the entry
/// above it, and an unknown key (a future git printing more) is ignored rather
/// than treated as a new entry. The first entry is the main worktree.
pub fn parse_worktree_list(porcelain: &str) -> Vec<WorktreeEntry> {
    let mut entries: Vec<WorktreeEntry> = Vec::new();

    for line in porcelain.lines() {
        let line = line.trim_end();
        let (key, value) = match line.split_once(' ') {
            Some((key, value)) => (key, value.trim()),
            None => (line, ""),
        };

        if key == "worktree" {
            entries.push(WorktreeEntry::new(value.to_string(), entries.is_empty()));
            continue;
        }

        let Some(entry) = entries.last_mut() else { continue };

        match key {
            "HEAD" => entry.head = Some(value.to_string()),
            "branch" => entry.branch = Some(short_branch(value)),
            "bare" => entry.bare = true,
            "detached" => entry.detached = true,
            // `locked` may carry a reason; the flag is what a caller acts on.
            "locked" => entry.locked = true,
            _ => {}
        }
    }

    entries
}

/// `refs/heads/feat/x` → `feat/x`, leaving an already-short name alone.
fn short_branch(reference: &str) -> String {
    reference.strip_prefix("refs/heads/").unwrap_or(reference).to_string()
}

/// Every worktree of the repository `dir` belongs to, the main one first.
///
/// This is also the "is this a git repository at all" check, and the one place
/// that answers it: the folder a pet is bound to is an ordinary folder and
/// often has no git in it, so the failure names the folder that was looked at
/// and keeps the account git gave. Git's message is not parsed — a missing
/// folder, a folder outside any repository, and an unreadable one all mean the
/// same thing here, and only git's wording (which follows the user's locale)
/// differs.
pub fn list_worktrees(git: &dyn Git, dir: &str) -> Result<Vec<WorktreeEntry>, String> {
    let listing = capture(git, dir, &["worktree", "list", "--porcelain"])
        .map_err(|message| format!("no git repository at {dir} (git: {message})"))?;
    let entries = parse_worktree_list(&listing);

    if entries.is_empty() {
        return Err(format!("no git repository at {dir}"));
    }

    Ok(entries)
}

/// The repository's main worktree — the folder the `.git` directory itself
/// lives in. Every worktree of a repository lists them all, so this resolves
/// the same way whether `dir` is the repository, one of its worktrees, or a
/// folder somewhere inside either.
pub fn main_worktree(git: &dyn Git, dir: &str) -> Result<String, String> {
    Ok(list_worktrees(git, dir)?.swap_remove(0).path)
}

/// The root of the worktree `dir` sits in, as git spells it — which is the path
/// a caller looks a pet up by, and the one to name in a refusal.
pub fn worktree_toplevel(git: &dyn Git, dir: &str) -> Result<String, String> {
    capture(git, dir, &["rev-parse", "--show-toplevel"])
}

/// Whether `branch` already exists locally. A missing branch is a normal
/// answer, not an error: `--verify --quiet` exits non-zero and says nothing.
fn branch_exists(git: &dyn Git, repo: &str, branch: &str) -> Result<bool, String> {
    let reference = format!("refs/heads/{branch}");
    let output = git.run(repo, &["rev-parse", "--verify", "--quiet", &reference])?;

    Ok(output.succeeded())
}

/// Whether a worktree holds uncommitted work — tracked changes or untracked
/// files, both of which removing it would throw away.
fn is_dirty(git: &dyn Git, path: &str) -> Result<bool, String> {
    Ok(!capture(git, path, &["status", "--porcelain"])?.trim().is_empty())
}

// ---- Choosing the folder ---------------------------------------------------

/// The worktree home from the environment, when one is set to something that is
/// not blank. Callers pass it to [`plan_worktree`] rather than it being read
/// there, so the choice is visible in the call and testable without the
/// environment.
pub fn worktree_root_from_env() -> Option<String> {
    std::env::var(WORKTREE_ROOT_ENV).ok().filter(|value| !value.trim().is_empty())
}

/// Everything above the last segment of `path`, or `None` when there is nothing
/// above it. Both separators are split on: a path reaches us as a plain string
/// and may be typed either way on Windows.
fn parent_path(path: &str) -> Option<&str> {
    let trimmed = path.trim_end_matches(['/', '\\']);
    let (parent, _) = trimmed.rsplit_once(['/', '\\'])?;

    (!parent.is_empty()).then_some(parent)
}

/// The last segment of `path`, which for a repository is its own name.
fn folder_name(path: &str) -> &str {
    path.rsplit(['/', '\\']).find(|segment| !segment.is_empty()).unwrap_or(path)
}

/// A branch name as a single folder name: `feat/login` → `feat-login`. Anything
/// a path cannot carry (separators, colons, wildcards, spaces) folds to a single
/// dash, so a slug never opens a second folder level or names a drive.
pub fn branch_slug(branch: &str) -> String {
    let mut slug = String::with_capacity(branch.len());

    for character in branch.chars() {
        let mapped = if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
            character
        } else {
            '-'
        };

        if mapped == '-' && (slug.is_empty() || slug.ends_with('-')) {
            continue;
        }

        slug.push(mapped);
    }

    let slug = slug.trim_end_matches('-');

    // A name of nothing but dots would be `.` or `..`, which names a folder
    // that already exists rather than a new one.
    if slug.is_empty() || slug.chars().all(|character| character == '.') {
        return FALLBACK_SLUG.to_string();
    }

    slug.to_string()
}

/// Where a worktree lands when no folder was named: under `root` when one is
/// given, otherwise in a `<repo>-worktrees` folder beside the repository. Both
/// keep one folder per repository, so two repositories that each branch `main`
/// never collide.
pub fn default_worktree_path(root: Option<&str>, main_worktree: &str, branch: &str) -> String {
    let repository = folder_name(main_worktree);
    let slug = branch_slug(branch);

    match root {
        Some(root) => format!("{}/{repository}/{slug}", root.trim_end_matches(['/', '\\'])),
        None => {
            // A repository with nothing above it (a bare name) puts its
            // worktrees beside itself in the current directory.
            let parent = parent_path(main_worktree).unwrap_or(".");
            format!("{parent}/{repository}{WORKTREE_FOLDER_SUFFIX}/{slug}")
        }
    }
}

/// Whether a folder already holds something. `git worktree add` refuses a
/// non-empty target itself, but only after we have chosen the path on the
/// user's behalf — naming the folder that is in the way is more use than git's
/// message about a folder they never typed.
pub fn is_occupied(path: &str) -> bool {
    std::fs::read_dir(path).map(|mut entries| entries.next().is_some()).unwrap_or(false)
}

/// Whether `folder` is `parent` or sits inside it, compared the way the core
/// compares Working Directories (separators folded, case ignored).
pub fn is_inside(parent: &str, folder: &str) -> bool {
    let parent = comparable_path(parent);
    let folder = comparable_path(folder);

    folder == parent || folder.starts_with(&format!("{parent}\\"))
}

// ---- Adding a worktree -----------------------------------------------------

/// What adding a worktree for a branch would do, worked out without changing
/// anything. The desktop shows it as a preview while the user types; the CLI
/// runs straight on to [`add_worktree`].
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreePlan {
    /// The repository the worktree branches from — always its main worktree,
    /// however deep inside it the caller pointed.
    pub repo: String,
    /// The folder the worktree will occupy.
    pub path: String,
    pub branch: String,
    /// Whether the branch already exists, in which case it is checked out as it
    /// stands rather than created.
    pub branch_exists: bool,
    /// Whether something is already in `path`, which add refuses.
    pub path_occupied: bool,
}

/// Work out where a worktree for `branch` would go. `path` overrides the
/// derived folder; `root` is the configured worktree home, if any.
pub fn plan_worktree(
    git: &dyn Git,
    repo_dir: &str,
    branch: &str,
    path: Option<&str>,
    root: Option<&str>,
) -> Result<WorktreePlan, String> {
    let branch = branch.trim();
    if branch.is_empty() {
        return Err("name the branch the worktree should check out".to_string());
    }

    let repo = main_worktree(git, repo_dir)?;
    let path = match path {
        Some(path) if !path.trim().is_empty() => path.trim().to_string(),
        _ => default_worktree_path(root, &repo, branch),
    };

    Ok(WorktreePlan {
        branch_exists: branch_exists(git, &repo, branch)?,
        path_occupied: is_occupied(&path),
        repo,
        path,
        branch: branch.to_string(),
    })
}

/// A worktree that now exists on disk.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddedWorktree {
    pub path: String,
    pub branch: String,
    pub repo: String,
    /// Whether the branch was created, so a caller can tell starting work from
    /// picking work up.
    pub created_branch: bool,
}

/// Create the worktree `plan` describes. `base` is what a newly created branch
/// starts at; a branch that already exists has nothing to start, so passing one
/// is refused rather than silently ignored.
pub fn add_worktree(
    git: &dyn Git,
    plan: &WorktreePlan,
    base: Option<&str>,
) -> Result<AddedWorktree, String> {
    if plan.path_occupied || is_occupied(&plan.path) {
        return Err(format!(
            "{} already holds files — choose another folder for the worktree",
            plan.path
        ));
    }

    let base = base.filter(|base| !base.trim().is_empty());

    if plan.branch_exists && base.is_some() {
        return Err(format!("branch {} already exists, so it has nothing to start at", plan.branch));
    }

    let arguments = add_arguments(&plan.path, &plan.branch, base, plan.branch_exists);
    let borrowed: Vec<&str> = arguments.iter().map(String::as_str).collect();
    let output = git.run(&plan.repo, &borrowed)?;

    if !output.succeeded() {
        return Err(output.failure_message());
    }

    Ok(AddedWorktree {
        path: plan.path.clone(),
        branch: plan.branch.clone(),
        repo: plan.repo.clone(),
        created_branch: !plan.branch_exists,
    })
}

/// The `git worktree add` line: a branch that does not exist yet is created
/// (at `base` when one is named), and one that does is checked out as it
/// stands.
fn add_arguments(path: &str, branch: &str, base: Option<&str>, existing: bool) -> Vec<String> {
    let mut arguments = vec!["worktree".to_string(), "add".to_string(), path.to_string()];

    if existing {
        arguments.push(branch.to_string());
        return arguments;
    }

    arguments.push("-b".to_string());
    arguments.push(branch.to_string());

    if let Some(base) = base {
        arguments.push(base.to_string());
    }

    arguments
}

// ---- Removing a worktree ---------------------------------------------------

/// A worktree that is no longer on disk.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovedWorktree {
    /// The folder that was removed, as git spelled it — which is the path a
    /// caller looks a pet up by.
    pub path: String,
    pub repo: String,
}

/// What removing the worktree a folder sits in would take away, worked out
/// without removing anything.
///
/// The question this answers is asked *of a folder someone is about to lose* —
/// the app asks it before deleting the pet standing in that folder — so every
/// reason the removal would be refused is a field here rather than an error:
/// the repository itself is not removable, and uncommitted work is only thrown
/// away on purpose. A folder that is in no git repository at all is still an
/// error, because then there is no worktree to ask about.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeRemoval {
    /// The worktree's root, as git spells it — the path to pass to
    /// [`remove_worktree`], and the one a pet is looked up by.
    pub path: String,
    pub repo: String,
    /// The short branch name; `None` when the worktree is detached or bare.
    pub branch: Option<String>,
    /// Whether `path` is the repository's own worktree, which cannot be
    /// removed as a worktree — nothing else here matters when it is true.
    pub main: bool,
    /// Whether the folder holds uncommitted work, which removing throws away
    /// and so takes a forced removal.
    pub dirty: bool,
    pub locked: bool,
}

/// Describe removing the worktree `dir` sits in, running no removal.
///
/// Deliberately separate from [`remove_worktree`]'s own checks rather than
/// shared with them: this one always looks (a caller showing the answer wants
/// to know about uncommitted work even when it would force past it), and the
/// removal re-checks for itself, because what a preview said and what is true
/// at the moment of removal are not the same thing.
pub fn plan_removal(git: &dyn Git, dir: &str) -> Result<WorktreeRemoval, String> {
    let entries = list_worktrees(git, dir)?;
    let repo = entries[0].path.clone();
    let path = worktree_toplevel(git, dir)?;

    // The same test the removal itself makes, so both call the same folder the
    // repository: git prints the main worktree first, and a folder inside it
    // that is not a worktree of its own resolves to it.
    let main = is_inside(&path, &repo);
    let entry = entries
        .iter()
        .find(|entry| is_inside(&entry.path, &path) && is_inside(&path, &entry.path));

    Ok(WorktreeRemoval {
        branch: entry.and_then(|entry| entry.branch.clone()),
        locked: entry.is_some_and(|entry| entry.locked),
        dirty: is_dirty(git, &path)?,
        path,
        repo,
        main,
    })
}

/// Remove the worktree at `dir`. Refuses before touching anything when the
/// target is the repository itself, or when it holds uncommitted work and
/// `force` was not given (which is also passed on to git).
pub fn remove_worktree(git: &dyn Git, dir: &str, force: bool) -> Result<RemovedWorktree, String> {
    let repo = main_worktree(git, dir)?;
    let folder = worktree_toplevel(git, dir)?;

    if is_inside(&folder, &repo) {
        return Err(format!("{folder} is the repository itself, not one of its worktrees"));
    }

    if !force && is_dirty(git, &folder)? {
        return Err(format!(
            "{folder} has uncommitted changes — commit them, or remove it anyway to throw them away"
        ));
    }

    let mut arguments = vec!["worktree", "remove"];
    if force {
        arguments.push("--force");
    }
    arguments.push(&folder);

    let output = git.run(&repo, &arguments)?;
    if !output.succeeded() {
        return Err(output.failure_message());
    }

    Ok(RemovedWorktree { path: folder, repo })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{failed, succeeded, ScriptedGit, LISTING};

    fn plan(git: &dyn Git, branch: &str, path: Option<&str>) -> WorktreePlan {
        plan_worktree(git, "D:/work/proj", branch, path, None).expect("the repository resolves")
    }

    #[test]
    fn parse_worktree_list_reads_each_entry_and_its_keys() {
        let entries = parse_worktree_list(LISTING);

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].path, "D:/work/proj");
        assert_eq!(entries[0].branch, Some("main".to_string()));
        // The first entry is the repository's own worktree.
        assert!(entries[0].main);
        assert!(!entries[1].main);
        assert_eq!(entries[1].path, "D:/work/proj-worktrees/feat-login");
        // The ref is shortened, keeping the slashes inside the branch name.
        assert_eq!(entries[1].branch, Some("feat/login".to_string()));
        assert_eq!(entries[1].head, Some("def456".to_string()));
    }

    #[test]
    fn parse_worktree_list_reads_the_flag_lines() {
        let entries = parse_worktree_list(
            "worktree D:/bare\nbare\n\nworktree D:/loose\nHEAD abc\ndetached\nlocked in use\n",
        );

        assert!(entries[0].bare);
        assert!(entries[1].detached);
        assert_eq!(entries[1].branch, None);
        // `locked` carries a reason; the flag is what a caller acts on.
        assert!(entries[1].locked);
    }

    #[test]
    fn branch_slug_folds_everything_a_folder_name_cannot_carry() {
        assert_eq!(branch_slug("feat/login"), "feat-login");
        assert_eq!(branch_slug("release-1.2"), "release-1.2");
        // Runs collapse and the edges are trimmed, so no folder is named `-`
        // or opens a level of its own.
        assert_eq!(branch_slug("feat//a b"), "feat-a-b");
        assert_eq!(branch_slug("/leading"), "leading");
        // A name of nothing but dots would resolve to a folder that exists.
        assert_eq!(branch_slug(".."), FALLBACK_SLUG);
        assert_eq!(branch_slug("///"), FALLBACK_SLUG);
    }

    #[test]
    fn default_worktree_path_puts_a_worktree_beside_its_repository() {
        assert_eq!(
            default_worktree_path(None, "D:/work/proj", "feat/login"),
            "D:/work/proj-worktrees/feat-login"
        );
    }

    #[test]
    fn default_worktree_path_keeps_one_folder_per_repository_under_a_root() {
        // Two repositories that each branch `main` must not land in the same
        // folder, so the repository name stays in the path.
        assert_eq!(
            default_worktree_path(Some("D:/trees/"), "D:/work/proj", "main"),
            "D:/trees/proj/main"
        );
        assert_eq!(
            default_worktree_path(Some("D:/trees"), "D:/work/other", "main"),
            "D:/trees/other/main"
        );
    }

    #[test]
    fn a_plan_resolves_the_repository_the_folder_and_the_branch() {
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", failed("")),
        ]);

        // Pointed at a folder deep inside the repository, the plan still names
        // the repository itself.
        let planned = plan_worktree(&git, "D:/work/proj/src/app", "feat/x", None, None).unwrap();

        assert_eq!(planned.repo, "D:/work/proj");
        assert_eq!(planned.path, "D:/work/proj-worktrees/feat-x");
        assert!(!planned.branch_exists);
    }

    #[test]
    fn a_plan_reports_a_branch_that_already_exists() {
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", succeeded("abc123")),
        ]);

        assert!(plan(&git, "feat/x", None).branch_exists);
    }

    #[test]
    fn a_plan_needs_a_branch_name() {
        let git = ScriptedGit::new(vec![("worktree list", succeeded(LISTING))]);
        let refusal = plan_worktree(&git, "D:/work/proj", "   ", None, None);

        assert!(refusal.unwrap_err().contains("name the branch"));
        // The refusal costs no git call at all.
        assert!(!git.ran("worktree list"));
    }

    #[test]
    fn add_creates_a_branch_that_does_not_exist_yet() {
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", failed("")),
            ("worktree add", succeeded("")),
        ]);
        let planned = plan(&git, "feat/x", Some("D:/trees/feat-x"));
        let added = add_worktree(&git, &planned, None).expect("git accepted the worktree");

        assert!(git.ran("worktree add D:/trees/feat-x -b feat/x"));
        assert!(added.created_branch);
        assert_eq!(added.path, "D:/trees/feat-x");
        assert_eq!(added.repo, "D:/work/proj");
    }

    #[test]
    fn add_checks_out_an_existing_branch_instead_of_creating_it() {
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", succeeded("abc123")),
            ("worktree add", succeeded("")),
        ]);
        let planned = plan(&git, "feat/x", Some("D:/trees/feat-x"));
        let added = add_worktree(&git, &planned, None).expect("git accepted the worktree");

        assert!(git.ran("worktree add D:/trees/feat-x feat/x"));
        assert!(!git.ran("worktree add D:/trees/feat-x -b"));
        assert!(!added.created_branch);
    }

    #[test]
    fn add_starts_a_new_branch_at_the_base_it_was_given() {
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", failed("")),
            ("worktree add", succeeded("")),
        ]);
        let planned = plan(&git, "feat/x", Some("D:/trees/feat-x"));

        add_worktree(&git, &planned, Some("origin/main")).expect("git accepted the worktree");
        assert!(git.ran("worktree add D:/trees/feat-x -b feat/x origin/main"));
        // A blank base is no base at all, not an empty argument passed to git.
        add_worktree(&git, &planned, Some("  ")).expect("git accepted the worktree");
        assert!(git.ran("worktree add D:/trees/feat-x -b feat/x"));
    }

    #[test]
    fn add_refuses_a_base_for_a_branch_that_already_exists() {
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", succeeded("abc123")),
            ("worktree add", succeeded("")),
        ]);
        let planned = plan(&git, "feat/x", Some("D:/trees/feat-x"));
        let refusal = add_worktree(&git, &planned, Some("origin/main"));

        assert!(refusal.unwrap_err().contains("nothing to start at"));
        assert!(!git.ran("worktree add"));
    }

    #[test]
    fn add_reports_the_failure_git_gave() {
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", failed("")),
            ("worktree add", failed("fatal: 'feat/x' is already checked out at 'D:/other'")),
        ]);
        let planned = plan(&git, "feat/x", Some("D:/trees/feat-x"));
        let refusal = add_worktree(&git, &planned, None);

        assert!(refusal.unwrap_err().contains("already checked out"));
    }

    #[test]
    fn a_removal_plan_names_the_branch_that_would_go_with_the_folder() {
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --show-toplevel", succeeded("D:/work/proj-worktrees/feat-login")),
            ("status --porcelain", succeeded("")),
        ]);
        let removal = plan_removal(&git, "D:/work/proj-worktrees/feat-login/src")
            .expect("the worktree resolves");

        assert_eq!(removal.path, "D:/work/proj-worktrees/feat-login");
        assert_eq!(removal.repo, "D:/work/proj");
        assert_eq!(removal.branch, Some("feat/login".to_string()));
        assert!(!removal.main);
        assert!(!removal.dirty);
        // Nothing is removed by asking.
        assert!(!git.ran("worktree remove"));
    }

    #[test]
    fn a_removal_plan_reports_uncommitted_work_instead_of_refusing_it() {
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --show-toplevel", succeeded("D:/work/proj-worktrees/feat-login")),
            ("status --porcelain", succeeded(" M src/lib.rs
")),
        ]);
        let removal = plan_removal(&git, "D:/work/proj-worktrees/feat-login")
            .expect("the worktree resolves");

        // The refusal is the caller's to make: it is asking so it can offer the
        // choice, not so it can be stopped.
        assert!(removal.dirty);
    }

    #[test]
    fn a_removal_plan_calls_the_repository_itself_what_it_is() {
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --show-toplevel", succeeded("D:/work/proj")),
            ("status --porcelain", succeeded("")),
        ]);
        let removal = plan_removal(&git, "D:/work/proj").expect("the repository resolves");

        assert!(removal.main);
        assert_eq!(removal.branch, Some("main".to_string()));
    }

    #[test]
    fn remove_takes_the_worktree_and_reports_the_repository_behind_it() {
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --show-toplevel", succeeded("D:/work/proj-worktrees/feat-login")),
            ("status --porcelain", succeeded("")),
            ("worktree remove", succeeded("")),
        ]);
        let removed = remove_worktree(&git, "D:/work/proj-worktrees/feat-login", false)
            .expect("git accepted the removal");

        assert!(git.ran("worktree remove D:/work/proj-worktrees/feat-login"));
        assert_eq!(removed.path, "D:/work/proj-worktrees/feat-login");
        assert_eq!(removed.repo, "D:/work/proj");
    }

    #[test]
    fn remove_refuses_the_repository_itself() {
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --show-toplevel", succeeded("D:/work/proj")),
        ]);
        let refusal = remove_worktree(&git, "D:/work/proj", false);

        assert!(refusal.unwrap_err().contains("the repository itself"));
        assert!(!git.ran("worktree remove"));
    }

    #[test]
    fn remove_refuses_uncommitted_work_until_it_is_forced() {
        let replies = || {
            ScriptedGit::new(vec![
                ("worktree list", succeeded(LISTING)),
                ("rev-parse --show-toplevel", succeeded("D:/work/proj-worktrees/feat-login")),
                ("status --porcelain", succeeded(" M src/lib.rs\n")),
                ("worktree remove", succeeded("")),
            ])
        };

        let git = replies();
        let refusal = remove_worktree(&git, "D:/work/proj-worktrees/feat-login", false);
        assert!(refusal.unwrap_err().contains("uncommitted changes"));
        assert!(!git.ran("worktree remove"));

        // Forced, the throwaway is git's to carry out too.
        let forced = replies();
        remove_worktree(&forced, "D:/work/proj-worktrees/feat-login", true)
            .expect("git accepted the removal");
        assert!(forced.ran("worktree remove --force"));
    }

    /// The folder a pet is bound to is an ordinary folder and often has no git
    /// in it, so the refusal names the folder that was looked at — git's own
    /// message names only `.git`.
    #[test]
    fn a_folder_with_no_git_in_it_is_named_in_the_refusal() {
        let git = ScriptedGit::new(vec![(
            "worktree list",
            failed("fatal: not a git repository (or any of the parent directories): .git"),
        )]);
        let refusal = list_worktrees(&git, "D:/pet-folder").unwrap_err();

        assert!(refusal.contains("no git repository at D:/pet-folder"));
        // Git's own account is kept: a missing folder and a folder outside any
        // repository read differently there.
        assert!(refusal.contains("not a git repository"));
    }

    /// A listing that parses to nothing is the same answer as a failed one: git
    /// prints an entry for every repository it can read.
    #[test]
    fn an_empty_listing_is_reported_as_no_repository() {
        let git = ScriptedGit::new(vec![("worktree list", succeeded(""))]);

        assert!(list_worktrees(&git, "D:/pet-folder")
            .unwrap_err()
            .contains("no git repository at D:/pet-folder"));
    }
}
