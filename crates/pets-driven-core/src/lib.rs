//! # pets-driven-core
//!
//! The authoritative Pet and Registered Working Directory behavior for
//! pets-driven, extracted from the desktop Tauri crate so a future CLI can link
//! it without depending on the desktop shell.
//!
//! [`PetsDrivenCore`] owns the whole read-modify-atomic-replace transaction
//! behind a single [`StateRepository`] seam. Callers hand it a typed input and
//! receive a [`Commit`] only after the durable replacement succeeds; a failed
//! validation or a failed persistence changes nothing and produces no
//! [`CoreEvent`]. The desktop process supplies the production file repository
//! and maps commit events to Tauri events and Pet Window effects.
//!
//! The document is modeled as a [`serde_json::Value`] internally so that normal
//! mutations preserve unknown schema-v1 fields untouched; only the fields a
//! command means to change are rewritten.

mod agents;
mod asset_id;
mod clock;
mod commands;
mod error;
mod model;
mod personalities;
mod queries;
mod repository;
mod state_v1;
mod working_directory;

use std::sync::{Arc, Mutex};

use serde_json::Value;

use commands::{HatchIds, WorkingDirectoryIds};

pub use agents::{is_valid_agent_provider, AGENT_PROVIDER_IDS};
pub use asset_id::is_valid_asset_id;
pub use clock::{Clock, IdSource, SystemClock, SystemIdSource};
pub use error::{CoreError, RepositoryError, ValidationError};
pub use model::{
    required_string_field, Commit, CoreEvent, HatchPet, Patch, PetId, PetPatch, PetView,
    RemovedPet, SettingsPatch, StateSnapshot,
};
pub use personalities::{personality_preset, PERSONALITY_IDS};
pub use repository::{
    FailingReplaceRepository, MemoryStateRepository, StateRepository, WriteTransaction,
};
pub use state_v1::{empty_state, SCHEMA_VERSION};
pub use working_directory::{comparable_path, is_valid_working_directory, WorkingDirectoryPath};

/// The authoritative owner of pets-driven persisted state.
///
/// Construct one per process with [`PetsDrivenCore::new`] and a repository, or
/// with [`PetsDrivenCore::with_seams`] to inject a deterministic clock and id
/// source in tests. The transaction mutex, clock, id source, and repository are
/// all private: callers reach state only through the typed methods below.
pub struct PetsDrivenCore {
    repository: Arc<dyn StateRepository>,
    clock: Arc<dyn Clock>,
    ids: Arc<dyn IdSource>,
    /// Serialises concurrent read-modify-write cycles against the repository so
    /// two writers can never lose each other's change.
    transaction_lock: Mutex<()>,
}

impl PetsDrivenCore {
    /// A core backed by `repository`, using the wall clock and the production id
    /// source.
    pub fn new(repository: Arc<dyn StateRepository>) -> Self {
        Self::with_seams(
            repository,
            Arc::new(SystemClock),
            Arc::new(SystemIdSource::new()),
        )
    }

    /// A core with every seam injected, for deterministic tests.
    pub fn with_seams(
        repository: Arc<dyn StateRepository>,
        clock: Arc<dyn Clock>,
        ids: Arc<dyn IdSource>,
    ) -> Self {
        Self {
            repository,
            clock,
            ids,
            transaction_lock: Mutex::new(()),
        }
    }

    // ---- Reads -----------------------------------------------------------
    //
    // Reads load and decode the latest document without taking the transaction
    // lock: they never write, so they only ever observe a fully-replaced
    // document, never a half-written one.

    fn load_document(&self) -> Result<Value, CoreError> {
        let bytes = self.repository.load()?;
        state_v1::decode(bytes)
    }

    /// The whole persisted document.
    pub fn snapshot(&self) -> Result<StateSnapshot, CoreError> {
        Ok(StateSnapshot::from_value(self.load_document()?))
    }

    /// The joined view of every pet.
    pub fn list_pets(&self) -> Result<Vec<PetView>, CoreError> {
        let state = self.load_document()?;
        Ok(queries::list_pets_view(&state)
            .into_iter()
            .map(PetView::from_value)
            .collect())
    }

    /// The joined view of one pet by id, or `None` when no pet matches.
    pub fn pet(&self, id: &PetId) -> Result<Option<PetView>, CoreError> {
        let state = self.load_document()?;
        Ok(queries::find_pet_view(&state, id.as_str()).map(PetView::from_value))
    }

    /// The joined view of the pet registered to `cwd`, or `None` when no pet is
    /// registered there. Folder comparison is case- and separator-insensitive.
    pub fn pet_by_working_directory(&self, cwd: &str) -> Result<Option<PetView>, CoreError> {
        let state = self.load_document()?;
        Ok(queries::find_pet_id_by_cwd(&state, cwd)
            .and_then(|pet_id| queries::find_pet_view(&state, &pet_id))
            .map(PetView::from_value))
    }

    // ---- Mutations -------------------------------------------------------

    /// Run one read-modify-atomic-replace transaction: take the lock, load and
    /// decode, run `op` to validate and produce the next document, then encode
    /// and durably replace. Ids and the timestamp are allocated inside `op`,
    /// only after validation, and a `Commit` is returned only once the
    /// replacement succeeds.
    fn transact<T>(
        &self,
        op: impl FnOnce(&Value, u64, &dyn IdSource) -> Result<(Value, T, Vec<CoreEvent>), CoreError>,
    ) -> Result<Commit<T>, CoreError> {
        // The process-local mutex serialises threads within this process; the
        // repository's write transaction serialises against other processes.
        // Both are needed: a cross-process file lock does not serialise threads
        // that share the process.
        let _guard = self
            .transaction_lock
            .lock()
            .map_err(|error| CoreError::Transaction(error.to_string()))?;

        let mut transaction = self.repository.begin_write()?;
        let bytes = transaction.load()?;
        let state = state_v1::decode(bytes)?;
        let now = self.clock.now_ms();

        let (next, value, events) = op(&state, now, self.ids.as_ref())?;

        let encoded = state_v1::encode(&next)?;
        transaction.replace(&encoded)?;
        // Dropping the transaction releases the write lock.
        drop(transaction);

        Ok(Commit {
            snapshot: StateSnapshot::from_value(next),
            value,
            events,
        })
    }

    /// Pet Birth. Creates the Pet and its Pet Profile atomically, plus a
    /// Registered Working Directory when the input carries a folder.
    pub fn hatch(&self, input: HatchPet) -> Result<Commit<PetView>, CoreError> {
        self.transact(|state, now, ids| {
            let hatch_ids = HatchIds {
                pet_id: ids.new_id("pet"),
                profile_id: ids.new_id("profile"),
                working_directory_id: ids.new_id("dir"),
                agent_source_id: ids.new_id("agent"),
            };

            let next = commands::apply_hatch(state, &input, &hatch_ids, now)?;
            let view = queries::find_pet_view(&next, &hatch_ids.pet_id)
                .map(PetView::from_value)
                .expect("a just-hatched pet must be present in the new state");

            let mut events = vec![CoreEvent::StateChanged];
            if input.working_directory.is_some() {
                events.push(CoreEvent::PetShown {
                    pet_id: PetId::new(hatch_ids.pet_id.clone()),
                });
            }

            Ok((next, view, events))
        })
    }

    /// Patch one pet's editable fields. Omitted fields are left untouched.
    pub fn update_pet(&self, id: &PetId, patch: PetPatch) -> Result<Commit<PetView>, CoreError> {
        self.transact(|state, now, ids| {
            let wd_ids = WorkingDirectoryIds {
                working_directory_id: ids.new_id("dir"),
                agent_source_id: ids.new_id("agent"),
            };

            let next = commands::apply_pet_update(state, id, &patch, &wd_ids, now)?;
            let view = queries::find_pet_view(&next, id.as_str())
                .map(PetView::from_value)
                .expect("an updated pet must still be present in the new state");

            Ok((next, view, vec![CoreEvent::StateChanged]))
        })
    }

    /// Permanently remove a pet, its profile, and any working directory it
    /// holds.
    pub fn remove_pet(&self, id: &PetId) -> Result<Commit<RemovedPet>, CoreError> {
        self.transact(|state, _now, _ids| {
            let next = commands::apply_remove_pet(state, id)?;
            Ok((
                next,
                RemovedPet { pet_id: id.clone() },
                vec![
                    CoreEvent::StateChanged,
                    CoreEvent::PetHidden { pet_id: id.clone() },
                ],
            ))
        })
    }

    /// Patch the app-wide settings.
    pub fn update_settings(&self, patch: SettingsPatch) -> Result<Commit<()>, CoreError> {
        self.transact(|state, _now, _ids| {
            let next = commands::apply_settings_update(state, &patch);
            Ok((next, (), vec![CoreEvent::StateChanged]))
        })
    }

    /// Put every app-wide setting back to its default, keeping the pets, their
    /// profiles, and the folders they watch exactly as they are.
    pub fn reset_settings(&self) -> Result<Commit<()>, CoreError> {
        self.transact(|state, _now, _ids| {
            let next = commands::apply_settings_reset(state);
            Ok((next, (), vec![CoreEvent::StateChanged]))
        })
    }

    /// Replace the whole document with what the caller holds in memory.
    ///
    /// This is last-writer-wins by nature — anything persisted since the caller
    /// loaded its copy is lost — so it is reserved for the desktop flows that
    /// genuinely own the entire document. It still goes through the transaction
    /// lock and the repository seam; it does not validate or merge, matching the
    /// previous `write_pets_driven_state` behavior.
    pub fn replace_document(&self, document: Value) -> Result<Commit<()>, CoreError> {
        let _guard = self
            .transaction_lock
            .lock()
            .map_err(|error| CoreError::Transaction(error.to_string()))?;

        let mut transaction = self.repository.begin_write()?;
        let encoded = state_v1::encode(&document)?;
        transaction.replace(&encoded)?;
        drop(transaction);

        Ok(Commit {
            snapshot: StateSnapshot::from_value(document),
            value: (),
            events: vec![CoreEvent::StateChanged],
        })
    }
}
