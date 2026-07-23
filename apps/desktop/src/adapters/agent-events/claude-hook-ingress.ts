export const CLAUDE_HOOK_INGRESS_EVENT = "claude-hook:received:v1";

/**
 * Mirrors `ClaudeHookIngressStatus` in `src-tauri/src/claude_hook_ingress.rs`.
 *
 * `state` only reports whether the listener claimed its port; the `lastEvent*`
 * / `receivedCount` fields are the separate answer to "is a hook actually
 * arriving", which a release build has no console to show.
 */
export type ClaudeHookIngressStatus = {
  url: string;
  state: "pending" | "listening" | "error";
  error: string | null;
  /** Unix epoch milliseconds of the most recent hook event; null until one arrives. */
  lastEventAt: number | null;
  /** Hook events accepted since the app started. Not persisted across restarts. */
  receivedCount: number;
  /**
   * The most recent event's `hook_event_name`, or null when the payload carried
   * none. The backend copies nothing else off a hook payload — see the privacy
   * note on the Rust struct.
   */
  lastEventName: string | null;
};
