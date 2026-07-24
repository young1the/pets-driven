//! User pet-asset discovery, shared so the CLI's random-asset default can
//! prefer the pets a user actually installed.
//!
//! `pdd hatch` with no `--asset` picks an asset at random. It should reach for
//! the pets the user added — the ones in their designated pet source folder —
//! before the app's built-ins, so someone who installed their own pets sees
//! those hatched rather than a bundled default. This module resolves that
//! folder the same way the desktop does and lists the addressable, renderable
//! pet ids inside it.
//!
//! coupling: mirrors `apps/desktop/src-tauri/src/pet_assets.rs`
//! (`designated_pet_source_root`, `read_pet_packages`). A pet folder's name is
//! its asset id; the folder must carry a `pet.json` plus the spritesheet the
//! manifest names (default `spritesheet.webp`). Keep the two in agreement so
//! the CLI never hatches an id the desktop cannot render.

use std::path::{Path, PathBuf};

use serde_json::Value;

/// The Petdex default user pet folder, `~/.petdex/pets`. `PETDEX_HOME` overrides
/// the `~/.petdex` part; otherwise it hangs off the user profile / home dir.
pub fn petdex_pets_root() -> Option<PathBuf> {
    std::env::var_os("PETDEX_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join(".petdex")))
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".petdex")))
        .map(|home| home.join("pets"))
}

/// The single designated user pet folder, read from the persisted `document`:
/// the `petSourceDirectory` string when set, else the first non-empty entry of
/// the legacy `petSourceDirectories` list, else the Petdex default.
pub fn designated_pet_source_root(document: &Value) -> Option<PathBuf> {
    if let Some(path) = document.get("petSourceDirectory").and_then(Value::as_str) {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }

    if let Some(directories) = document.get("petSourceDirectories").and_then(Value::as_array) {
        for directory in directories {
            if let Some(path) = directory.as_str() {
                let trimmed = path.trim();
                if !trimmed.is_empty() {
                    return Some(PathBuf::from(trimmed));
                }
            }
        }
    }

    petdex_pets_root()
}

/// The asset ids the user installed in `document`'s designated pet folder,
/// sorted. Empty when no folder is designated, the folder is unreadable, or it
/// holds no renderable pet — in which case the caller falls back to built-ins.
pub fn user_asset_ids(document: &Value) -> Vec<String> {
    designated_pet_source_root(document)
        .map(|root| asset_ids_in(&root))
        .unwrap_or_default()
}

/// Scan `root` for hatchable pet folders and return their ids, sorted. A pet
/// folder's name is its asset id; it must be a valid id and carry a `pet.json`
/// plus the spritesheet the manifest names.
pub fn asset_ids_in(root: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(root) else {
        return Vec::new();
    };

    let mut ids: Vec<String> = entries
        .flatten()
        .filter(|entry| {
            entry
                .file_type()
                .map(|kind| kind.is_dir())
                .unwrap_or(false)
        })
        .filter_map(|entry| {
            let id = entry.file_name().into_string().ok()?;
            (pets_driven_core::is_valid_asset_id(&id) && has_spritesheet(&entry.path()))
                .then_some(id)
        })
        .collect();

    ids.sort();
    ids.dedup();
    ids
}

/// Whether `pet_dir` carries a readable `pet.json` and the spritesheet it names
/// (default `spritesheet.webp`) exists on disk. A directory without a manifest
/// or without its sheet is not a renderable pet, so it is not hatchable.
fn has_spritesheet(pet_dir: &Path) -> bool {
    let Ok(manifest_text) = std::fs::read_to_string(pet_dir.join("pet.json")) else {
        return false;
    };

    let sheet = serde_json::from_str::<Value>(&manifest_text)
        .ok()
        .and_then(|manifest| {
            manifest
                .get("spritesheetPath")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| "spritesheet.webp".to_string());

    pet_dir.join(sheet).exists()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir() -> PathBuf {
        static COUNTER: AtomicU64 = AtomicU64::new(0);
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "pets-driven-pet-source-{}-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed),
            nanos
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_pet(root: &Path, dir: &str, manifest: &str, sheet: Option<&str>) {
        let pet_dir = root.join(dir);
        std::fs::create_dir_all(&pet_dir).unwrap();
        std::fs::write(pet_dir.join("pet.json"), manifest).unwrap();
        if let Some(sheet) = sheet {
            std::fs::write(pet_dir.join(sheet), b"webp").unwrap();
        }
    }

    #[test]
    fn lists_only_renderable_pet_folders_sorted() {
        let root = unique_temp_dir();
        write_pet(&root, "zed", r#"{"displayName":"Zed"}"#, Some("spritesheet.webp"));
        write_pet(&root, "abe", r#"{"displayName":"Abe"}"#, Some("spritesheet.webp"));
        // No manifest -> skipped.
        std::fs::create_dir_all(root.join("bare")).unwrap();
        std::fs::write(root.join("bare").join("spritesheet.webp"), b"webp").unwrap();
        // Manifest but no sheet -> skipped.
        write_pet(&root, "no-art", r#"{"displayName":"No Art"}"#, None);

        assert_eq!(asset_ids_in(&root), vec!["abe".to_string(), "zed".to_string()]);

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn honors_a_non_default_spritesheet_path() {
        let root = unique_temp_dir();
        write_pet(
            &root,
            "kirby",
            r#"{"displayName":"Kirby","spritesheetPath":"sheet.png"}"#,
            Some("sheet.png"),
        );

        assert_eq!(asset_ids_in(&root), vec!["kirby".to_string()]);

        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn missing_folder_yields_no_ids() {
        let root = unique_temp_dir();
        let ghost = root.join("does-not-exist");
        assert!(asset_ids_in(&ghost).is_empty());
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn designated_root_prefers_the_explicit_directory() {
        let document = serde_json::json!({
            "petSourceDirectory": "  D:/pets  ",
            "petSourceDirectories": ["D:/legacy"],
        });
        assert_eq!(
            designated_pet_source_root(&document),
            Some(PathBuf::from("D:/pets"))
        );
    }

    #[test]
    fn designated_root_falls_back_to_the_legacy_list() {
        let document = serde_json::json!({
            "petSourceDirectory": "   ",
            "petSourceDirectories": ["", "D:/legacy"],
        });
        assert_eq!(
            designated_pet_source_root(&document),
            Some(PathBuf::from("D:/legacy"))
        );
    }

    #[test]
    fn user_asset_ids_reads_the_designated_folder() {
        let folder = unique_temp_dir();
        write_pet(&folder, "mycat", r#"{"displayName":"My Cat"}"#, Some("spritesheet.webp"));
        let document = serde_json::json!({ "petSourceDirectory": folder.to_str().unwrap() });

        assert_eq!(user_asset_ids(&document), vec!["mycat".to_string()]);

        std::fs::remove_dir_all(&folder).ok();
    }
}
