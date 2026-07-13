use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
};

use tauri::Manager;

use crate::state_store;

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

/// The default user pet folder: `~/.petdex/pets`, where the partnered Petdex
/// service installs pet packs. `PETDEX_HOME` overrides the `~/.petdex` part.
fn petdex_pets_root() -> Result<PathBuf, String> {
    let home = env::var_os("PETDEX_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join(".petdex")))
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".petdex")))
        .ok_or_else(|| "Could not resolve the Petdex home directory".to_string())?;

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

/// Discover pet packages across several roots (the built-in Codex root plus any
/// user-configured Petdex folders), unioning the results. Earlier roots win on
/// an asset-id collision, so the built-in pets take precedence over a folder the
/// user added later. A root that cannot be read (missing folder, permissions) is
/// skipped rather than failing the whole scan.
fn read_pet_packages_from_roots(roots: &[PathBuf]) -> Vec<CodexPetPackage> {
    let mut packages: Vec<CodexPetPackage> = Vec::new();
    let mut seen_ids: HashSet<String> = HashSet::new();

    for root in roots {
        let found = read_pet_packages(root).unwrap_or_default();

        for package in found {
            if seen_ids.insert(package.id.clone()) {
                packages.push(package);
            }
        }
    }

    // Re-sort after merging so the combined list is ordered by display name, not
    // grouped by the root a pack happened to come from.
    packages.sort_by_key(|package| package.display_name.to_lowercase());

    packages
}

/// The built-in pets shipped with the app: a bundled resource in packaged
/// builds, the repo-root `pets/` checkout when running `tauri dev`. This is what
/// lets a fresh install show the default pets without a populated
/// `~/.codex/pets`. Mirrors `claude_plugin::bundled_plugins_dir`.
fn bundled_pets_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("pets"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..")
            .join("pets"),
    );

    candidates.into_iter().find(|dir| dir.is_dir())
}

/// The single designated user pet folder, read straight from the persisted
/// state file: the v3 `petSourceDirectory` string when set, else the first
/// entry of the legacy v2 `petSourceDirectories` list, else the Petdex default
/// (`~/.petdex/pets`).
fn designated_pet_source_root(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(state) = state_store::read_state_pub(app) {
        if let Some(path) = state
            .get("petSourceDirectory")
            .and_then(|value| value.as_str())
        {
            let trimmed = path.trim();
            if !trimmed.is_empty() {
                return Some(PathBuf::from(trimmed));
            }
        }

        if let Some(directories) = state
            .get("petSourceDirectories")
            .and_then(|value| value.as_array())
        {
            for directory in directories {
                if let Some(path) = directory.as_str() {
                    let trimmed = path.trim();
                    if !trimmed.is_empty() {
                        return Some(PathBuf::from(trimmed));
                    }
                }
            }
        }
    }

    petdex_pets_root().ok()
}

/// The ordered list of roots to scan: the designated user folder (Petdex by
/// default) first, then the pets bundled with the app. Reading the config here
/// (rather than threading it through every caller) keeps the frontend and the
/// pet windows unaware of the folder while still resolving their sprites.
/// Order matches `read_pet_packages_from_roots` so a listed pack and its loaded
/// sprite always resolve to the same file; the bundled defaults come last so a
/// user-installed pack wins on an id collision.
fn configured_pet_roots(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    if let Some(root) = designated_pet_source_root(app) {
        roots.push(root);
    }

    if let Some(bundled) = bundled_pets_dir(app) {
        roots.push(bundled);
    }

    roots
}

/// The Petdex default pet folder as a display string, so the frontend can show
/// where pets land when no custom folder is designated.
#[tauri::command]
pub(crate) fn get_default_pet_source_directory() -> Result<String, String> {
    Ok(petdex_pets_root()?.display().to_string())
}

#[tauri::command]
pub(crate) fn list_codex_pet_packages(
    app: tauri::AppHandle,
) -> Result<Vec<CodexPetPackage>, String> {
    Ok(read_pet_packages_from_roots(&configured_pet_roots(&app)))
}

#[tauri::command]
pub(crate) fn load_codex_pet_spritesheet(
    app: tauri::AppHandle,
    asset_id: String,
) -> Result<tauri::ipc::Response, String> {
    validate_asset_id(&asset_id)?;

    // Search every configured root in the same order as listing, so a pet
    // adopted from a custom folder still resolves its sprite in its window.
    for root in configured_pet_roots(&app) {
        let spritesheet_path = root.join(&asset_id).join("spritesheet.webp");

        if spritesheet_path.exists() {
            let bytes = fs::read(&spritesheet_path)
                .map_err(|error| format!("Could not read Codex pet spritesheet: {error}"))?;

            return Ok(tauri::ipc::Response::new(bytes));
        }
    }

    Err(format!(
        "Could not find a spritesheet for Codex pet asset '{asset_id}'"
    ))
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

    // The repo-root pets/ directory bundled into packaged builds. Kept in sync
    // with bundled_pets_dir's dev fallback.
    fn repo_root_pets_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..")
            .join("pets")
    }

    #[test]
    fn bundled_pets_directory_parses_into_the_built_in_packs() {
        let packages = read_pet_packages(&repo_root_pets_dir())
            .expect("repo-root pets/ should parse as pet packages");

        // The six pets shipped with the app must each ship a manifest + sheet so
        // a fresh install (no ~/.codex/pets) still lists and loads them.
        for id in ["cato", "otto", "mochi", "fenn", "bloop", "pip"] {
            assert!(
                packages.iter().any(|package| package.id == id),
                "built-in pet '{id}' missing from bundled pets/ (got {:?})",
                packages.iter().map(|p| &p.id).collect::<Vec<_>>(),
            );
        }
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

    #[test]
    fn unions_packages_across_roots_sorted_by_display_name() {
        let primary = unique_temp_dir();
        let extra = unique_temp_dir();
        write_pet(&primary, "zed", r#"{"displayName":"Zed"}"#, true);
        write_pet(&extra, "abe", r#"{"displayName":"Abe"}"#, true);

        let packages = read_pet_packages_from_roots(&[primary.clone(), extra.clone()]);

        let ids: Vec<&str> = packages.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, vec!["abe", "zed"]);

        fs::remove_dir_all(&primary).ok();
        fs::remove_dir_all(&extra).ok();
    }

    #[test]
    fn earlier_root_wins_on_asset_id_collision() {
        let primary = unique_temp_dir();
        let extra = unique_temp_dir();
        write_pet(&primary, "boba", r#"{"displayName":"Built-in Boba"}"#, true);
        write_pet(&extra, "boba", r#"{"displayName":"Custom Boba"}"#, true);

        let packages = read_pet_packages_from_roots(&[primary.clone(), extra.clone()]);

        assert_eq!(packages.len(), 1);
        assert_eq!(packages[0].display_name, "Built-in Boba");

        fs::remove_dir_all(&primary).ok();
        fs::remove_dir_all(&extra).ok();
    }

    #[test]
    fn skips_roots_that_cannot_be_read() {
        let primary = unique_temp_dir();
        write_pet(&primary, "abe", r#"{"displayName":"Abe"}"#, true);
        let missing = env::temp_dir().join("pets-driven-does-not-exist-xyz");

        let packages = read_pet_packages_from_roots(&[missing, primary.clone()]);

        let ids: Vec<&str> = packages.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, vec!["abe"]);

        fs::remove_dir_all(&primary).ok();
    }
}
