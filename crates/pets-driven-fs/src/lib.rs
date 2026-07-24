//! # pets-driven-fs
//!
//! The production persistence adapter for pets-driven state: a
//! [`FileStateRepository`] that backs the core's write transaction with an
//! `fslock` cross-process advisory lock and replaces the document atomically
//! (sibling temp file + rename).
//!
//! This crate is shared by the desktop and the CLI on purpose. Both processes
//! resolve the *same* `state.v1.json` under the OS data directory and serialise
//! their writes through the *same* lock file, so either can safely mutate state
//! — including while the other runs. The advisory lock is held on a file
//! descriptor, so the OS releases it when a process dies; there is no stale
//! marker file to clean up.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use fslock::LockFile;
use pets_driven_core::{RepositoryError, StateRepository, WriteTransaction};

mod pet_source;
pub use pet_source::{
    asset_ids_in, designated_pet_source_root, petdex_pets_root, user_asset_ids,
};

/// The Tauri bundle identifier. The state directory is
/// `<os data dir>/<APP_IDENTIFIER>`, matching Tauri v2's `app_data_dir()`.
///
/// coupling: keep in sync with `identifier` in
/// `apps/desktop/src-tauri/tauri.conf.json`.
pub const APP_IDENTIFIER: &str = "com.petsdriven.desktop";

/// The persisted state file name.
pub const STATE_FILE_NAME: &str = "state.v1.json";

/// An env override for the full state file path, used by tests and by anyone who
/// wants to point both processes at a shared non-default location.
pub const STATE_PATH_ENV: &str = "PETS_DRIVEN_STATE_PATH";

/// Breaks ties between temp file names minted within the same nanosecond.
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Resolve the canonical `state.v1.json` path both processes agree on:
/// `$PETS_DRIVEN_STATE_PATH` when set, else `<os data dir>/<identifier>/state.v1.json`.
pub fn state_file_path() -> Result<PathBuf, RepositoryError> {
    if let Some(path) = std::env::var_os(STATE_PATH_ENV) {
        return Ok(PathBuf::from(path));
    }

    let data_dir = dirs::data_dir()
        .ok_or_else(|| RepositoryError::new("Could not resolve the OS data directory"))?;

    Ok(data_dir.join(APP_IDENTIFIER).join(STATE_FILE_NAME))
}

/// A [`StateRepository`] backed by `state.v1.json` on disk, serialising writes
/// with a sibling `.lock` file.
pub struct FileStateRepository {
    path: PathBuf,
    lock_path: PathBuf,
}

impl FileStateRepository {
    /// A repository over an explicit state file path (the lock is a sibling
    /// `<name>.lock`).
    pub fn new(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let lock_path = lock_path_for(&path);
        Self { path, lock_path }
    }

    /// A repository over the canonical [`state_file_path`].
    pub fn discover() -> Result<Self, RepositoryError> {
        Ok(Self::new(state_file_path()?))
    }

    /// The resolved state file path.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Ensure the state directory exists before creating the lock or state file.
    fn ensure_parent(&self) -> Result<(), RepositoryError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                RepositoryError::new(format!("Could not create {}: {error}", parent.display()))
            })?;
        }
        Ok(())
    }
}

impl StateRepository for FileStateRepository {
    fn load(&self) -> Result<Option<Vec<u8>>, RepositoryError> {
        read_optional(&self.path)
    }

    fn begin_write(&self) -> Result<Box<dyn WriteTransaction + '_>, RepositoryError> {
        self.ensure_parent()?;

        let mut lock = LockFile::open(&self.lock_path).map_err(|error| {
            RepositoryError::new(format!(
                "Could not open lock file {}: {error}",
                self.lock_path.display()
            ))
        })?;
        // Blocks until no other process (or thread, via the core's mutex) holds
        // the lock. Released when the returned transaction is dropped.
        lock.lock().map_err(|error| {
            RepositoryError::new(format!(
                "Could not acquire lock {}: {error}",
                self.lock_path.display()
            ))
        })?;

        Ok(Box::new(FileWriteTransaction {
            path: &self.path,
            _lock: lock,
        }))
    }
}

struct FileWriteTransaction<'a> {
    path: &'a Path,
    /// Held for the transaction's lifetime; dropping it releases the OS lock.
    _lock: LockFile,
}

impl WriteTransaction for FileWriteTransaction<'_> {
    fn load(&mut self) -> Result<Option<Vec<u8>>, RepositoryError> {
        read_optional(self.path)
    }

    /// Persist by writing a sibling temp file and renaming it over the target.
    /// A plain write truncates in place, so a reader racing the write could
    /// observe a partial file; the rename is atomic on the same filesystem.
    fn replace(&mut self, bytes: &[u8]) -> Result<(), RepositoryError> {
        let temp_path = self
            .path
            .with_file_name(format!("{STATE_FILE_NAME}.{}.tmp", temp_suffix()));

        fs::write(&temp_path, bytes).map_err(|error| {
            RepositoryError::new(format!("Could not write {}: {error}", temp_path.display()))
        })?;

        fs::rename(&temp_path, self.path).map_err(|error| {
            let _ = fs::remove_file(&temp_path);
            RepositoryError::new(format!("Could not replace {}: {error}", self.path.display()))
        })
    }
}

/// Read a file, mapping "not found" to `None` rather than an error.
fn read_optional(path: &Path) -> Result<Option<Vec<u8>>, RepositoryError> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(RepositoryError::new(format!(
            "Could not read {}: {error}",
            path.display()
        ))),
    }
}

/// The sibling lock path for a state file: `<name>.lock`.
fn lock_path_for(path: &Path) -> PathBuf {
    match path.file_name() {
        Some(name) => {
            let mut lock_name = name.to_os_string();
            lock_name.push(".lock");
            path.with_file_name(lock_name)
        }
        None => path.with_file_name("state.lock"),
    }
}

/// A process-unique temp suffix: nanoseconds plus a counter, so two writes in
/// the same nanosecond never collide on the sibling file.
fn temp_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);

    format!("{}-{nanos}-{counter}", std::process::id())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_dir() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "pets-driven-fs-{}-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed),
            nanos
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn missing_file_loads_as_none() {
        let dir = unique_temp_dir();
        let repository = FileStateRepository::new(dir.join("state.v1.json"));

        assert_eq!(repository.load().unwrap(), None);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn write_then_read_round_trips_through_a_transaction() {
        let dir = unique_temp_dir();
        let repository = FileStateRepository::new(dir.join("state.v1.json"));

        {
            let mut txn = repository.begin_write().unwrap();
            assert_eq!(txn.load().unwrap(), None);
            txn.replace(br#"{"schemaVersion":1}"#).unwrap();
            // Reads inside the transaction see the new document.
            assert_eq!(txn.load().unwrap().as_deref(), Some(&b"{\"schemaVersion\":1}"[..]));
        }

        // And an unlocked read after the transaction sees it too.
        assert_eq!(
            repository.load().unwrap().as_deref(),
            Some(&b"{\"schemaVersion\":1}"[..])
        );

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_second_transaction_overwrites_the_document() {
        let dir = unique_temp_dir();
        let repository = FileStateRepository::new(dir.join("state.v1.json"));

        repository.begin_write().unwrap().replace(b"first").unwrap();
        repository.begin_write().unwrap().replace(b"second").unwrap();

        assert_eq!(repository.load().unwrap().as_deref(), Some(&b"second"[..]));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn replace_leaves_no_temp_file_behind() {
        let dir = unique_temp_dir();
        let repository = FileStateRepository::new(dir.join("state.v1.json"));
        repository.begin_write().unwrap().replace(b"data").unwrap();

        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "unexpected temp files: {leftovers:?}");

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_lock_path_is_a_sibling_of_the_state_file() {
        let repository = FileStateRepository::new("/data/com.petsdriven.desktop/state.v1.json");
        assert_eq!(
            repository.lock_path,
            PathBuf::from("/data/com.petsdriven.desktop/state.v1.json.lock")
        );
    }

    #[test]
    fn the_default_state_path_lives_under_the_app_identifier() {
        // With no env override, the path ends with the identifier and file name.
        // (This test never sets the env var, so it does not race other tests.)
        if std::env::var_os(STATE_PATH_ENV).is_none() {
            let path = state_file_path().unwrap();
            assert!(path.ends_with(PathBuf::from(APP_IDENTIFIER).join(STATE_FILE_NAME)));
        }
    }
}
