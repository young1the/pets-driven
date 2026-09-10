//! `pdd worktree`: a git worktree and the pet that lives in it.
//!
//! Nothing here is persisted beyond the pet itself. Git already knows which
//! folders are worktrees of which repository (`git worktree list`), so the
//! commands ask git rather than keeping a second registry in `state.v1.json` —
//! a worktree created outside pets-driven still lists, and a pet bound to a
//! worktree folder is an ordinary pet with an ordinary folder.
//!
//! Every git call goes through the [`Git`] seam so the commands can be tested
//! against a scripted repository instead of a real one.

use std::io::Write;
use std::process::Command;

use pets_driven_core::{comparable_path, PetsDrivenCore, WorkingDirectoryPath};
use serde_json::Value;

use crate::{error_json, folder_name, hatch_pet, hatch_request, print_json, PetOptions};

/// An explicit home for new worktrees, so someone who wants them all in one
/// place does not pass `--path` every time.
const WORKTREE_ROOT_ENV: &str = "PETS_DRIVEN_WORKTREE_ROOT";

/// The suffix on the folder new worktrees land beside the repository in, when
/// neither `--path` nor [`WORKTREE_ROOT_ENV`] says otherwise.
const WORKTREE_FOLDER_SUFFIX: &str = "-worktrees";

/// The slug a branch whose every character is unusable in a folder name falls
/// back to, so a path is always produced.
const FALLBACK_SLUG: &str = "worktree";

// ---- The git seam ----------------------------------------------------------

/// What one git invocation produced.
#[derive(Debug, Clone)]
pub(crate) struct GitOutput {
    pub(crate) status: i32,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
}

impl GitOutput {
    fn succeeded(&self) -> bool {
        self.status == 0
    }

    /// Git's own account of a failure, which is on stderr for a `fatal:` and on
    /// stdout for a few porcelain refusals. Falls back to the exit code so an
    /// error is never reported as an empty string.
    fn failure_message(&self) -> String {
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
pub(crate) trait Git {
    fn run(&self, dir: &str, args: &[&str]) -> Result<GitOutput, String>;
}

/// The real thing: `git -C <dir> <args…>`.
pub(crate) struct SystemGit;

impl Git for SystemGit {
    fn run(&self, dir: &str, args: &[&str]) -> Result<GitOutput, String> {
        let output = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
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
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct WorktreeEntry {
    pub(crate) path: String,
    pub(crate) head: Option<String>,
    /// The short branch name (`refs/heads/x` → `x`); `None` when the worktree
    /// is detached or bare.
    pub(crate) branch: Option<String>,
    pub(crate) bare: bool,
    pub(crate) detached: bool,
    pub(crate) locked: bool,
}

impl WorktreeEntry {
    fn new(path: String) -> Self {
        Self { path, head: None, branch: None, bare: false, detached: false, locked: false }
    }

    fn to_json(&self, pet: Value) -> Value {
        serde_json::json!({
            "path": self.path,
            "branch": self.branch,
            "head": self.head,
            "bare": self.bare,
            "detached": self.detached,
            "locked": self.locked,
            "pet": pet,
        })
    }
}

/// Parse `git worktree list --porcelain`. Entries are blank-line separated and
/// open with a `worktree <path>` line; every later key belongs to the entry
/// above it, and an unknown key (a future git printing more) is ignored rather
/// than treated as a new entry.
pub(crate) fn parse_worktree_list(porcelain: &str) -> Vec<WorktreeEntry> {
    let mut entries: Vec<WorktreeEntry> = Vec::new();

    for line in porcelain.lines() {
        let line = line.trim_end();
        let (key, value) = match line.split_once(' ') {
            Some((key, value)) => (key, value.trim()),
            None => (line, ""),
        };

        if key == "worktree" {
            entries.push(WorktreeEntry::new(value.to_string()));
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

/// Every worktree of the repository `dir` belongs to.
///
/// This is also the "is this a git repository at all" check, and the one place
/// that answers it: a pet's folder is an ordinary folder and often has no git in
/// it, so the failure names the folder that was looked at and keeps git's own
/// account of why. Git's message is not parsed — a missing folder, a folder
/// outside any repository, and an unreadable one all mean the same thing here,
/// and only git's wording (which follows the user's locale) differs.
fn worktree_entries(git: &dyn Git, dir: &str) -> Result<Vec<WorktreeEntry>, String> {
    let listing = capture(git, dir, &["worktree", "list", "--porcelain"])
        .map_err(|message| format!("no git repository at {dir} (git: {message})"))?;
    let entries = parse_worktree_list(&listing);

    if entries.is_empty() {
        return Err(format!("no git repository at {dir}"));
    }

    Ok(entries)
}

/// The repository's main worktree — the folder the `.git` directory itself
/// lives in. Every worktree of a repository lists them all, so this resolves the
/// same way whether `dir` is the repository, one of its worktrees, or a folder
/// somewhere inside either.
fn main_worktree(git: &dyn Git, dir: &str) -> Result<String, String> {
    Ok(worktree_entries(git, dir)?.swap_remove(0).path)
}

/// The root of the worktree `dir` sits in, as git spells it.
fn toplevel(git: &dyn Git, dir: &str) -> Result<String, String> {
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
/// files, both of which `worktree remove` would throw away.
fn is_dirty(git: &dyn Git, path: &str) -> Result<bool, String> {
    Ok(!capture(git, path, &["status", "--porcelain"])?.trim().is_empty())
}

// ---- Choosing the folder ---------------------------------------------------

/// The worktree home from the environment, when one is set to something that is
/// not blank.
fn worktree_root_override() -> Option<String> {
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

/// A branch name as a single folder name: `feat/login` → `feat-login`. Anything
/// a path cannot carry (separators, colons, wildcards, spaces) folds to a single
/// dash, so a slug never opens a second folder level or names a drive.
pub(crate) fn branch_slug(branch: &str) -> String {
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

/// Where a worktree lands when `--path` was not given: under `root` when the
/// environment names one, otherwise in a `<repo>-worktrees` folder beside the
/// repository. Both keep one folder per repository, so two repositories that
/// each branch `main` never collide.
pub(crate) fn default_worktree_path(root: Option<&str>, main_worktree: &str, branch: &str) -> String {
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
fn is_occupied(path: &str) -> bool {
    std::fs::read_dir(path).map(|mut entries| entries.next().is_some()).unwrap_or(false)
}

/// Whether `folder` is `parent` or sits inside it, compared the way the core
/// compares Working Directories (separators folded to `\`, case ignored).
fn is_inside(parent: &str, folder: &str) -> bool {
    let parent = comparable_path(parent);
    let folder = comparable_path(folder);

    folder == parent || folder.starts_with(&format!("{parent}\\"))
}

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
    // The likeliest folder to run this in is a pet's own, which is an ordinary
    // folder that may well have no git in it — so the refusal says what to do
    // about it rather than only what is wrong.
    let repository = main_worktree(git, &options.repo).map_err(|message| {
        format!("{message} — run `git init` there, or pass --repo to name the repository to branch from")
    })?;
    let path = match options.path {
        Some(path) => path,
        None => {
            default_worktree_path(worktree_root_override().as_deref(), &repository, &options.branch)
        }
    };

    if is_occupied(&path) {
        return Err(format!(
            "{path} already holds files — pass --path to put the worktree somewhere else"
        ));
    }

    let existing = branch_exists(git, &repository, &options.branch)?;

    if existing && options.base.is_some() {
        return Err(format!(
            "branch {} already exists, so --base has nothing to start",
            options.branch
        ));
    }

    let arguments = add_arguments(&path, &options.branch, options.base.as_deref(), existing);
    let borrowed: Vec<&str> = arguments.iter().map(String::as_str).collect();
    let output = git.run(&repository, &borrowed)?;

    if !output.succeeded() {
        return Err(output.failure_message());
    }

    // The worktree exists from here on, so a failed adoption is reported beside
    // it rather than as the command failing: the folder is the deliverable and
    // is not rolled back.
    let (pet, pet_error) = if options.no_pet {
        (Value::Null, Value::Null)
    } else {
        let folder = WorkingDirectoryPath::new(path.clone());
        let request = hatch_request(core, Some(folder), options.pet);

        match hatch_pet(core, request, origin) {
            Ok(pet) => (pet, Value::Null),
            Err(error) => (Value::Null, Value::String(error.to_string())),
        }
    };

    Ok(serde_json::json!({
        "ok": true,
        "worktree": {
            "path": path,
            "branch": options.branch,
            "repo": repository,
            // Whether the branch is new, so a caller can tell starting work
            // from picking work up.
            "createdBranch": !existing,
        },
        "pet": pet,
        "petError": pet_error,
    }))
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
    let repository = main_worktree(git, &options.path)?;
    let folder = toplevel(git, &options.path)?;

    if is_inside(&folder, &repository) {
        return Err(format!("{folder} is the repository itself, not one of its worktrees"));
    }

    // Windows keeps a handle on a shell's current directory, so a removal from
    // inside the folder fails halfway: git deletes what it can and leaves the
    // folder behind, still registered.
    if is_inside(&folder, &options.process_cwd) {
        return Err(format!(
            "cd out of {folder} before removing it — a shell sitting in a folder keeps it from being deleted"
        ));
    }

    if !options.force && is_dirty(git, &folder)? {
        return Err(format!(
            "{folder} has uncommitted changes — commit them, or pass --force to throw them away"
        ));
    }

    let mut arguments = vec!["worktree", "remove"];
    if options.force {
        arguments.push("--force");
    }
    arguments.push(&folder);

    let output = git.run(&repository, &arguments)?;
    if !output.succeeded() {
        return Err(output.failure_message());
    }

    // The folder is gone; a pet still pointing at it has nothing left to watch,
    // so a failed removal is reported beside the result rather than as the
    // command failing.
    let (pet, pet_error) = if options.keep_pet {
        (Value::Null, Value::Null)
    } else {
        match crate::remove_pet_bound_to(core, origin, &folder) {
            Ok(pet_id) => (pet_id.map_or(Value::Null, Value::String), Value::Null),
            Err(error) => (Value::Null, Value::String(error.to_string())),
        }
    };

    Ok(serde_json::json!({
        "ok": true,
        "removed": { "path": folder, "repo": repository, "pet": pet },
        "petError": pet_error,
    }))
}

// ---- ls --------------------------------------------------------------------

pub(crate) fn run_ls<O: Write>(core: &PetsDrivenCore, git: &dyn Git, repo: &str, out: &mut O) -> i32 {
    report(list(core, git, repo), out)
}

fn list(core: &PetsDrivenCore, git: &dyn Git, repo: &str) -> Result<Value, String> {
    let entries = worktree_entries(git, repo)?;
    let repository = entries[0].path.clone();

    let worktrees = entries
        .iter()
        .map(|entry| {
            // A state read that fails leaves the worktree listed with no pet:
            // the folders are the answer here, and the pet is the join.
            let pet = core
                .pet_by_working_directory(&entry.path)
                .ok()
                .flatten()
                .map_or(Value::Null, |view| view.into_value());

            entry.to_json(pet)
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
    use std::cell::RefCell;
    use std::sync::Arc;

    use pets_driven_core::MemoryStateRepository;

    /// A loopback port that refuses instantly, so the best-effort show/hide
    /// ping around an adoption fails fast without a running app.
    const REFUSED: &str = "127.0.0.1:1";

    /// A repository with one worktree beside it, as git prints it.
    const LISTING: &str = "worktree D:/work/proj\nHEAD abc123\nbranch refs/heads/main\n\n\
                           worktree D:/work/proj-worktrees/feat-login\nHEAD def456\n\
                           branch refs/heads/feat/login\n";

    /// A git that answers from a script instead of a repository, and remembers
    /// what it was asked. Replies are matched on the start of the joined
    /// arguments, so a test names as much of a command as it cares about.
    struct ScriptedGit {
        replies: Vec<(&'static str, GitOutput)>,
        calls: RefCell<Vec<String>>,
    }

    impl ScriptedGit {
        fn new(replies: Vec<(&'static str, GitOutput)>) -> Self {
            Self { replies, calls: RefCell::new(Vec::new()) }
        }

        /// Whether any call started with `prefix`.
        fn ran(&self, prefix: &str) -> bool {
            self.calls.borrow().iter().any(|call| call.starts_with(prefix))
        }
    }

    impl Git for ScriptedGit {
        fn run(&self, _dir: &str, args: &[&str]) -> Result<GitOutput, String> {
            let joined = args.join(" ");
            self.calls.borrow_mut().push(joined.clone());

            for (prefix, output) in &self.replies {
                if joined.starts_with(prefix) {
                    return Ok(output.clone());
                }
            }

            // An unscripted call is a test bug, so it fails loudly rather than
            // passing as an empty success.
            Ok(failed(&format!("unscripted git call: {joined}")))
        }
    }

    fn succeeded(stdout: &str) -> GitOutput {
        GitOutput { status: 0, stdout: stdout.to_string(), stderr: String::new() }
    }

    fn failed(stderr: &str) -> GitOutput {
        GitOutput { status: 1, stdout: String::new(), stderr: stderr.to_string() }
    }

    /// The replies every command needs before it gets to its own work: the
    /// repository listing, and the worktree's own root.
    fn repository_replies() -> Vec<(&'static str, GitOutput)> {
        vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --show-toplevel", succeeded("D:/work/proj-worktrees/feat-login")),
        ]
    }

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

    #[test]
    fn parse_worktree_list_reads_each_entry_and_its_keys() {
        let entries = parse_worktree_list(LISTING);

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].path, "D:/work/proj");
        assert_eq!(entries[0].branch, Some("main".to_string()));
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
    fn add_creates_the_branch_and_adopts_a_pet_for_the_new_folder() {
        let core = core_with_empty_state();
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            // `--verify --quiet` exits non-zero for a branch that does not exist.
            ("rev-parse --verify", failed("")),
            ("worktree add", succeeded("")),
        ]);

        let mut out = Vec::new();
        let code = run_add(&core, &git, REFUSED, add_options("feat/x", "D:/trees/feat-x"), &mut out);
        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");

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
    fn add_checks_out_an_existing_branch_instead_of_creating_it() {
        let core = core_with_empty_state();
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", succeeded("abc123")),
            ("worktree add", succeeded("")),
        ]);

        let mut out = Vec::new();
        let code = run_add(&core, &git, REFUSED, add_options("feat/x", "D:/trees/feat-x"), &mut out);

        assert_eq!(code, 0);
        assert!(git.ran("worktree add D:/trees/feat-x feat/x"));
        assert!(!git.ran("worktree add D:/trees/feat-x -b"));
        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");
        assert_eq!(answer["worktree"]["createdBranch"], false);
    }

    #[test]
    fn add_starts_a_new_branch_at_the_base_it_was_given() {
        let core = core_with_empty_state();
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", failed("")),
            ("worktree add", succeeded("")),
        ]);

        let options =
            AddOptions { base: Some("origin/main".to_string()), ..add_options("feat/x", "D:/trees/feat-x") };
        assert_eq!(run_add(&core, &git, REFUSED, options, &mut Vec::new()), 0);
        assert!(git.ran("worktree add D:/trees/feat-x -b feat/x origin/main"));
    }

    #[test]
    fn add_refuses_a_base_for_a_branch_that_already_exists() {
        let core = core_with_empty_state();
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", succeeded("abc123")),
        ]);

        let options =
            AddOptions { base: Some("origin/main".to_string()), ..add_options("feat/x", "D:/trees/feat-x") };
        let mut out = Vec::new();
        let code = run_add(&core, &git, REFUSED, options, &mut out);
        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");

        assert_eq!(code, 1);
        assert_eq!(answer["ok"], false);
        // Nothing was created: the contradiction is caught before git is asked.
        assert!(!git.ran("worktree add"));
    }

    #[test]
    fn add_reports_gits_own_failure_and_adopts_nothing() {
        let core = core_with_empty_state();
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", failed("")),
            ("worktree add", failed("fatal: 'feat/x' is already checked out at 'D:/other'")),
        ]);

        let mut out = Vec::new();
        let code = run_add(&core, &git, REFUSED, add_options("feat/x", "D:/trees/feat-x"), &mut out);
        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");

        assert_eq!(code, 1);
        assert!(answer["error"].as_str().unwrap().contains("already checked out"));
        assert!(core.pet_by_working_directory("D:/trees/feat-x").unwrap().is_none());
    }

    #[test]
    fn add_reports_a_failed_adoption_beside_the_worktree_it_made() {
        let core = core_with_empty_state();
        // The folder already has a pet, so the worktree succeeds and the
        // adoption cannot. The folder is the deliverable and is not rolled back.
        hatch_at(&core, "D:/trees/feat-x");

        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", failed("")),
            ("worktree add", succeeded("")),
        ]);

        let mut out = Vec::new();
        let code = run_add(&core, &git, REFUSED, add_options("feat/x", "D:/trees/feat-x"), &mut out);
        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");

        assert_eq!(code, 0);
        assert_eq!(answer["worktree"]["path"], "D:/trees/feat-x");
        assert_eq!(answer["pet"], Value::Null);
        assert!(answer["petError"].as_str().unwrap().contains("already has pet"));
    }

    #[test]
    fn add_without_a_pet_leaves_state_alone() {
        let core = core_with_empty_state();
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --verify", failed("")),
            ("worktree add", succeeded("")),
        ]);

        let options = AddOptions { no_pet: true, ..add_options("feat/x", "D:/trees/feat-x") };
        let mut out = Vec::new();
        assert_eq!(run_add(&core, &git, REFUSED, options, &mut out), 0);

        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");
        assert_eq!(answer["pet"], Value::Null);
        assert!(core.pet_by_working_directory("D:/trees/feat-x").unwrap().is_none());
    }

    #[test]
    fn rm_deletes_the_worktree_and_the_pet_bound_to_it() {
        let core = core_with_empty_state();
        let pet_id = hatch_at(&core, "D:/work/proj-worktrees/feat-login");

        let mut replies = repository_replies();
        replies.push(("status --porcelain", succeeded("")));
        replies.push(("worktree remove", succeeded("")));
        let git = ScriptedGit::new(replies);

        let mut out = Vec::new();
        let code = run_rm(
            &core,
            &git,
            REFUSED,
            remove_options("D:/work/proj-worktrees/feat-login"),
            &mut out,
        );
        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");

        assert_eq!(code, 0);
        assert!(git.ran("worktree remove D:/work/proj-worktrees/feat-login"));
        assert_eq!(answer["removed"]["pet"], pet_id);
        assert!(core.pet_by_working_directory("D:/work/proj-worktrees/feat-login").unwrap().is_none());
    }

    #[test]
    fn rm_of_a_worktree_with_no_pet_is_not_a_failure() {
        let core = core_with_empty_state();
        let mut replies = repository_replies();
        replies.push(("status --porcelain", succeeded("")));
        replies.push(("worktree remove", succeeded("")));
        let git = ScriptedGit::new(replies);

        let mut out = Vec::new();
        let code = run_rm(&core, &git, REFUSED, remove_options("D:/work/proj-worktrees/feat-login"), &mut out);
        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");

        assert_eq!(code, 0);
        assert_eq!(answer["removed"]["pet"], Value::Null);
        assert_eq!(answer["petError"], Value::Null);
    }

    #[test]
    fn rm_keeps_the_pet_when_asked_to() {
        let core = core_with_empty_state();
        hatch_at(&core, "D:/work/proj-worktrees/feat-login");

        let mut replies = repository_replies();
        replies.push(("status --porcelain", succeeded("")));
        replies.push(("worktree remove", succeeded("")));
        let git = ScriptedGit::new(replies);

        let options =
            RemoveOptions { keep_pet: true, ..remove_options("D:/work/proj-worktrees/feat-login") };
        assert_eq!(run_rm(&core, &git, REFUSED, options, &mut Vec::new()), 0);
        assert!(core.pet_by_working_directory("D:/work/proj-worktrees/feat-login").unwrap().is_some());
    }

    #[test]
    fn rm_refuses_the_repository_itself() {
        let core = core_with_empty_state();
        let git = ScriptedGit::new(vec![
            ("worktree list", succeeded(LISTING)),
            ("rev-parse --show-toplevel", succeeded("D:/work/proj")),
        ]);

        let mut out = Vec::new();
        let code = run_rm(&core, &git, REFUSED, remove_options("D:/work/proj"), &mut out);
        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");

        assert_eq!(code, 1);
        assert!(answer["error"].as_str().unwrap().contains("the repository itself"));
        assert!(!git.ran("worktree remove"));
    }

    #[test]
    fn rm_refuses_to_delete_the_folder_it_is_running_in() {
        let core = core_with_empty_state();
        let git = ScriptedGit::new(repository_replies());

        let options = RemoveOptions {
            // A shell sitting inside the worktree, spelled the other way round:
            // the comparison folds separators and case the way the core does.
            process_cwd: "d:\\work\\proj-worktrees\\feat-login\\src".to_string(),
            ..remove_options("D:/work/proj-worktrees/feat-login")
        };
        let mut out = Vec::new();
        let code = run_rm(&core, &git, REFUSED, options, &mut out);
        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");

        assert_eq!(code, 1);
        assert!(answer["error"].as_str().unwrap().contains("cd out of"));
        assert!(!git.ran("worktree remove"));
    }

    #[test]
    fn rm_refuses_a_dirty_worktree_until_it_is_forced() {
        let core = core_with_empty_state();
        let mut replies = repository_replies();
        replies.push(("status --porcelain", succeeded(" M src/lib.rs\n")));
        replies.push(("worktree remove", succeeded("")));
        let git = ScriptedGit::new(replies);

        let mut out = Vec::new();
        let code = run_rm(&core, &git, REFUSED, remove_options("D:/work/proj-worktrees/feat-login"), &mut out);
        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");

        assert_eq!(code, 1);
        assert!(answer["error"].as_str().unwrap().contains("uncommitted changes"));
        assert!(!git.ran("worktree remove"));

        // --force says the changes are expendable, and git is told so too.
        let forced = ScriptedGit::new({
            let mut replies = repository_replies();
            replies.push(("status --porcelain", succeeded(" M src/lib.rs\n")));
            replies.push(("worktree remove", succeeded("")));
            replies
        });
        let options =
            RemoveOptions { force: true, ..remove_options("D:/work/proj-worktrees/feat-login") };

        assert_eq!(run_rm(&core, &forced, REFUSED, options, &mut Vec::new()), 0);
        assert!(forced.ran("worktree remove --force"));
    }

    #[test]
    fn ls_joins_every_worktree_with_the_pet_bound_to_it() {
        let core = core_with_empty_state();
        let pet_id = hatch_at(&core, "D:/work/proj-worktrees/feat-login");
        let git = ScriptedGit::new(vec![("worktree list", succeeded(LISTING))]);

        let mut out = Vec::new();
        let code = run_ls(&core, &git, "D:/work/proj", &mut out);
        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");
        let worktrees = answer["worktrees"].as_array().expect("a list of worktrees");

        assert_eq!(code, 0);
        assert_eq!(answer["repo"], "D:/work/proj");
        assert_eq!(worktrees.len(), 2);
        // The repository itself has no pet here; the worktree does.
        assert_eq!(worktrees[0]["pet"], Value::Null);
        assert_eq!(worktrees[1]["branch"], "feat/login");
        assert_eq!(worktrees[1]["pet"]["id"], pet_id);
    }

    /// A pet's folder is an ordinary folder and often has no git in it, so the
    /// three commands have to name the folder they looked at — git's own
    /// message names only `.git`.
    #[test]
    fn a_folder_with_no_git_in_it_is_named_in_the_refusal() {
        let core = core_with_empty_state();
        let no_repository = || {
            ScriptedGit::new(vec![(
                "worktree list",
                failed("fatal: not a git repository (or any of the parent directories): .git"),
            )])
        };

        let mut out = Vec::new();
        assert_eq!(run_ls(&core, &no_repository(), "D:/pet-folder", &mut out), 1);
        let listed: Value = serde_json::from_slice(&out).expect("the answer is JSON");
        let message = listed["error"].as_str().unwrap();
        assert!(message.contains("no git repository at D:/pet-folder"));
        // Git's own account is kept: a missing folder and a folder outside any
        // repository read differently there.
        assert!(message.contains("not a git repository"));

        // `add` is the one with something to suggest.
        let mut add_out = Vec::new();
        let options = add_options("feat/x", "D:/trees/feat-x");
        let code = run_add(&core, &no_repository(), REFUSED, options, &mut add_out);
        let added: Value = serde_json::from_slice(&add_out).expect("the answer is JSON");

        assert_eq!(code, 1);
        assert!(added["error"].as_str().unwrap().contains("git init"));

        let mut rm_out = Vec::new();
        let code = run_rm(&core, &no_repository(), REFUSED, remove_options("D:/pet-folder"), &mut rm_out);
        let removed: Value = serde_json::from_slice(&rm_out).expect("the answer is JSON");

        assert_eq!(code, 1);
        assert!(removed["error"].as_str().unwrap().contains("no git repository at D:/pet-folder"));
    }

    /// A listing that parses to nothing is the same answer as a failed one: git
    /// prints an entry for every repository it can read.
    #[test]
    fn an_empty_listing_is_reported_as_no_repository() {
        let core = core_with_empty_state();
        let git = ScriptedGit::new(vec![("worktree list", succeeded(""))]);

        let mut out = Vec::new();
        assert_eq!(run_ls(&core, &git, "D:/pet-folder", &mut out), 1);
        let answer: Value = serde_json::from_slice(&out).expect("the answer is JSON");
        assert!(answer["error"].as_str().unwrap().contains("no git repository at D:/pet-folder"));
    }
}
