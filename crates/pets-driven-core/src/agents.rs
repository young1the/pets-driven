//! Agent Source provider catalog.
//!
//! A pet may name the Agent Source it belongs to, which is what its session
//! launches. The set is closed because the app only ships hooks and a plugin
//! for these providers, so a value outside it would name an agent nothing in
//! the product can start or listen to.

// coupling: keep these in sync with `AgentPluginProvider` in
// apps/desktop/src/app/desktop-gateway.ts
pub const AGENT_PROVIDER_IDS: [&str; 2] = ["claude", "codex"];

/// Whether `id` names an Agent Source provider this build knows.
pub fn is_valid_agent_provider(id: &str) -> bool {
    AGENT_PROVIDER_IDS.contains(&id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_providers_are_accepted_and_others_rejected() {
        assert!(is_valid_agent_provider("claude"));
        assert!(is_valid_agent_provider("codex"));
        assert!(!is_valid_agent_provider("Claude"));
        assert!(!is_valid_agent_provider(""));
        assert!(!is_valid_agent_provider("cursor"));
    }
}
