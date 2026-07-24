//! Watches `state.v1.json` for external changes and tells the webview to reload.
//!
//! Now that the `pdd` CLI writes the same state file directly (serialised with
//! the desktop by a cross-process lock), a mutation can happen while the app is
//! running without going through a Tauri command. The app's own command
//! mutations already return the new state to the webview, so this only needs to
//! catch writes made by *another* process — but it also fires for our own writes,
//! which is harmless because the reload the webview does on `state-changed` is
//! idempotent.
//!
//! It polls the file's modified-time rather than pulling in a filesystem-notify
//! dependency; a one-second cadence is well within human tolerance for a pet
//! appearing after a CLI hatch.
//!
//! Limitation: the webview reload reconciles the pet *roster* (a CLI-hatched pet
//! appears in the manager), but this does not open the pet's overlay window the
//! way the ingress hatch path does, because it cannot tell which pet is new from
//! an mtime bump alone. Opening the overlay for an externally-hatched pet is left
//! to the user (or a future diff-based reconcile).

use std::path::Path;
use std::thread;
use std::time::{Duration, SystemTime};

use tauri::Emitter;

const PETS_DRIVEN_STATE_CHANGED_EVENT: &str = "pets-driven:state-changed";
const POLL_INTERVAL: Duration = Duration::from_secs(1);

/// Spawn the background watcher. Does nothing if the state path cannot be
/// resolved (the same failure would already have stopped the core from building).
pub(crate) fn start(app: tauri::AppHandle) {
    let path = match pets_driven_fs::state_file_path() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("[pets-driven] external-change watch disabled: {error}");
            return;
        }
    };

    thread::spawn(move || {
        let mut last_seen = modified_at(&path);

        loop {
            thread::sleep(POLL_INTERVAL);

            let current = modified_at(&path);
            if current != last_seen {
                last_seen = current;
                let _ = app.emit_to("main", PETS_DRIVEN_STATE_CHANGED_EVENT, ());
            }
        }
    });
}

/// The file's modified time, or `None` when it does not exist yet.
fn modified_at(path: &Path) -> Option<SystemTime> {
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
}
