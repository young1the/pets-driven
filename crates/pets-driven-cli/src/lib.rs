//! # pets-driven-cli
//!
//! The `pdd` command-line client for pets-driven.
//!
//! State commands read and write the shared state file directly through
//! [`pets_driven_core::PetsDrivenCore`] over [`pets_driven_fs::FileStateRepository`]
//! — the same core and the same cross-process-locked file the desktop writes —
//! so they work whether or not the desktop is running and never race it.
//!
//! `forward` is the exception: a hook event is a transient signal for a *running*
//! pet to react to, not a persisted change, so it is delivered to the live app
//! over the loopback ingress and silently does nothing when the app is down.

mod transport;

use std::io::{Read, Write};
use std::sync::Arc;
use std::time::Duration;

use clap::{Parser, Subcommand};
use pets_driven_core::{
    CoreError, HatchPet, Patch, PetId, PetPatch, PetsDrivenCore, WorkingDirectoryPath,
    PERSONALITY_IDS,
};
use pets_driven_fs::FileStateRepository;
use pets_driven_protocol as protocol;

/// Fire-and-forget hook forwards cap the wait short so a stopped app never
/// blocks the agent.
const FIRE_AND_FORGET_TIMEOUT: Duration = Duration::from_secs(2);

/// A command that waits for the app's reply (show/hide) bounds the wait a little
/// longer, but still short so a wedged app does not hang the terminal.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Parser)]
#[command(
    name = "pdd",
    version,
    disable_version_flag = true,
    about = "Command-line client for pets-driven",
    long_about = "Command-line client for pets-driven.\n\n\
        State commands read and write the shared state file directly: the desktop \
        is not required and cannot be raced (a cross-process lock serialises \
        them). Only `forward` needs a running app — it hands a live hook event to \
        the pet to react.",
    after_help = "ENVIRONMENT:\n    \
        PETS_DRIVEN_STATE_PATH        Override the state file path (must match the desktop's)\n    \
        PETS_DRIVEN_INGRESS_ORIGIN    Override the ingress origin for `forward`\n\n\
        Run `pdd presets` to list personality ids."
)]
struct Cli {
    /// Print version. Accepts both `-v` and `-V`.
    #[arg(short = 'v', short_alias = 'V', long = "version", action = clap::ArgAction::Version)]
    version: Option<bool>,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Show the state file path and pet count
    Status,
    /// List every pet in state
    List,
    /// List the personality ids `hatch` accepts
    Presets,
    /// Adopt a pet bound to a folder. Only a name is required; the asset,
    /// personality, and folder default to a random asset, a random personality,
    /// and the current directory.
    Hatch {
        /// Display name for the new pet
        name: String,
        /// Pet asset id (default: a random built-in asset)
        #[arg(short, long)]
        asset: Option<String>,
        /// Personality id (default: a random personality)
        #[arg(short, long)]
        personality: Option<String>,
        /// Folder to bind (default: the current directory)
        #[arg(short, long)]
        cwd: Option<String>,
    },
    /// Bind a pet to a folder
    Bind {
        /// Pet id (from `pdd list`)
        pet: String,
        /// Folder to bind (defaults to the current directory)
        #[arg(short, long)]
        cwd: Option<String>,
    },
    /// Detach a pet from its folder
    Unbind {
        /// Pet id (from `pdd list`)
        pet: String,
    },
    /// Permanently remove a pet (and hide its window)
    Delete {
        /// Pet id to remove (from `pdd list`). Omit to remove the pet bound to
        /// --cwd (or the current directory).
        pet: Option<String>,
        /// Remove the pet bound to this folder instead of by id
        #[arg(short, long)]
        cwd: Option<String>,
    },
    /// Show the running app's pet window for a folder (defaults to the cwd)
    Show {
        /// Folder whose pet to show (default: the current directory)
        cwd: Option<String>,
    },
    /// Hide the running app's pet window for a folder (defaults to the cwd)
    Hide {
        /// Folder whose pet to hide (default: the current directory)
        cwd: Option<String>,
    },
    /// Forward a hook event to the running app
    Forward {
        /// Lifecycle event to synthesize when stdin is empty
        event: Option<String>,
    },
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

/// Print a core error as the failure envelope and return exit code 1.
fn report_core_error<O: Write>(out: &mut O, error: &CoreError) -> i32 {
    print_json(out, &error_json(error.to_string()));
    1
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

fn run_presets<O: Write>(out: &mut O) -> i32 {
    print_json(out, &serde_json::json!({ "ok": true, "presets": PERSONALITY_IDS }));
    0
}

fn run_hatch<O: Write>(core: &PetsDrivenCore, input: HatchPet, origin: &str, out: &mut O) -> i32 {
    match core.hatch(input) {
        Ok(commit) => {
            // Ask the running app to show the new pet's overlay window. The app
            // reloads state (picking up the pet we just wrote) before showing,
            // so this is safe right after the write. Fire-and-forget: a stopped
            // app just means the pet appears on next launch.
            if let Some(cwd) = commit.value.working_directory() {
                show_pet(origin, cwd);
            }
            print_json(out, &serde_json::json!({ "ok": true, "pet": commit.value }));
            0
        }
        Err(error) => report_core_error(out, &error),
    }
}

/// Best-effort request to the running app to show the pet registered to `cwd`.
/// Fire-and-forget: used as a side effect of `hatch`, it never blocks or prints.
fn show_pet(origin: &str, cwd: &str) {
    let body = serde_json::json!({ "cwd": cwd }).to_string();
    let _ = transport::post_json(origin, protocol::paths::SHOW, body.as_bytes(), FIRE_AND_FORGET_TIMEOUT);
}

/// Show or hide the running app's pet window for `cwd`, printing the app's
/// reply. A show/hide needs the app, so an unreachable app is reported as
/// `app-not-running` (still exit 0 — a stopped app is a normal answer).
fn run_show_hide<O: Write>(origin: &str, path: &str, cwd: &str, out: &mut O) -> i32 {
    let body = serde_json::json!({ "cwd": cwd }).to_string();
    match transport::post_json(origin, path, body.as_bytes(), REQUEST_TIMEOUT) {
        Ok(reply) => {
            let _ = out.write_all(&reply);
            let _ = writeln!(out);
        }
        Err(_) => print_json(out, &error_json("app-not-running")),
    }
    0
}

/// Remove a pet: resolve it (by id or by folder), hide its window in the
/// running app (best-effort, while it is still in state), then delete it.
fn run_delete<O: Write>(
    core: &PetsDrivenCore,
    origin: &str,
    pet: Option<String>,
    folder: String,
    out: &mut O,
) -> i32 {
    // Resolve the target pet and the folder to hide.
    let (pet_id, cwd) = match pet {
        Some(id) => match core.pet(&PetId::new(&id)) {
            Ok(Some(view)) => (PetId::new(id), view.working_directory().map(str::to_string)),
            Ok(None) => {
                print_json(out, &error_json(format!("No pet found with id {id}")));
                return 1;
            }
            Err(error) => return report_core_error(out, &error),
        },
        None => match core.pet_by_working_directory(&folder) {
            Ok(Some(view)) => match view.id() {
                Some(id) => (PetId::new(id), Some(folder)),
                None => {
                    print_json(out, &error_json("resolved pet has no id"));
                    return 1;
                }
            },
            Ok(None) => {
                print_json(out, &error_json(format!("No pet bound to {folder}")));
                return 1;
            }
            Err(error) => return report_core_error(out, &error),
        },
    };

    // Close the overlay window while the pet is still in state (the hide route
    // resolves the pet by folder). Best-effort: a stopped app is fine.
    if let Some(cwd) = &cwd {
        let body = serde_json::json!({ "cwd": cwd }).to_string();
        let _ = transport::post_json(origin, protocol::paths::HIDE, body.as_bytes(), FIRE_AND_FORGET_TIMEOUT);
    }

    match core.remove_pet(&pet_id) {
        Ok(_commit) => {
            print_json(out, &serde_json::json!({ "ok": true, "removed": pet_id.as_str() }));
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

/// The pet assets shipped with the app, used to pick one at random when
/// `--asset` is omitted. They ship with every install, so a random pick is
/// always resolvable.
///
/// coupling: keep in sync with the built-in packs in repo-root `pets/` (and the
/// list asserted in `apps/desktop/src-tauri/src/pet_assets.rs` tests).
const BUILTIN_PET_ASSETS: [&str; 6] = ["bloop", "cato", "fenn", "mochi", "otto", "pip"];

/// A random index into a slice of `len`. The randomness lives here, in the CLI
/// adapter, so the core stays deterministic; a per-call salt mixed into the
/// clock keeps two picks in the same command (asset and personality) from
/// landing on a correlated value.
fn random_index(len: usize) -> usize {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SALT: AtomicU64 = AtomicU64::new(0);

    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos() as u64)
        .unwrap_or(0);
    let salt = SALT.fetch_add(0x9E37_79B9_7F4A_7C15, Ordering::Relaxed);

    ((nanos ^ salt) as usize) % len
}

/// A personality id chosen at random from the core catalog.
fn random_personality() -> &'static str {
    PERSONALITY_IDS[random_index(PERSONALITY_IDS.len())]
}

/// A built-in pet asset id chosen at random.
fn random_asset() -> &'static str {
    BUILTIN_PET_ASSETS[random_index(BUILTIN_PET_ASSETS.len())]
}

// ---- Dispatch --------------------------------------------------------------

/// Run the CLI with every input injected, for testing. Returns the process exit
/// code: `0` on success (including a stopped app for `forward`, and for
/// `--help`/`--version`), `1` on a core or repository failure, `2` on a usage
/// error.
pub fn run_with<O: Write, E: Write>(
    args: &[String],
    origin: &str,
    cwd: &str,
    stdin: impl FnOnce() -> Vec<u8>,
    out: &mut O,
    err: &mut E,
) -> i32 {
    // clap expects argv[0] to be the program name.
    let argv = std::iter::once("pdd".to_string()).chain(args.iter().cloned());
    let cli = match Cli::try_parse_from(argv) {
        Ok(cli) => cli,
        Err(error) => return render_clap_error(error, out, err),
    };

    match cli.command {
        Command::Forward { event } => run_forward(event.as_deref(), cwd, origin, stdin),
        Command::Presets => run_presets(out),

        // Live presentation signals for the running app; no state change.
        Command::Show { cwd: folder } => run_show_hide(
            origin,
            protocol::paths::SHOW,
            &folder.unwrap_or_else(|| cwd.to_string()),
            out,
        ),
        Command::Hide { cwd: folder } => run_show_hide(
            origin,
            protocol::paths::HIDE,
            &folder.unwrap_or_else(|| cwd.to_string()),
            out,
        ),

        Command::Status
        | Command::List
        | Command::Hatch { .. }
        | Command::Bind { .. }
        | Command::Unbind { .. }
        | Command::Delete { .. } => {
            let core = match open_core() {
                Ok(core) => core,
                Err(message) => {
                    print_json(out, &error_json(message));
                    return 1;
                }
            };

            match cli.command {
                Command::Status => run_status(&core, out),
                Command::List => run_list(&core, out),
                Command::Hatch { name, asset, personality, cwd: folder } => {
                    let asset_id = asset.unwrap_or_else(|| random_asset().to_string());
                    let personality_id =
                        personality.unwrap_or_else(|| random_personality().to_string());
                    let folder = folder.unwrap_or_else(|| cwd.to_string());
                    run_hatch(
                        &core,
                        HatchPet {
                            working_directory: Some(WorkingDirectoryPath::new(folder)),
                            asset_id,
                            name,
                            personality_id,
                        },
                        origin,
                        out,
                    )
                }
                Command::Bind { pet, cwd: folder } => {
                    let folder = folder.unwrap_or_else(|| cwd.to_string());
                    run_update(
                        &core,
                        &PetId::new(pet),
                        PetPatch {
                            working_directory: Patch::Set(WorkingDirectoryPath::new(folder)),
                            ..empty_pet_patch()
                        },
                        out,
                    )
                }
                Command::Unbind { pet } => run_update(
                    &core,
                    &PetId::new(pet),
                    PetPatch {
                        working_directory: Patch::Clear,
                        ..empty_pet_patch()
                    },
                    out,
                ),
                Command::Delete { pet, cwd: folder } => {
                    let folder = folder.unwrap_or_else(|| cwd.to_string());
                    run_delete(&core, origin, pet, folder, out)
                }
                // The outer match already excluded the other variants.
                Command::Forward { .. }
                | Command::Presets
                | Command::Show { .. }
                | Command::Hide { .. } => unreachable!(),
            }
        }
    }
}

/// Map a clap parse outcome to an exit code and the right stream: `--help` and
/// `--version` are successful output on stdout; everything else is a usage error
/// on stderr with exit 2.
fn render_clap_error<O: Write, E: Write>(error: clap::Error, out: &mut O, err: &mut E) -> i32 {
    use clap::error::ErrorKind;
    match error.kind() {
        ErrorKind::DisplayHelp | ErrorKind::DisplayVersion => {
            let _ = write!(out, "{error}");
            0
        }
        _ => {
            let _ = write!(err, "{error}");
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
fn run_forward(event: Option<&str>, cwd: &str, origin: &str, stdin: impl FnOnce() -> Vec<u8>) -> i32 {
    let event_name = event.unwrap_or("UserPromptSubmit");

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

    /// A loopback port that refuses instantly, so the best-effort show ping after
    /// a hatch fails fast without a running app.
    const REFUSED: &str = "127.0.0.1:1";

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(|item| item.to_string()).collect()
    }

    fn core_with_empty_state() -> PetsDrivenCore {
        PetsDrivenCore::new(Arc::new(MemoryStateRepository::new()))
    }

    fn parse_out(out: &[u8]) -> serde_json::Value {
        serde_json::from_slice(out).expect("command output should be JSON")
    }

    fn hatch_input(asset: &str, name: &str, personality: &str, cwd: &str) -> HatchPet {
        HatchPet {
            working_directory: Some(WorkingDirectoryPath::new(cwd)),
            asset_id: asset.to_string(),
            name: name.to_string(),
            personality_id: personality.to_string(),
        }
    }

    #[test]
    fn hatch_then_list_round_trips_through_the_core() {
        let core = core_with_empty_state();

        let mut out = Vec::new();
        assert_eq!(run_hatch(&core, hatch_input("cato", "Rex", "playful", "D:/proj"), REFUSED, &mut out), 0);
        let hatched = parse_out(&out);
        assert_eq!(hatched["pet"]["name"], "Rex");
        assert_eq!(hatched["pet"]["cwd"], "D:/proj");

        let mut list_out = Vec::new();
        assert_eq!(run_list(&core, &mut list_out), 0);
        assert_eq!(parse_out(&list_out)["pets"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn hatch_rejects_an_occupied_folder_with_exit_one() {
        let core = core_with_empty_state();
        run_hatch(&core, hatch_input("cato", "Rex", "playful", "D:/proj"), REFUSED, &mut Vec::new());

        let mut out = Vec::new();
        let code = run_hatch(&core, hatch_input("otto", "Blue", "reserved", "D:/proj"), REFUSED, &mut out);

        assert_eq!(code, 1);
        assert_eq!(parse_out(&out)["ok"], false);
        assert!(parse_out(&out)["error"].as_str().unwrap().contains("already has pet"));
    }

    #[test]
    fn bind_then_unbind_moves_and_clears_the_folder() {
        let core = core_with_empty_state();
        let mut hatch_out = Vec::new();
        run_hatch(&core, hatch_input("cato", "Rex", "playful", "D:/proj"), REFUSED, &mut hatch_out);
        let pet_id = parse_out(&hatch_out)["pet"]["id"].as_str().unwrap().to_string();

        let mut bind_out = Vec::new();
        let code = run_update(
            &core,
            &PetId::new(pet_id.clone()),
            PetPatch { working_directory: Patch::Set(WorkingDirectoryPath::new("D:/other")), ..empty_pet_patch() },
            &mut bind_out,
        );
        assert_eq!(code, 0);
        assert_eq!(parse_out(&bind_out)["pet"]["cwd"], "D:/other");

        let mut unbind_out = Vec::new();
        run_update(
            &core,
            &PetId::new(pet_id),
            PetPatch { working_directory: Patch::Clear, ..empty_pet_patch() },
            &mut unbind_out,
        );
        assert_eq!(parse_out(&unbind_out)["pet"]["cwd"], serde_json::Value::Null);
    }

    #[test]
    fn delete_by_folder_removes_the_pet() {
        let core = core_with_empty_state();
        run_hatch(&core, hatch_input("cato", "Rex", "playful", "D:/proj"), REFUSED, &mut Vec::new());

        let mut out = Vec::new();
        let code = run_delete(&core, REFUSED, None, "D:/proj".to_string(), &mut out);
        assert_eq!(code, 0);
        assert_eq!(parse_out(&out)["ok"], true);

        let mut list_out = Vec::new();
        run_list(&core, &mut list_out);
        assert!(parse_out(&list_out)["pets"].as_array().unwrap().is_empty());
    }

    #[test]
    fn delete_of_an_unbound_folder_reports_not_found() {
        let core = core_with_empty_state();
        let mut out = Vec::new();
        let code = run_delete(&core, REFUSED, None, "D:/nobody".to_string(), &mut out);
        assert_eq!(code, 1);
        assert!(parse_out(&out)["error"].as_str().unwrap().contains("No pet bound"));
    }

    #[test]
    fn random_defaults_come_from_the_catalogs() {
        for _ in 0..50 {
            assert!(PERSONALITY_IDS.contains(&random_personality()));
            assert!(BUILTIN_PET_ASSETS.contains(&random_asset()));
        }
    }

    #[test]
    fn hatch_requires_a_name() {
        let mut out = Vec::new();
        let mut err = Vec::new();
        let code = run_with(&args(&["hatch"]), "127.0.0.1:1", "D:/proj", Vec::new, &mut out, &mut err);
        assert_eq!(code, 2);
        // clap names the missing positional in its error.
        assert!(String::from_utf8(err).unwrap().to_lowercase().contains("name"));
    }

    #[test]
    fn an_unknown_command_is_a_usage_error() {
        let mut out = Vec::new();
        let mut err = Vec::new();
        let code = run_with(&args(&["frobnicate"]), "127.0.0.1:1", "D:/proj", Vec::new, &mut out, &mut err);
        assert_eq!(code, 2);
        assert!(!err.is_empty());
    }

    #[test]
    fn help_and_version_go_to_stdout_with_exit_zero() {
        for flag in ["--help", "--version"] {
            let mut out = Vec::new();
            let mut err = Vec::new();
            let code = run_with(&args(&[flag]), "127.0.0.1:1", "D:/proj", Vec::new, &mut out, &mut err);
            assert_eq!(code, 0);
            assert!(!out.is_empty());
            assert!(err.is_empty());
        }
    }

    #[test]
    fn presets_lists_the_catalog() {
        let mut out = Vec::new();
        let mut err = Vec::new();
        let code = run_with(&args(&["presets"]), "127.0.0.1:1", "D:/proj", Vec::new, &mut out, &mut err);
        assert_eq!(code, 0);
        let listed = parse_out(&out);
        assert_eq!(listed["presets"].as_array().unwrap().len(), PERSONALITY_IDS.len());
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
