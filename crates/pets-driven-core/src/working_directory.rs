//! Working Directory path handling.
//!
//! One normalization implementation is shared by every path comparison the
//! core makes — exact occupancy checks at Pet Birth and re-bind, and the
//! Working Directory lookup that resolves a pet from a folder. Keeping it in a
//! single place is what the invariant "exact occupancy checks and Agent Event
//! Feed routing must share one Working Directory normalization" refers to.

/// A Working Directory path as supplied by a caller, before normalization.
///
/// This is a thin newtype over the raw string: it carries the path verbatim
/// (that is what gets persisted), and [`comparable_path`] derives the
/// normalized key used for comparison.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkingDirectoryPath(String);

impl WorkingDirectoryPath {
    pub fn new(path: impl Into<String>) -> Self {
        Self(path.into())
    }

    /// The raw path as it will be persisted.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// The normalized key used to compare two paths for occupancy.
    pub fn comparable(&self) -> String {
        comparable_path(&self.0)
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

impl From<&str> for WorkingDirectoryPath {
    fn from(path: &str) -> Self {
        Self::new(path)
    }
}

impl From<String> for WorkingDirectoryPath {
    fn from(path: String) -> Self {
        Self::new(path)
    }
}

impl std::fmt::Display for WorkingDirectoryPath {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

/// Lightweight path compare for occupancy: fold separators and case so
/// `D:/Proj` and `d:\proj` resolve to the same folder. Runtime hook routing
/// re-normalises both sides in TypeScript, so this only has to catch the same
/// folder, not canonicalise the filesystem.
pub fn comparable_path(path: &str) -> String {
    path.trim()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

/// Whether a Working Directory path is safe to persist: non-empty after
/// trimming and free of control characters. A control character (for example a
/// CR injected by an unescaped backslash in request JSON) would store a folder
/// that can never be opened or matched again.
pub fn is_valid_working_directory(path: &str) -> bool {
    !path.trim().is_empty() && !path.contains(['\r', '\n', '\t'])
}
