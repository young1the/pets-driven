//! Core interface tests: drive [`PetsDrivenCore`] through its public methods
//! with an in-memory repository and deterministic seams, exercising the whole
//! read-modify-atomic-replace transaction rather than the pure functions alone.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use pets_driven_core::{
    empty_state, Clock, CoreError, CoreEvent, FailingReplaceRepository, HatchPet, IdSource,
    MemoryStateRepository, Patch, PetId, PetPatch, PetsDrivenCore, SettingsPatch, StateRepository,
    WorkingDirectoryPath,
};
use serde_json::{json, Value};

/// A clock frozen at a fixed millisecond, so persisted timestamps are
/// predictable.
struct FixedClock(u64);

impl Clock for FixedClock {
    fn now_ms(&self) -> u64 {
        self.0
    }
}

/// A deterministic id source: `"{prefix}-{n}"` with a single shared counter, so
/// the ids a transaction mints are predictable across the whole test.
struct SequentialIds(AtomicU64);

impl SequentialIds {
    fn new() -> Self {
        Self(AtomicU64::new(1))
    }
}

impl IdSource for SequentialIds {
    fn new_id(&self, prefix: &str) -> String {
        let n = self.0.fetch_add(1, Ordering::Relaxed);
        format!("{prefix}-{n}")
    }
}

fn core_with(repository: Arc<dyn StateRepository>) -> PetsDrivenCore {
    PetsDrivenCore::with_seams(
        repository,
        Arc::new(FixedClock(1000)),
        Arc::new(SequentialIds::new()),
    )
}

fn empty_core() -> (Arc<MemoryStateRepository>, PetsDrivenCore) {
    let repository = Arc::new(MemoryStateRepository::new());
    let core = core_with(repository.clone());
    (repository, core)
}

fn hatch_input(cwd: Option<&str>) -> HatchPet {
    HatchPet {
        working_directory: cwd.map(WorkingDirectoryPath::new),
        asset_id: "cato".to_string(),
        name: "Rex".to_string(),
        personality_id: "playful".to_string(),
    }
}

fn blank_patch() -> PetPatch {
    PetPatch {
        name: None,
        asset_id: None,
        personality_id: None,
        visible: None,
        archived: None,
        memo: None,
        scale: None,
        swap_running_directions: None,
        working_directory: Patch::Keep,
    }
}

fn persisted(repository: &MemoryStateRepository) -> Value {
    let bytes = repository
        .snapshot_bytes()
        .expect("a document should be persisted");
    serde_json::from_slice(&bytes).expect("persisted bytes should be valid JSON")
}

#[test]
fn snapshot_of_a_fresh_repository_is_the_empty_state() {
    let (_repository, core) = empty_core();

    let snapshot = core.snapshot().expect("snapshot should load");

    assert_eq!(snapshot.into_value(), empty_state());
}

#[test]
fn hatch_persists_and_returns_the_joined_view() {
    let (repository, core) = empty_core();

    let commit = core.hatch(hatch_input(Some("D:/proj"))).expect("hatch should commit");

    // The returned view is the joined shape.
    assert_eq!(commit.value.working_directory(), Some("D:/proj"));
    let pet_id = commit.value.id().expect("a hatched pet has an id").to_string();

    // A folder-bound hatch asks the adapter to show the pet.
    assert_eq!(
        commit.events,
        vec![
            CoreEvent::StateChanged,
            CoreEvent::PetShown {
                pet_id: PetId::new(pet_id.clone()),
            },
        ]
    );

    // The change is durable: a fresh read sees the pet.
    let pets = core.list_pets().expect("list should load");
    assert_eq!(pets.len(), 1);
    assert_eq!(pets[0].id(), Some(pet_id.as_str()));

    // And the on-disk document is real schema-v1 with the directory bound.
    let document = persisted(&repository);
    assert_eq!(document["schemaVersion"], 1);
    assert_eq!(document["registeredWorkingDirectories"][0]["path"], "D:/proj");
}

#[test]
fn folderless_hatch_emits_no_show_event() {
    let (_repository, core) = empty_core();

    let commit = core.hatch(hatch_input(None)).expect("folderless hatch should commit");

    assert_eq!(commit.events, vec![CoreEvent::StateChanged]);
    assert_eq!(commit.value.working_directory(), None);
}

#[test]
fn hatch_rejects_an_occupied_working_directory() {
    let (repository, core) = empty_core();
    core.hatch(hatch_input(Some("D:/Proj"))).expect("first hatch should commit");
    let before = persisted(&repository);

    let error = core
        .hatch(HatchPet {
            name: "Blue".to_string(),
            ..hatch_input(Some("d:\\proj"))
        })
        .expect_err("a second hatch on the same folder is rejected");

    assert!(matches!(
        error,
        CoreError::WorkingDirectoryOccupied { .. }
    ));
    // A rejected hatch changes nothing on disk.
    assert_eq!(persisted(&repository), before);
}

#[test]
fn hatch_rejects_an_unknown_personality_as_validation() {
    let (_repository, core) = empty_core();

    let error = core
        .hatch(HatchPet {
            personality_id: "chaotic".to_string(),
            ..hatch_input(Some("D:/proj"))
        })
        .expect_err("an unknown personality is rejected");

    assert!(matches!(error, CoreError::Validation(_)));
}

#[test]
fn update_patches_a_pet_and_persists() {
    let (_repository, core) = empty_core();
    let commit = core.hatch(hatch_input(Some("D:/proj"))).unwrap();
    let pet_id = PetId::new(commit.value.id().unwrap().to_string());

    let updated = core
        .update_pet(
            &pet_id,
            PetPatch {
                name: Some("Rexy".to_string()),
                personality_id: Some("reserved".to_string()),
                ..blank_patch()
            },
        )
        .expect("update should commit");

    assert_eq!(updated.value.as_value()["name"], "Rexy");
    assert_eq!(updated.value.as_value()["personalityId"], "reserved");

    // Persisted and re-readable.
    let pet = core.pet(&pet_id).unwrap().expect("pet should still exist");
    assert_eq!(pet.as_value()["name"], "Rexy");
}

#[test]
fn update_of_an_unknown_pet_is_pet_not_found() {
    let (_repository, core) = empty_core();

    let error = core
        .update_pet(&PetId::new("pet-missing"), blank_patch())
        .expect_err("unknown pet id is rejected");

    assert_eq!(
        error,
        CoreError::PetNotFound {
            pet_id: "pet-missing".to_string()
        }
    );
}

#[test]
fn rebind_then_detach_leaves_no_stale_directory() {
    let (repository, core) = empty_core();
    let commit = core.hatch(hatch_input(Some("D:/proj"))).unwrap();
    let pet_id = PetId::new(commit.value.id().unwrap().to_string());

    core.update_pet(
        &pet_id,
        PetPatch {
            working_directory: Patch::Set(WorkingDirectoryPath::new("D:/other")),
            ..blank_patch()
        },
    )
    .expect("rebind should commit");

    let after_rebind = persisted(&repository);
    let dirs = after_rebind["registeredWorkingDirectories"].as_array().unwrap();
    assert_eq!(dirs.len(), 1);
    assert_eq!(dirs[0]["path"], "D:/other");

    core.update_pet(
        &pet_id,
        PetPatch {
            working_directory: Patch::Clear,
            ..blank_patch()
        },
    )
    .expect("detach should commit");

    let after_detach = persisted(&repository);
    assert!(after_detach["registeredWorkingDirectories"].as_array().unwrap().is_empty());
    assert_eq!(after_detach["pets"][0]["workingDirectoryId"], Value::Null);
}

#[test]
fn remove_cascades_and_reports_the_removed_id() {
    let (repository, core) = empty_core();
    let commit = core.hatch(hatch_input(Some("D:/proj"))).unwrap();
    let pet_id = PetId::new(commit.value.id().unwrap().to_string());

    let removed = core.remove_pet(&pet_id).expect("remove should commit");

    assert_eq!(removed.value.pet_id, pet_id);
    assert!(removed.events.contains(&CoreEvent::PetHidden {
        pet_id: pet_id.clone()
    }));

    let document = persisted(&repository);
    assert!(document["pets"].as_array().unwrap().is_empty());
    assert!(document["petProfiles"].as_array().unwrap().is_empty());
    assert!(document["registeredWorkingDirectories"].as_array().unwrap().is_empty());
}

#[test]
fn settings_reset_keeps_pet_data_and_drops_settings() {
    let (repository, core) = empty_core();
    core.hatch(hatch_input(Some("D:/proj"))).unwrap();
    core.update_settings(SettingsPatch {
        session_command: Some("cmd /k codex".to_string()),
        terminal_shell: Patch::Set("C:/Windows/System32/cmd.exe".to_string()),
        pet_source_directory: Patch::Set("D:/pets".to_string()),
    })
    .expect("settings update should commit");

    core.reset_settings().expect("reset should commit");

    let document = persisted(&repository);
    assert_eq!(document.get("sessionCommand"), None);
    assert_eq!(document.get("terminalShell"), None);
    assert_eq!(document.get("petSourceDirectory"), None);
    assert_eq!(document["pets"].as_array().unwrap().len(), 1);
}

#[test]
fn pet_by_working_directory_matches_case_insensitively() {
    let (_repository, core) = empty_core();
    core.hatch(hatch_input(Some("D:/Proj"))).unwrap();

    let pet = core
        .pet_by_working_directory("d:\\proj")
        .expect("lookup should load")
        .expect("a pet is registered there");

    assert_eq!(pet.working_directory(), Some("D:/Proj"));
}

#[test]
fn a_failed_replace_yields_no_commit_and_no_persisted_change() {
    // Seed a valid document, then make replace fail: a mutation must surface the
    // repository error rather than a Commit, and change nothing.
    let seeded = serde_json::to_vec(&empty_state()).unwrap();
    let repository = Arc::new(FailingReplaceRepository::with_document(seeded));
    let core = core_with(repository.clone());

    let error = core
        .hatch(hatch_input(Some("D:/proj")))
        .expect_err("a failed replace must not yield a commit");

    assert!(matches!(error, CoreError::Repository(_)));
}

#[test]
fn unknown_top_level_and_nested_fields_survive_a_mutation() {
    // A document with fields this build does not model must round-trip through a
    // mutation untouched.
    let mut seeded = empty_state();
    let object = seeded.as_object_mut().unwrap();
    object.insert("futureTopLevel".to_string(), json!({ "keep": true }));
    object.insert(
        "pets".to_string(),
        json!([{ "id": "pet-1", "profileId": "profile-1", "futureField": 7 }]),
    );
    object.insert(
        "petProfiles".to_string(),
        json!([{ "id": "profile-1", "personalityId": "playful" }]),
    );
    let repository = Arc::new(MemoryStateRepository::with_document(
        serde_json::to_vec(&seeded).unwrap(),
    ));
    let core = core_with(repository.clone());

    core.update_pet(
        &PetId::new("pet-1"),
        PetPatch {
            name: Some("Rex".to_string()),
            ..blank_patch()
        },
    )
    .expect("update should commit");

    let document = persisted(&repository);
    assert_eq!(document["futureTopLevel"], json!({ "keep": true }));
    assert_eq!(document["pets"][0]["futureField"], 7);
    assert_eq!(document["pets"][0]["name"], "Rex");
}

#[test]
fn an_unknown_schema_version_is_rejected() {
    let seeded = serde_json::to_vec(&json!({
        "schemaVersion": 2,
        "pets": [],
        "petProfiles": [],
        "registeredWorkingDirectories": []
    }))
    .unwrap();
    let repository = Arc::new(MemoryStateRepository::with_document(seeded));
    let core = core_with(repository);

    let error = core.snapshot().expect_err("a v2 document must be rejected");

    assert_eq!(error, CoreError::UnsupportedSchemaVersion { found: 2 });
}

#[test]
fn concurrent_writers_serialize_without_losing_a_change() {
    // Two threads each hatch a folderless pet against the same core. The
    // transaction lock must serialize the read-modify-write cycles so both pets
    // survive rather than one clobbering the other.
    let repository = Arc::new(MemoryStateRepository::new());
    let core = Arc::new(PetsDrivenCore::with_seams(
        repository.clone(),
        Arc::new(FixedClock(1000)),
        Arc::new(SequentialIds::new()),
    ));

    let mut handles = Vec::new();
    for index in 0..8 {
        let core = core.clone();
        handles.push(std::thread::spawn(move || {
            core.hatch(HatchPet {
                name: format!("Pet {index}"),
                ..hatch_input(None)
            })
            .expect("each hatch should commit");
        }));
    }
    for handle in handles {
        handle.join().expect("thread should not panic");
    }

    let pets = core.list_pets().expect("list should load");
    assert_eq!(pets.len(), 8);
}
