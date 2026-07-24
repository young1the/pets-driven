//! # pets-driven-cli
//!
//! The `pdd` command-line client for pets-driven.
//!
//! State commands go **straight to the shared on-disk state** through
//! [`pets_driven_core::PetsDrivenCore`] over [`pets_driven_fs::FileStateRepository`]:
//! the same core and the same cross-process-locked file the desktop writes. So
//! `pdd list/hatch/bind/unbind/status` work whether or not the desktop is
//! running, and never race it — the file lock serialises the two processes.
//!
//! `forward` is the exception: a hook event is a transient signal for a *running*
//! pet to react to, not a persisted change, so it is delivered to the live app
//! over the loopback ingress and silently does nothing when the app is down.
//!
//! Commands:
//! * `status`  — the state file location and how many pets it holds.
//! * `list`    — every pet in state.
//! * `hatch <ASSET> <NAME> <PRESET> [CWD]` — adopt a pet bound to a folder.
//! * `bind <PET_ID> [CWD]` — bind a pet to a folder (defaults to the cwd).
//! * `unbind <PET_ID>` — detach a pet from its folder.
//! * `forward [EVENT]` — forward an agent hook event to the running app.

mod transport;

use std::io::{Read, Write};
use std::sync::Arc;
use std::time::Duration;

use pets_driven_core::{
    CoreError, HatchPet, Patch, PetId, PetPatch, PetsDrivenCore, WorkingDirectoryPath,
    PERSONALITY_IDS,
};
use pets_driven_fs::FileStateRepository;
use pets_driven_protocol as protocol;

/// Fire-and-forget hook forwards cap the wait short so a stopped app never
/// blocks the agent.
const FIRE_AND_FORGET_TIMEOUT: Duration = Duration::from_secs(2);

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

// ---- Direct state commands -------------------------------------------------

/// Open the core over the shared on-disk state repository.
fn open_core() -> Result<PetsDrivenCore, String> {
    let repository = FileStateRepository::discover().map_err(|error| error.to_string())?;
    Ok(PetsDrivenCore::new(Arc::new(repository)))
}

/// The `{ "ok": false, "error": ... }` envelope for a failed command.
fn error_json(message: impl Into<String>) -> serde_json::Value {
    serde_json::json!({ "ok": false, "error": message.into() })
}

fn print_json<O: Write>(out: &mut O, value: &serde_json::Value) {
    let _ = writeln!(out, "{value}");
}

/// A blank patch to spread over when only one field changes.
fn empty_pet_patch() -> PetPatch {
    PetPatch {
        name: None,
        asset_id: None,
        personality_id: None,
        visible: None,
        archived: None,
        memo: None,
        scale: None,
        working_directory: Patch::Keep,
    }
}

fn run_status<O: Write>(core: &PetsDrivenCore, out: &mut O) -> i32 {
    let state_file = pets_driven_fs::state_file_path()
        .map(|path| path.display().to_string())
        .unwrap_or_default();

    match core.list_pets() {
        Ok(pets) => {
            print_json(
                out,
                &serde_json::json!({ "ok": true, "stateFile": state_file, "pets": pets.len() }),
            );
            0
        }
        Err(error) => report_core_error(out, &error),
    }
}

fn run_list<O: Write>(core: &PetsDrivenCore, out: &mut O) -> i32 {
    match core.list_pets() {
        Ok(pets) => {
            print_json(out, &serde_json::json!({ "ok": true, "pets": pets }));
            0
        }
        Err(error) => report_core_error(out, &error),
    }
}

fn run_hatch<O: Write>(core: &PetsDrivenCore, input: HatchPet, out: &mut O) -> i32 {
    match core.hatch(input) {
        Ok(commit) => {
            print_json(out, &serde_json::json!({ "ok": true, "pet": commit.value }));
            0
        }
        Err(error) => report_core_error(out, &error),
    }
}

fn run_update<O: Write>(core: &PetsDrivenCore, pet_id: &PetId, patch: PetPatch, out: &mut O) -> i32 {
    match core.update_pet(pet_id, patch) {
        Ok(commit) => {
            print_json(out, &serde_json::json!({ "ok": true, "pet": commit.value }));
            0
        }
        Err(error) => report_core_error(out, &error),
    }
}

/// Print a core error as the failure envelope and return exit code 1.
fn report_core_error<O: Write>(out: &mut O, error: &CoreError) -> i32 {
    print_json(out, &error_json(error.to_string()));
    1
}

fn parse_hatch(args: &[String], cwd: &str) -> Result<HatchPet, UsageError> {
    let asset_id = required_arg(args, 0, "hatch", "ASSET")?;
    let name = required_arg(args, 1, "hatch", "NAME")?;
    let personality_id = resolve_preset(&required_arg(args, 2, "hatch", "PRESET")?)?;
    let folder = args.get(3).cloned().unwrap_or_else(|| cwd.to_string());

    Ok(HatchPet {
        working_directory: Some(WorkingDirectoryPath::new(folder)),
        asset_id,
        name,
        personality_id,
    })
}

/// Resolve the `PRESET` argument. A leading `@` marks a directive — `@auto` /
/// `@random` (case-insensitive) pick a personality at random. Without the `@`
/// the value is a literal personality id, passed through for the core to
/// validate. The prefix keeps the directive from ever colliding with a real
/// value, and `@` (not `$`) is used because a shell would expand `$random`.
fn resolve_preset(preset: &str) -> Result<String, UsageError> {
    let Some(directive) = preset.strip_prefix('@') else {
        return Ok(preset.to_string());
    };

    if directive.eq_ignore_ascii_case("auto") || directive.eq_ignore_ascii_case("random") {
        Ok(random_personality().to_string())
    } else {
        Err(UsageError(format!(
            "unknown preset directive '@{directive}'; use @auto or a personality id"
        )))
    }
}

/// A personality id chosen at random. The randomness lives here, in the CLI
/// adapter, so the core stays deterministic. A coarse clock-derived index is
/// plenty for picking a personality.
fn random_personality() -> &'static str {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    PERSONALITY_IDS[(nanos as usize) % PERSONALITY_IDS.len()]
}

fn parse_bind(args: &[String], cwd: &str) -> Result<(PetId, PetPatch), UsageError> {
    let pet_id = PetId::new(required_arg(args, 0, "bind", "PET_ID")?);
    let folder = args.get(1).cloned().unwrap_or_else(|| cwd.to_string());

    Ok((
        pet_id,
        PetPatch {
            working_directory: Patch::Set(WorkingDirectoryPath::new(folder)),
            ..empty_pet_patch()
        },
    ))
}

fn parse_unbind(args: &[String]) -> Result<(PetId, PetPatch), UsageError> {
    let pet_id = PetId::new(required_arg(args, 0, "unbind", "PET_ID")?);

    Ok((
        pet_id,
        PetPatch {
            working_directory: Patch::Clear,
            ..empty_pet_patch()
        },
    ))
}

// ---- Dispatch --------------------------------------------------------------

/// Run the CLI with every input injected, for testing. Returns the process exit
/// code: `0` on success (including a stopped app for `forward`), `1` on a core
/// or repository failure, `2` on a usage error.
pub fn run_with<O: Write, E: Write>(
    args: &[String],
    origin: &str,
    cwd: &str,
    stdin: impl FnOnce() -> Vec<u8>,
    out: &mut O,
    err: &mut E,
) -> i32 {
    let (command, rest) = match args.split_first() {
        // Bare `pdd` prints help rather than doing anything.
        None => {
            let _ = write!(out, "{}", help_text());
            return 0;
        }
        Some((first, rest)) => (first.as_str(), rest),
    };

    match command {
        "help" | "--help" | "-h" => {
            let _ = write!(out, "{}", help_text());
            0
        }
        "version" | "--version" | "-V" => {
            let _ = writeln!(out, "pdd {}", env!("CARGO_PKG_VERSION"));
            0
        }
        // A transient hook event for the running app, not a state change.
        "forward" => run_forward(rest, cwd, origin, stdin),

        // State commands go straight to the shared on-disk state.
        "status" | "list" | "hatch" | "bind" | "unbind" => {
            let core = match open_core() {
                Ok(core) => core,
                Err(message) => {
                    print_json(out, &error_json(message));
                    return 1;
                }
            };

            let parsed = match command {
                "status" => Ok(run_status(&core, out)),
                "list" => Ok(run_list(&core, out)),
                "hatch" => parse_hatch(rest, cwd).map(|input| run_hatch(&core, input, out)),
                "bind" => parse_bind(rest, cwd).map(|(id, patch)| run_update(&core, &id, patch, out)),
                "unbind" => parse_unbind(rest).map(|(id, patch)| run_update(&core, &id, patch, out)),
                _ => unreachable!(),
            };

            match parsed {
                Ok(code) => code,
                Err(UsageError(message)) => {
                    let _ = writeln!(err, "pdd: {message}");
                    let _ = writeln!(err, "Run 'pdd --help' for usage.");
                    2
                }
            }
        }

        other => {
            let _ = writeln!(err, "pdd: unknown command: {other}");
            let _ = writeln!(err, "Run 'pdd --help' for usage.");
            2
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
pdd {version} — command-line client for pets-driven

State commands read and write the shared state file directly (the desktop is
not required and cannot be raced — a cross-process lock serialises them). Only
`forward` needs a running app: it hands a live hook event to the pet to react.

USAGE:
    pdd <COMMAND> [ARGS]

COMMANDS:
    status                          Show the state file path and pet count
    list                            List every pet in state
    hatch <ASSET> <NAME> <PRESET> [CWD]
                                    Adopt a pet bound to a folder (default: cwd).
                                    PRESET may be @auto to pick one at random.
    bind <PET_ID> [CWD]             Bind a pet to a folder (default: cwd)
    unbind <PET_ID>                 Detach a pet from its folder
    forward [EVENT]                 Forward a hook event to the running app: the
                                    stdin payload unchanged, or a synthesized
                                    event when stdin is empty
    help, --help, -h                Show this help
    version, --version, -V          Show the version

PRESETS:
    {presets} (or @auto)

ENVIRONMENT:
    PETS_DRIVEN_STATE_PATH          Override the state file path (must match the
                                    desktop's)
    PETS_DRIVEN_INGRESS_ORIGIN      Override the ingress origin for `forward`
                                    (default: {origin})
",
        version = env!("CARGO_PKG_VERSION"),
        origin = protocol::DEFAULT_INGRESS_ORIGIN,
        presets = PERSONALITY_IDS.join(", "),
    )
}

// ---- forward (live hook event) --------------------------------------------

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

/// Resolve the body to forward: the real stdin payload when present, otherwise a
/// synthesized event for `event_name`. Claude hooks always deliver a payload, so
/// synthesis is only reached by an agent (Codex) whose hook fires with no stdin.
/// Returns `None` when there is nothing to send — an empty payload for a
/// lifecycle event the app does not express.
fn forward_body(stdin: &[u8], event_name: &str, cwd: &str) -> Option<Vec<u8>> {
    let payload = strip_bom(stdin);

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

    protocol::CodexHookEvent::synthesize(event_name, cwd)
        .map(|event| serde_json::to_vec(&event).expect("a synthesized event always serializes"))
}

/// Forward an agent lifecycle event to the running app, fire-and-forget: a hook
/// must never surface an error to the agent, and a stopped app is expected.
fn run_forward(args: &[String], cwd: &str, origin: &str, stdin: impl FnOnce() -> Vec<u8>) -> i32 {
    let event_name = args.first().map(String::as_str).unwrap_or("UserPromptSubmit");

    if let Some(body) = forward_body(&stdin(), event_name, cwd) {
        let _ = transport::post_json(
            origin,
            protocol::paths::CLAUDE_HOOK,
            &body,
            FIRE_AND_FORGET_TIMEOUT,
        );
    }

    0
}

#[cfg(test)]
mod tests {
    use super::*;
    use pets_driven_core::MemoryStateRepository;

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| item.to_string()).collect()
    }

    fn core_with_empty_state() -> PetsDrivenCore {
        PetsDrivenCore::new(Arc::new(MemoryStateRepository::new()))
    }

    fn parse_out(out: &[u8]) -> serde_json::Value {
        serde_json::from_slice(out).expect("command output should be JSON")
    }

    #[test]
    fn hatch_then_list_round_trips_through_the_core() {
        let core = core_with_empty_state();

        let mut out = Vec::new();
        let code = run_hatch(
            &core,
            parse_hatch(&args(&["cato", "Rex", "playful"]), "D:/proj").unwrap(),
            &mut out,
        );
        assert_eq!(code, 0);
        let hatched = parse_out(&out);
        assert_eq!(hatched["ok"], true);
        assert_eq!(hatched["pet"]["name"], "Rex");
        assert_eq!(hatched["pet"]["cwd"], "D:/proj");

        let mut list_out = Vec::new();
        assert_eq!(run_list(&core, &mut list_out), 0);
        let listed = parse_out(&list_out);
        assert_eq!(listed["pets"].as_array().unwrap().len(), 1);
        assert_eq!(listed["pets"][0]["name"], "Rex");
    }

    #[test]
    fn hatch_rejects_an_occupied_folder_with_exit_one() {
        let core = core_with_empty_state();
        run_hatch(
            &core,
            parse_hatch(&args(&["cato", "Rex", "playful", "D:/proj"]), "D:/x").unwrap(),
            &mut Vec::new(),
        );

        let mut out = Vec::new();
        let code = run_hatch(
            &core,
            parse_hatch(&args(&["otto", "Blue", "reserved", "D:/proj"]), "D:/x").unwrap(),
            &mut out,
        );

        assert_eq!(code, 1);
        let rejected = parse_out(&out);
        assert_eq!(rejected["ok"], false);
        assert!(rejected["error"].as_str().unwrap().contains("already has pet"));
    }

    #[test]
    fn bind_then_unbind_moves_and_clears_the_folder() {
        let core = core_with_empty_state();
        let mut hatch_out = Vec::new();
        run_hatch(
            &core,
            parse_hatch(&args(&["cato", "Rex", "playful"]), "D:/proj").unwrap(),
            &mut hatch_out,
        );
        let pet_id = parse_out(&hatch_out)["pet"]["id"].as_str().unwrap().to_string();

        let (id, patch) = parse_bind(&args(&[&pet_id, "D:/other"]), "D:/x").unwrap();
        let mut bind_out = Vec::new();
        assert_eq!(run_update(&core, &id, patch, &mut bind_out), 0);
        assert_eq!(parse_out(&bind_out)["pet"]["cwd"], "D:/other");

        let (id, patch) = parse_unbind(&args(&[&pet_id])).unwrap();
        let mut unbind_out = Vec::new();
        assert_eq!(run_update(&core, &id, patch, &mut unbind_out), 0);
        assert_eq!(parse_out(&unbind_out)["pet"]["cwd"], serde_json::Value::Null);
    }

    #[test]
    fn update_of_an_unknown_pet_reports_not_found_with_exit_one() {
        let core = core_with_empty_state();
        let (id, patch) = parse_unbind(&args(&["pet-missing"])).unwrap();

        let mut out = Vec::new();
        let code = run_update(&core, &id, patch, &mut out);

        assert_eq!(code, 1);
        assert!(parse_out(&out)["error"].as_str().unwrap().contains("No pet found"));
    }

    #[test]
    fn status_reports_the_pet_count() {
        let core = core_with_empty_state();
        run_hatch(
            &core,
            parse_hatch(&args(&["cato", "Rex", "playful"]), "D:/proj").unwrap(),
            &mut Vec::new(),
        );

        let mut out = Vec::new();
        assert_eq!(run_status(&core, &mut out), 0);
        let status = parse_out(&out);
        assert_eq!(status["ok"], true);
        assert_eq!(status["pets"], 1);
    }

    #[test]
    fn preset_passes_a_bare_personality_through() {
        // No `@` prefix: a literal id, including one that happens to look like a
        // keyword. `random` here is a pet name / bare value, not the directive.
        assert_eq!(resolve_preset("playful").unwrap(), "playful");
        assert_eq!(resolve_preset("random").unwrap(), "random");
    }

    #[test]
    fn preset_at_auto_picks_a_known_personality() {
        for directive in ["@auto", "@AUTO", "@random", "@Random"] {
            let picked = resolve_preset(directive).unwrap();
            assert!(
                PERSONALITY_IDS.contains(&picked.as_str()),
                "auto preset picked an unknown personality: {picked}"
            );
        }
    }

    #[test]
    fn an_unknown_preset_directive_is_a_usage_error() {
        let error = resolve_preset("@bogus").expect_err("an unknown @directive should be rejected");
        assert_eq!(
            error,
            UsageError("unknown preset directive '@bogus'; use @auto or a personality id".to_string())
        );
    }

    #[test]
    fn hatch_at_auto_preset_hatches_a_pet_with_a_real_personality() {
        let core = core_with_empty_state();
        let mut out = Vec::new();
        let code = run_hatch(
            &core,
            parse_hatch(&args(&["cato", "Rex", "@auto"]), "D:/proj").unwrap(),
            &mut out,
        );
        assert_eq!(code, 0);
        let personality = parse_out(&out)["pet"]["personalityId"].as_str().unwrap().to_string();
        assert!(PERSONALITY_IDS.contains(&personality.as_str()));
    }

    #[test]
    fn hatch_missing_an_argument_is_a_usage_error() {
        let error = parse_hatch(&args(&["cato", "Rex"]), "D:/proj")
            .expect_err("a hatch without a preset should be a usage error");
        assert_eq!(error, UsageError("hatch: missing required argument PRESET".to_string()));
    }

    #[test]
    fn an_unknown_command_exits_two() {
        let mut out = Vec::new();
        let mut err = Vec::new();
        let code = run_with(&args(&["frobnicate"]), "127.0.0.1:1", "D:/proj", Vec::new, &mut out, &mut err);
        assert_eq!(code, 2);
        assert!(String::from_utf8(err).unwrap().contains("unknown command"));
    }

    #[test]
    fn help_and_bare_invocation_print_usage() {
        for command in [&[][..], &["--help"][..], &["help"][..]] {
            let mut out = Vec::new();
            let mut err = Vec::new();
            let code = run_with(&args(command), "127.0.0.1:1", "D:/proj", Vec::new, &mut out, &mut err);
            assert_eq!(code, 0);
            let text = String::from_utf8(out).unwrap();
            assert!(text.contains("USAGE:"));
            assert!(text.contains("forward [EVENT]"));
        }
    }

    #[test]
    fn version_prints_the_crate_version() {
        let mut out = Vec::new();
        let mut err = Vec::new();
        let code = run_with(&args(&["--version"]), "127.0.0.1:1", "D:/proj", Vec::new, &mut out, &mut err);
        assert_eq!(code, 0);
        assert_eq!(
            String::from_utf8(out).unwrap().trim_end(),
            format!("pdd {}", env!("CARGO_PKG_VERSION"))
        );
    }

    #[test]
    fn forward_passes_a_real_stdin_payload_through() {
        let body = forward_body(br#"{"hook_event_name":"Stop","cwd":"D:/x"}"#, "Stop", "D:/proj")
            .expect("a real payload should be forwarded");
        assert_eq!(body, br#"{"hook_event_name":"Stop","cwd":"D:/x"}"#);
    }

    #[test]
    fn forward_synthesizes_when_stdin_is_empty() {
        let body = forward_body(b"", "UserPromptSubmit", "D:/proj").expect("should synthesize");
        let text = String::from_utf8(body).unwrap();
        assert!(text.contains(r#""hook_event_name":"UserPromptSubmit""#));
        assert!(text.contains(r#""sourceId":"codex""#));
    }

    #[test]
    fn forward_has_nothing_to_send_for_an_unknown_empty_event() {
        assert_eq!(forward_body(b"   ", "Frobnicate", "D:/proj"), None);
    }
}
