//! # pets-driven-cli
//!
//! A command-line client for the running pets-driven desktop app. It is the
//! typed successor to the `plugins/pets-driven/hooks/forward` shell script:
//! every command goes through the desktop's loopback HTTP ingress using the
//! shared [`pets_driven_protocol`] message types, so an agent never reads or
//! writes `state.v1.json` or a pet asset folder itself — the desktop process
//! remains the only authoritative writer.
//!
//! Requests are built from typed structs and serialized with `serde`, which is
//! what makes path escaping correct by construction rather than by hand.
//!
//! Commands:
//! * `status`  — is the desktop app up and listening.
//! * `options` — the hatchable assets and personality presets it accepts.
//! * `list`    — every pet in the app's state.
//! * `hatch ASSET NAME PRESET [CWD]` — create a pet bound to a folder.
//! * `bind PET_ID [CWD]`  — bind a pet to a folder (defaults to the cwd).
//! * `unbind PET_ID`      — detach a pet from its folder.
//! * `attach`  — tell the app an agent attached to the current folder.
//! * `summary EVENT TEXT` — forward a task summary for the current folder.
//! * `forward` (the default) — forward a hook event read from stdin, unchanged.
//! * `forward-codex [EVENT]` — forward a Codex event, synthesizing one when
//!   stdin is empty.

mod transport;

use std::io::{Read, Write};
use std::time::Duration;

use pets_driven_protocol as protocol;

use transport::TransportError;

/// Authoritative queries and mutations wait up to this long for the app's
/// answer.
const AUTHORITATIVE_TIMEOUT: Duration = Duration::from_secs(5);

/// Fire-and-forget hook forwards cap the wait short so a stopped app never
/// blocks the agent.
const FIRE_AND_FORGET_TIMEOUT: Duration = Duration::from_secs(2);

/// Whether a command waits for and prints the app's answer, or fires and
/// forgets.
#[derive(Debug, PartialEq, Eq)]
enum Mode {
    /// Wait for the reply and print it; a connection failure prints the
    /// app-not-running answer.
    Authoritative,
    /// POST and return immediately, ignoring the reply and any failure.
    FireAndForget,
}

/// A resolved request ready to send.
#[derive(Debug, PartialEq, Eq)]
struct PreparedRequest {
    path: &'static str,
    body: Vec<u8>,
    mode: Mode,
}

/// A bad command line: a missing argument or an unknown command.
#[derive(Debug, PartialEq, Eq)]
pub struct UsageError(pub String);

fn required_arg(
    args: &[String],
    index: usize,
    command: &str,
    name: &str,
) -> Result<String, UsageError> {
    args.get(index)
        .cloned()
        .ok_or_else(|| UsageError(format!("{command}: missing required argument {name}")))
}

/// A request type serialized to a JSON body. The protocol request types are
/// plain data, so serialization cannot fail.
fn json_body<T: serde::Serialize>(value: &T) -> Vec<u8> {
    serde_json::to_vec(value).expect("protocol request types always serialize")
}

/// Turn a parsed command line into the request to send. `cwd` is the working
/// directory a command reads or defaults to; `stdin` yields the forwarded hook
/// body and is only read for the default forward command.
fn prepare(
    command: &str,
    args: &[String],
    cwd: &str,
    stdin: impl FnOnce() -> Vec<u8>,
) -> Result<PreparedRequest, UsageError> {
    let authoritative = |path, body| PreparedRequest {
        path,
        body,
        mode: Mode::Authoritative,
    };
    let fire = |path, body| PreparedRequest {
        path,
        body,
        mode: Mode::FireAndForget,
    };

    match command {
        // Read-only lookups. The app answers from its own state.
        "status" | "ping" => Ok(authoritative(protocol::paths::PING, Vec::new())),
        "options" => Ok(authoritative(protocol::paths::OPTIONS, Vec::new())),
        "list" => Ok(authoritative(protocol::paths::LIST, Vec::new())),

        // Authoritative mutations. The response tells "app not running" apart
        // from a rejection (an occupied folder, an unknown pet).
        "hatch" => {
            let asset_id = required_arg(args, 0, "hatch", "ASSET")?;
            let name = required_arg(args, 1, "hatch", "NAME")?;
            let personality_id = required_arg(args, 2, "hatch", "PRESET")?;
            let folder = args.get(3).cloned().unwrap_or_else(|| cwd.to_string());
            Ok(authoritative(
                protocol::paths::HATCH,
                json_body(&protocol::HatchRequest {
                    cwd: folder,
                    asset_id,
                    name,
                    personality_id,
                }),
            ))
        }
        "bind" => {
            let pet_id = required_arg(args, 0, "bind", "PET_ID")?;
            let folder = args.get(1).cloned().unwrap_or_else(|| cwd.to_string());
            Ok(authoritative(
                protocol::paths::PET_UPDATE,
                json_body(&protocol::BindRequest { pet_id, cwd: folder }),
            ))
        }
        "unbind" => {
            let pet_id = required_arg(args, 0, "unbind", "PET_ID")?;
            Ok(authoritative(
                protocol::paths::PET_UPDATE,
                json_body(&protocol::UnbindRequest::new(pet_id)),
            ))
        }

        // Fire-and-forget hook forwards.
        "attach" => Ok(fire(
            protocol::paths::CLAUDE_HOOK,
            json_body(&protocol::HookEvent::attach(cwd)),
        )),
        "summary" => {
            let event_name = required_arg(args, 0, "summary", "EVENT_NAME")?;
            let text = required_arg(args, 1, "summary", "SUMMARY")?;
            Ok(fire(
                protocol::paths::CLAUDE_HOOK,
                json_body(&protocol::HookEvent::summary(event_name, cwd, text)),
            ))
        }
        // The default: forward a hook event read from stdin, unchanged.
        "forward" => Ok(fire(protocol::paths::CLAUDE_HOOK, stdin())),

        other => Err(UsageError(format!("unknown command: {other}"))),
    }
}

/// Run the CLI with every input injected, for testing. Returns the process exit
/// code. Every reachable outcome exits `0` except a usage error (`2`), matching
/// the shell script it replaces: a stopped app is a normal answer, not a fault.
pub fn run_with<O: Write, E: Write>(
    args: &[String],
    origin: &str,
    cwd: &str,
    stdin: impl FnOnce() -> Vec<u8>,
    out: &mut O,
    err: &mut E,
) -> i32 {
    let (command, rest) = match args.split_first() {
        // Bare `pdd` prints help rather than blocking on stdin: the hook always
        // invokes an explicit `forward` / `forward-codex`, so no-args is a human
        // asking what the tool does.
        None => {
            let _ = write!(out, "{}", help_text());
            return 0;
        }
        Some((first, rest)) => (first.as_str(), rest),
    };

    match command {
        "help" | "--help" | "-h" => {
            let _ = write!(out, "{}", help_text());
            return 0;
        }
        "version" | "--version" | "-V" => {
            let _ = writeln!(out, "pdd {}", env!("CARGO_PKG_VERSION"));
            return 0;
        }
        // Codex forwarding is special: it may synthesize a body when stdin is
        // empty, so it does not fit the single-request shape the others share.
        "forward-codex" => return run_codex_forward(rest, cwd, origin, stdin),
        _ => {}
    }

    let request = match prepare(command, rest, cwd, stdin) {
        Ok(request) => request,
        Err(UsageError(message)) => {
            let _ = writeln!(err, "pdd: {message}");
            let _ = writeln!(err, "Run 'pdd --help' for usage.");
            return 2;
        }
    };

    match request.mode {
        Mode::FireAndForget => {
            // Ignore the reply and any failure: a hook forward must not surface
            // an error to the agent, and an unopened app is expected.
            let _ = transport::post_json(
                origin,
                request.path,
                &request.body,
                FIRE_AND_FORGET_TIMEOUT,
            );
            0
        }
        Mode::Authoritative => {
            match transport::post_json(origin, request.path, &request.body, AUTHORITATIVE_TIMEOUT) {
                Ok(body) => {
                    let _ = out.write_all(&body);
                    let _ = writeln!(out);
                }
                Err(TransportError::Connect(_) | TransportError::Resolve(_)) => {
                    // The app is not reachable: answer with the structured
                    // app-not-running value instead of a transport error.
                    let _ = writeln!(out, "{}", protocol::APP_NOT_RUNNING_JSON);
                }
                Err(TransportError::Io(_)) => {
                    // A mid-request I/O fault is reported the same friendly way:
                    // from the caller's view the app did not answer.
                    let _ = writeln!(out, "{}", protocol::APP_NOT_RUNNING_JSON);
                }
            }
            0
        }
    }
}

/// The process entry point: resolve the ingress origin, working directory, and
/// stdin from the environment, then dispatch.
pub fn run() -> i32 {
    let args: Vec<String> = std::env::args().skip(1).collect();

    let origin = std::env::var("PETS_DRIVEN_INGRESS_ORIGIN")
        .map(|raw| protocol::normalize_origin(&raw))
        .unwrap_or_else(|_| protocol::DEFAULT_INGRESS_ORIGIN.to_string());

    let cwd = std::env::current_dir()
        .map(|path| path.display().to_string())
        .unwrap_or_default();

    let mut out = std::io::stdout();
    let mut err = std::io::stderr();

    run_with(&args, &origin, &cwd, read_stdin, &mut out, &mut err)
}

/// The `--help` text.
fn help_text() -> String {
    format!(
        "\
pdd {version} — command-line client for the running pets-driven desktop app

The desktop app is the only writer of pets-driven state, so every command goes
through its local ingress; nothing here touches the state file directly.

USAGE:
    pdd <COMMAND> [ARGS]

COMMANDS:
    status                          Report whether the desktop app is running
    list                            List every pet the app knows about
    options                         List hatchable assets and personality presets
    hatch <ASSET> <NAME> <PRESET> [CWD]
                                    Adopt a pet bound to a folder (default: cwd)
    bind <PET_ID> [CWD]             Bind a pet to a folder (default: cwd)
    unbind <PET_ID>                 Detach a pet from its folder
    attach                          Tell the app an agent attached to this folder
    summary <EVENT> <TEXT>          Forward a task summary for this folder
    forward                         Forward a hook event read from stdin, unchanged
    forward-codex [EVENT]           Forward a Codex event, synthesized when stdin
                                    is empty (default event: UserPromptSubmit)
    help, --help, -h                Show this help
    version, --version, -V          Show the version

ENVIRONMENT:
    PETS_DRIVEN_INGRESS_ORIGIN      Override the ingress origin
                                    (default: {origin})

If the app is not running, a command answers with a small JSON object whose
error is \"app-not-running\" and still exits 0.
",
        version = env!("CARGO_PKG_VERSION"),
        origin = protocol::DEFAULT_INGRESS_ORIGIN,
    )
}

/// Read the whole hook body from stdin, as bytes, so a non-ASCII payload passes
/// through unchanged.
fn read_stdin() -> Vec<u8> {
    let mut buffer = Vec::new();
    let _ = std::io::stdin().read_to_end(&mut buffer);
    buffer
}

/// Strip a leading UTF-8 byte-order mark, which some shells prepend to a hook
/// payload.
fn strip_bom(bytes: &[u8]) -> &[u8] {
    bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes)
}

/// Resolve the body to forward for a Codex event: the real stdin payload when
/// present, otherwise a synthesized event. Returns `None` when there is nothing
/// to send — an empty payload for a lifecycle event the app does not express —
/// so the caller simply exits without posting.
fn codex_forward_body(stdin: &[u8], event_name: &str, cwd: &str) -> Option<Vec<u8>> {
    let payload = strip_bom(stdin);

    // A real payload is forwarded unchanged. Only a blank body or a bare `{}`
    // (or non-UTF-8, which a genuine hook payload never is) falls through to
    // synthesis.
    let is_blank = match std::str::from_utf8(payload) {
        Ok(text) => {
            let trimmed = text.trim();
            trimmed.is_empty() || trimmed == "{}"
        }
        Err(_) => false,
    };

    if !is_blank {
        return Some(payload.to_vec());
    }

    protocol::CodexHookEvent::synthesize(event_name, cwd).map(|event| json_body(&event))
}

/// Forward a Codex lifecycle event to the Codex route, fire-and-forget: a hook
/// must never surface an error to the agent. When stdin is empty the event is
/// synthesized; a lifecycle event with no synthesized form sends nothing.
fn run_codex_forward(
    args: &[String],
    cwd: &str,
    origin: &str,
    stdin: impl FnOnce() -> Vec<u8>,
) -> i32 {
    let event_name = args.first().map(String::as_str).unwrap_or("UserPromptSubmit");

    if let Some(body) = codex_forward_body(&stdin(), event_name, cwd) {
        let _ = transport::post_json(
            origin,
            protocol::paths::CODEX_HOOK,
            &body,
            FIRE_AND_FORGET_TIMEOUT,
        );
    }

    0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| item.to_string()).collect()
    }

    fn prepared(command: &str, rest: &[&str], cwd: &str) -> PreparedRequest {
        prepare(command, &args(rest), cwd, || b"STDIN".to_vec()).expect("should prepare")
    }

    #[test]
    fn status_list_and_options_send_no_body_and_wait() {
        for (command, path) in [
            ("status", protocol::paths::PING),
            ("list", protocol::paths::LIST),
            ("options", protocol::paths::OPTIONS),
        ] {
            let request = prepared(command, &[], "D:/proj");
            assert_eq!(request.path, path);
            assert!(request.body.is_empty());
            assert_eq!(request.mode, Mode::Authoritative);
        }
    }

    #[test]
    fn hatch_builds_a_camel_case_body_and_defaults_cwd() {
        let request = prepared("hatch", &["cato", "Rex", "playful"], "D:/proj");
        assert_eq!(request.path, protocol::paths::HATCH);
        assert_eq!(request.mode, Mode::Authoritative);
        assert_eq!(
            String::from_utf8(request.body).unwrap(),
            r#"{"cwd":"D:/proj","assetId":"cato","name":"Rex","personalityId":"playful"}"#
        );
    }

    #[test]
    fn hatch_uses_an_explicit_folder_argument_when_given() {
        let request = prepared("hatch", &["cato", "Rex", "playful", "D:/other"], "D:/proj");
        assert!(String::from_utf8(request.body).unwrap().contains(r#""cwd":"D:/other""#));
    }

    #[test]
    fn hatch_escapes_a_windows_path_by_construction() {
        let request = prepared("hatch", &["cato", "Rex", "playful", r"C:\a\b"], "D:/proj");
        assert!(String::from_utf8(request.body).unwrap().contains(r#""cwd":"C:\\a\\b""#));
    }

    #[test]
    fn hatch_missing_an_argument_is_a_usage_error() {
        let error = prepare("hatch", &args(&["cato", "Rex"]), "D:/proj", || Vec::new())
            .expect_err("a hatch without a preset should be a usage error");
        assert_eq!(error, UsageError("hatch: missing required argument PRESET".to_string()));
    }

    #[test]
    fn bind_targets_pet_update_and_defaults_cwd() {
        let request = prepared("bind", &["pet-1"], "D:/proj");
        assert_eq!(request.path, protocol::paths::PET_UPDATE);
        assert_eq!(
            String::from_utf8(request.body).unwrap(),
            r#"{"petId":"pet-1","cwd":"D:/proj"}"#
        );
    }

    #[test]
    fn unbind_sends_an_explicit_null_cwd() {
        let request = prepared("unbind", &["pet-1"], "D:/proj");
        assert_eq!(request.path, protocol::paths::PET_UPDATE);
        assert_eq!(
            String::from_utf8(request.body).unwrap(),
            r#"{"petId":"pet-1","cwd":null}"#
        );
    }

    #[test]
    fn attach_synthesizes_a_notification_for_the_cwd_and_fires() {
        let request = prepared("attach", &[], "D:/proj");
        assert_eq!(request.path, protocol::paths::CLAUDE_HOOK);
        assert_eq!(request.mode, Mode::FireAndForget);
        assert_eq!(
            String::from_utf8(request.body).unwrap(),
            r#"{"hook_event_name":"Notification","cwd":"D:/proj","message":"Agent attached"}"#
        );
    }

    #[test]
    fn the_default_command_forwards_stdin_unchanged() {
        let request =
            prepare("forward", &[], "D:/proj", || b"{\"raw\":true}".to_vec()).expect("prepare");
        assert_eq!(request.path, protocol::paths::CLAUDE_HOOK);
        assert_eq!(request.mode, Mode::FireAndForget);
        assert_eq!(request.body, b"{\"raw\":true}");
    }

    #[test]
    fn codex_forward_passes_a_real_stdin_payload_through() {
        let body = codex_forward_body(br#"{"hook_event_name":"Stop","cwd":"D:/x"}"#, "Stop", "D:/proj")
            .expect("a real payload should be forwarded");
        assert_eq!(body, br#"{"hook_event_name":"Stop","cwd":"D:/x"}"#);
    }

    #[test]
    fn codex_forward_strips_a_utf8_bom_before_deciding() {
        // A BOM in front of `{}` must still count as an empty payload, so the
        // event is synthesized rather than forwarded as-is.
        let mut stdin = vec![0xEF, 0xBB, 0xBF];
        stdin.extend_from_slice(b"{}");
        let body = codex_forward_body(&stdin, "Stop", "D:/proj").expect("should synthesize");
        let text = String::from_utf8(body).unwrap();
        assert!(text.contains(r#""summary":"Codex turn completed""#));
    }

    #[test]
    fn codex_forward_synthesizes_when_stdin_is_empty() {
        let body = codex_forward_body(b"", "UserPromptSubmit", "D:/proj").expect("should synthesize");
        let text = String::from_utf8(body).unwrap();
        assert!(text.contains(r#""hook_event_name":"UserPromptSubmit""#));
        assert!(text.contains(r#""sourceId":"codex""#));
        assert!(text.contains(r#""cwd":"D:/proj""#));
    }

    #[test]
    fn codex_forward_has_nothing_to_send_for_an_unknown_empty_event() {
        assert_eq!(codex_forward_body(b"   ", "Frobnicate", "D:/proj"), None);
    }

    #[test]
    fn an_unknown_command_is_a_usage_error() {
        let error = prepare("frobnicate", &[], "D:/proj", || Vec::new())
            .expect_err("an unknown command should be a usage error");
        assert_eq!(error, UsageError("unknown command: frobnicate".to_string()));
    }

    #[test]
    fn help_and_bare_invocation_print_usage_and_exit_zero() {
        for command in [&[][..], &["--help"][..], &["-h"][..], &["help"][..]] {
            let mut out = Vec::new();
            let mut err = Vec::new();
            let code = run_with(
                &args(command),
                protocol::DEFAULT_INGRESS_ORIGIN,
                "D:/proj",
                Vec::new,
                &mut out,
                &mut err,
            );
            assert_eq!(code, 0);
            let text = String::from_utf8(out).unwrap();
            assert!(text.contains("USAGE:"));
            assert!(text.contains("forward-codex"));
            assert!(err.is_empty());
        }
    }

    #[test]
    fn version_prints_the_crate_version() {
        let mut out = Vec::new();
        let mut err = Vec::new();
        let code = run_with(
            &args(&["--version"]),
            protocol::DEFAULT_INGRESS_ORIGIN,
            "D:/proj",
            Vec::new,
            &mut out,
            &mut err,
        );
        assert_eq!(code, 0);
        assert_eq!(
            String::from_utf8(out).unwrap().trim_end(),
            format!("pdd {}", env!("CARGO_PKG_VERSION"))
        );
    }

    #[test]
    fn a_usage_error_exits_two_and_writes_to_stderr() {
        let mut out = Vec::new();
        let mut err = Vec::new();
        let code = run_with(
            &args(&["hatch"]),
            protocol::DEFAULT_INGRESS_ORIGIN,
            "D:/proj",
            Vec::new,
            &mut out,
            &mut err,
        );
        assert_eq!(code, 2);
        assert!(out.is_empty());
        assert!(String::from_utf8(err).unwrap().contains("missing required argument ASSET"));
    }

    #[test]
    fn an_unreachable_app_answers_app_not_running_and_exits_zero() {
        // Port 1 on loopback refuses instantly, standing in for a stopped app.
        let mut out = Vec::new();
        let mut err = Vec::new();
        let code = run_with(
            &args(&["list"]),
            "127.0.0.1:1",
            "D:/proj",
            Vec::new,
            &mut out,
            &mut err,
        );
        assert_eq!(code, 0);
        assert!(String::from_utf8(out).unwrap().contains("app-not-running"));
    }
}
