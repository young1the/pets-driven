//! Installs the bundled pets-driven Codex plugin through the `codex` CLI.
//!
//! Codex and Claude consume the same plugin directory, but each agent owns its
//! own marketplace and install state. The desktop app therefore prepares the
//! Codex marketplace separately and hands the visible add/remove command to the
//! embedded terminal.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

const PLUGIN_NAME: &str = "pets-driven";
const MARKETPLACE_NAME: &str = "pets-driven";
const PLUGIN_ID: &str = "pets-driven@pets-driven";
#[cfg(target_os = "windows")]
const CMD_COMMAND_NOT_FOUND: i32 = 9009;
const BROKEN_CLI_HINT: &str = "the codex CLI is installed but cannot run; reinstall it with `npm install -g @openai/codex@latest`";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexPluginStatus {
    /// "cli-missing" | "not-installed" | "installed" | "error"
    pub state: &'static str,
    pub version: Option<String>,
    pub error: Option<String>,
}

impl CodexPluginStatus {
    fn cli_missing() -> Self {
        Self {
            state: "cli-missing",
            version: None,
            error: None,
        }
    }

    fn error(message: String) -> Self {
        Self {
            state: "error",
            version: None,
            error: Some(message),
        }
    }
}

enum CodexCliError {
    Missing,
    Failed(String),
}

#[derive(Clone, Debug)]
enum CodexHome {
    Canonical,
    Inherited(PathBuf),
}

impl CodexHome {
    fn is_inherited(&self) -> bool {
        matches!(self, Self::Inherited(_))
    }
}

impl From<CodexCliError> for CodexPluginStatus {
    fn from(error: CodexCliError) -> Self {
        match error {
            CodexCliError::Missing => CodexPluginStatus::cli_missing(),
            CodexCliError::Failed(message) => CodexPluginStatus::error(message),
        }
    }
}

struct CliOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

/// npm ships the codex binary as a platform-specific optional dependency. When
/// that dependency is missing the JS shim throws a node stack trace instead of
/// running, so every codex call fails with the same trace no matter what we
/// asked for.
fn is_broken_cli_install(detail: &str) -> bool {
    detail.contains("Missing optional dependency")
        || detail.contains("Cannot find module '@openai/codex")
}

impl CliOutput {
    fn error_text(&self, context: &str) -> String {
        let detail = if self.stderr.trim().is_empty() {
            self.stdout.trim()
        } else {
            self.stderr.trim()
        };
        if is_broken_cli_install(detail) {
            return BROKEN_CLI_HINT.to_string();
        }
        format!("{context}: {detail}")
    }
}

#[cfg(target_os = "windows")]
fn canonical_codex_home_path() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(|profile| PathBuf::from(profile).join(".codex"))
}

#[cfg(not(target_os = "windows"))]
fn canonical_codex_home_path() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".codex"))
}

fn same_path(left: &Path, right: &Path) -> bool {
    let left = normalize_dir(left.to_path_buf());
    let right = normalize_dir(right.to_path_buf());

    #[cfg(target_os = "windows")]
    {
        left.to_string_lossy()
            .trim_end_matches(['\\', '/'])
            .eq_ignore_ascii_case(right.to_string_lossy().trim_end_matches(['\\', '/']))
    }

    #[cfg(not(target_os = "windows"))]
    {
        left == right
    }
}

fn codex_homes() -> Vec<CodexHome> {
    let inherited = std::env::var_os("CODEX_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .filter(|path| {
            canonical_codex_home_path()
                .as_deref()
                .is_none_or(|canonical| !same_path(path, canonical))
        });

    let mut homes = Vec::with_capacity(2);
    if let Some(path) = inherited {
        homes.push(CodexHome::Inherited(path));
    }
    homes.push(CodexHome::Canonical);
    homes
}

#[cfg(target_os = "windows")]
fn base_codex_command(home: &CodexHome) -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let mut command = Command::new("cmd");
    command.arg("/C").arg("codex");
    match home {
        CodexHome::Canonical => {
            command.env_remove("CODEX_HOME");
        }
        CodexHome::Inherited(path) => {
            command.env("CODEX_HOME", path);
        }
    }
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(not(target_os = "windows"))]
fn base_codex_command(home: &CodexHome) -> Command {
    let mut command = Command::new("codex");
    match home {
        CodexHome::Canonical => {
            command.env_remove("CODEX_HOME");
        }
        CodexHome::Inherited(path) => {
            command.env("CODEX_HOME", path);
        }
    }
    command
}

fn run_codex(home: &CodexHome, args: &[&str]) -> Result<CliOutput, CodexCliError> {
    let output = base_codex_command(home)
        .args(args)
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                CodexCliError::Missing
            } else {
                CodexCliError::Failed(format!("could not run the codex CLI: {error}"))
            }
        })?;

    #[cfg(target_os = "windows")]
    if output.status.code() == Some(CMD_COMMAND_NOT_FOUND) {
        return Err(CodexCliError::Missing);
    }

    Ok(CliOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

fn plugin_entry<'a>(value: &'a serde_json::Value) -> Option<&'a serde_json::Value> {
    match value {
        serde_json::Value::Array(entries) => entries.iter().find_map(plugin_entry),
        serde_json::Value::Object(map) => {
            let id_matches = ["id", "pluginId", "name"].iter().any(|key| {
                map.get(*key)
                    .and_then(serde_json::Value::as_str)
                    .is_some_and(|id| id == PLUGIN_NAME || id == PLUGIN_ID)
            });
            if id_matches {
                return Some(value);
            }
            map.values().find_map(plugin_entry)
        }
        _ => None,
    }
}

fn installed_from_output(output: &str) -> Option<Option<String>> {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(output) {
        return plugin_entry(&value).map(|entry| {
            entry
                .get("version")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        });
    }

    output
        .lines()
        .any(|line| line.contains(PLUGIN_ID) || line.trim_start().starts_with(PLUGIN_NAME))
        .then_some(None)
}

fn read_status_from(home: &CodexHome) -> CodexPluginStatus {
    let json_output = match run_codex(home, &["plugin", "list", "--json"]) {
        Err(error) => return error.into(),
        Ok(output) => output,
    };

    if json_output.success {
        if let Some(version) = installed_from_output(&json_output.stdout) {
            return CodexPluginStatus {
                state: "installed",
                version,
                error: None,
            };
        }
        return CodexPluginStatus {
            state: "not-installed",
            version: None,
            error: None,
        };
    }

    let plain_output = match run_codex(home, &["plugin", "list"]) {
        Err(error) => return error.into(),
        Ok(output) => output,
    };
    if !plain_output.success {
        return CodexPluginStatus::error(plain_output.error_text("codex plugin list failed"));
    }

    match installed_from_output(&plain_output.stdout) {
        Some(version) => CodexPluginStatus {
            state: "installed",
            version,
            error: None,
        },
        None => CodexPluginStatus {
            state: "not-installed",
            version: None,
            error: None,
        },
    }
}

fn read_status_from_all(homes: &[CodexHome]) -> CodexPluginStatus {
    let mut version = None;
    for home in homes {
        let status = read_status_from(home);
        if status.state != "installed" {
            return status;
        }
        if version.is_none() {
            version = status.version;
        }
    }

    CodexPluginStatus {
        state: "installed",
        version,
        error: None,
    }
}

fn read_status() -> CodexPluginStatus {
    read_status_from_all(&codex_homes())
}

fn marketplace_is_registered(home: &CodexHome) -> Result<bool, CodexCliError> {
    let json_output = run_codex(home, &["plugin", "marketplace", "list", "--json"])?;
    if json_output.success {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json_output.stdout) {
            return Ok(
                plugin_entry(&value).is_some() || json_output.stdout.contains(MARKETPLACE_NAME)
            );
        }
        return Ok(json_output.stdout.contains(MARKETPLACE_NAME));
    }

    let plain_output = run_codex(home, &["plugin", "marketplace", "list"])?;
    Ok(plain_output.success && plain_output.stdout.contains(MARKETPLACE_NAME))
}

fn ensure_marketplace(home: &CodexHome, plugins_dir: &Path) -> Result<(), CodexPluginStatus> {
    if marketplace_is_registered(home).map_err(CodexPluginStatus::from)? {
        return Ok(());
    }

    let dir = plugins_dir.to_string_lossy();
    let add = run_codex(home, &["plugin", "marketplace", "add", &dir])
        .map_err(CodexPluginStatus::from)?;
    if add.success {
        Ok(())
    } else {
        Err(CodexPluginStatus::error(add.error_text(
            "could not register the pets-driven Codex marketplace",
        )))
    }
}

fn ensure_marketplaces(homes: &[CodexHome], plugins_dir: &Path) -> Result<(), CodexPluginStatus> {
    for home in homes {
        ensure_marketplace(home, plugins_dir)?;
    }
    Ok(())
}

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
    dir.join(".agents")
        .join("plugins")
        .join("marketplace.json")
        .is_file()
}

fn bundled_plugins_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("plugins"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("..")
            .join("plugins"),
    );

    candidates
        .into_iter()
        .map(normalize_dir)
        .find(|dir| is_marketplace_dir(dir))
}

fn terminal_command_line(action: &str, include_inherited_home: bool) -> String {
    let operation = if action == "uninstall" {
        format!("plugin remove {PLUGIN_ID}")
    } else {
        format!("plugin add {PLUGIN_ID}")
    };

    #[cfg(target_os = "windows")]
    {
        if include_inherited_home {
            format!(r#"codex {operation} & set "CODEX_HOME=" & codex {operation}"#)
        } else {
            format!(r#"set "CODEX_HOME=" & codex {operation}"#)
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if include_inherited_home {
            format!("codex {operation}; env -u CODEX_HOME codex {operation}")
        } else {
            format!("env -u CODEX_HOME codex {operation}")
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexPluginPlan {
    pub line: Option<String>,
    pub status: CodexPluginStatus,
}

#[tauri::command]
pub(crate) async fn get_codex_plugin_status() -> CodexPluginStatus {
    tauri::async_runtime::spawn_blocking(read_status)
        .await
        .unwrap_or_else(|error| CodexPluginStatus::error(error.to_string()))
}

#[tauri::command]
pub(crate) async fn plan_codex_plugin_command(
    app: tauri::AppHandle,
    action: String,
) -> CodexPluginPlan {
    tauri::async_runtime::spawn_blocking(move || {
        let homes = codex_homes();
        let include_inherited_home = homes.iter().any(CodexHome::is_inherited);

        if action == "uninstall" {
            return CodexPluginPlan {
                line: Some(terminal_command_line(&action, include_inherited_home)),
                status: read_status_from_all(&homes),
            };
        }

        let Some(dir) = bundled_plugins_dir(&app) else {
            return CodexPluginPlan {
                line: None,
                status: CodexPluginStatus::error(
                    "bundled plugin files not found; reinstall the app".to_string(),
                ),
            };
        };

        if let Err(status) = ensure_marketplaces(&homes, &dir) {
            return CodexPluginPlan { line: None, status };
        }

        CodexPluginPlan {
            line: Some(terminal_command_line(&action, include_inherited_home)),
            status: read_status_from_all(&homes),
        }
    })
    .await
    .unwrap_or_else(|error| CodexPluginPlan {
        line: None,
        status: CodexPluginStatus::error(error.to_string()),
    })
}

#[tauri::command]
pub(crate) async fn install_codex_plugin(app: tauri::AppHandle) -> CodexPluginStatus {
    tauri::async_runtime::spawn_blocking(move || {
        let homes = codex_homes();
        let Some(dir) = bundled_plugins_dir(&app) else {
            return CodexPluginStatus::error(
                "bundled plugin files not found; reinstall the app".to_string(),
            );
        };
        if let Err(status) = ensure_marketplaces(&homes, &dir) {
            return status;
        }
        for home in &homes {
            match run_codex(home, &["plugin", "add", PLUGIN_ID]) {
                Err(error) => return error.into(),
                Ok(output) if !output.success => {
                    return CodexPluginStatus::error(
                        output.error_text("could not install the Codex plugin"),
                    );
                }
                Ok(_) => {}
            }
        }
        read_status_from_all(&homes)
    })
    .await
    .unwrap_or_else(|error| CodexPluginStatus::error(error.to_string()))
}

#[tauri::command]
pub(crate) async fn uninstall_codex_plugin() -> CodexPluginStatus {
    tauri::async_runtime::spawn_blocking(|| {
        let homes = codex_homes();
        for home in &homes {
            match run_codex(home, &["plugin", "remove", PLUGIN_ID]) {
                Err(error) => return error.into(),
                Ok(output) if !output.success => {
                    return CodexPluginStatus::error(
                        output.error_text("could not remove the Codex plugin"),
                    );
                }
                Ok(_) => {}
            }
        }
        read_status_from_all(&homes)
    })
    .await
    .unwrap_or_else(|error| CodexPluginStatus::error(error.to_string()))
}

#[cfg(test)]
mod tests {
    use std::ffi::OsStr;
    use std::path::PathBuf;

    use super::{
        base_codex_command, installed_from_output, terminal_command_line, CliOutput, CodexHome,
        BROKEN_CLI_HINT,
    };

    #[test]
    fn finds_installed_plugin_in_json_output() {
        let output = r#"[{"id":"pets-driven@pets-driven","version":"0.1.0"}]"#;
        assert_eq!(
            installed_from_output(output),
            Some(Some("0.1.0".to_string()))
        );
    }

    #[test]
    fn finds_installed_plugin_in_wrapped_json_output() {
        let output = r#"{"installed":[{"name":"pets-driven"}]}"#;
        assert_eq!(installed_from_output(output), Some(None));
    }

    #[test]
    fn finds_installed_plugin_in_plain_output() {
        assert_eq!(
            installed_from_output("pets-driven@pets-driven enabled"),
            Some(None)
        );
    }

    #[test]
    fn a_broken_codex_install_reports_the_reinstall_command() {
        let output = CliOutput {
            success: false,
            stdout: String::new(),
            stderr: concat!(
                "Error: Missing optional dependency @openai/codex-win32-x64. ",
                "Reinstall Codex: npm install -g @openai/codex@latest\n",
                "    at findCodexExecutable (file:///C:/codex/bin/codex.js:105:9)"
            )
            .to_string(),
        };

        assert_eq!(
            output.error_text("could not register the pets-driven Codex marketplace"),
            BROKEN_CLI_HINT
        );
    }

    #[test]
    fn an_ordinary_failure_keeps_its_context() {
        let output = CliOutput {
            success: false,
            stdout: String::new(),
            stderr: "marketplace already exists".to_string(),
        };

        assert_eq!(
            output.error_text("could not register the pets-driven Codex marketplace"),
            "could not register the pets-driven Codex marketplace: marketplace already exists"
        );
    }

    #[test]
    fn misses_an_unrelated_plugin() {
        assert_eq!(installed_from_output(r#"[{"name":"other"}]"#), None);
    }

    #[test]
    fn canonical_codex_process_does_not_inherit_a_launcher_specific_home() {
        let command = base_codex_command(&CodexHome::Canonical);

        assert!(command
            .get_envs()
            .any(|(key, value)| key == OsStr::new("CODEX_HOME") && value.is_none()));
    }

    #[test]
    fn inherited_codex_process_targets_the_launcher_specific_home() {
        let home = PathBuf::from("launcher-codex-home");
        let command = base_codex_command(&CodexHome::Inherited(home.clone()));

        assert!(command.get_envs().any(|(key, value)| {
            key == OsStr::new("CODEX_HOME") && value == Some(home.as_os_str())
        }));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn terminal_commands_update_the_active_and_canonical_homes_on_windows() {
        assert_eq!(
            terminal_command_line("install", true),
            r#"codex plugin add pets-driven@pets-driven & set "CODEX_HOME=" & codex plugin add pets-driven@pets-driven"#
        );
        assert_eq!(
            terminal_command_line("uninstall", true),
            r#"codex plugin remove pets-driven@pets-driven & set "CODEX_HOME=" & codex plugin remove pets-driven@pets-driven"#
        );
        assert_eq!(
            terminal_command_line("install", false),
            r#"set "CODEX_HOME=" & codex plugin add pets-driven@pets-driven"#
        );
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn terminal_commands_update_the_active_and_canonical_homes_on_unix() {
        assert_eq!(
            terminal_command_line("install", true),
            "codex plugin add pets-driven@pets-driven; env -u CODEX_HOME codex plugin add pets-driven@pets-driven"
        );
        assert_eq!(
            terminal_command_line("uninstall", true),
            "codex plugin remove pets-driven@pets-driven; env -u CODEX_HOME codex plugin remove pets-driven@pets-driven"
        );
        assert_eq!(
            terminal_command_line("install", false),
            "env -u CODEX_HOME codex plugin add pets-driven@pets-driven"
        );
    }
}
