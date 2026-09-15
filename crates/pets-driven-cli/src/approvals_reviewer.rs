//! Attach who reviews a Codex permission request to the hook payload.
//!
//! With `approvals_reviewer = "auto_review"`, Codex still fires the
//! `PermissionRequest` hook before its reviewer approves or rejects the action on
//! its own, so the event alone cannot say whether the user is being asked. The
//! hook input carries no reviewer field, but it does carry `transcript_path`: the
//! session rollout, where every turn records the settings it actually ran with in
//! a `turn_context` line.
//!
//! This module only reports that fact. It copies the latest turn's
//! `approvals_reviewer` onto the payload and leaves the event name alone;
//! deciding what the request means for a pet belongs to the desktop's Codex hook
//! adapter. When the transcript cannot answer, nothing is attached.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// The payload field the reviewer is attached under, named after Codex's own
/// setting so the adapter reads it like any other hook field.
const REVIEWER_FIELD: &str = "approvals_reviewer";

/// A cheap byte prefilter for `turn_context` lines, so the scan parses only the
/// lines that can answer. Codex writes the rollout as compact JSON.
const TURN_CONTEXT_MARKER: &[u8] = br#""type":"turn_context""#;

/// The first tail read. Transcripts run to tens of megabytes, but the latest
/// `turn_context` is usually near the end, so the window grows only on a miss.
const INITIAL_WINDOW: u64 = 256 * 1024;

/// Add `approvals_reviewer` to a Codex `PermissionRequest` payload, read from its
/// transcript. Returns `None` to forward the payload unchanged: any other event
/// (no transcript read on the hot tool path), a payload that already names its
/// reviewer, or a transcript that cannot say.
pub(crate) fn with_approvals_reviewer(payload: &[u8]) -> Option<Vec<u8>> {
    let mut hook: serde_json::Value = serde_json::from_slice(payload).ok()?;
    if hook.get("hook_event_name")?.as_str()? != "PermissionRequest"
        || hook.get(REVIEWER_FIELD).is_some()
    {
        return None;
    }

    let transcript = hook.get("transcript_path")?.as_str()?;
    let reviewer = latest_approvals_reviewer(Path::new(transcript))?;

    hook.as_object_mut()?.insert(
        REVIEWER_FIELD.to_string(),
        serde_json::Value::from(reviewer),
    );
    serde_json::to_vec(&hook).ok()
}

/// The `approvals_reviewer` of the last `turn_context` in a rollout transcript,
/// read from the end of the file in a window that quadruples until a turn
/// context turns up or the whole file has been read.
fn latest_approvals_reviewer(transcript: &Path) -> Option<String> {
    let mut file = File::open(transcript).ok()?;
    let len = file.metadata().ok()?.len();
    let mut window = INITIAL_WINDOW;

    loop {
        let start = len.saturating_sub(window);
        file.seek(SeekFrom::Start(start)).ok()?;
        let mut tail = Vec::new();
        file.read_to_end(&mut tail).ok()?;

        // A window that starts mid-file begins inside a line; drop that fragment.
        let lines = if start == 0 {
            &tail[..]
        } else {
            let first_break = tail.iter().position(|byte| *byte == b'\n')?;
            &tail[first_break + 1..]
        };

        // An unparseable match is a line still being written; an older one answers.
        let turn_context = lines
            .split(|byte| *byte == b'\n')
            .rev()
            .filter(|line| contains(line, TURN_CONTEXT_MARKER))
            .find_map(|line| {
                let entry: serde_json::Value = serde_json::from_slice(line).ok()?;
                (entry.get("type")?.as_str()? == "turn_context").then_some(entry)
            });

        if let Some(entry) = turn_context {
            return entry
                .get("payload")?
                .get(REVIEWER_FIELD)?
                .as_str()
                .map(str::to_string);
        }
        if start == 0 {
            return None;
        }
        window = window.saturating_mul(4);
    }
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// A transcript file unique to one test, removed when the guard drops.
    struct Transcript(PathBuf);

    impl Transcript {
        fn new(name: &str, contents: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "pdd-approvals-reviewer-{}-{name}.jsonl",
                std::process::id()
            ));
            std::fs::write(&path, contents).expect("write transcript");
            Transcript(path)
        }

        fn hook(&self, event_name: &str) -> Vec<u8> {
            serde_json::to_vec(&serde_json::json!({
                "hook_event_name": event_name,
                "session_id": "thread-1",
                "cwd": "D:\\작업\\proj",
                "tool_name": "shell",
                "transcript_path": self.0.display().to_string(),
            }))
            .unwrap()
        }
    }

    impl Drop for Transcript {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    fn turn_context(reviewer: &str) -> String {
        format!(
            r#"{{"timestamp":"2026-09-15T02:30:02.138Z","type":"turn_context","payload":{{"turn_id":"t","approval_policy":"on-request","approvals_reviewer":"{reviewer}"}}}}"#
        )
    }

    fn event_message() -> &'static str {
        r#"{"timestamp":"2026-09-15T02:30:03.000Z","type":"event_msg","payload":{"type":"agent_message","message":"working"}}"#
    }

    fn parse(body: &[u8]) -> serde_json::Value {
        serde_json::from_slice(body).unwrap()
    }

    #[test]
    fn a_permission_request_gains_its_reviewer_and_keeps_everything_else() {
        let transcript = Transcript::new(
            "auto",
            &format!("{}\n{}\n", turn_context("auto_review"), event_message()),
        );

        let body = with_approvals_reviewer(&transcript.hook("PermissionRequest"))
            .expect("the reviewer should be attached");
        let value = parse(&body);

        assert_eq!(value["approvals_reviewer"], "auto_review");
        assert_eq!(value["hook_event_name"], "PermissionRequest");
        assert_eq!(value["session_id"], "thread-1");
        assert_eq!(value["tool_name"], "shell");
        assert_eq!(value["cwd"], "D:\\작업\\proj");
    }

    #[test]
    fn a_user_reviewer_is_reported_too() {
        let transcript = Transcript::new("user", &format!("{}\n", turn_context("user")));

        let body = with_approvals_reviewer(&transcript.hook("PermissionRequest")).unwrap();
        assert_eq!(parse(&body)["approvals_reviewer"], "user");
    }

    #[test]
    fn the_latest_turn_decides_when_the_reviewer_changed_mid_session() {
        let transcript = Transcript::new(
            "switched",
            &format!(
                "{}\n{}\n{}\n{}\n",
                turn_context("auto_review"),
                event_message(),
                turn_context("user"),
                event_message()
            ),
        );

        let body = with_approvals_reviewer(&transcript.hook("PermissionRequest")).unwrap();
        assert_eq!(parse(&body)["approvals_reviewer"], "user");
    }

    #[test]
    fn a_turn_context_beyond_the_first_window_is_still_found() {
        let filler = format!("{}\n", event_message()).repeat((INITIAL_WINDOW as usize / 100) * 3);
        let transcript =
            Transcript::new("far", &format!("{}\n{filler}", turn_context("auto_review")));

        let body = with_approvals_reviewer(&transcript.hook("PermissionRequest")).unwrap();
        assert_eq!(parse(&body)["approvals_reviewer"], "auto_review");
    }

    #[test]
    fn nothing_is_attached_when_the_transcript_cannot_say() {
        let missing = Transcript::new("missing", "");
        let payload = missing.hook("PermissionRequest");
        drop(missing);
        assert_eq!(with_approvals_reviewer(&payload), None);

        let no_context = Transcript::new("no-context", &format!("{}\n", event_message()));
        assert_eq!(
            with_approvals_reviewer(&no_context.hook("PermissionRequest")),
            None
        );

        let no_path = br#"{"hook_event_name":"PermissionRequest","cwd":"D:/proj"}"#;
        assert_eq!(with_approvals_reviewer(no_path), None);
    }

    #[test]
    fn only_permission_requests_read_the_transcript() {
        let transcript = Transcript::new("stop", &format!("{}\n", turn_context("auto_review")));

        assert_eq!(with_approvals_reviewer(&transcript.hook("Stop")), None);
        assert_eq!(
            with_approvals_reviewer(&transcript.hook("PreToolUse")),
            None
        );
    }

    #[test]
    fn a_reviewer_already_on_the_payload_is_not_overwritten() {
        let transcript = Transcript::new("present", &format!("{}\n", turn_context("user")));
        let payload = serde_json::to_vec(&serde_json::json!({
            "hook_event_name": "PermissionRequest",
            "approvals_reviewer": "auto_review",
            "transcript_path": transcript.0.display().to_string(),
        }))
        .unwrap();

        assert_eq!(with_approvals_reviewer(&payload), None);
    }
}
