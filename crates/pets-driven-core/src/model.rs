//! The typed values that cross the core boundary: ids, patch semantics, the
//! inputs the mutation methods take, and the joined views they return.
//!
//! Wire parsing (turning an arbitrary JSON payload into one of these inputs)
//! lives here too, so the Tauri command surface and the HTTP ingress share one
//! definition of the request shape and reject the same malformed payloads.

use serde_json::Value;

use crate::error::CoreError;
use crate::working_directory::WorkingDirectoryPath;

/// A Pet id.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PetId(String);

impl PetId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for PetId {
    fn from(id: &str) -> Self {
        Self::new(id)
    }
}

impl From<String> for PetId {
    fn from(id: String) -> Self {
        Self::new(id)
    }
}

impl std::fmt::Display for PetId {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

/// A three-state patch for an optional field: leave it as it is, set it to a
/// value, or clear it. This replaces the `Option<Option<T>>` the old wire
/// parser exposed, where the outer `Option` meant "present" and the inner meant
/// "non-null".
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Patch<T> {
    /// The field was omitted; leave the stored value untouched.
    Keep,
    /// The field carried a value; store it.
    Set(T),
    /// The field was explicitly null; clear the stored value.
    Clear,
}

/// Read a field that carries three states off a payload: absent leaves the
/// stored value alone ([`Patch::Keep`]), an explicit null clears it
/// ([`Patch::Clear`]), a string sets it ([`Patch::Set`]).
fn parse_string_patch(payload: &Value, key: &str) -> Result<Patch<String>, CoreError> {
    match payload.get(key) {
        None => Ok(Patch::Keep),
        Some(Value::Null) => Ok(Patch::Clear),
        Some(Value::String(value)) => Ok(Patch::Set(value.to_string())),
        Some(_) => Err(CoreError::field(format!("{key} must be a string or null"))),
    }
}

/// Read a required, non-blank string field off a payload, trimming surrounding
/// whitespace. Used for the fields Pet Birth cannot proceed without.
pub fn required_string_field(payload: &Value, field: &str) -> Result<String, CoreError> {
    payload
        .get(field)
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| CoreError::field(format!("Hatch request is missing required field: {field}")))
}

/// A Pet Birth request. `working_directory` is optional: onboarding lets the
/// user adopt a pet with no folder bound, and such a pet lives on and receives
/// no agent events until one is picked. (The HTTP ingress requires a folder
/// separately, because an agent hook only ever hatches for the directory it is
/// running in.)
#[derive(Debug, Clone, PartialEq)]
pub struct HatchPet {
    pub working_directory: Option<WorkingDirectoryPath>,
    pub asset_id: String,
    pub name: String,
    pub personality_id: String,
    /// The Agent Source the pet's session opens, or `None` to leave it unset —
    /// such a pet falls back to the app-wide launch command.
    pub agent_provider: Option<String>,
}

impl HatchPet {
    /// Read a Pet Birth request off a JSON payload. `cwd` is optional here.
    pub fn from_json(payload: &Value) -> Result<Self, CoreError> {
        let working_directory = match payload.get("cwd") {
            None | Some(Value::Null) => None,
            Some(Value::String(value)) => Some(WorkingDirectoryPath::new(value.to_string())),
            Some(_) => return Err(CoreError::field("cwd must be a string or null".to_string())),
        };

        Ok(Self {
            working_directory,
            asset_id: required_string_field(payload, "assetId")?,
            name: required_string_field(payload, "name")?,
            personality_id: required_string_field(payload, "personalityId")?,
            agent_provider: match parse_string_patch(payload, "agentProvider")? {
                Patch::Set(provider) => Some(provider),
                // A pet is born with no Agent Source unless one is named, so
                // "absent" and "explicitly null" mean the same thing here.
                Patch::Keep | Patch::Clear => None,
            },
        })
    }
}

/// A partial patch to one pet's editable fields. Every `Option` field is `None`
/// when the caller left it out, so an omitted field is left untouched.
#[derive(Debug, Clone, PartialEq)]
pub struct PetPatch {
    pub name: Option<String>,
    /// The installed Pet Asset the pet wears. A Pet Asset is chosen at Pet
    /// Birth but is not frozen there — re-skinning writes both the pet's
    /// `assetId` and its profile's `petAssetId`, which must never disagree.
    pub asset_id: Option<String>,
    pub personality_id: Option<String>,
    pub visible: Option<bool>,
    pub archived: Option<bool>,
    pub note: Option<String>,
    pub scale: Option<f64>,
    /// Trade the pet's two directional running rows for one another. Set for a
    /// Pet Asset whose spritesheet draws left/right the opposite way round from
    /// the atlas, which would otherwise run backwards on this pet.
    pub swap_running_directions: Option<bool>,
    /// The Agent Source the pet's session opens: [`Patch::Keep`] leaves the
    /// current choice, [`Patch::Clear`] unsets it (the pet falls back to the
    /// app-wide launch command), and [`Patch::Set`] pins it to that provider.
    pub agent_provider: Patch<String>,
    /// The pet's registered working directory: [`Patch::Keep`] leaves the
    /// current binding, [`Patch::Clear`] detaches it (the pet keeps living with
    /// no folder), and [`Patch::Set`] re-binds the pet to that folder.
    pub working_directory: Patch<WorkingDirectoryPath>,
}

impl PetPatch {
    /// Read a pet patch off a JSON payload, returning the target [`PetId`]
    /// alongside it. An absent field means "leave this alone", so every field
    /// but `petId` maps to `None`/[`Patch::Keep`] when missing.
    pub fn from_json(payload: &Value) -> Result<(PetId, Self), CoreError> {
        let pet_id = payload
            .get("petId")
            .and_then(|value| value.as_str())
            .ok_or_else(|| CoreError::field("Missing required field: petId".to_string()))?;

        let working_directory = match parse_string_patch(payload, "cwd")? {
            Patch::Keep => Patch::Keep,
            Patch::Clear => Patch::Clear,
            Patch::Set(path) => Patch::Set(WorkingDirectoryPath::new(path)),
        };

        let patch = Self {
            name: payload.get("name").and_then(|value| value.as_str()).map(str::to_string),
            asset_id: payload
                .get("assetId")
                .and_then(|value| value.as_str())
                .map(str::to_string),
            personality_id: payload
                .get("personalityId")
                .and_then(|value| value.as_str())
                .map(str::to_string),
            visible: payload.get("visible").and_then(|value| value.as_bool()),
            archived: payload.get("archived").and_then(|value| value.as_bool()),
            note: payload.get("note").and_then(|value| value.as_str()).map(str::to_string),
            scale: payload.get("scale").and_then(|value| value.as_f64()),
            swap_running_directions: payload
                .get("swapRunningDirections")
                .and_then(|value| value.as_bool()),
            agent_provider: parse_string_patch(payload, "agentProvider")?,
            working_directory,
        };

        Ok((PetId::new(pet_id), patch))
    }
}

/// The app-wide settings a caller can patch. `session_command` is set-or-keep;
/// the two nullable ones clear the stored value on [`Patch::Clear`] (no shell
/// picked / the default pet source folder).
#[derive(Debug, Clone, PartialEq)]
pub struct SettingsPatch {
    pub session_command: Option<String>,
    pub terminal_shell: Patch<String>,
    pub pet_source_directory: Patch<String>,
}

impl SettingsPatch {
    pub fn from_json(payload: &Value) -> Result<Self, CoreError> {
        Ok(Self {
            session_command: payload
                .get("sessionCommand")
                .and_then(|value| value.as_str())
                .map(str::to_string),
            terminal_shell: parse_string_patch(payload, "terminalShell")?,
            pet_source_directory: parse_string_patch(payload, "petSourceDirectory")?,
        })
    }
}

/// One pet's externally-relevant fields, joined with its personality id and
/// working directory — the shape the list, get-pet, and update endpoints
/// return. Serializes transparently to the same JSON object the previous
/// `pet_view` produced.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(transparent)]
pub struct PetView(Value);

impl PetView {
    pub(crate) fn from_value(value: Value) -> Self {
        Self(value)
    }

    /// The pet's id, if present.
    pub fn id(&self) -> Option<&str> {
        self.0.get("id").and_then(|value| value.as_str())
    }

    /// The pet's bound working directory path, or `None` when no folder is
    /// bound (the `cwd` field is JSON null).
    pub fn working_directory(&self) -> Option<&str> {
        self.0.get("cwd").and_then(|value| value.as_str())
    }

    pub fn as_value(&self) -> &Value {
        &self.0
    }

    pub fn into_value(self) -> Value {
        self.0
    }
}

/// The outcome of removing a pet: the id that was removed, so an adapter can
/// tear down any window for it.
#[derive(Debug, Clone, PartialEq)]
pub struct RemovedPet {
    pub pet_id: PetId,
}

/// The whole persisted state document. Serializes transparently to the same
/// JSON the Tauri read/mutation commands have always returned to the webview.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(transparent)]
pub struct StateSnapshot(Value);

impl StateSnapshot {
    pub(crate) fn from_value(value: Value) -> Self {
        Self(value)
    }

    pub fn as_value(&self) -> &Value {
        &self.0
    }

    pub fn into_value(self) -> Value {
        self.0
    }
}

#[allow(clippy::from_over_into)]
impl Into<Value> for StateSnapshot {
    fn into(self) -> Value {
        self.0
    }
}

/// A domain fact produced by a successful commit. The desktop adapter maps
/// these to Tauri event names and Pet Window effects after the durable
/// replacement succeeds; other adapters (a future CLI) may ignore them.
#[derive(Debug, Clone, PartialEq)]
pub enum CoreEvent {
    /// The persisted state changed; any live view of it should refresh.
    StateChanged,
    /// A pet's surface should be shown (a folder-bound pet was just born).
    PetShown { pet_id: PetId },
    /// A pet's surface should be hidden (the pet was removed).
    PetHidden { pet_id: PetId },
}

/// The result of a successful mutation: the new document, the method's own
/// return value, and the domain events to present. `Commit` is only ever
/// constructed after the durable replacement succeeds, so holding one means the
/// change is persisted.
#[derive(Debug, Clone, PartialEq)]
pub struct Commit<T> {
    pub snapshot: StateSnapshot,
    pub value: T,
    pub events: Vec<CoreEvent>,
}
