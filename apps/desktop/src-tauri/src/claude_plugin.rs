//! Installs the bundled pets-driven Claude Code plugin through the `claude`
//! CLI. The plugin forwards Claude Code lifecycle hooks to the ingress in
//! `claude_hook_ingress.rs`, so the copy bundled with this app must stay in
//! lock-step with the ingress protocol — installing from the bundle (instead
//! of a remote marketplace) guarantees that. All writes go through the CLI so
//! Claude Code stays the owner of its own config format.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

const PLUGIN_NAME: &str = "pets-driven";
const MARKETPLACE_NAME: &str = "pets-driven";
/// `plugin@marketplace` id used for installs pinned to our marketplace.
const PLUGIN_ID: &str = "pets-driven@pets-driven";
/// Exit code cmd.exe returns for an unrecognized command; locale-independent,
/// unlike matching the "is not recognized" message text.
#[cfg(target_os = "windows")]
const CMD_COMMAND_NOT_FOUND: i32 = 9009;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClaudePluginStatus {
    /// "cli-missing" | "not-installed" | "installed" | "error"
    pub state: &'static str,
    pub version: Option<String>,
    pub error: Option<String>,
}

impl ClaudePluginStatus {
    fn cli_missing() -> Self {
        Self { state: "cli-missing", version: None, error: None }
    }

    fn error(message: String) -> Self {
        Self { state: "error", version: None, error: Some(message) }
    }
}

enum ClaudeCliError {
    Missing,
    Failed(String),
}

impl From<ClaudeCliError> for ClaudePluginStatus {
    fn from(error: ClaudeCliError) -> Self {
        match error {
            ClaudeCliError::Missing => ClaudePluginStatus::cli_missing(),
            ClaudeCliError::Failed(message) => ClaudePluginStatus::error(message),
        }
    }
}

struct CliOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

impl CliOutput {
    fn error_text(&self, context: &str) -> String {
        let detail = if self.stderr.trim().is_empty() {
            self.stdout.trim()
        } else {
            self.stderr.trim()
        };
        format!("{context}: {detail}")
    }
}

/// The `claude` shim installed by npm is a .cmd file on Windows, which
/// CreateProcess will not run directly — go through cmd.exe there.
#[cfg(target_os = "windows")]
fn base_claude_command() -> Command {
    use std::os::windows::process::CommandExt;
    // CREATE_NO_WINDOW: this is a GUI app, so a console must not flash open.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let mut command = Command::new("cmd");
    command.arg("/C").arg("claude");
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(not(target_os = "windows"))]
fn base_claude_command() -> Command {
    Command::new("claude")
}

fn run_claude(args: &[&str]) -> Result<CliOutput, ClaudeCliError> {
    let output = base_claude_command().args(args).output().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            ClaudeCliError::Missing
        } else {
            ClaudeCliError::Failed(format!("could not run the claude CLI: {error}"))
        }
    })?;

    #[cfg(target_os = "windows")]
    if output.status.code() == Some(CMD_COMMAND_NOT_FOUND) {
        return Err(ClaudeCliError::Missing);
    }

    Ok(CliOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

/// Find our plugin in `claude plugin list --json` output. The array form with
/// an `id` of `plugin@marketplace` is current; `name`/`pluginId` and the
/// `{ "installed": [...] }` wrapper cover `--available` output and stay
/// tolerant of CLI changes.
fn find_installed_plugin(value: &serde_json::Value) -> Option<&serde_json::Value> {
    let entries = value
        .as_array()
        .or_else(|| value.get("installed").and_then(|list| list.as_array()))?;

    let id_matches = |id: &str| id == PLUGIN_ID || id.starts_with("pets-driven@");

    entries.iter().find(|entry| {
        entry.get("name").and_then(|name| name.as_str()) == Some(PLUGIN_NAME)
            || ["id", "pluginId"].iter().any(|key| {
                entry.get(*key).and_then(|id| id.as_str()).is_some_and(id_matches)
            })
    })
}

fn read_status() -> ClaudePluginStatus {
    let output = match run_claude(&["plugin", "list", "--json"]) {
        Err(error) => return error.into(),
        Ok(output) => output,
    };
    if !output.success {
        return ClaudePluginStatus::error(output.error_text("claude plugin list failed"));
    }

    match serde_json::from_str::<serde_json::Value>(&output.stdout) {
        Err(error) => ClaudePluginStatus::error(format!(
            "unexpected claude plugin list output: {error}"
        )),
        Ok(value) => match find_installed_plugin(&value) {
            Some(entry) => ClaudePluginStatus {
                state: "installed",
                version: entry
                    .get("version")
                    .and_then(|version| version.as_str())
                    .map(str::to_owned),
                error: None,
            },
            None => ClaudePluginStatus { state: "not-installed", version: None, error: None },
        },
    }
}

fn marketplace_is_registered() -> Result<bool, ClaudeCliError> {
    let output = run_claude(&["plugin", "marketplace", "list", "--json"])?;
    if !output.success {
        // Treat an unreadable list as "not registered" and let `add` decide.
        return Ok(false);
    }

    let registered = serde_json::from_str::<serde_json::Value>(&output.stdout)
        .ok()
        .and_then(|value| {
            value.as_array().map(|entries| {
                entries.iter().any(|entry| {
                    entry.get("name").and_then(|name| name.as_str()) == Some(MARKETPLACE_NAME)
                })
            })
        })
        .unwrap_or(false);

    Ok(registered)
}

/// Register (or refresh) the bundled marketplace. When the registered copy is
/// stale — e.g. the app was moved or updated to a new path — `update` fails,
/// and re-adding from the current bundle path fixes it.
fn ensure_marketplace(plugins_dir: &Path) -> Result<(), ClaudePluginStatus> {
    if marketplace_is_registered().map_err(ClaudePluginStatus::from)? {
        let update = run_claude(&["plugin", "marketplace", "update", MARKETPLACE_NAME])
            .map_err(ClaudePluginStatus::from)?;
        if update.success {
            return Ok(());
        }
        let _ = run_claude(&["plugin", "marketplace", "remove", MARKETPLACE_NAME]);
    }

    let dir = plugins_dir.to_string_lossy();
    let add =
        run_claude(&["plugin", "marketplace", "add", &dir]).map_err(ClaudePluginStatus::from)?;
    if add.success {
        Ok(())
    } else {
        Err(ClaudePluginStatus::error(
            add.error_text("could not register the pets-driven marketplace"),
        ))
    }
}

fn install(plugins_dir: &Path) -> ClaudePluginStatus {
    if let Err(status) = ensure_marketplace(plugins_dir) {
        return status;
    }

    // Reinstalling refreshes the cached files from the (just-updated)
    // marketplace, which is how an app update rolls the plugin forward.
    // update/uninstall need the full plugin@marketplace id; the bare name
    // reports "not found".
    let result = if read_status().state == "installed" {
        run_claude(&["plugin", "update", PLUGIN_ID])
    } else {
        run_claude(&["plugin", "install", PLUGIN_ID, "--scope", "user"])
    };
    match result {
        Err(error) => error.into(),
        Ok(output) if !output.success => {
            ClaudePluginStatus::error(output.error_text("could not install the plugin"))
        }
        Ok(_) => read_status(),
    }
}

/// Canonicalize without the `\\?\` verbatim prefix, which trips up tools that
/// receive the path as a plain string argument.
fn normalize_dir(path: PathBuf) -> PathBuf {
    let canonical = match path.canonicalize() {
        Ok(canonical) => canonical,
        Err(_) => return path,
    };
    let text = canonical.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(stripped) => PathBuf::from(stripped),
        None => canonical,
    }
}

fn is_marketplace_dir(dir: &Path) -> bool {
    dir.join(".claude-plugin").join("marketplace.json").is_file()
}

/// The bundled `plugins/` marketplace: a resource in packaged builds, the
/// workspace checkout when running `tauri dev`.
fn bundled_plugins_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("plugins"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("..").join("plugins"),
    );

    candidates.into_iter().map(normalize_dir).find(|dir| is_marketplace_dir(dir))
}

#[tauri::command]
pub(crate) async fn get_claude_plugin_status() -> ClaudePluginStatus {
    tauri::async_runtime::spawn_blocking(read_status)
        .await
        .unwrap_or_else(|error| ClaudePluginStatus::error(error.to_string()))
}

/// The `claude` line the in-app terminal should run, plus the status the caller
/// should show if there is nothing to run.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClaudePluginPlan {
    /// Command to type into the terminal; None when preparation already failed.
    pub line: Option<String>,
    pub status: ClaudePluginStatus,
}

/// Work out which `claude plugin` line installs or removes the plugin right
/// now, so the frontend can run it in the visible in-app terminal.
///
/// The read-only probes (`marketplace list --json`, `plugin list --json`) and
/// the marketplace registration stay here: their output is parsed as JSON,
/// which a PTY would corrupt with echo and control codes, and the stale-path
/// recovery in `ensure_marketplace` has no single-line equivalent. Only the
/// install/uninstall itself — the slow, chatty step worth watching — is handed
/// back to be run where the user can see and answer it.
#[tauri::command]
pub(crate) async fn plan_claude_plugin_command(
    app: tauri::AppHandle,
    action: String,
) -> ClaudePluginPlan {
    tauri::async_runtime::spawn_blocking(move || {
        if action == "uninstall" {
            return ClaudePluginPlan {
                line: Some(format!("claude plugin uninstall {PLUGIN_ID} -y")),
                status: read_status(),
            };
        }

        let Some(dir) = bundled_plugins_dir(&app) else {
            return ClaudePluginPlan {
                line: None,
                status: ClaudePluginStatus::error(
                    "bundled plugin files not found; reinstall the app".to_string(),
                ),
            };
        };

        if let Err(status) = ensure_marketplace(&dir) {
            return ClaudePluginPlan { line: None, status };
        }

        // Reinstalling refreshes the cached files from the (just-updated)
        // marketplace, which is how an app update rolls the plugin forward.
        let status = read_status();
        let line = if status.state == "installed" {
            format!("claude plugin update {PLUGIN_ID}")
        } else {
            format!("claude plugin install {PLUGIN_ID} --scope user")
        };

        ClaudePluginPlan { line: Some(line), status }
    })
    .await
    .unwrap_or_else(|error| ClaudePluginPlan {
        line: None,
        status: ClaudePluginStatus::error(error.to_string()),
    })
}

#[tauri::command]
pub(crate) async fn install_claude_plugin(app: tauri::AppHandle) -> ClaudePluginStatus {
    tauri::async_runtime::spawn_blocking(move || match bundled_plugins_dir(&app) {
        Some(dir) => install(&dir),
        None => ClaudePluginStatus::error(
            "bundled plugin files not found; reinstall the app".to_string(),
        ),
    })
    .await
    .unwrap_or_else(|error| ClaudePluginStatus::error(error.to_string()))
}

#[tauri::command]
pub(crate) async fn uninstall_claude_plugin() -> ClaudePluginStatus {
    tauri::async_runtime::spawn_blocking(|| {
        match run_claude(&["plugin", "uninstall", PLUGIN_ID, "-y"]) {
            Err(error) => error.into(),
            Ok(output) if !output.success => {
                ClaudePluginStatus::error(output.error_text("could not uninstall the plugin"))
            }
            Ok(_) => read_status(),
        }
    })
    .await
    .unwrap_or_else(|error| ClaudePluginStatus::error(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::find_installed_plugin;

    #[test]
    fn finds_plugin_in_list_array() {
        // Shape observed from `claude plugin list --json`.
        let value = serde_json::json!([
            { "id": "other@claude-plugins-official", "version": "2.0.0" },
            { "id": "pets-driven@pets-driven", "version": "0.1.0", "enabled": true }
        ]);
        let entry = find_installed_plugin(&value).expect("plugin entry");
        assert_eq!(entry.get("version").unwrap(), "0.1.0");
    }

    #[test]
    fn finds_plugin_by_name_key() {
        let value = serde_json::json!([{ "name": "pets-driven" }]);
        assert!(find_installed_plugin(&value).is_some());
    }

    #[test]
    fn finds_plugin_by_plugin_id_in_installed_key() {
        let value = serde_json::json!({
            "installed": [{ "pluginId": "pets-driven@pets-driven" }]
        });
        assert!(find_installed_plugin(&value).is_some());
    }

    #[test]
    fn misses_when_absent() {
        let value = serde_json::json!([{ "name": "other" }]);
        assert!(find_installed_plugin(&value).is_none());
    }
}
