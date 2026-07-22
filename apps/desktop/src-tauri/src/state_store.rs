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

/// Serialises concurrent read-modify-write cycles against the state file
/// (hatch, pet update, pet delete).
static STATE_MUTATION_LOCK: Mutex<()> = Mutex::new(());
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

/// Persist the state file by writing a sibling temp file and renaming it over
/// the target. A plain `fs::write` truncates in place, so a reader racing the
/// write (the webview reloading after a hatch, say) could observe a partial
/// file and fall back to empty state.
fn write_state(app: &tauri::AppHandle, state: &serde_json::Value) -> Result<(), String> {
    let state_path = pets_driven_state_path(app)?;

    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }

    let state_text = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Could not serialize pets-driven state: {error}"))?;

    let temp_path = state_path.with_file_name(format!(
        "{PETS_DRIVEN_STATE_FILE_NAME}.{}.tmp",
        new_id("write")
    ));

    fs::write(&temp_path, state_text)
        .map_err(|error| format!("Could not write {}: {error}", temp_path.display()))?;

    fs::rename(&temp_path, &state_path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        format!("Could not replace {}: {error}", state_path.display())
    })
}

#[tauri::command]
pub(crate) fn read_pets_driven_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    read_state(&app)
}

/// The webview persists the whole state blob, so this write has to queue behind
/// the authoritative read-modify-write cycles (hatch, pet update, pet delete)
/// that the ingress thread runs against the same file.
#[tauri::command]
pub(crate) fn write_pets_driven_state(
    app: tauri::AppHandle,
    state: serde_json::Value,
) -> Result<(), String> {
    let _guard = STATE_MUTATION_LOCK
        .lock()
        .map_err(|error| format!("State lock poisoned: {error}"))?;

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
pub(crate) const PERSONALITY_IDS: [&str; 13] = [
    "playful",
    "attentive",
    "reserved",
    "curious",
    "steady",
    "feisty",
    "gentle",
    "mischievous",
    "lazy",
    "zen",
    "aloof",
    "skittish",
    "shrewd",
];

pub(crate) fn personality_preset(personality_id: &str) -> Option<serde_json::Value> {
    match personality_id {
        "playful" => Some(serde_json::json!({
            "standForce": 0.0008,
            "pursueForce": 0.0016,
            "arriveForce": 0.002,
            "idleConversationMs": 9000,
            "completionIntent": "arrive",
            "openness": 0.75,
            "conscientiousness": 0.3,
            "extraversion": 0.95,
            "agreeableness": 0.55,
            "neuroticism": 0.08
        })),
        "attentive" => Some(serde_json::json!({
            "standForce": 0.0005,
            "pursueForce": 0.001,
            "arriveForce": 0.0016,
            "idleConversationMs": 11000,
            "completionIntent": "arrive",
            "openness": 0.25,
            "conscientiousness": 0.72,
            "extraversion": 0.72,
            "agreeableness": 0.95,
            "neuroticism": 0.15
        })),
        "reserved" => Some(serde_json::json!({
            "standForce": 0.0004,
            "pursueForce": 0.0008,
            "arriveForce": 0.001,
            "completionIntent": "stand",
            "openness": 0.22,
            "conscientiousness": 0.55,
            "extraversion": 0.12,
            "agreeableness": 0.38,
            "neuroticism": 0.82
        })),
        "curious" => Some(serde_json::json!({
            "standForce": 0.0007,
            "pursueForce": 0.0013,
            "arriveForce": 0.0015,
            "idleConversationMs": 13000,
            "completionIntent": "arrive",
            "openness": 0.98,
            "conscientiousness": 0.35,
            "extraversion": 0.45,
            "agreeableness": 0.55,
            "neuroticism": 0.3
        })),
        "steady" => Some(serde_json::json!({
            "standForce": 0.00045,
            "pursueForce": 0.0009,
            "arriveForce": 0.0012,
            "idleConversationMs": 20000,
            "completionIntent": "stand",
            "openness": 0.35,
            "conscientiousness": 0.95,
            "extraversion": 0.4,
            "agreeableness": 0.7,
            "neuroticism": 0.06
        })),
        "feisty" => Some(serde_json::json!({
            "standForce": 0.0009,
            "pursueForce": 0.0018,
            "arriveForce": 0.0022,
            "idleConversationMs": 9000,
            "completionIntent": "arrive",
            "openness": 0.55,
            "conscientiousness": 0.4,
            "extraversion": 0.85,
            "agreeableness": 0.3,
            "neuroticism": 0.6
        })),
        "gentle" => Some(serde_json::json!({
            "standForce": 0.0004,
            "pursueForce": 0.0008,
            "arriveForce": 0.001,
            "idleConversationMs": 14000,
            "completionIntent": "arrive",
            "openness": 0.45,
            "conscientiousness": 0.65,
            "extraversion": 0.3,
            "agreeableness": 0.98,
            "neuroticism": 0.12
        })),
        "mischievous" => Some(serde_json::json!({
            "standForce": 0.001,
            "pursueForce": 0.002,
            "arriveForce": 0.0025,
            "idleConversationMs": 8000,
            "completionIntent": "arrive",
            "openness": 0.9,
            "conscientiousness": 0.1,
            "extraversion": 0.82,
            "agreeableness": 0.32,
            "neuroticism": 0.35
        })),
        "lazy" => Some(serde_json::json!({
            "standForce": 0.0002,
            "pursueForce": 0.0005,
            "arriveForce": 0.0007,
            "idleConversationMs": 30000,
            "completionIntent": "stand",
            "openness": 0.28,
            "conscientiousness": 0.18,
            "extraversion": 0.1,
            "agreeableness": 0.55,
            "neuroticism": 0.18
        })),
        "zen" => Some(serde_json::json!({
            "standForce": 0.00035,
            "pursueForce": 0.0007,
            "arriveForce": 0.0009,
            "idleConversationMs": 22000,
            "completionIntent": "stand",
            "openness": 0.6,
            "conscientiousness": 0.7,
            "extraversion": 0.45,
            "agreeableness": 0.8,
            "neuroticism": 0.02
        })),
        "aloof" => Some(serde_json::json!({
            "standForce": 0.00035,
            "pursueForce": 0.0007,
            "arriveForce": 0.0009,
            "idleConversationMs": 24000,
            "completionIntent": "stand",
            "openness": 0.4,
            "conscientiousness": 0.6,
            "extraversion": 0.15,
            "agreeableness": 0.08,
            "neuroticism": 0.3
        })),
        "skittish" => Some(serde_json::json!({
            "standForce": 0.0006,
            "pursueForce": 0.0013,
            "arriveForce": 0.0016,
            "completionIntent": "stand",
            "openness": 0.3,
            "conscientiousness": 0.4,
            "extraversion": 0.25,
            "agreeableness": 0.5,
            "neuroticism": 0.95
        })),
        "shrewd" => Some(serde_json::json!({
            "standForce": 0.0005,
            "pursueForce": 0.001,
            "arriveForce": 0.0013,
            "idleConversationMs": 21000,
            "completionIntent": "stand",
            "openness": 0.85,
            "conscientiousness": 0.82,
            "extraversion": 0.3,
            "agreeableness": 0.25,
            "neuroticism": 0.08
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
    let _guard = STATE_MUTATION_LOCK
        .lock()
        .map_err(|error| format!("State lock poisoned: {error}"))?;

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

/// One pet's externally-relevant fields, joined with its personality id and
/// working directory — the shape returned by the `/pets-driven/list`,
/// `/pets-driven/pet`, and pet update/delete HTTP endpoints.
fn pet_view(state: &serde_json::Value, pet: &serde_json::Value) -> serde_json::Value {
    let pet_id = pet.get("id").and_then(|value| value.as_str()).unwrap_or_default();
    let profile_id = pet
        .get("profileId")
        .and_then(|value| value.as_str())
        .unwrap_or_default();

    let personality_id = state
        .get("petProfiles")
        .and_then(|value| value.as_array())
        .and_then(|profiles| {
            profiles
                .iter()
                .find(|profile| profile.get("id").and_then(|value| value.as_str()) == Some(profile_id))
        })
        .and_then(|profile| profile.get("personalityId"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    let cwd = state
        .get("registeredWorkingDirectories")
        .and_then(|value| value.as_array())
        .and_then(|directories| {
            directories
                .iter()
                .find(|directory| directory.get("petId").and_then(|value| value.as_str()) == Some(pet_id))
        })
        .and_then(|directory| directory.get("path"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    serde_json::json!({
        "id": pet.get("id").cloned().unwrap_or(serde_json::Value::Null),
        "name": pet.get("name").cloned().unwrap_or(serde_json::Value::Null),
        "assetId": pet.get("assetId").cloned().unwrap_or(serde_json::Value::Null),
        "personalityId": personality_id,
        "cwd": cwd,
        "visible": pet.get("visible").cloned().unwrap_or(serde_json::Value::Null),
        "archived": pet.get("archived").cloned().unwrap_or(serde_json::Value::Null),
        "adoptedAt": pet.get("adoptedAt").cloned().unwrap_or(serde_json::Value::Null),
    })
}

/// The joined view of every pet in `state`, for the `/pets-driven/list` endpoint.
pub(crate) fn list_pets_view(state: &serde_json::Value) -> Vec<serde_json::Value> {
    state
        .get("pets")
        .and_then(|value| value.as_array())
        .map(|pets| pets.iter().map(|pet| pet_view(state, pet)).collect())
        .unwrap_or_default()
}

/// The joined view of a single pet, for the `/pets-driven/pet` endpoint.
pub(crate) fn find_pet_view(state: &serde_json::Value, pet_id: &str) -> Option<serde_json::Value> {
    state
        .get("pets")
        .and_then(|value| value.as_array())?
        .iter()
        .find(|pet| pet.get("id").and_then(|value| value.as_str()) == Some(pet_id))
        .map(|pet| pet_view(state, pet))
}

pub(crate) struct PetUpdateInput {
    pub pet_id: String,
    pub name: Option<String>,
    pub personality_id: Option<String>,
    pub visible: Option<bool>,
    pub archived: Option<bool>,
    pub memo: Option<String>,
    /// The pet's registered working directory. `None` leaves the current
    /// binding untouched, `Some(None)` clears it (the pet keeps living with no
    /// folder), and `Some(Some(path))` re-binds the pet to that folder.
    pub cwd: Option<Option<String>>,
}

/// The ids a working-directory re-bind needs, generated by the caller so
/// `apply_pet_update` stays pure (mirrors `HatchIds`).
struct WorkingDirectoryIds {
    working_directory_id: String,
    agent_source_id: String,
}

#[derive(Debug, PartialEq)]
pub(crate) enum PetUpdateError {
    NotFound,
    UnknownPersonality,
    InvalidCwd,
    CwdOccupied { owner_pet_id: String },
}

/// Apply a partial patch to one pet record (and its profile's personality, if
/// `personality_id` is set). Unset fields are left untouched.
fn apply_pet_update(
    state: &serde_json::Value,
    input: &PetUpdateInput,
    ids: &WorkingDirectoryIds,
    now: u64,
) -> Result<serde_json::Value, PetUpdateError> {
    let pet_exists = state
        .get("pets")
        .and_then(|value| value.as_array())
        .is_some_and(|pets| {
            pets.iter()
                .any(|pet| pet.get("id").and_then(|value| value.as_str()) == Some(input.pet_id.as_str()))
        });

    if !pet_exists {
        return Err(PetUpdateError::NotFound);
    }

    let personality = match &input.personality_id {
        Some(personality_id) => match personality_preset(personality_id) {
            Some(personality) => Some(personality),
            None => return Err(PetUpdateError::UnknownPersonality),
        },
        None => None,
    };

    // Validate the requested folder before touching state, so a rejected
    // re-bind leaves the other patched fields unwritten too.
    if let Some(Some(cwd)) = &input.cwd {
        // Same guard as `apply_hatch`: a control character in the path would
        // store a folder that can never be opened or matched again.
        if cwd.trim().is_empty() || cwd.contains(['\r', '\n', '\t']) {
            return Err(PetUpdateError::InvalidCwd);
        }

        if let Some(owner_pet_id) = find_pet_id_by_cwd(state, cwd) {
            if owner_pet_id != input.pet_id {
                return Err(PetUpdateError::CwdOccupied { owner_pet_id });
            }
        }
    }

    let mut next = state.clone();
    let mut profile_id = String::new();

    if let Some(pets) = next.get_mut("pets").and_then(|value| value.as_array_mut()) {
        for pet in pets.iter_mut() {
            if pet.get("id").and_then(|value| value.as_str()) != Some(input.pet_id.as_str()) {
                continue;
            }

            profile_id = pet
                .get("profileId")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string();

            let Some(object) = pet.as_object_mut() else {
                continue;
            };

            if let Some(name) = &input.name {
                object.insert("name".to_string(), serde_json::json!(name));
            }
            if let Some(visible) = input.visible {
                object.insert("visible".to_string(), serde_json::json!(visible));
            }
            if let Some(archived) = input.archived {
                object.insert("archived".to_string(), serde_json::json!(archived));
            }
            if let Some(memo) = &input.memo {
                object.insert("memo".to_string(), serde_json::json!(memo));
            }
        }
    }

    if let (Some(personality_id), Some(personality)) = (&input.personality_id, personality) {
        if let Some(profiles) = next.get_mut("petProfiles").and_then(|value| value.as_array_mut()) {
            for profile in profiles.iter_mut() {
                if profile.get("id").and_then(|value| value.as_str()) != Some(profile_id.as_str()) {
                    continue;
                }

                if let Some(object) = profile.as_object_mut() {
                    object.insert("personalityId".to_string(), serde_json::json!(personality_id));
                    object.insert("personality".to_string(), personality.clone());
                }
            }
        }
    }

    if let Some(cwd) = &input.cwd {
        apply_pet_working_directory(&mut next, &input.pet_id, cwd.as_deref(), ids, now);
    }

    Ok(next)
}

/// Re-point one pet's registered working directory: `cwd` of `None` detaches it,
/// `Some(path)` binds it to that folder. A pet holds at most one directory and a
/// directory belongs to exactly one pet, so the pet's current entry is dropped
/// either way before a new one is appended, and the pet's back-pointer is kept
/// in step (mirrors `clearWorkingDirectoryForPet` and `registerWorkingDirectory`
/// in apps/desktop/src/app-state/pet-adoption.ts).
fn apply_pet_working_directory(
    next: &mut serde_json::Value,
    pet_id: &str,
    cwd: Option<&str>,
    ids: &WorkingDirectoryIds,
    now: u64,
) {
    if let Some(directories) = next
        .get_mut("registeredWorkingDirectories")
        .and_then(|value| value.as_array_mut())
    {
        directories
            .retain(|directory| directory.get("petId").and_then(|value| value.as_str()) != Some(pet_id));
    }

    let working_directory_id = match cwd {
        Some(path) => {
            push_array(
                next,
                "registeredWorkingDirectories",
                serde_json::json!({
                    "id": ids.working_directory_id,
                    "path": path,
                    "petId": pet_id,
                    "agentSourceId": ids.agent_source_id,
                    "createdAt": now,
                    "updatedAt": now
                }),
            );
            serde_json::json!(ids.working_directory_id)
        }
        None => serde_json::Value::Null,
    };

    if let Some(pets) = next.get_mut("pets").and_then(|value| value.as_array_mut()) {
        for pet in pets.iter_mut() {
            if pet.get("id").and_then(|value| value.as_str()) != Some(pet_id) {
                continue;
            }

            if let Some(object) = pet.as_object_mut() {
                object.insert("workingDirectoryId".to_string(), working_directory_id.clone());
            }
        }
    }
}

fn pet_update_error_message(error: PetUpdateError, pet_id: &str) -> String {
    match error {
        PetUpdateError::NotFound => format!("No pet found with id {pet_id}"),
        PetUpdateError::UnknownPersonality => "Unknown personality preset".to_string(),
        PetUpdateError::InvalidCwd => {
            "Working directory path is empty or contains control characters".to_string()
        }
        PetUpdateError::CwdOccupied { owner_pet_id } => {
            format!("Working directory already has pet {owner_pet_id}")
        }
    }
}

/// Authoritative pet-update path, mirroring `hatch_pet`'s serialise/read/write
/// cycle. Returns the new state for the caller to broadcast.
pub(crate) fn update_pet(
    app: &tauri::AppHandle,
    input: PetUpdateInput,
) -> Result<serde_json::Value, String> {
    let _guard = STATE_MUTATION_LOCK
        .lock()
        .map_err(|error| format!("State lock poisoned: {error}"))?;

    let state = read_state(app)?;
    let ids = WorkingDirectoryIds {
        working_directory_id: new_id("dir"),
        agent_source_id: new_id("agent"),
    };
    let next = apply_pet_update(&state, &input, &ids, now_ms())
        .map_err(|error| pet_update_error_message(error, &input.pet_id))?;
    write_state(app, &next)?;

    Ok(next)
}

/// Permanently remove a pet, its profile, and any working directory it holds
/// (mirrors the frontend's `removePet` in app-state/pet-adoption.ts).
fn apply_remove_pet(state: &serde_json::Value, pet_id: &str) -> Result<serde_json::Value, String> {
    let pet = state
        .get("pets")
        .and_then(|value| value.as_array())
        .and_then(|pets| {
            pets.iter()
                .find(|pet| pet.get("id").and_then(|value| value.as_str()) == Some(pet_id))
        })
        .ok_or_else(|| format!("No pet found with id {pet_id}"))?;

    let profile_id = pet
        .get("profileId")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();

    let mut next = state.clone();
    let Some(object) = next.as_object_mut() else {
        return Ok(next);
    };

    if let Some(serde_json::Value::Array(pets)) = object.get_mut("pets") {
        pets.retain(|pet| pet.get("id").and_then(|value| value.as_str()) != Some(pet_id));
    }
    if let Some(serde_json::Value::Array(profiles)) = object.get_mut("petProfiles") {
        profiles.retain(|profile| {
            profile.get("id").and_then(|value| value.as_str()) != Some(profile_id.as_str())
        });
    }
    if let Some(serde_json::Value::Array(directories)) = object.get_mut("registeredWorkingDirectories")
    {
        directories.retain(|directory| directory.get("petId").and_then(|value| value.as_str()) != Some(pet_id));
    }

    Ok(next)
}

/// Authoritative pet-delete path, mirroring `hatch_pet`'s serialise/read/write
/// cycle. Returns the new state for the caller to broadcast.
pub(crate) fn remove_pet(app: &tauri::AppHandle, pet_id: &str) -> Result<serde_json::Value, String> {
    let _guard = STATE_MUTATION_LOCK
        .lock()
        .map_err(|error| format!("State lock poisoned: {error}"))?;

    let state = read_state(app)?;
    let next = apply_remove_pet(&state, pet_id)?;
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
            asset_id: "cato".to_string(),
            name: "Rex".to_string(),
            personality_id: "playful".to_string(),
        };

        let next = apply_hatch(&empty_pets_driven_state(), &input, &sample_ids(), 1000)
            .expect("hatch should succeed");

        assert_eq!(next["schemaVersion"], 1);

        let pet = &next["pets"][0];
        assert_eq!(pet["id"], "pet-1");
        assert_eq!(pet["name"], "Rex");
        assert_eq!(pet["assetId"], "cato");
        assert_eq!(pet["profileId"], "profile-1");
        assert_eq!(pet["workingDirectoryId"], "dir-1");
        assert_eq!(pet["adoptedAt"], 1000);
        assert_eq!(pet["archived"], false);
        assert_eq!(pet["visible"], true);

        let profile = &next["petProfiles"][0];
        assert_eq!(profile["id"], "profile-1");
        assert_eq!(profile["petAssetId"], "cato");
        assert_eq!(profile["personalityId"], "playful");
        assert_eq!(profile["personality"]["extraversion"], 0.95);

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
                asset_id: "cato".to_string(),
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
                asset_id: "otto".to_string(),
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
                asset_id: "cato".to_string(),
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
                asset_id: "cato".to_string(),
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
            asset_id: "cato".to_string(),
            name: "Rex".to_string(),
            personality_id: "curious".to_string(),
        };

        let next = apply_hatch(&empty_pets_driven_state(), &input, &sample_ids(), 1000)
            .expect("curious personality should be accepted");

        let profile = &next["petProfiles"][0];
        assert_eq!(profile["personalityId"], "curious");
        assert_eq!(profile["personality"]["openness"], 0.98);
        assert_eq!(profile["personality"]["extraversion"], 0.45);
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
                asset_id: "cato".to_string(),
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

    fn hatched_state() -> serde_json::Value {
        apply_hatch(
            &empty_pets_driven_state(),
            &HatchInput {
                cwd: "D:/proj".to_string(),
                asset_id: "cato".to_string(),
                name: "Rex".to_string(),
                personality_id: "playful".to_string(),
            },
            &sample_ids(),
            1000,
        )
        .expect("hatch should succeed")
    }

    #[test]
    fn list_pets_view_joins_personality_id_and_cwd() {
        let state = hatched_state();
        let pets = list_pets_view(&state);

        assert_eq!(pets.len(), 1);
        assert_eq!(pets[0]["id"], "pet-1");
        assert_eq!(pets[0]["name"], "Rex");
        assert_eq!(pets[0]["personalityId"], "playful");
        assert_eq!(pets[0]["cwd"], "D:/proj");
        assert_eq!(pets[0]["visible"], true);
    }

    #[test]
    fn find_pet_view_returns_none_for_unknown_pet() {
        assert_eq!(find_pet_view(&hatched_state(), "pet-missing"), None);
    }

    fn sample_working_directory_ids() -> WorkingDirectoryIds {
        WorkingDirectoryIds {
            working_directory_id: "dir-2".to_string(),
            agent_source_id: "agent-2".to_string(),
        }
    }

    fn pet_update_input(pet_id: &str) -> PetUpdateInput {
        PetUpdateInput {
            pet_id: pet_id.to_string(),
            name: None,
            personality_id: None,
            visible: None,
            archived: None,
            memo: None,
            cwd: None,
        }
    }

    #[test]
    fn apply_pet_update_patches_name_visibility_and_personality() {
        let state = hatched_state();
        let next = apply_pet_update(
            &state,
            &PetUpdateInput {
                name: Some("Rexy".to_string()),
                personality_id: Some("reserved".to_string()),
                visible: Some(false),
                memo: Some("likes naps".to_string()),
                ..pet_update_input("pet-1")
            },
            &sample_working_directory_ids(),
            2000,
        )
        .expect("update should succeed");

        let pet = &next["pets"][0];
        assert_eq!(pet["name"], "Rexy");
        assert_eq!(pet["visible"], false);
        assert_eq!(pet["archived"], false);
        assert_eq!(pet["memo"], "likes naps");

        let profile = &next["petProfiles"][0];
        assert_eq!(profile["personalityId"], "reserved");
        assert_eq!(profile["personality"]["neuroticism"], 0.82);
    }

    #[test]
    fn apply_pet_update_rejects_unknown_pet() {
        let error = apply_pet_update(
            &hatched_state(),
            &pet_update_input("pet-missing"),
            &sample_working_directory_ids(),
            2000,
        )
        .expect_err("unknown pet id should be rejected");

        assert_eq!(error, PetUpdateError::NotFound);
    }

    #[test]
    fn apply_pet_update_rejects_unknown_personality() {
        let error = apply_pet_update(
            &hatched_state(),
            &PetUpdateInput {
                personality_id: Some("chaotic".to_string()),
                ..pet_update_input("pet-1")
            },
            &sample_working_directory_ids(),
            2000,
        )
        .expect_err("unknown personality should be rejected");

        assert_eq!(error, PetUpdateError::UnknownPersonality);
    }

    #[test]
    fn apply_pet_update_clears_the_working_directory_on_null_cwd() {
        let next = apply_pet_update(
            &hatched_state(),
            &PetUpdateInput {
                cwd: Some(None),
                ..pet_update_input("pet-1")
            },
            &sample_working_directory_ids(),
            2000,
        )
        .expect("clearing the working directory should succeed");

        assert!(next["registeredWorkingDirectories"].as_array().unwrap().is_empty());
        assert_eq!(next["pets"][0]["workingDirectoryId"], serde_json::Value::Null);
        assert_eq!(list_pets_view(&next)[0]["cwd"], serde_json::Value::Null);
    }

    #[test]
    fn apply_pet_update_rebinds_the_working_directory_without_leaving_the_old_one() {
        let next = apply_pet_update(
            &hatched_state(),
            &PetUpdateInput {
                cwd: Some(Some("D:/other".to_string())),
                ..pet_update_input("pet-1")
            },
            &sample_working_directory_ids(),
            2000,
        )
        .expect("re-binding the working directory should succeed");

        let directories = next["registeredWorkingDirectories"].as_array().unwrap();
        assert_eq!(directories.len(), 1);
        assert_eq!(directories[0]["id"], "dir-2");
        assert_eq!(directories[0]["path"], "D:/other");
        assert_eq!(directories[0]["petId"], "pet-1");
        assert_eq!(next["pets"][0]["workingDirectoryId"], "dir-2");
    }

    #[test]
    fn apply_pet_update_rejects_a_cwd_held_by_another_pet() {
        let mut state = hatched_state();
        push_array(
            &mut state,
            "pets",
            serde_json::json!({ "id": "pet-2", "workingDirectoryId": null }),
        );

        let error = apply_pet_update(
            &state,
            &PetUpdateInput {
                cwd: Some(Some("d:\\proj".to_string())),
                ..pet_update_input("pet-2")
            },
            &sample_working_directory_ids(),
            2000,
        )
        .expect_err("a folder already held by another pet should be rejected");

        assert_eq!(
            error,
            PetUpdateError::CwdOccupied {
                owner_pet_id: "pet-1".to_string()
            }
        );
    }

    #[test]
    fn apply_pet_update_rejects_a_cwd_with_control_characters() {
        let error = apply_pet_update(
            &hatched_state(),
            &PetUpdateInput {
                cwd: Some(Some("D:\rrealtime".to_string())),
                ..pet_update_input("pet-1")
            },
            &sample_working_directory_ids(),
            2000,
        )
        .expect_err("a control character in the path should be rejected");

        assert_eq!(error, PetUpdateError::InvalidCwd);
    }

    #[test]
    fn apply_remove_pet_deletes_pet_profile_and_directory() {
        let next = apply_remove_pet(&hatched_state(), "pet-1").expect("removal should succeed");

        assert!(next["pets"].as_array().unwrap().is_empty());
        assert!(next["petProfiles"].as_array().unwrap().is_empty());
        assert!(next["registeredWorkingDirectories"].as_array().unwrap().is_empty());
    }

    #[test]
    fn apply_remove_pet_rejects_unknown_pet() {
        assert!(apply_remove_pet(&hatched_state(), "pet-missing").is_err());
    }
}
