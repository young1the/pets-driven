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

use clap::{ArgGroup, Parser, Subcommand};
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
    /// Adopt a pet bound to a folder. Nothing is required: the name defaults to
    /// the folder's own name, and the asset, personality, and folder default to
    /// a random asset, a random personality, and the current directory. The
    /// random asset is drawn from the pets you installed in your pet source
    /// folder, falling back to the built-ins.
    Hatch {
        /// Display name for the new pet (default: the bound folder's name)
        name: Option<String>,
        /// Pet asset id (default: a random installed pet, else a built-in)
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
    /// Change a pet's editable fields (name, look, personality, note, scale).
    /// Every field is optional on its own, but at least one is required — an
    /// update that changes nothing is a usage error rather than a silent no-op.
    #[command(group(
        ArgGroup::new("fields")
            .required(true)
            .multiple(true)
            .args(["name", "asset", "personality", "note", "scale", "swap_running_directions"])
    ))]
    Update {
        /// Pet id to update (from `pdd list`). Omit to update the pet bound to
        /// --cwd (or the current directory).
        pet: Option<String>,
        /// Update the pet bound to this folder instead of by id
        #[arg(short, long)]
        cwd: Option<String>,
        /// New display name
        #[arg(short, long)]
        name: Option<String>,
        /// New pet asset id — re-skins the pet, keeping everything else
        #[arg(short, long)]
        asset: Option<String>,
        /// New personality id (`pdd presets` lists them)
        #[arg(short, long)]
        personality: Option<String>,
        /// New note on the pet's card. Pass an empty string to clear it.
        // Long-only on purpose: `-n` is `--name` on this same command.
        #[arg(long)]
        note: Option<String>,
        /// New window scale, between 0.5 and 2
        #[arg(short, long, value_parser = parse_scale)]
        scale: Option<f64>,
        /// Trade the pet's two running directions, for an asset whose
        /// spritesheet draws left/right the opposite way round. Takes an
        /// optional true/false; bare means true.
        #[arg(long, num_args = 0..=1, default_missing_value = "true")]
        swap_running_directions: Option<bool>,
    },
    /// Read or write the note on a pet's card — the same field `update --note`
    /// patches, with a shape built for notes: no argument prints the current
    /// note instead of failing.
    Note {
        /// The note to write. Omit to print the current note; pass `-` to read
        /// the note from stdin.
        text: Option<String>,
        /// Target the pet bound to this folder (default: the current directory)
        #[arg(short, long)]
        cwd: Option<String>,
        /// Target this pet id instead of a folder's pet
        // Long-only on purpose: `-p` is `--personality` in every other command.
        #[arg(long)]
        pet: Option<String>,
        /// Erase the note
        #[arg(long, conflicts_with = "text")]
        clear: bool,
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
        note: None,
        scale: None,
        swap_running_directions: None,
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

/// The note currently stored on a pet, or `None` when it has none. The pet
/// view the core returns carries no note, so this reads the field off the state
/// document — the pet itself is already known to exist by the time we get here.
fn read_note(core: &PetsDrivenCore, pet_id: &PetId) -> Result<Option<String>, CoreError> {
    let snapshot = core.snapshot()?;

    Ok(snapshot
        .as_value()
        .get("pets")
        .and_then(|value| value.as_array())
        .and_then(|pets| {
            pets.iter()
                .find(|pet| pet.get("id").and_then(|value| value.as_str()) == Some(pet_id.as_str()))
        })
        .and_then(|pet| pet.get("note"))
        .and_then(|value| value.as_str())
        .map(str::to_string))
}

/// Decode a note piped in for `pdd note -`. Surrounding whitespace goes: a note
/// typed through a heredoc or `echo` arrives with a trailing newline nobody
/// means to store.
fn note_from_stdin(bytes: &[u8]) -> Result<String, String> {
    std::str::from_utf8(strip_bom(bytes))
        .map(|text| text.trim().to_string())
        .map_err(|_| "the note piped in is not valid UTF-8".to_string())
}

/// Read or write one pet's note. A `text` of `None` prints the stored note
/// (`null` when there is none); `Some` replaces it, and an empty string erases
/// it. Either way the answer is note-shaped rather than the usual pet view,
/// which carries no note to show back.
fn run_note<O: Write>(
    core: &PetsDrivenCore,
    pet_id: &PetId,
    text: Option<String>,
    out: &mut O,
) -> i32 {
    let note = match text {
        Some(text) => {
            let patch = PetPatch {
                note: Some(text.clone()),
                ..empty_pet_patch()
            };
            match core.update_pet(pet_id, patch) {
                Ok(_commit) => Some(text),
                Err(error) => return report_core_error(out, &error),
            }
        }
        None => match read_note(core, pet_id) {
            Ok(note) => note,
            Err(error) => return report_core_error(out, &error),
        },
    };

    print_json(
        out,
        &serde_json::json!({ "ok": true, "petId": pet_id.as_str(), "note": note }),
    );
    0
}

/// Resolve the pet a command targets: the explicit id when one was given,
/// otherwise the pet bound to `folder`. Returns the pet and the folder it is
/// bound to; on failure the envelope is already printed and the exit code is
/// handed back for the caller to return.
fn resolve_target<O: Write>(
    core: &PetsDrivenCore,
    pet: Option<String>,
    folder: String,
    out: &mut O,
) -> Result<(PetId, Option<String>), i32> {
    match pet {
        Some(id) => match core.pet(&PetId::new(&id)) {
            Ok(Some(view)) => Ok((PetId::new(id), view.working_directory().map(str::to_string))),
            Ok(None) => {
                print_json(out, &error_json(format!("No pet found with id {id}")));
                Err(1)
            }
            Err(error) => Err(report_core_error(out, &error)),
        },
        None => match core.pet_by_working_directory(&folder) {
            Ok(Some(view)) => match view.id() {
                Some(id) => Ok((PetId::new(id), Some(folder))),
                None => {
                    print_json(out, &error_json("resolved pet has no id"));
                    Err(1)
                }
            },
            Ok(None) => {
                print_json(out, &error_json(format!("No pet bound to {folder}")));
                Err(1)
            }
            Err(error) => Err(report_core_error(out, &error)),
        },
    }
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
    let (pet_id, cwd) = match resolve_target(core, pet, folder, out) {
        Ok(target) => target,
        Err(code) => return code,
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

/// The asset id for a `hatch` that gave no `--asset`. The pets the user
/// installed in their designated pet folder come first, so someone who added
/// their own pets gets one of those instead of a bundled default; the built-in
/// catalog is the fallback when the user has installed none (or state cannot be
/// read).
fn choose_random_asset(core: &PetsDrivenCore) -> String {
    let user_ids = core
        .snapshot()
        .ok()
        .map(|snapshot| pets_driven_fs::user_asset_ids(snapshot.as_value()))
        .unwrap_or_default();

    if !user_ids.is_empty() {
        return user_ids[random_index(user_ids.len())].clone();
    }

    random_asset().to_string()
}

/// The display name for a `hatch` that gave none: the bound folder's own name,
/// so `pdd hatch` in `D:/work/atlas` adopts a pet called "atlas". Both
/// separators are split on because a folder reaches us as a plain string —
/// `--cwd` may be typed either way on Windows — and trailing ones are ignored.
/// A path with no named segment (a bare drive or filesystem root) falls back to
/// the folder itself.
fn folder_name(folder: &str) -> String {
    folder
        .rsplit(['/', '\\'])
        .find(|segment| !segment.is_empty())
        .unwrap_or(folder)
        .to_string()
}

/// The window scale range the desktop accepts. A value outside it would be
/// written to state and then silently clamped when the overlay is laid out, so
/// `update` rejects it as a usage error instead.
///
/// coupling: keep in sync with `PET_WINDOW_MIN_SCALE` / `PET_WINDOW_MAX_SCALE`
/// in `apps/desktop/src/pet-window/pet-window-layout.ts`.
const SCALE_RANGE: (f64, f64) = (0.5, 2.0);

/// Parse `--scale`, rejecting anything the desktop could not render at.
fn parse_scale(raw: &str) -> Result<f64, String> {
    let (min, max) = SCALE_RANGE;
    let scale: f64 = raw.parse().map_err(|_| format!("`{raw}` is not a number"))?;

    if !(min..=max).contains(&scale) {
        return Err(format!("scale must be between {min} and {max}"));
    }

    Ok(scale)
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
        | Command::Update { .. }
        | Command::Note { .. }
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
                    let asset_id = asset.unwrap_or_else(|| choose_random_asset(&core));
                    let personality_id =
                        personality.unwrap_or_else(|| random_personality().to_string());
                    let folder = folder.unwrap_or_else(|| cwd.to_string());
                    let name = name.unwrap_or_else(|| folder_name(&folder));
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
                Command::Update {
                    pet,
                    cwd: folder,
                    name,
                    asset,
                    personality,
                    note,
                    scale,
                    swap_running_directions,
                } => {
                    let folder = folder.unwrap_or_else(|| cwd.to_string());
                    // The desktop picks the write up from its state watcher, so
                    // an update needs no signal to the running app.
                    match resolve_target(&core, pet, folder, out) {
                        Ok((pet_id, _)) => run_update(
                            &core,
                            &pet_id,
                            PetPatch {
                                name,
                                asset_id: asset,
                                personality_id: personality,
                                note,
                                scale,
                                swap_running_directions,
                                ..empty_pet_patch()
                            },
                            out,
                        ),
                        Err(code) => code,
                    }
                }
                Command::Note { text, cwd: folder, pet, clear } => {
                    let folder = folder.unwrap_or_else(|| cwd.to_string());
                    // `-` means the note is piped in, so it is resolved before
                    // the pet: a bad payload should not half-run the command.
                    let text = match text.as_deref() {
                        Some("-") => match note_from_stdin(&stdin()) {
                            Ok(text) => Some(text),
                            Err(message) => {
                                print_json(out, &error_json(message));
                                return 1;
                            }
                        },
                        // `--clear` and a note cannot both be given (clap
                        // rejects it), so an erase is unambiguous here.
                        _ if clear => Some(String::new()),
                        _ => text,
                    };

                    match resolve_target(&core, pet, folder, out) {
                        Ok((pet_id, _)) => run_note(&core, &pet_id, text, out),
                        Err(code) => code,
                    }
                }
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
    fn update_by_folder_patches_the_targeted_pet() {
        let core = core_with_empty_state();
        run_hatch(&core, hatch_input("cato", "Rex", "playful", "D:/proj"), REFUSED, &mut Vec::new());

        let (pet_id, _) = resolve_target(&core, None, "D:/proj".to_string(), &mut Vec::new())
            .expect("the folder's pet resolves");

        let mut out = Vec::new();
        let code = run_update(
            &core,
            &pet_id,
            PetPatch {
                name: Some("Blue".to_string()),
                personality_id: Some("zen".to_string()),
                note: Some("on the release branch".to_string()),
                scale: Some(1.5),
                ..empty_pet_patch()
            },
            &mut out,
        );

        assert_eq!(code, 0);
        let updated = parse_out(&out);
        assert_eq!(updated["pet"]["name"], "Blue");
        assert_eq!(updated["pet"]["personalityId"], "zen");
        // A field-only update leaves the folder binding alone.
        assert_eq!(updated["pet"]["cwd"], "D:/proj");

        // The pet view carries neither note nor scale, so read those off state.
        let snapshot = core.snapshot().expect("state reads back");
        let pet = &snapshot.as_value()["pets"][0];
        assert_eq!(pet["note"], "on the release branch");
        assert_eq!(pet["scale"], 1.5);
    }

    #[test]
    fn update_of_an_unknown_pet_reports_not_found() {
        let core = core_with_empty_state();
        let mut out = Vec::new();
        let code = resolve_target(&core, Some("pet-nope".to_string()), "D:/proj".to_string(), &mut out)
            .expect_err("an unknown id should fail");

        assert_eq!(code, 1);
        assert!(parse_out(&out)["error"].as_str().unwrap().contains("No pet found"));
    }

    #[test]
    fn update_with_no_field_is_a_usage_error() {
        let mut out = Vec::new();
        let mut err = Vec::new();
        // No field means clap rejects it before any state is opened.
        let code = run_with(&args(&["update"]), REFUSED, "D:/proj", Vec::new, &mut out, &mut err);

        assert_eq!(code, 2);
        assert!(!err.is_empty());
    }

    #[test]
    fn note_writes_then_reads_back() {
        let core = core_with_empty_state();
        run_hatch(&core, hatch_input("cato", "Rex", "playful", "D:/proj"), REFUSED, &mut Vec::new());
        let (pet_id, _) = resolve_target(&core, None, "D:/proj".to_string(), &mut Vec::new())
            .expect("the folder's pet resolves");

        // A pet hatched without one has no note at all.
        let mut empty_out = Vec::new();
        assert_eq!(run_note(&core, &pet_id, None, &mut empty_out), 0);
        assert_eq!(parse_out(&empty_out)["note"], serde_json::Value::Null);

        let mut write_out = Vec::new();
        let code = run_note(&core, &pet_id, Some("chasing a flaky test".to_string()), &mut write_out);
        assert_eq!(code, 0);
        assert_eq!(parse_out(&write_out)["note"], "chasing a flaky test");
        assert_eq!(parse_out(&write_out)["petId"], pet_id.as_str());

        let mut read_out = Vec::new();
        run_note(&core, &pet_id, None, &mut read_out);
        assert_eq!(parse_out(&read_out)["note"], "chasing a flaky test");
    }

    #[test]
    fn note_clears_to_an_empty_string() {
        let core = core_with_empty_state();
        run_hatch(&core, hatch_input("cato", "Rex", "playful", "D:/proj"), REFUSED, &mut Vec::new());
        let (pet_id, _) = resolve_target(&core, None, "D:/proj".to_string(), &mut Vec::new())
            .expect("the folder's pet resolves");
        run_note(&core, &pet_id, Some("temporary".to_string()), &mut Vec::new());

        // What `--clear` sends: the empty note the desktop renders as no note.
        run_note(&core, &pet_id, Some(String::new()), &mut Vec::new());

        let mut out = Vec::new();
        run_note(&core, &pet_id, None, &mut out);
        assert_eq!(parse_out(&out)["note"], "");
    }

    #[test]
    fn a_piped_note_loses_its_surrounding_whitespace() {
        assert_eq!(note_from_stdin(b"  piped note\n"), Ok("piped note".to_string()));
        // A BOM some shells prepend is not part of the note either.
        assert_eq!(note_from_stdin(b"\xEF\xBB\xBFwith a bom"), Ok("with a bom".to_string()));
        assert!(note_from_stdin(&[0xFF, 0xFE]).is_err());
    }

    #[test]
    fn note_rejects_text_alongside_clear() {
        let mut out = Vec::new();
        let mut err = Vec::new();
        // Both at once is contradictory; clap rejects it before state is opened.
        let code = run_with(
            &args(&["note", "a note", "--clear"]),
            REFUSED,
            "D:/proj",
            Vec::new,
            &mut out,
            &mut err,
        );

        assert_eq!(code, 2);
        assert!(!err.is_empty());
    }

    #[test]
    fn scale_outside_the_desktop_range_is_rejected() {
        assert_eq!(parse_scale("1.5"), Ok(1.5));
        assert_eq!(parse_scale("0.5"), Ok(0.5));
        assert_eq!(parse_scale("2"), Ok(2.0));
        assert!(parse_scale("0.4").is_err());
        assert!(parse_scale("2.5").is_err());
        assert!(parse_scale("huge").is_err());
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
    fn folder_name_falls_back_to_the_last_named_segment() {
        assert_eq!(folder_name("D:/work/atlas"), "atlas");
        assert_eq!(folder_name(r"D:\work\atlas"), "atlas");
        assert_eq!(folder_name("D:/work/atlas/"), "atlas");
        assert_eq!(folder_name("/home/kanye/atlas"), "atlas");
        // A bare root has no named segment; keep the folder itself.
        assert_eq!(folder_name("/"), "/");
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
