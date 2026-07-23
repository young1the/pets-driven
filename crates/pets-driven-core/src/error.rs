//! Typed errors for the pets-driven core.
//!
//! Adapters (the desktop Tauri commands and the HTTP ingress) map these
//! variants to their own surfaces instead of inspecting message prefixes:
//!
//! * [`CoreError::PetNotFound`] maps to HTTP 404.
//! * [`CoreError::WorkingDirectoryOccupied`] maps to HTTP 409.
//! * [`CoreError::Validation`] (input or catalog validation) maps to HTTP 400.
//! * [`CoreError::Repository`] and [`CoreError::Transaction`] map to HTTP 500.
//!
//! The [`std::fmt::Display`] text is kept compatible with the strings the
//! previous `state_store` returned, so a `Result<_, String>` command surface
//! still shows the same messages to the webview.

/// A repository (persistence) failure. The core surfaces the message; the
/// concrete cause (missing file, permission, rename failure) belongs to the
/// adapter that implements [`crate::StateRepository`].
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
#[error("{0}")]
pub struct RepositoryError(pub String);

impl RepositoryError {
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

/// Input or catalog validation failures. Every variant maps to HTTP 400.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ValidationError {
    /// The personality id is not one of the known presets.
    #[error("Unknown personality preset")]
    UnknownPersonality,
    /// A working directory path was empty or held a control character, so it
    /// could never be opened or matched again.
    #[error("Working directory path is empty or contains control characters")]
    InvalidWorkingDirectory,
    /// A pet asset id that the sprite loader or overlay window could not address.
    #[error("Invalid Codex pet asset id")]
    InvalidAssetId,
    /// A wire-shape problem in the request payload (missing or wrongly typed
    /// field). Carries the exact message so the compatible wire text is
    /// preserved verbatim.
    #[error("{0}")]
    Field(String),
}

/// The single error type every [`crate::PetsDrivenCore`] method returns.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum CoreError {
    /// No pet exists with the given id (HTTP 404).
    #[error("No pet found with id {pet_id}")]
    PetNotFound { pet_id: String },
    /// The requested working directory already belongs to another pet
    /// (HTTP 409).
    #[error("Working directory already has pet {owner_pet_id}")]
    WorkingDirectoryOccupied { owner_pet_id: String },
    /// Input or catalog validation failed (HTTP 400).
    #[error(transparent)]
    Validation(#[from] ValidationError),
    /// A persisted document declared a schema version this build cannot read.
    /// Returned instead of silently treating the file as empty state
    /// (HTTP 500).
    #[error("Unsupported pets-driven state schema version: {found}")]
    UnsupportedSchemaVersion { found: i64 },
    /// The persisted document could not be decoded (HTTP 500).
    #[error("Could not decode pets-driven state: {0}")]
    Corruption(String),
    /// The state could not be re-serialized for persistence (HTTP 500).
    #[error("Could not serialize pets-driven state: {0}")]
    Serialization(String),
    /// The underlying repository failed to load or replace the document
    /// (HTTP 500).
    #[error(transparent)]
    Repository(#[from] RepositoryError),
    /// The transaction lock was poisoned by a panic in another writer
    /// (HTTP 500).
    #[error("State lock poisoned: {0}")]
    Transaction(String),
}

impl CoreError {
    /// A wire-shape validation failure with an exact, compatible message.
    pub fn field(message: impl Into<String>) -> Self {
        CoreError::Validation(ValidationError::Field(message.into()))
    }
}
