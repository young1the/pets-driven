use std::{env, fs, path::PathBuf};

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
pub(crate) struct CodexPetPackage {
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

pub(crate) fn validate_asset_id(asset_id: &str) -> Result<(), String> {
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

#[tauri::command]
pub(crate) fn list_codex_pet_packages() -> Result<Vec<CodexPetPackage>, String> {
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
pub(crate) fn load_codex_pet_spritesheet(asset_id: String) -> Result<tauri::ipc::Response, String> {
    validate_asset_id(&asset_id)?;

    let spritesheet_path = codex_pets_root()?.join(asset_id).join("spritesheet.webp");
    let bytes = fs::read(&spritesheet_path)
        .map_err(|error| format!("Could not read Codex pet spritesheet: {error}"))?;

    Ok(tauri::ipc::Response::new(bytes))
}
