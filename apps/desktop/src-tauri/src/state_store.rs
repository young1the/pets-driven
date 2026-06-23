use std::{fs, path::PathBuf};

use tauri::Manager;

const PETS_DRIVEN_STATE_FILE_NAME: &str = "state.v1.json";

fn empty_pets_driven_state() -> serde_json::Value {
    serde_json::json!({
        "schemaVersion": 1,
        "registeredWorkingDirectories": [],
        "pets": [],
        "petProfiles": []
    })
}

fn pets_driven_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(PETS_DRIVEN_STATE_FILE_NAME))
        .map_err(|error| format!("Could not resolve pets-driven app data directory: {error}"))
}

#[tauri::command]
pub(crate) fn read_pets_driven_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let state_path = pets_driven_state_path(&app)?;

    if !state_path.exists() {
        return Ok(empty_pets_driven_state());
    }

    let state_text = fs::read_to_string(&state_path)
        .map_err(|error| format!("Could not read {}: {error}", state_path.display()))?;

    serde_json::from_str(&state_text)
        .map_err(|error| format!("Could not parse {}: {error}", state_path.display()))
}

#[tauri::command]
pub(crate) fn write_pets_driven_state(
    app: tauri::AppHandle,
    state: serde_json::Value,
) -> Result<(), String> {
    let state_path = pets_driven_state_path(&app)?;

    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }

    let state_text = serde_json::to_string_pretty(&state)
        .map_err(|error| format!("Could not serialize pets-driven state: {error}"))?;

    fs::write(&state_path, state_text)
        .map_err(|error| format!("Could not write {}: {error}", state_path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_pets_driven_state_uses_schema_version_one() {
        assert_eq!(
            empty_pets_driven_state(),
            serde_json::json!({
                "schemaVersion": 1,
                "registeredWorkingDirectories": [],
                "pets": [],
                "petProfiles": []
            })
        );
    }
}
