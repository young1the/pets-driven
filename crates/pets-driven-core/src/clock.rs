//! The clock and id seams.
//!
//! Ids and timestamps are allocated only after validation succeeds, and both
//! are injected so tests can drive [`crate::PetsDrivenCore`] deterministically.
//! Production uses the wall clock and a nanosecond-plus-counter id source that
//! matches the ids the previous `state_store` generated.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// A source of the current time in Unix epoch milliseconds.
pub trait Clock: Send + Sync {
    fn now_ms(&self) -> u64;
}

/// A source of unique record ids, prefixed by record kind (`pet`, `profile`,
/// `dir`, `agent`).
pub trait IdSource: Send + Sync {
    fn new_id(&self, prefix: &str) -> String;
}

/// The wall-clock implementation used in production.
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_millis() as u64)
            .unwrap_or(0)
    }
}

/// The production id source: `"{prefix}-{nanos}-{counter}"`, where the counter
/// breaks ties between ids minted within the same nanosecond.
pub struct SystemIdSource {
    counter: AtomicU64,
}

impl SystemIdSource {
    pub fn new() -> Self {
        Self {
            counter: AtomicU64::new(0),
        }
    }
}

impl Default for SystemIdSource {
    fn default() -> Self {
        Self::new()
    }
}

impl IdSource for SystemIdSource {
    fn new_id(&self, prefix: &str) -> String {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0);
        let counter = self.counter.fetch_add(1, Ordering::Relaxed);

        format!("{prefix}-{nanos}-{counter}")
    }
}
