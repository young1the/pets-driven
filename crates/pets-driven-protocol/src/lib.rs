//! # pets-driven-protocol
//!
//! The typed loopback contract between the desktop HTTP ingress
//! (`apps/desktop/src-tauri/src/claude_hook_ingress.rs`) and any local client.
//! A client — today the `pets-driven-cli` binary — codes against these route
//! constants and message types instead of hand-building JSON, so a path or
//! field can never drift silently between the two sides.
//!
//! This crate is transport-free on purpose: it owns *what* is sent, not *how*.
//! The client supplies the loopback HTTP transport. Because the desktop process
//! is the only authoritative writer of `state.v1.json`, every message here is a
//! request to the running app; there is no direct-file fallback.

use serde::{Deserialize, Serialize};

/// The loopback port the desktop ingress binds. Coupled to
/// `CLAUDE_HOOK_INGRESS_PORT` in the desktop crate — change both together.
pub const DEFAULT_INGRESS_PORT: u16 = 43187;

/// The default ingress origin as a `host:port` authority, ready for
/// [`std::net::TcpStream`]. Not a URL: the loopback transport dials this
/// directly.
pub const DEFAULT_INGRESS_ORIGIN: &str = "127.0.0.1:43187";

/// The answer a client should surface when it cannot reach the ingress at all.
///
/// A stopped desktop app is a normal state — the plugin can be installed long
/// before the app is first opened — so a connection failure is reported as this
/// structured value rather than a transport error, and the client still exits
/// successfully. It is deliberately distinct from the app's own
/// `{"ok":false,"error":...}` rejection.
pub const APP_NOT_RUNNING_JSON: &str =
    r#"{"ok":false,"error":"app-not-running","message":"The pets-driven desktop app is not running."}"#;

/// The ingress routes. Kept in sync with the path constants and match arms in
/// the desktop `claude_hook_ingress`.
pub mod paths {
    /// Index of every route the ingress serves.
    pub const API: &str = "/pets-driven/api";
    /// Health check: is the ingress up and listening.
    pub const PING: &str = "/pets-driven/ping";
    /// Personality presets and hatchable pet assets.
    pub const OPTIONS: &str = "/pets-driven/options";
    /// Every pet currently in state.
    pub const LIST: &str = "/pets-driven/list";
    /// One pet by `petId` or by the `cwd` it is registered to.
    pub const PET: &str = "/pets-driven/pet";
    /// Create a pet bound to a folder.
    pub const HATCH: &str = "/pets-driven/hatch";
    /// Patch one pet's editable fields (used for bind and unbind).
    pub const PET_UPDATE: &str = "/pets-driven/pet/update";
    /// Remove a pet, its profile, and its registered working directory.
    pub const PET_DELETE: &str = "/pets-driven/pet/delete";
    /// Show the desktop window for the pet registered to a folder.
    pub const SHOW: &str = "/pets-driven/show";
    /// Hide the desktop window for the pet registered to a folder.
    pub const HIDE: &str = "/pets-driven/hide";
    /// Route a Claude Code hook event to the pet whose folder matches its cwd.
    pub const CLAUDE_HOOK: &str = "/claude-hook";
    /// The same routing as [`CLAUDE_HOOK`], for Codex.
    pub const CODEX_HOOK: &str = "/codex-hook";
}

/// Normalize a caller-supplied ingress origin into a `host:port` authority.
///
/// The `PETS_DRIVEN_INGRESS_ORIGIN` override the plugin shell script accepts is
/// a URL (`http://127.0.0.1:43187`); the loopback transport wants a bare
/// authority. This strips a leading `http://` or `https://` scheme and any
/// trailing slash so both forms work.
pub fn normalize_origin(raw: &str) -> String {
    let without_scheme = raw
        .strip_prefix("http://")
        .or_else(|| raw.strip_prefix("https://"))
        .unwrap_or(raw);

    without_scheme.trim_end_matches('/').to_string()
}

/// A Pet Birth request: create a pet bound to `cwd`. Serializes to the
/// camelCase body `/pets-driven/hatch` expects.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HatchRequest {
    pub cwd: String,
    pub asset_id: String,
    pub name: String,
    pub personality_id: String,
}

/// A bind request: re-point one pet's registered working directory to `cwd`.
/// Sent to `/pets-driven/pet/update`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BindRequest {
    pub pet_id: String,
    pub cwd: String,
}

/// An unbind request: detach one pet from its folder. The `cwd` field
/// serializes to an explicit JSON `null`, which is the "clear the binding"
/// signal — omitting it would leave the current binding untouched.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnbindRequest {
    pub pet_id: String,
    /// Always `None`, so this serializes as `"cwd":null` rather than being
    /// skipped.
    pub cwd: Option<String>,
}

impl UnbindRequest {
    pub fn new(pet_id: impl Into<String>) -> Self {
        Self {
            pet_id: pet_id.into(),
            cwd: None,
        }
    }
}

/// A hook event forwarded to `/claude-hook`. The field names are the hook
/// payload's own snake_case names, not the camelCase the pets-driven endpoints
/// use, so this is serialized without a rename.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HookEvent {
    pub hook_event_name: String,
    pub cwd: String,
    /// A human-facing line, present on the synthesized attach ping.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    /// A task summary, present on a synthesized summary event.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
}

impl HookEvent {
    /// The attach ping: a `Notification` for `cwd` that tells the app an agent
    /// attached to that folder.
    pub fn attach(cwd: impl Into<String>) -> Self {
        Self {
            hook_event_name: "Notification".to_string(),
            cwd: cwd.into(),
            message: Some("Agent attached".to_string()),
            summary: None,
        }
    }

    /// A summary event carrying a task summary line for `cwd`.
    pub fn summary(hook_event_name: impl Into<String>, cwd: impl Into<String>, summary: impl Into<String>) -> Self {
        Self {
            hook_event_name: hook_event_name.into(),
            cwd: cwd.into(),
            message: None,
            summary: Some(summary.into()),
        }
    }
}

/// The common `{ ok, error }` head every ingress reply carries. The rest of a
/// reply (pets, personalities, assets, the pet view) is endpoint-specific and
/// left to the client to read off the raw body; this is only what decides
/// success from rejection.
#[derive(Debug, Clone, PartialEq, Eq, Default, Deserialize)]
pub struct ResponseEnvelope {
    #[serde(default)]
    pub ok: bool,
    #[serde(default)]
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hatch_request_serializes_to_camel_case() {
        let body = serde_json::to_string(&HatchRequest {
            cwd: "D:/proj".to_string(),
            asset_id: "cato".to_string(),
            name: "Rex".to_string(),
            personality_id: "playful".to_string(),
        })
        .unwrap();

        assert_eq!(
            body,
            r#"{"cwd":"D:/proj","assetId":"cato","name":"Rex","personalityId":"playful"}"#
        );
    }

    #[test]
    fn a_backslash_path_is_escaped_by_serialization() {
        // The whole reason to build requests with serde instead of string
        // concatenation: a Windows path's backslashes must be escaped so the
        // body never injects a control character.
        let body = serde_json::to_string(&BindRequest {
            pet_id: "pet-1".to_string(),
            cwd: "C:\\a\\b".to_string(),
        })
        .unwrap();

        assert_eq!(body, r#"{"petId":"pet-1","cwd":"C:\\a\\b"}"#);
    }

    #[test]
    fn unbind_request_sends_an_explicit_null_cwd() {
        let body = serde_json::to_string(&UnbindRequest::new("pet-1")).unwrap();
        assert_eq!(body, r#"{"petId":"pet-1","cwd":null}"#);
    }

    #[test]
    fn attach_event_uses_snake_case_hook_fields() {
        let body = serde_json::to_string(&HookEvent::attach("D:/proj")).unwrap();
        assert_eq!(
            body,
            r#"{"hook_event_name":"Notification","cwd":"D:/proj","message":"Agent attached"}"#
        );
    }

    #[test]
    fn summary_event_omits_the_absent_message() {
        let body = serde_json::to_string(&HookEvent::summary("Stop", "D:/proj", "done")).unwrap();
        assert_eq!(
            body,
            r#"{"hook_event_name":"Stop","cwd":"D:/proj","summary":"done"}"#
        );
    }

    #[test]
    fn normalize_origin_strips_scheme_and_trailing_slash() {
        assert_eq!(normalize_origin("http://127.0.0.1:43187"), "127.0.0.1:43187");
        assert_eq!(normalize_origin("http://127.0.0.1:43187/"), "127.0.0.1:43187");
        assert_eq!(normalize_origin("127.0.0.1:43187"), "127.0.0.1:43187");
        assert_eq!(normalize_origin("https://localhost:9/"), "localhost:9");
    }

    #[test]
    fn response_envelope_reads_ok_and_error() {
        let ok: ResponseEnvelope = serde_json::from_str(r#"{"ok":true}"#).unwrap();
        assert!(ok.ok);
        assert_eq!(ok.error, None);

        let rejected: ResponseEnvelope =
            serde_json::from_str(r#"{"ok":false,"error":"taken"}"#).unwrap();
        assert!(!rejected.ok);
        assert_eq!(rejected.error.as_deref(), Some("taken"));
    }
}
