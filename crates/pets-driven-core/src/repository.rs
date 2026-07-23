//! The persistence seam.
//!
//! The core owns the read-modify-atomic-replace transaction but not the medium
//! it persists to. A [`StateRepository`] is the whole of what the core needs
//! from storage: load the latest bytes, or replace them wholesale. Keeping the
//! production file adapter in the desktop crate (not here) is deliberate — a
//! future CLI links this crate and must not be able to reach a file writer by
//! accident.

use std::sync::Mutex;

use crate::error::RepositoryError;

/// Load and replace the raw persisted document.
///
/// * `load` returns `None` when no document exists yet (a fresh install), and
///   `Some(bytes)` otherwise.
/// * `replace` durably swaps the whole document for `bytes`. Implementations
///   are expected to be atomic against a concurrent reader (write a sibling
///   temp file and rename, rather than truncating in place).
pub trait StateRepository: Send + Sync {
    fn load(&self) -> Result<Option<Vec<u8>>, RepositoryError>;
    fn replace(&self, bytes: &[u8]) -> Result<(), RepositoryError>;
}

/// An in-memory repository for core interface tests. Holds the latest document
/// bytes behind a mutex so a test can drive [`crate::PetsDrivenCore`] without a
/// filesystem.
#[derive(Default)]
pub struct MemoryStateRepository {
    document: Mutex<Option<Vec<u8>>>,
}

impl MemoryStateRepository {
    /// A repository with no document yet.
    pub fn new() -> Self {
        Self::default()
    }

    /// A repository seeded with an existing document, for tests that start from
    /// persisted state.
    pub fn with_document(bytes: impl Into<Vec<u8>>) -> Self {
        Self {
            document: Mutex::new(Some(bytes.into())),
        }
    }

    /// The current document bytes, for assertions.
    pub fn snapshot_bytes(&self) -> Option<Vec<u8>> {
        self.document.lock().expect("memory repository lock").clone()
    }
}

impl StateRepository for MemoryStateRepository {
    fn load(&self) -> Result<Option<Vec<u8>>, RepositoryError> {
        Ok(self.document.lock().expect("memory repository lock").clone())
    }

    fn replace(&self, bytes: &[u8]) -> Result<(), RepositoryError> {
        *self.document.lock().expect("memory repository lock") = Some(bytes.to_vec());
        Ok(())
    }
}

/// A repository whose `replace` always fails, for tests that a failed
/// persistence leaves state and events unchanged. `load` still works so the
/// transaction reaches the replace step.
pub struct FailingReplaceRepository {
    inner: MemoryStateRepository,
}

impl FailingReplaceRepository {
    pub fn with_document(bytes: impl Into<Vec<u8>>) -> Self {
        Self {
            inner: MemoryStateRepository::with_document(bytes),
        }
    }
}

impl StateRepository for FailingReplaceRepository {
    fn load(&self) -> Result<Option<Vec<u8>>, RepositoryError> {
        self.inner.load()
    }

    fn replace(&self, _bytes: &[u8]) -> Result<(), RepositoryError> {
        Err(RepositoryError::new("replace failed"))
    }
}
