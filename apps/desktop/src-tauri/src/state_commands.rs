//! The desktop adapters over [`PetsDrivenCore`].
//!
//! One core instance is built at setup over the shared
//! [`pets_driven_fs::FileStateRepository`] and managed as Tauri state; every
//! Tauri command and the HTTP ingress reach persisted state only through it.
//! The repository is the *same* one the `pdd` CLI uses — the same file, the same
//! cross-process lock — so the two processes serialise their writes and neither
//! loses the other's change. These commands are thin: they parse the webview's
//! JSON payload into a typed core input, run the core method, and return the
//! persisted snapshot for the caller to render. They do not emit presentation
//! events — the webview re-renders from the returned state — so a command
//! ignores `Commit::events`. The HTTP ingress is the adapter that maps those
//! events to Tauri events and Pet Window effects.

use std::sync::Arc;

use pets_driven_core::{
    CoreError, HatchPet, PetId, PetPatch, PetsDrivenCore, RepositoryError, SettingsPatch,
    StateSnapshot,
};
use pets_driven_fs::FileStateRepository;
use serde_json::Value;
use tauri::Manager;

/// The Tauri-managed handle to the one core instance for this process.
pub(crate) struct PetsDrivenCoreState(pub(crate) Arc<PetsDrivenCore>);

/// Build the core over the shared on-disk state repository, resolved to the same
/// `state.v1.json` the CLI writes. Fails only if the OS data directory cannot be
/// resolved.
pub(crate) fn build_core() -> Result<Arc<PetsDrivenCore>, RepositoryError> {
    let repository = FileStateRepository::discover()?;
    Ok(Arc::new(PetsDrivenCore::new(Arc::new(repository))))
}

/// Fetch the managed core.
fn core(app: &tauri::AppHandle) -> Arc<PetsDrivenCore> {
    app.state::<PetsDrivenCoreState>().0.clone()
}

/// The persisted document as a JSON value, for the non-command callers (pet
/// asset scanning) that only need to read a setting off state.
pub(crate) fn read_state(app: &tauri::AppHandle) -> Result<Value, String> {
    core(app)
        .snapshot()
        .map(StateSnapshot::into_value)
        .map_err(|error| error.to_string())
}

/// Map a [`CoreError`] to the HTTP status line the ingress should reply with.
/// This replaces the old string-prefix matching: variants, not message text,
/// decide the status.
pub(crate) fn core_error_http_status(error: &CoreError) -> &'static str {
    match error {
        CoreError::PetNotFound { .. } => "404 Not Found",
        CoreError::WorkingDirectoryOccupied { .. } => "409 Conflict",
        CoreError::Validation(_) => "400 Bad Request",
        CoreError::UnsupportedSchemaVersion { .. }
        | CoreError::Corruption(_)
        | CoreError::Serialization(_)
        | CoreError::Repository(_)
        | CoreError::Transaction(_) => "500 Internal Server Error",
    }
}

#[tauri::command]
pub(crate) fn read_pets_driven_state(app: tauri::AppHandle) -> Result<Value, String> {
    read_state(&app)
}

/// Replace the whole state document with what the caller holds in memory.
///
/// Last-writer-wins by nature, so it is reserved for the webview flows that
/// genuinely own the entire document. It still goes through the core's
/// transaction lock and the repository seam.
#[tauri::command]
pub(crate) fn write_pets_driven_state(app: tauri::AppHandle, state: Value) -> Result<(), String> {
    core(&app)
        .replace_document(state)
        .map(|_commit| ())
        .map_err(|error| error.to_string())
}

/// Adopt a pet. Mirrors the `/pets-driven/hatch` endpoint, except `cwd` may be
/// absent or null — onboarding lets the user skip the folder step.
#[tauri::command]
pub(crate) fn hatch_pet_record(app: tauri::AppHandle, input: Value) -> Result<Value, String> {
    let hatch = HatchPet::from_json(&input).map_err(|error| error.to_string())?;
    core(&app)
        .hatch(hatch)
        .map(|commit| commit.snapshot.into_value())
        .map_err(|error| error.to_string())
}

/// Patch one pet's editable fields. Omitted fields are left untouched.
#[tauri::command]
pub(crate) fn update_pet_record(app: tauri::AppHandle, input: Value) -> Result<Value, String> {
    let (pet_id, patch) = PetPatch::from_json(&input).map_err(|error| error.to_string())?;
    core(&app)
        .update_pet(&pet_id, patch)
        .map(|commit| commit.snapshot.into_value())
        .map_err(|error| error.to_string())
}

/// Permanently remove a pet, its profile, and any working directory it holds.
#[tauri::command]
pub(crate) fn delete_pet_record(app: tauri::AppHandle, pet_id: String) -> Result<Value, String> {
    core(&app)
        .remove_pet(&PetId::new(pet_id))
        .map(|commit| commit.snapshot.into_value())
        .map_err(|error| error.to_string())
}

/// Patch the app-wide settings (launch line, terminal shell, pet source folder).
#[tauri::command]
pub(crate) fn update_pets_driven_settings(
    app: tauri::AppHandle,
    input: Value,
) -> Result<Value, String> {
    let patch = SettingsPatch::from_json(&input).map_err(|error| error.to_string())?;
    core(&app)
        .update_settings(patch)
        .map(|commit| commit.snapshot.into_value())
        .map_err(|error| error.to_string())
}

/// Put every app-wide setting back to its default, keeping the pets, their
/// profiles, and the folders they watch exactly as they are.
#[tauri::command]
pub(crate) fn reset_pets_driven_settings(app: tauri::AppHandle) -> Result<Value, String> {
    core(&app)
        .reset_settings()
        .map(|commit| commit.snapshot.into_value())
        .map_err(|error| error.to_string())
}
