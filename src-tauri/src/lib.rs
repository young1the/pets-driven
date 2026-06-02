use std::{env, fs, path::PathBuf};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const PET_WINDOW_PLAYGROUND_MAX_WINDOWS: u8 = 5;
const PET_WINDOW_PLAYGROUND_PET_IDS: [&str; 5] = ["pet-a", "pet-b", "pet-c", "pet-d", "pet-e"];

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetManifest {
    id: String,
    display_name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    spritesheet_path: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexPetPackage {
    id: String,
    display_name: String,
    description: String,
    spritesheet_path: String,
}

fn codex_pets_root() -> Result<PathBuf, String> {
    let home = env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join(".codex")))
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".codex")))
        .ok_or_else(|| "Could not resolve the Codex home directory".to_string())?;

    Ok(home.join("pets"))
}

fn validate_asset_id(asset_id: &str) -> Result<(), String> {
    let valid = !asset_id.is_empty()
        && asset_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_');

    if valid {
        Ok(())
    } else {
        Err("Invalid Codex pet asset id".to_string())
    }
}

fn pet_window_playground_count(count: Option<u8>) -> u8 {
    count
        .unwrap_or(1)
        .clamp(1, PET_WINDOW_PLAYGROUND_MAX_WINDOWS)
}

fn pet_window_playground_label(index: u8) -> String {
    format!("pet-window-playground-{index}")
}

fn pet_window_playground_pet_id(index: u8) -> &'static str {
    PET_WINDOW_PLAYGROUND_PET_IDS
        .get(usize::from(index.saturating_sub(1)))
        .copied()
        .unwrap_or("pet-a")
}

fn pet_window_playground_url(index: u8) -> String {
    format!(
        "index.html?surface=pet-window&petId={}&assetId=patamon&windowIndex={index}",
        pet_window_playground_pet_id(index),
    )
}

#[tauri::command]
fn list_codex_pet_packages() -> Result<Vec<CodexPetPackage>, String> {
    let pets_root = codex_pets_root()?;
    let entries = fs::read_dir(&pets_root)
        .map_err(|error| format!("Could not read Codex pets directory: {error}"))?;
    let mut packages = Vec::new();

    for entry_result in entries {
        let entry =
            entry_result.map_err(|error| format!("Could not read Codex pet entry: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Could not inspect Codex pet entry: {error}"))?;

        if !file_type.is_dir() {
            continue;
        }

        let pet_dir = entry.path();
        let manifest_path = pet_dir.join("pet.json");

        if !manifest_path.exists() {
            continue;
        }

        let manifest_text = fs::read_to_string(&manifest_path)
            .map_err(|error| format!("Could not read {}: {error}", manifest_path.display()))?;
        let manifest: PetManifest = serde_json::from_str(&manifest_text)
            .map_err(|error| format!("Could not parse {}: {error}", manifest_path.display()))?;
        let spritesheet_path = pet_dir.join(
            manifest
                .spritesheet_path
                .unwrap_or_else(|| "spritesheet.webp".to_string()),
        );

        if !spritesheet_path.exists() {
            continue;
        }

        packages.push(CodexPetPackage {
            id: manifest.id,
            display_name: manifest.display_name,
            description: manifest.description,
            spritesheet_path: spritesheet_path.display().to_string(),
        });
    }

    packages.sort_by_key(|package| package.display_name.to_lowercase());

    Ok(packages)
}

#[tauri::command]
fn load_codex_pet_spritesheet(asset_id: String) -> Result<tauri::ipc::Response, String> {
    validate_asset_id(&asset_id)?;

    let spritesheet_path = codex_pets_root()?
        .join(asset_id)
        .join("spritesheet.webp");
    let bytes = fs::read(&spritesheet_path)
        .map_err(|error| format!("Could not read Codex pet spritesheet: {error}"))?;

    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
async fn open_pet_window_playground(app: tauri::AppHandle, count: Option<u8>) -> Result<(), String> {
    let count = pet_window_playground_count(count);

    for index in 1..=count {
        let label = pet_window_playground_label(index);

        if let Some(window) = app.get_webview_window(&label) {
            window
                .show()
                .map_err(|error| format!("Could not show {label}: {error}"))?;
            continue;
        }

        WebviewWindowBuilder::new(
            &app,
            label.clone(),
            WebviewUrl::App(pet_window_playground_url(index).into()),
        )
        .title(format!("Pet Window {index}"))
        .inner_size(192.0, 208.0)
        .position(120.0 + f64::from(index.saturating_sub(1)) * 220.0, 120.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .build()
        .map_err(|error| format!("Could not create {label}: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
async fn close_pet_window_playground(app: tauri::AppHandle) -> Result<(), String> {
    for index in 1..=PET_WINDOW_PLAYGROUND_MAX_WINDOWS {
        let label = pet_window_playground_label(index);

        if let Some(window) = app.get_webview_window(&label) {
            window
                .destroy()
                .map_err(|error| format!("Could not close {label}: {error}"))?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pet_window_playground_count_defaults_to_one_and_clamps_to_five() {
        assert_eq!(pet_window_playground_count(None), 1);
        assert_eq!(pet_window_playground_count(Some(0)), 1);
        assert_eq!(pet_window_playground_count(Some(3)), 3);
        assert_eq!(pet_window_playground_count(Some(9)), 5);
    }

    #[test]
    fn pet_window_playground_labels_are_stable() {
        assert_eq!(
            pet_window_playground_label(3),
            "pet-window-playground-3"
        );
    }

    #[test]
    fn pet_window_playground_url_routes_to_pet_window_surface() {
        assert_eq!(
            pet_window_playground_url(2),
            "index.html?surface=pet-window&petId=pet-b&assetId=patamon&windowIndex=2"
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_codex_pet_packages,
            load_codex_pet_spritesheet,
            open_pet_window_playground,
            close_pet_window_playground
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
