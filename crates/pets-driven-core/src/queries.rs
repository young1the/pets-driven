//! Read-only projections over the state document: the joined pet views the
//! read endpoints return, and the Working Directory lookup that resolves a pet
//! from a folder.

use serde_json::Value;

use crate::working_directory::comparable_path;

/// One pet's externally-relevant fields, joined with its personality id and
/// working directory. `cwd`, `visible`, and the rest fall back to JSON null
/// when absent, matching the shape the list/get/update endpoints have always
/// returned.
pub(crate) fn pet_view(state: &Value, pet: &Value) -> Value {
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
        .unwrap_or(Value::Null);

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
        .unwrap_or(Value::Null);

    serde_json::json!({
        "id": pet.get("id").cloned().unwrap_or(Value::Null),
        "name": pet.get("name").cloned().unwrap_or(Value::Null),
        "assetId": pet.get("assetId").cloned().unwrap_or(Value::Null),
        "personalityId": personality_id,
        "cwd": cwd,
        "visible": pet.get("visible").cloned().unwrap_or(Value::Null),
        "archived": pet.get("archived").cloned().unwrap_or(Value::Null),
        "adoptedAt": pet.get("adoptedAt").cloned().unwrap_or(Value::Null),
    })
}

/// The joined view of every pet in `state`.
pub(crate) fn list_pets_view(state: &Value) -> Vec<Value> {
    state
        .get("pets")
        .and_then(|value| value.as_array())
        .map(|pets| pets.iter().map(|pet| pet_view(state, pet)).collect())
        .unwrap_or_default()
}

/// The joined view of a single pet, by id.
pub(crate) fn find_pet_view(state: &Value, pet_id: &str) -> Option<Value> {
    state
        .get("pets")
        .and_then(|value| value.as_array())?
        .iter()
        .find(|pet| pet.get("id").and_then(|value| value.as_str()) == Some(pet_id))
        .map(|pet| pet_view(state, pet))
}

/// The pet id whose registered working directory matches `cwd`, comparing
/// folders case- and separator-insensitively.
pub(crate) fn find_pet_id_by_cwd(state: &Value, cwd: &str) -> Option<String> {
    let target = comparable_path(cwd);
    state
        .get("registeredWorkingDirectories")
        .and_then(|value| value.as_array())
        .and_then(|directories| {
            directories.iter().find(|directory| {
                directory
                    .get("path")
                    .and_then(|value| value.as_str())
                    .map(|path| comparable_path(path) == target)
                    .unwrap_or(false)
            })
        })
        .and_then(|directory| directory.get("petId"))
        .and_then(|value| value.as_str())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::tests_support::hatched_state;

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

    #[test]
    fn find_pet_id_by_cwd_matches_case_insensitively() {
        assert_eq!(
            find_pet_id_by_cwd(&hatched_state(), "d:\\proj"),
            Some("pet-1".to_string())
        );
    }

    #[test]
    fn find_pet_id_by_cwd_returns_none_for_unknown_path() {
        assert_eq!(find_pet_id_by_cwd(&crate::state_v1::empty_state(), "D:/proj"), None);
    }
}
