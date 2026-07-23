//! Schema-v1 state document decoding, encoding, and shape helpers.
//!
//! The document is kept as a [`serde_json::Value`] on purpose: normal mutations
//! must preserve unknown schema-v1 top-level and nested fields untouched, and
//! round-tripping the raw `Value` is the simplest way to guarantee that no
//! field is dropped just because this build does not model it yet.

use serde_json::Value;

use crate::error::CoreError;

/// The schema version this build reads and writes.
pub const SCHEMA_VERSION: i64 = 1;

/// The top-level keys that hold user data rather than settings: the adopted
/// pets, their profiles, and the folders they watch. A settings reset keeps
/// exactly these and drops every other key, so a setting added later resets by
/// default instead of being silently forgotten by a hand-kept list.
pub const PET_DATA_KEYS: [&str; 3] = ["registeredWorkingDirectories", "pets", "petProfiles"];

/// A fresh, empty schema-v1 document.
pub fn empty_state() -> Value {
    serde_json::json!({
        "schemaVersion": SCHEMA_VERSION,
        "registeredWorkingDirectories": [],
        "pets": [],
        "petProfiles": []
    })
}

/// Decode the bytes a [`crate::StateRepository`] loaded into a schema-v1
/// document.
///
/// * `None` (no document yet) becomes the empty state.
/// * A document whose `schemaVersion` is present and not [`SCHEMA_VERSION`] is
///   rejected with [`CoreError::UnsupportedSchemaVersion`] rather than silently
///   read as empty state, so a newer on-disk format is never clobbered.
/// * A document missing `schemaVersion` is accepted as legacy v1 and read as-is
///   (absent arrays are treated as empty by the queries and commands).
pub fn decode(bytes: Option<Vec<u8>>) -> Result<Value, CoreError> {
    let Some(bytes) = bytes else {
        return Ok(empty_state());
    };

    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|error| CoreError::Corruption(error.to_string()))?;

    if let Some(schema_version) = value.get("schemaVersion") {
        // A present-but-wrong version is a hard error. `as_i64` also catches a
        // non-numeric `schemaVersion`, which is corruption rather than a
        // readable v1 document.
        let found = schema_version.as_i64();
        if found != Some(SCHEMA_VERSION) {
            return Err(CoreError::UnsupportedSchemaVersion {
                found: found.unwrap_or(-1),
            });
        }
    }

    Ok(value)
}

/// Serialize a schema-v1 document for persistence, preserving the pretty,
/// human-diffable layout the file has always used.
pub fn encode(state: &Value) -> Result<Vec<u8>, CoreError> {
    serde_json::to_vec_pretty(state).map_err(|error| CoreError::Serialization(error.to_string()))
}

/// Append `item` to the array under `key`, creating the array if the key is
/// absent or holds a non-array value.
pub fn push_array(state: &mut Value, key: &str, item: Value) {
    let Some(object) = state.as_object_mut() else {
        return;
    };
    let entry = object
        .entry(key)
        .or_insert_with(|| Value::Array(Vec::new()));

    if let Some(array) = entry.as_array_mut() {
        array.push(item);
    } else {
        *entry = Value::Array(vec![item]);
    }
}
