//! # pets-driven-protocol
//!
//! The hook-forwarding contract between a local client and the desktop app.
//!
//! Most pets-driven operations no longer travel over the wire: `pdd` reads and
//! writes state directly through the shared file repository. What remains is the
//! one genuinely *live* signal — an agent hook event, which a running pet reacts
//! to but which is never persisted. This crate owns the route it is posted to,
//! the synthesized-event shape for hooks that fire with no payload, and the
//! origin the loopback transport dials. It is transport-free: it says *what* is
//! sent, not *how*.

use serde::Serialize;

/// The loopback port the desktop ingress binds. Coupled to
/// `CLAUDE_HOOK_INGRESS_PORT` in the desktop crate — change both together.
pub const DEFAULT_INGRESS_PORT: u16 = 43187;

/// The default ingress origin as a `host:port` authority, ready for
/// [`std::net::TcpStream`]. Not a URL: the loopback transport dials this
/// directly.
pub const DEFAULT_INGRESS_ORIGIN: &str = "127.0.0.1:43187";

/// The ingress routes a local client posts to. Kept in sync with the path
/// constants in the desktop `claude_hook_ingress`.
pub mod paths {
    /// Routes a Claude Code hook event to the pet whose folder matches its cwd.
    pub const CLAUDE_HOOK: &str = "/claude-hook";
    /// The same routing as [`CLAUDE_HOOK`], for Codex.
    pub const CODEX_HOOK: &str = "/codex-hook";
    /// Shows the running app's overlay window for the pet registered to a
    /// folder. Body: `{"cwd": "<folder>"}`. A no-op (404) if no pet is there.
    pub const SHOW: &str = "/pets-driven/show";
}

/// Normalize a caller-supplied ingress origin into a `host:port` authority.
///
/// The `PETS_DRIVEN_INGRESS_ORIGIN` override accepts a URL
/// (`http://127.0.0.1:43187`); the loopback transport wants a bare authority.
/// This strips a leading `http://` or `https://` scheme and any trailing slash
/// so both forms work.
pub fn normalize_origin(raw: &str) -> String {
    let without_scheme = raw
        .strip_prefix("http://")
        .or_else(|| raw.strip_prefix("https://"))
        .unwrap_or(raw);

    without_scheme.trim_end_matches('/').to_string()
}

/// A synthesized agent lifecycle event, forwarded to a hook route when a hook
/// fires with no usable stdin payload of its own (the Codex case — Claude hooks
/// always deliver a full payload the client forwards unchanged).
///
/// The source identity is emitted under all three keys the ingress reads
/// (`sourceId`, `source_id`, `agent_id`) so the event is always attributed to
/// its agent.
///
/// coupling: the per-event summary and message text mirror
/// `plugins/pets-driven/hooks/forward-codex` — change both together.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CodexHookEvent {
    pub hook_event_name: String,
    pub cwd: String,
    pub summary: String,
    pub message: String,
    #[serde(rename = "sourceId")]
    pub source_id_camel: String,
    pub source_id: String,
    pub agent_id: String,
}

impl CodexHookEvent {
    /// The Codex source id used under every source key.
    pub const SOURCE_ID: &'static str = "codex";

    /// Synthesize the fallback event for a Codex lifecycle `event_name`, or
    /// `None` when the event is not one the app expresses.
    pub fn synthesize(event_name: &str, cwd: impl Into<String>) -> Option<Self> {
        let (summary, message) = match event_name {
            "UserPromptSubmit" => ("Codex prompt received", "Codex started working"),
            "PermissionRequest" => ("Codex needs permission", "Codex needs permission"),
            "Stop" => ("Codex turn completed", "Codex turn completed"),
            _ => return None,
        };

        Some(Self {
            hook_event_name: event_name.to_string(),
            cwd: cwd.into(),
            summary: summary.to_string(),
            message: message.to_string(),
            source_id_camel: Self::SOURCE_ID.to_string(),
            source_id: Self::SOURCE_ID.to_string(),
            agent_id: Self::SOURCE_ID.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_event_synthesizes_source_ids_and_per_event_text() {
        let started = CodexHookEvent::synthesize("UserPromptSubmit", "D:/proj").unwrap();
        assert_eq!(started.summary, "Codex prompt received");
        assert_eq!(started.message, "Codex started working");

        let body = serde_json::to_string(&started).unwrap();
        assert!(body.contains(r#""hook_event_name":"UserPromptSubmit""#));
        assert!(body.contains(r#""sourceId":"codex""#));
        assert!(body.contains(r#""source_id":"codex""#));
        assert!(body.contains(r#""agent_id":"codex""#));
        assert!(body.contains(r#""cwd":"D:/proj""#));
    }

    #[test]
    fn codex_event_covers_permission_and_stop_but_rejects_unknown() {
        assert_eq!(
            CodexHookEvent::synthesize("PermissionRequest", "D:/proj").unwrap().message,
            "Codex needs permission"
        );
        assert_eq!(
            CodexHookEvent::synthesize("Stop", "D:/proj").unwrap().summary,
            "Codex turn completed"
        );
        assert_eq!(CodexHookEvent::synthesize("Frobnicate", "D:/proj"), None);
    }

    #[test]
    fn normalize_origin_strips_scheme_and_trailing_slash() {
        assert_eq!(normalize_origin("http://127.0.0.1:43187"), "127.0.0.1:43187");
        assert_eq!(normalize_origin("http://127.0.0.1:43187/"), "127.0.0.1:43187");
        assert_eq!(normalize_origin("127.0.0.1:43187"), "127.0.0.1:43187");
        assert_eq!(normalize_origin("https://localhost:9/"), "localhost:9");
    }
}
