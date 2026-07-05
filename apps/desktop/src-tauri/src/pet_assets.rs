use std::{
    env, fs,
    path::{Path, PathBuf},
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetManifest {
    #[serde(default)]
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

/// Discover the pet packages under `pets_root`. A pet's asset id is its
/// directory name, not any `id` field in the manifest: `load_codex_pet_spritesheet`
/// rebuilds `<pets_root>/<id>/spritesheet.webp` from that id, so keying a package
/// by anything else would break sprite loading the moment the two disagree.
fn read_pet_packages(pets_root: &Path) -> Result<Vec<CodexPetPackage>, String> {
    let entries = fs::read_dir(pets_root)
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

        // The directory name is the asset id. Skip anything the loader could not
        // address (e.g. names with spaces), so listing and loading stay in sync.
        let Some(asset_id) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if validate_asset_id(&asset_id).is_err() {
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
                .as_deref()
                .unwrap_or("spritesheet.webp"),
        );

        if !spritesheet_path.exists() {
            continue;
        }

        // A partial manifest should still yield a usable pet: fall back to the
        // directory name when no display name was provided.
        let display_name = if manifest.display_name.trim().is_empty() {
            asset_id.clone()
        } else {
            manifest.display_name
        };

        packages.push(CodexPetPackage {
            id: asset_id,
            display_name,
            description: manifest.description,
            spritesheet_path: spritesheet_path.display().to_string(),
        });
    }

    packages.sort_by_key(|package| package.display_name.to_lowercase());

    Ok(packages)
}

#[tauri::command]
pub(crate) fn list_codex_pet_packages() -> Result<Vec<CodexPetPackage>, String> {
    read_pet_packages(&codex_pets_root()?)
}

#[tauri::command]
pub(crate) fn load_codex_pet_spritesheet(asset_id: String) -> Result<tauri::ipc::Response, String> {
    validate_asset_id(&asset_id)?;

    let spritesheet_path = codex_pets_root()?.join(asset_id).join("spritesheet.webp");
    let bytes = fs::read(&spritesheet_path)
        .map_err(|error| format!("Could not read Codex pet spritesheet: {error}"))?;

    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir() -> PathBuf {
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = env::temp_dir().join(format!(
            "pets-driven-pet-assets-{}-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed),
            nanos
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_pet(root: &Path, dir: &str, manifest: &str, with_sprite: bool) {
        let pet_dir = root.join(dir);
        fs::create_dir_all(&pet_dir).unwrap();
        fs::write(pet_dir.join("pet.json"), manifest).unwrap();
        if with_sprite {
            fs::write(pet_dir.join("spritesheet.webp"), b"webp").unwrap();
        }
    }

    #[test]
    fn ids_come_from_the_directory_name_not_the_manifest_id() {
        let root = unique_temp_dir();
        write_pet(
            &root,
            "paimo-2",
            r#"{"id":"paimo","displayName":"Paimo"}"#,
            true,
        );

        let packages = read_pet_packages(&root).unwrap();

        assert_eq!(packages.len(), 1);
        assert_eq!(packages[0].id, "paimo-2");
        assert_eq!(packages[0].display_name, "Paimo");

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn skips_directories_without_a_spritesheet() {
        let root = unique_temp_dir();
        write_pet(&root, "no-art", r#"{"displayName":"No Art"}"#, false);

        let packages = read_pet_packages(&root).unwrap();

        assert!(packages.is_empty());

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn skips_directories_without_a_manifest() {
        let root = unique_temp_dir();
        let bare = root.join("bare");
        fs::create_dir_all(&bare).unwrap();
        fs::write(bare.join("spritesheet.webp"), b"webp").unwrap();

        let packages = read_pet_packages(&root).unwrap();

        assert!(packages.is_empty());

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn falls_back_to_the_directory_name_when_display_name_is_missing() {
        let root = unique_temp_dir();
        write_pet(&root, "bloop", r#"{}"#, true);

        let packages = read_pet_packages(&root).unwrap();

        assert_eq!(packages.len(), 1);
        assert_eq!(packages[0].id, "bloop");
        assert_eq!(packages[0].display_name, "bloop");

        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn sorts_packages_by_display_name_case_insensitively() {
        let root = unique_temp_dir();
        write_pet(&root, "zed", r#"{"displayName":"zed"}"#, true);
        write_pet(&root, "abe", r#"{"displayName":"Abe"}"#, true);

        let packages = read_pet_packages(&root).unwrap();

        let ids: Vec<&str> = packages.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, vec!["abe", "zed"]);

        fs::remove_dir_all(&root).ok();
    }
}
