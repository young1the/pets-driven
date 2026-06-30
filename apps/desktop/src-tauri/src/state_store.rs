use std::{
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::Manager;

const PETS_DRIVEN_STATE_FILE_NAME: &str = "state.v1.json";

/// Serialises concurrent hatch read-modify-write cycles against the state file.
static HATCH_LOCK: Mutex<()> = Mutex::new(());
static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

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

pub(crate) fn read_state_pub(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    read_state(app)
}

fn read_state(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    let state_path = pets_driven_state_path(app)?;

    if !state_path.exists() {
        return Ok(empty_pets_driven_state());
    }

    let state_text = fs::read_to_string(&state_path)
        .map_err(|error| format!("Could not read {}: {error}", state_path.display()))?;

    serde_json::from_str(&state_text)
        .map_err(|error| format!("Could not parse {}: {error}", state_path.display()))
}

fn write_state(app: &tauri::AppHandle, state: &serde_json::Value) -> Result<(), String> {
    let state_path = pets_driven_state_path(app)?;

    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }

    let state_text = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Could not serialize pets-driven state: {error}"))?;

    fs::write(&state_path, state_text)
        .map_err(|error| format!("Could not write {}: {error}", state_path.display()))
}

#[tauri::command]
pub(crate) fn read_pets_driven_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    read_state(&app)
}

#[tauri::command]
pub(crate) fn write_pets_driven_state(
    app: tauri::AppHandle,
    state: serde_json::Value,
) -> Result<(), String> {
    write_state(&app, &state)
}

pub(crate) struct HatchInput {
    pub cwd: String,
    pub asset_id: String,
    pub name: String,
    pub personality_id: String,
}

struct HatchIds {
    pet_id: String,
    profile_id: String,
    working_directory_id: String,
    agent_source_id: String,
}

#[derive(Debug, PartialEq)]
pub(crate) enum HatchError {
    UnknownPersonality,
    InvalidCwd,
    Occupied { owner_pet_id: String },
}

// coupling: keep these in sync with the factories in
// packages/pet-engine/src/pets/personalities/factories.ts
fn personality_preset(personality_id: &str) -> Option<serde_json::Value> {
    match personality_id {
        "playful" => Some(serde_json::json!({
            "idleForce": 0.0008,
            "activeForce": 0.0016,
            "seekForce": 0.002,
            "idleConversationMs": 9000,
            "completionIntent": "seek",
            "openness": 0.7,
            "conscientiousness": 0.4,
            "extraversion": 0.85,
            "agreeableness": 0.5,
            "neuroticism": 0.1
        })),
        "attentive" => Some(serde_json::json!({
            "idleForce": 0.0005,
            "activeForce": 0.001,
            "seekForce": 0.0016,
            "idleConversationMs": 12000,
            "completionIntent": "seek",
            "openness": 0.3,
            "conscientiousness": 0.6,
            "extraversion": 0.8,
            "agreeableness": 0.8,
            "neuroticism": 0.2
        })),
        "reserved" => Some(serde_json::json!({
            "idleForce": 0.0004,
            "activeForce": 0.0008,
            "seekForce": 0.001,
            "completionIntent": "idle",
            "openness": 0.3,
            "conscientiousness": 0.5,
            "extraversion": 0.2,
            "agreeableness": 0.4,
            "neuroticism": 0.75
        })),
        "curious" => Some(serde_json::json!({
            "idleForce": 0.0007,
            "activeForce": 0.0013,
            "seekForce": 0.0015,
            "idleConversationMs": 14000,
            "completionIntent": "seek",
            "openness": 0.9,
            "conscientiousness": 0.35,
            "extraversion": 0.55,
            "agreeableness": 0.6,
            "neuroticism": 0.25
        })),
        "steady" => Some(serde_json::json!({
            "idleForce": 0.00045,
            "activeForce": 0.0009,
            "seekForce": 0.0012,
            "idleConversationMs": 18000,
            "completionIntent": "idle",
            "openness": 0.45,
            "conscientiousness": 0.85,
            "extraversion": 0.45,
            "agreeableness": 0.7,
            "neuroticism": 0.15
        })),
        "bold" => Some(serde_json::json!({
            "idleForce": 0.0009,
            "activeForce": 0.0018,
            "seekForce": 0.0022,
            "idleConversationMs": 8000,
            "completionIntent": "seek",
            "openness": 0.8,
            "conscientiousness": 0.45,
            "extraversion": 0.9,
            "agreeableness": 0.55,
            "neuroticism": 0.12
        })),
        _ => None,
    }
}

// ponytail: lightweight path compare for occupancy only; runtime hook routing
// re-normalises both sides in TS, so this just needs to catch the same folder.
fn comparable_path(path: &str) -> String {
    path.trim()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

fn push_array(state: &mut serde_json::Value, key: &str, item: serde_json::Value) {
    let object = match state.as_object_mut() {
        Some(object) => object,
        None => return,
    };
    let entry = object
        .entry(key)
        .or_insert_with(|| serde_json::Value::Array(Vec::new()));

    if let Some(array) = entry.as_array_mut() {
        array.push(item);
    } else {
        *entry = serde_json::Value::Array(vec![item]);
    }
}

fn apply_hatch(
    state: &serde_json::Value,
    input: &HatchInput,
    ids: &HatchIds,
    now: u64,
) -> Result<serde_json::Value, HatchError> {
    let personality =
        personality_preset(&input.personality_id).ok_or(HatchError::UnknownPersonality)?;

    // Guard against a corrupted path: a control character (e.g. a CR injected by
    // an unescaped backslash in the request JSON) would store a folder that can
    // never be opened or matched. Reject it rather than persist garbage.
    if input.cwd.trim().is_empty() || input.cwd.contains(['\r', '\n', '\t']) {
        return Err(HatchError::InvalidCwd);
    }

    let target = comparable_path(&input.cwd);
    if let Some(directories) = state
        .get("registeredWorkingDirectories")
        .and_then(|value| value.as_array())
    {
        for directory in directories {
            let path = directory
                .get("path")
                .and_then(|value| value.as_str())
                .unwrap_or_default();

            if comparable_path(path) == target {
                let owner_pet_id = directory
                    .get("petId")
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_string();

                return Err(HatchError::Occupied { owner_pet_id });
            }
        }
    }

    let mut next = state.clone();
    // The hatch records use the v2 shape (named pet, profile); pin the version
    // so the frontend does not run the v1->v2 migration and overwrite the name.
    if let Some(object) = next.as_object_mut() {
        object.insert("schemaVersion".to_string(), serde_json::json!(2));
    }

    push_array(
        &mut next,
        "pets",
        serde_json::json!({
            "id": ids.pet_id,
            "workingDirectoryId": ids.working_directory_id,
            "assetId": input.asset_id,
            "profileId": ids.profile_id,
            "name": input.name,
            "adoptedAt": now,
            "archived": false,
            "visible": true
        }),
    );
    push_array(
        &mut next,
        "petProfiles",
        serde_json::json!({
            "id": ids.profile_id,
            "petAssetId": input.asset_id,
            "personalityId": input.personality_id,
            "personality": personality
        }),
    );
    push_array(
        &mut next,
        "registeredWorkingDirectories",
        serde_json::json!({
            "id": ids.working_directory_id,
            "path": input.cwd,
            "petId": ids.pet_id,
            "agentSourceId": ids.agent_source_id,
            "createdAt": now,
            "updatedAt": now
        }),
    );

    Ok(next)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn new_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    let counter = ID_COUNTER.fetch_add(1, Ordering::Relaxed);

    format!("{prefix}-{nanos}-{counter}")
}

fn hatch_error_message(error: HatchError) -> String {
    match error {
        HatchError::UnknownPersonality => "Unknown personality preset".to_string(),
        HatchError::InvalidCwd => {
            "Working directory path is empty or contains control characters".to_string()
        }
        HatchError::Occupied { owner_pet_id } => {
            format!("Working directory already has pet {owner_pet_id}")
        }
    }
}

/// Find the pet id whose registered working directory matches `cwd`.
pub(crate) fn find_pet_id_by_cwd(state: &serde_json::Value, cwd: &str) -> Option<String> {
    let target = comparable_path(cwd);
    state
        .get("registeredWorkingDirectories")
        .and_then(|v| v.as_array())
        .and_then(|dirs| {
            dirs.iter().find(|dir| {
                dir.get("path")
                    .and_then(|p| p.as_str())
                    .map(|p| comparable_path(p) == target)
                    .unwrap_or(false)
            })
        })
        .and_then(|dir| dir.get("petId"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Authoritative create path: serialise, read the state file, append the new
/// pet, and persist. Returns the new state for the caller to broadcast.
pub(crate) fn hatch_pet(
    app: &tauri::AppHandle,
    input: HatchInput,
) -> Result<serde_json::Value, String> {
    let _guard = HATCH_LOCK
        .lock()
        .map_err(|error| format!("Hatch lock poisoned: {error}"))?;

    let state = read_state(app)?;
    let ids = HatchIds {
        pet_id: new_id("pet"),
        profile_id: new_id("profile"),
        working_directory_id: new_id("dir"),
        agent_source_id: new_id("agent"),
    };

    let next = apply_hatch(&state, &input, &ids, now_ms()).map_err(hatch_error_message)?;
    write_state(app, &next)?;

    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_ids() -> HatchIds {
        HatchIds {
            pet_id: "pet-1".to_string(),
            profile_id: "profile-1".to_string(),
            working_directory_id: "dir-1".to_string(),
            agent_source_id: "agent-1".to_string(),
        }
    }

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

    #[test]
    fn apply_hatch_appends_pet_profile_and_directory() {
        let input = HatchInput {
            cwd: "D:/proj".to_string(),
            asset_id: "agumon".to_string(),
            name: "Rex".to_string(),
            personality_id: "playful".to_string(),
        };

        let next = apply_hatch(&empty_pets_driven_state(), &input, &sample_ids(), 1000)
            .expect("hatch should succeed");

        assert_eq!(next["schemaVersion"], 2);

        let pet = &next["pets"][0];
        assert_eq!(pet["id"], "pet-1");
        assert_eq!(pet["name"], "Rex");
        assert_eq!(pet["assetId"], "agumon");
        assert_eq!(pet["profileId"], "profile-1");
        assert_eq!(pet["workingDirectoryId"], "dir-1");
        assert_eq!(pet["adoptedAt"], 1000);
        assert_eq!(pet["archived"], false);
        assert_eq!(pet["visible"], true);

        let profile = &next["petProfiles"][0];
        assert_eq!(profile["id"], "profile-1");
        assert_eq!(profile["petAssetId"], "agumon");
        assert_eq!(profile["personalityId"], "playful");
        assert_eq!(profile["personality"]["extraversion"], 0.85);

        let directory = &next["registeredWorkingDirectories"][0];
        assert_eq!(directory["id"], "dir-1");
        assert_eq!(directory["path"], "D:/proj");
        assert_eq!(directory["petId"], "pet-1");
        assert_eq!(directory["agentSourceId"], "agent-1");
        assert_eq!(directory["createdAt"], 1000);
    }

    #[test]
    fn apply_hatch_rejects_occupied_cwd_case_insensitively() {
        let first = apply_hatch(
            &empty_pets_driven_state(),
            &HatchInput {
                cwd: "D:/Proj".to_string(),
                asset_id: "agumon".to_string(),
                name: "Rex".to_string(),
                personality_id: "playful".to_string(),
            },
            &sample_ids(),
            1,
        )
        .expect("first hatch should succeed");

        let error = apply_hatch(
            &first,
            &HatchInput {
                cwd: "d:\\proj".to_string(),
                asset_id: "gabumon".to_string(),
                name: "Blue".to_string(),
                personality_id: "reserved".to_string(),
            },
            &HatchIds {
                pet_id: "pet-2".to_string(),
                profile_id: "profile-2".to_string(),
                working_directory_id: "dir-2".to_string(),
                agent_source_id: "agent-2".to_string(),
            },
            2,
        )
        .expect_err("second hatch on the same folder should be rejected");

        assert_eq!(
            error,
            HatchError::Occupied {
                owner_pet_id: "pet-1".to_string()
            }
        );
    }

    #[test]
    fn apply_hatch_rejects_cwd_with_control_characters() {
        let error = apply_hatch(
            &empty_pets_driven_state(),
            &HatchInput {
                cwd: "D:\realtime".to_string(),
                asset_id: "agumon".to_string(),
                name: "Rex".to_string(),
                personality_id: "playful".to_string(),
            },
            &sample_ids(),
            1,
        )
        .expect_err("a carriage return in the path should be rejected");

        assert_eq!(error, HatchError::InvalidCwd);
    }

    #[test]
    fn apply_hatch_rejects_unknown_personality() {
        let error = apply_hatch(
            &empty_pets_driven_state(),
            &HatchInput {
                cwd: "D:/proj".to_string(),
                asset_id: "agumon".to_string(),
                name: "Rex".to_string(),
                personality_id: "chaotic".to_string(),
            },
            &sample_ids(),
            1,
        )
        .expect_err("unknown personality should be rejected");

        assert_eq!(error, HatchError::UnknownPersonality);
    }

    #[test]
    fn apply_hatch_accepts_curious_personality() {
        let input = HatchInput {
            cwd: "D:/proj".to_string(),
            asset_id: "agumon".to_string(),
            name: "Rex".to_string(),
            personality_id: "curious".to_string(),
        };

        let next = apply_hatch(&empty_pets_driven_state(), &input, &sample_ids(), 1000)
            .expect("curious personality should be accepted");

        let profile = &next["petProfiles"][0];
        assert_eq!(profile["personalityId"], "curious");
        assert_eq!(profile["personality"]["openness"], 0.9);
        assert_eq!(profile["personality"]["extraversion"], 0.55);
    }

    #[test]
    fn new_id_starts_with_prefix() {
        assert!(new_id("pet").starts_with("pet-"));
    }

    #[test]
    fn find_pet_id_by_cwd_matches_case_insensitively() {
        let state = apply_hatch(
            &empty_pets_driven_state(),
            &HatchInput {
                cwd: "D:/Proj".to_string(),
                asset_id: "agumon".to_string(),
                name: "Rex".to_string(),
                personality_id: "playful".to_string(),
            },
            &sample_ids(),
            1,
        )
        .unwrap();

        assert_eq!(
            find_pet_id_by_cwd(&state, "d:\\proj"),
            Some("pet-1".to_string())
        );
    }

    #[test]
    fn find_pet_id_by_cwd_returns_none_for_unknown_path() {
        assert_eq!(find_pet_id_by_cwd(&empty_pets_driven_state(), "D:/proj"), None);
    }
}
