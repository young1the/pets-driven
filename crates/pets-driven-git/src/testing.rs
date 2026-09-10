//! A git that answers from a script instead of a repository.
//!
//! Shipped rather than test-only because every caller of this crate — the CLI
//! commands and the desktop's Tauri commands — has to test its own behavior
//! around git without creating repositories on the machine running the suite.

use std::cell::RefCell;

use crate::{Git, GitOutput};

/// A repository with one worktree beside it, as `git worktree list --porcelain`
/// prints it. The shape most tests need, so they do not each retype it.
pub const LISTING: &str = "worktree D:/work/proj\nHEAD abc123\nbranch refs/heads/main\n\n\
                           worktree D:/work/proj-worktrees/feat-login\nHEAD def456\n\
                           branch refs/heads/feat/login\n";

/// A successful git call with `stdout` on its output.
pub fn succeeded(stdout: &str) -> GitOutput {
    GitOutput { status: 0, stdout: stdout.to_string(), stderr: String::new() }
}

/// A failed git call carrying `stderr`, the way a `fatal:` arrives.
pub fn failed(stderr: &str) -> GitOutput {
    GitOutput { status: 1, stdout: String::new(), stderr: stderr.to_string() }
}

/// A [`Git`] that replies from a script and remembers what it was asked.
/// Replies are matched on the start of the joined arguments, so a test names as
/// much of a command as it cares about and no more.
pub struct ScriptedGit {
    replies: Vec<(&'static str, GitOutput)>,
    calls: RefCell<Vec<String>>,
}

impl ScriptedGit {
    pub fn new(replies: Vec<(&'static str, GitOutput)>) -> Self {
        Self { replies, calls: RefCell::new(Vec::new()) }
    }

    /// Whether any call so far started with `prefix`.
    pub fn ran(&self, prefix: &str) -> bool {
        self.calls.borrow().iter().any(|call| call.starts_with(prefix))
    }

    /// Every call made so far, joined arguments only.
    pub fn calls(&self) -> Vec<String> {
        self.calls.borrow().clone()
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
