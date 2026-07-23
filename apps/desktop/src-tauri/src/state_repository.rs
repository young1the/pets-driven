//! The production persistence adapter: a [`StateRepository`] backed by the
//! `state.v1.json` file under the app data directory.
//!
//! This lives in the desktop crate, not in `pets-driven-core`, on purpose. The
//! core owns the transaction but not the medium; keeping the only file writer
//! here means a future CLI that links the core cannot accidentally import
//! file-writing behavior and become a second production writer of the state
//! file.

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use pets_driven_core::{RepositoryError, StateRepository};
use tauri::Manager;

const PETS_DRIVEN_STATE_FILE_NAME: &str = "state.v1.json";

/// Breaks ties between temp file names minted within the same nanosecond.
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// A [`StateRepository`] that loads and atomically replaces `state.v1.json`
/// under the app data directory.
///
/// The path is resolved lazily on each call from the held [`tauri::AppHandle`],
/// matching the previous `state_store` behavior, so the repository can be
/// constructed at setup before the data directory exists.
pub(crate) struct JsonFileStateRepository {
    app: tauri::AppHandle,
}

impl JsonFileStateRepository {
    pub(crate) fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }

    fn state_path(&self) -> Result<PathBuf, RepositoryError> {
        self.app
            .path()
            .app_data_dir()
            .map(|path| path.join(PETS_DRIVEN_STATE_FILE_NAME))
            .map_err(|error| {
                RepositoryError::new(format!(
                    "Could not resolve pets-driven app data directory: {error}"
                ))
            })
    }
}

impl StateRepository for JsonFileStateRepository {
    fn load(&self) -> Result<Option<Vec<u8>>, RepositoryError> {
        let state_path = self.state_path()?;

        if !state_path.exists() {
            return Ok(None);
        }

        fs::read(&state_path)
            .map(Some)
            .map_err(|error| RepositoryError::new(format!("Could not read {}: {error}", state_path.display())))
    }

    /// Persist by writing a sibling temp file and renaming it over the target.
    /// A plain `fs::write` truncates in place, so a reader racing the write (the
    /// webview reloading after a hatch, say) could observe a partial file and
    /// fall back to empty state.
    fn replace(&self, bytes: &[u8]) -> Result<(), RepositoryError> {
        let state_path = self.state_path()?;

        if let Some(parent) = state_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| RepositoryError::new(format!("Could not create {}: {error}", parent.display())))?;
        }

        let temp_path =
            state_path.with_file_name(format!("{PETS_DRIVEN_STATE_FILE_NAME}.{}.tmp", temp_suffix()));

        fs::write(&temp_path, bytes)
            .map_err(|error| RepositoryError::new(format!("Could not write {}: {error}", temp_path.display())))?;

        fs::rename(&temp_path, &state_path).map_err(|error| {
            let _ = fs::remove_file(&temp_path);
            RepositoryError::new(format!("Could not replace {}: {error}", state_path.display()))
        })
    }
}

/// A process-unique suffix for a temp file name: nanoseconds plus a counter, so
/// two writes in the same nanosecond never collide on the sibling file.
fn temp_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);

    format!("write-{nanos}-{counter}")
}
