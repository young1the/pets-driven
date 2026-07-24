//! The persistence seam.
//!
//! The core owns the read-modify-atomic-replace transaction but not the medium
//! it persists to, nor how that medium serialises writers. A write acquires an
//! exclusive lock that spans the whole transaction — load, modify, replace —
//! via [`StateRepository::begin_write`]; reads take no lock and rely on the
//! writer replacing the document atomically.
//!
//! Keeping the lock inside the repository (rather than only a process-local
//! mutex in the core) is what lets two processes — the desktop and the CLI —
//! write the same document safely: the production file adapter backs
//! [`begin_write`] with a cross-process advisory file lock.

use std::sync::Mutex;

use crate::error::RepositoryError;

/// Load and, under an exclusive lock, replace the raw persisted document.
pub trait StateRepository: Send + Sync {
    /// Load the current document for a read. Takes no write lock: the writer
    /// replaces the document atomically, so a reader only ever observes a whole
    /// document, never a half-written one. `None` means no document exists yet.
    fn load(&self) -> Result<Option<Vec<u8>>, RepositoryError>;

    /// Begin an exclusive write transaction, blocking until the write lock is
    /// held. The returned guard holds the lock until it is dropped, so a caller
    /// loads and replaces through it and releases the lock by dropping it.
    fn begin_write(&self) -> Result<Box<dyn WriteTransaction + '_>, RepositoryError>;
}

/// An in-progress exclusive write. Holds the lock for its lifetime; dropping it
/// releases the lock whether or not [`WriteTransaction::replace`] was called, so
/// an aborted transaction (a validation failure) frees the lock cleanly.
pub trait WriteTransaction {
    /// Load the latest document inside the locked transaction.
    fn load(&mut self) -> Result<Option<Vec<u8>>, RepositoryError>;

    /// Atomically replace the whole document with `bytes`.
    fn replace(&mut self, bytes: &[u8]) -> Result<(), RepositoryError>;
}

/// An in-memory repository for core interface tests. The document lives behind a
/// mutex whose guard the write transaction holds, so it serialises writers the
/// same way the file adapter's lock does.
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

    fn begin_write(&self) -> Result<Box<dyn WriteTransaction + '_>, RepositoryError> {
        Ok(Box::new(MemoryWriteTransaction {
            document: self.document.lock().expect("memory repository lock"),
        }))
    }
}

struct MemoryWriteTransaction<'a> {
    document: std::sync::MutexGuard<'a, Option<Vec<u8>>>,
}

impl WriteTransaction for MemoryWriteTransaction<'_> {
    fn load(&mut self) -> Result<Option<Vec<u8>>, RepositoryError> {
        Ok(self.document.clone())
    }

    fn replace(&mut self, bytes: &[u8]) -> Result<(), RepositoryError> {
        *self.document = Some(bytes.to_vec());
        Ok(())
    }
}

/// A repository whose `replace` always fails, for tests that a failed
/// persistence leaves state and events unchanged. Load still works so the
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

    fn begin_write(&self) -> Result<Box<dyn WriteTransaction + '_>, RepositoryError> {
        Ok(Box::new(FailingWriteTransaction {
            inner: self.inner.begin_write()?,
        }))
    }
}

struct FailingWriteTransaction<'a> {
    inner: Box<dyn WriteTransaction + 'a>,
}

impl WriteTransaction for FailingWriteTransaction<'_> {
    fn load(&mut self) -> Result<Option<Vec<u8>>, RepositoryError> {
        self.inner.load()
    }

    fn replace(&mut self, _bytes: &[u8]) -> Result<(), RepositoryError> {
        Err(RepositoryError::new("replace failed"))
    }
}
