use std::{
    env, fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const CLAUDE_HOOK_INGRESS_EVENT: &str = "claude-hook:received:v1";
const CLAUDE_HOOK_INGRESS_PATH: &str = "/claude-hook";
const CLAUDE_HOOK_INGRESS_PORT: u16 = 43187;
const PETS_DRIVEN_STATE_FILE_NAME: &str = "state.v1.json";
const PET_WINDOW_PLAYGROUND_MAX_WINDOWS: u8 = 7;
const PET_WINDOW_PLAYGROUND_FIXTURES: [(&str, &str); 7] = [
    ("pet-a", "agumon"),
    ("pet-b", "gabumon"),
    ("pet-c", "gomamon"),
    ("pet-d", "palmon"),
    ("pet-e", "patamon"),
    ("pet-f", "piyomon"),
    ("pet-g", "tentomon"),
];
type ClaudeHookIngressStatusHandle = Arc<Mutex<ClaudeHookIngressStatus>>;

struct ClaudeHookIngressSharedStatus(ClaudeHookIngressStatusHandle);

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PetManifest {
    id: String,
    display_name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    spritesheet_path: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexPetPackage {
    id: String,
    display_name: String,
    description: String,
    spritesheet_path: String,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
struct ClaudeHookIngressStatus {
    url: String,
    state: String,
    error: Option<String>,
}

impl ClaudeHookIngressStatus {
    fn pending() -> Self {
        Self {
            url: claude_hook_ingress_url(),
            state: "pending".to_string(),
            error: None,
        }
    }

    fn listening() -> Self {
        Self {
            url: claude_hook_ingress_url(),
            state: "listening".to_string(),
            error: None,
        }
    }

    fn error(error: String) -> Self {
        Self {
            url: claude_hook_ingress_url(),
            state: "error".to_string(),
            error: Some(error),
        }
    }
}

fn codex_pets_root() -> Result<PathBuf, String> {
    let home = env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join(".codex")))
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".codex")))
        .ok_or_else(|| "Could not resolve the Codex home directory".to_string())?;

    Ok(home.join("pets"))
}

fn validate_asset_id(asset_id: &str) -> Result<(), String> {
    let valid = !asset_id.is_empty()
        && asset_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_');

    if valid {
        Ok(())
    } else {
        Err("Invalid Codex pet asset id".to_string())
    }
}

fn pet_window_playground_count(count: Option<u8>) -> u8 {
    count
        .unwrap_or(1)
        .clamp(1, PET_WINDOW_PLAYGROUND_MAX_WINDOWS)
}

fn pet_window_playground_label(index: u8) -> String {
    format!("pet-window-playground-{index}")
}

fn pet_window_playground_pet_id(index: u8) -> &'static str {
    PET_WINDOW_PLAYGROUND_FIXTURES
        .get(usize::from(index.saturating_sub(1)))
        .map(|fixture| fixture.0)
        .unwrap_or("pet-a")
}

fn pet_window_playground_asset_id(index: u8) -> &'static str {
    PET_WINDOW_PLAYGROUND_FIXTURES
        .get(usize::from(index.saturating_sub(1)))
        .map(|fixture| fixture.1)
        .unwrap_or("agumon")
}

fn pet_window_playground_url(index: u8) -> String {
    format!(
        "index.html?surface=pet-window&petId={}&assetId={}&windowIndex={index}",
        pet_window_playground_pet_id(index),
        pet_window_playground_asset_id(index),
    )
}

fn pet_window_label(pet_id: &str) -> String {
    format!("pet-window-{pet_id}")
}

fn pet_window_url(pet_id: &str, asset_id: &str) -> String {
    format!("index.html?surface=pet-window&petId={pet_id}&assetId={asset_id}&windowIndex=1")
}

fn claude_hook_ingress_url() -> String {
    format!("http://127.0.0.1:{CLAUDE_HOOK_INGRESS_PORT}{CLAUDE_HOOK_INGRESS_PATH}")
}

fn empty_pets_driven_state() -> serde_json::Value {
    serde_json::json!({
        "schemaVersion": 1,
        "registeredWorkingDirectories": [],
        "pets": [],
        "petProfiles": []
    })
}

fn pets_driven_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(PETS_DRIVEN_STATE_FILE_NAME))
        .map_err(|error| format!("Could not resolve pets-driven app data directory: {error}"))
}

fn http_body_start(request: &[u8]) -> Option<usize> {
    request
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4)
}

fn parse_content_length(headers: &str) -> Result<usize, String> {
    for line in headers.lines().skip(1) {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };

        if name.trim().eq_ignore_ascii_case("content-length") {
            return value
                .trim()
                .parse::<usize>()
                .map_err(|error| format!("Invalid Content-Length header: {error}"));
        }
    }

    Ok(0)
}

fn is_http_request_complete(request: &[u8]) -> Result<bool, String> {
    let Some(body_start) = http_body_start(request) else {
        return Ok(false);
    };

    let headers = std::str::from_utf8(&request[..body_start - 4])
        .map_err(|error| format!("Invalid UTF-8 request headers: {error}"))?;
    let content_length = parse_content_length(headers)?;

    Ok(request.len() >= body_start + content_length)
}

fn read_http_request(stream: &mut TcpStream) -> Result<Vec<u8>, String> {
    let mut request = Vec::new();
    let mut chunk = [0_u8; 1024];

    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| format!("Could not configure Claude hook read timeout: {error}"))?;

    loop {
        let bytes_read = stream
            .read(&mut chunk)
            .map_err(|error| format!("Could not read Claude hook request: {error}"))?;

        if bytes_read == 0 {
            break;
        }

        request.extend_from_slice(&chunk[..bytes_read]);

        if is_http_request_complete(&request)? {
            break;
        }
    }

    Ok(request)
}

fn parse_claude_hook_request(request: &[u8]) -> Result<serde_json::Value, String> {
    let body_start =
        http_body_start(request).ok_or_else(|| "Malformed Claude hook HTTP request".to_string())?;
    let headers = std::str::from_utf8(&request[..body_start - 4])
        .map_err(|error| format!("Invalid UTF-8 request headers: {error}"))?;
    let body = std::str::from_utf8(&request[body_start..])
        .map_err(|error| format!("Invalid UTF-8 Claude hook body: {error}"))?;
    let mut lines = headers.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| "Missing Claude hook HTTP request line".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or_default();

    if method != "POST" {
        return Err("Claude hook ingress only accepts POST".to_string());
    }

    if path != CLAUDE_HOOK_INGRESS_PATH {
        return Err("Claude hook ingress path not found".to_string());
    }

    serde_json::from_str(body).map_err(|error| format!("Could not parse Claude hook JSON: {error}"))
}

fn claude_hook_payload_string_field<'a>(payload: &'a serde_json::Value, field: &str) -> &'a str {
    payload
        .get(field)
        .and_then(|value| value.as_str())
        .unwrap_or("-")
}

fn claude_hook_payload_first_string_field<'a>(
    payload: &'a serde_json::Value,
    fields: &[&str],
) -> &'a str {
    fields
        .iter()
        .find_map(|field| payload.get(field).and_then(|value| value.as_str()))
        .unwrap_or("-")
}

fn claude_hook_ingress_log_line(payload: &serde_json::Value) -> String {
    let hook_event_name = claude_hook_payload_string_field(payload, "hook_event_name");
    let cwd = claude_hook_payload_string_field(payload, "cwd");
    let source = claude_hook_payload_first_string_field(
        payload,
        &["sourceId", "source_id", "agent_id", "session_id"],
    );

    format!(
        "[pets-driven-hook] received hook_event_name={hook_event_name} cwd={cwd} source={source}"
    )
}

fn write_http_response(stream: &mut TcpStream, status: &str, body: &str) -> Result<(), String> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len()
    );

    stream
        .write_all(response.as_bytes())
        .map_err(|error| format!("Could not write Claude hook response: {error}"))
}

fn set_claude_hook_ingress_status(
    status: &ClaudeHookIngressStatusHandle,
    next_status: ClaudeHookIngressStatus,
) {
    if let Ok(mut current_status) = status.lock() {
        *current_status = next_status;
    }
}

fn handle_claude_hook_connection(app: tauri::AppHandle, mut stream: TcpStream) {
    let request = match read_http_request(&mut stream) {
        Ok(request) => request,
        Err(error) => {
            let _ = write_http_response(
                &mut stream,
                "400 Bad Request",
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
            return;
        }
    };

    match parse_claude_hook_request(&request) {
        Ok(payload) => {
            eprintln!("{}", claude_hook_ingress_log_line(&payload));

            match app.emit_to("main", CLAUDE_HOOK_INGRESS_EVENT, payload) {
                Ok(()) => {
                    let _ = write_http_response(&mut stream, "200 OK", r#"{"ok":true}"#);
                }
                Err(error) => {
                    let _ = write_http_response(
                        &mut stream,
                        "500 Internal Server Error",
                        &format!(
                            r#"{{"ok":false,"error":{}}}"#,
                            serde_json::json!(error.to_string())
                        ),
                    );
                }
            }
        }
        Err(error) => {
            let _ = write_http_response(
                &mut stream,
                "400 Bad Request",
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
        }
    }
}

fn start_claude_hook_ingress(app: tauri::AppHandle, status: ClaudeHookIngressStatusHandle) {
    thread::spawn(move || {
        let listener = match TcpListener::bind(("127.0.0.1", CLAUDE_HOOK_INGRESS_PORT)) {
            Ok(listener) => {
                set_claude_hook_ingress_status(&status, ClaudeHookIngressStatus::listening());
                listener
            }
            Err(error) => {
                set_claude_hook_ingress_status(
                    &status,
                    ClaudeHookIngressStatus::error(error.to_string()),
                );
                eprintln!(
                    "Could not start Claude hook ingress at {}: {error}",
                    claude_hook_ingress_url()
                );
                return;
            }
        };

        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let app = app.clone();
                    thread::spawn(move || handle_claude_hook_connection(app, stream));
                }
                Err(error) => {
                    eprintln!("Claude hook ingress connection failed: {error}");
                }
            }
        }
    });
}

#[tauri::command]
fn get_claude_hook_ingress_status(
    status: tauri::State<'_, ClaudeHookIngressSharedStatus>,
) -> Result<ClaudeHookIngressStatus, String> {
    status
        .0
        .lock()
        .map(|status| status.clone())
        .map_err(|error| format!("Could not read Claude hook ingress status: {error}"))
}

#[tauri::command]
fn emit_test_claude_hook_ingress_event(app: tauri::AppHandle) -> Result<(), String> {
    let cwd = env::current_dir()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| String::new());
    let payload = serde_json::json!({
        "hook_event_name": "PermissionRequest",
        "sourceId": "agent-a",
        "cwd": cwd,
        "message": "Test Claude hook",
    });

    app.emit_to("main", CLAUDE_HOOK_INGRESS_EVENT, payload)
        .map_err(|error| format!("Could not emit Claude hook test event: {error}"))
}

#[tauri::command]
fn read_pets_driven_state(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let state_path = pets_driven_state_path(&app)?;

    if !state_path.exists() {
        return Ok(empty_pets_driven_state());
    }

    let state_text = fs::read_to_string(&state_path)
        .map_err(|error| format!("Could not read {}: {error}", state_path.display()))?;

    serde_json::from_str(&state_text)
        .map_err(|error| format!("Could not parse {}: {error}", state_path.display()))
}

#[tauri::command]
fn write_pets_driven_state(app: tauri::AppHandle, state: serde_json::Value) -> Result<(), String> {
    let state_path = pets_driven_state_path(&app)?;

    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }

    let state_text = serde_json::to_string_pretty(&state)
        .map_err(|error| format!("Could not serialize pets-driven state: {error}"))?;

    fs::write(&state_path, state_text)
        .map_err(|error| format!("Could not write {}: {error}", state_path.display()))
}

#[tauri::command]
fn list_codex_pet_packages() -> Result<Vec<CodexPetPackage>, String> {
    let pets_root = codex_pets_root()?;
    let entries = fs::read_dir(&pets_root)
        .map_err(|error| format!("Could not read Codex pets directory: {error}"))?;
    let mut packages = Vec::new();

    for entry_result in entries {
        let entry =
            entry_result.map_err(|error| format!("Could not read Codex pet entry: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Could not inspect Codex pet entry: {error}"))?;

        if !file_type.is_dir() {
            continue;
        }

        let pet_dir = entry.path();
        let manifest_path = pet_dir.join("pet.json");

        if !manifest_path.exists() {
            continue;
        }

        let manifest_text = fs::read_to_string(&manifest_path)
            .map_err(|error| format!("Could not read {}: {error}", manifest_path.display()))?;
        let manifest: PetManifest = serde_json::from_str(&manifest_text)
            .map_err(|error| format!("Could not parse {}: {error}", manifest_path.display()))?;
        let spritesheet_path = pet_dir.join(
            manifest
                .spritesheet_path
                .unwrap_or_else(|| "spritesheet.webp".to_string()),
        );

        if !spritesheet_path.exists() {
            continue;
        }

        packages.push(CodexPetPackage {
            id: manifest.id,
            display_name: manifest.display_name,
            description: manifest.description,
            spritesheet_path: spritesheet_path.display().to_string(),
        });
    }

    packages.sort_by_key(|package| package.display_name.to_lowercase());

    Ok(packages)
}

#[tauri::command]
fn load_codex_pet_spritesheet(asset_id: String) -> Result<tauri::ipc::Response, String> {
    validate_asset_id(&asset_id)?;

    let spritesheet_path = codex_pets_root()?.join(asset_id).join("spritesheet.webp");
    let bytes = fs::read(&spritesheet_path)
        .map_err(|error| format!("Could not read Codex pet spritesheet: {error}"))?;

    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
async fn open_pet_window_playground(
    app: tauri::AppHandle,
    count: Option<u8>,
) -> Result<(), String> {
    let count = pet_window_playground_count(count);

    for index in 1..=count {
        let label = pet_window_playground_label(index);

        if let Some(window) = app.get_webview_window(&label) {
            window
                .show()
                .map_err(|error| format!("Could not show {label}: {error}"))?;
            continue;
        }

        WebviewWindowBuilder::new(
            &app,
            label.clone(),
            WebviewUrl::App(pet_window_playground_url(index).into()),
        )
        .title(format!("Pet Window {index}"))
        .inner_size(192.0, 208.0)
        .position(120.0 + f64::from(index.saturating_sub(1)) * 220.0, 120.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|error| format!("Could not create {label}: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
async fn open_pet_window(
    app: tauri::AppHandle,
    pet_id: String,
    asset_id: String,
) -> Result<(), String> {
    validate_asset_id(&pet_id).map_err(|_| "Invalid pet id".to_string())?;
    validate_asset_id(&asset_id)?;

    let label = pet_window_label(&pet_id);

    if let Some(window) = app.get_webview_window(&label) {
        return window
            .show()
            .map_err(|error| format!("Could not show {label}: {error}"));
    }

    // Adopted pet windows have no host frame loop driving a deferred
    // show(), so they must be created visible.
    WebviewWindowBuilder::new(
        &app,
        label.clone(),
        WebviewUrl::App(pet_window_url(&pet_id, &asset_id).into()),
    )
    .title("Pet Window")
    .inner_size(192.0, 208.0)
    .position(120.0, 120.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .shadow(false)
    .visible(true)
    .focused(false)
    .build()
    .map_err(|error| format!("Could not create {label}: {error}"))?;

    Ok(())
}

#[tauri::command]
async fn close_pet_window_playground(app: tauri::AppHandle) -> Result<(), String> {
    for index in 1..=PET_WINDOW_PLAYGROUND_MAX_WINDOWS {
        let label = pet_window_playground_label(index);

        if let Some(window) = app.get_webview_window(&label) {
            window
                .destroy()
                .map_err(|error| format!("Could not close {label}: {error}"))?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pet_window_playground_count_defaults_to_one_and_clamps_to_fixture_count() {
        assert_eq!(pet_window_playground_count(None), 1);
        assert_eq!(pet_window_playground_count(Some(0)), 1);
        assert_eq!(pet_window_playground_count(Some(3)), 3);
        assert_eq!(pet_window_playground_count(Some(9)), 7);
    }

    #[test]
    fn pet_window_playground_labels_are_stable() {
        assert_eq!(pet_window_playground_label(3), "pet-window-playground-3");
    }

    #[test]
    fn pet_window_playground_url_routes_to_pet_window_surface() {
        assert_eq!(
            pet_window_playground_url(2),
            "index.html?surface=pet-window&petId=pet-b&assetId=gabumon&windowIndex=2"
        );
        assert_eq!(
            pet_window_playground_url(7),
            "index.html?surface=pet-window&petId=pet-g&assetId=tentomon&windowIndex=7"
        );
    }

    #[test]
    fn pet_window_label_uses_pet_id() {
        assert_eq!(
            pet_window_label("3f2c8a10-aaaa-bbbb-cccc-1234567890ab"),
            "pet-window-3f2c8a10-aaaa-bbbb-cccc-1234567890ab"
        );
    }

    #[test]
    fn pet_window_url_routes_to_pet_window_surface() {
        assert_eq!(
            pet_window_url("pet-123", "patamon"),
            "index.html?surface=pet-window&petId=pet-123&assetId=patamon&windowIndex=1"
        );
    }

    #[test]
    fn claude_hook_ingress_url_uses_loopback_endpoint() {
        assert_eq!(
            claude_hook_ingress_url(),
            "http://127.0.0.1:43187/claude-hook"
        );
    }

    #[test]
    fn claude_hook_ingress_parses_post_json_body() {
        let request = b"POST /claude-hook HTTP/1.1\r\nContent-Length: 45\r\n\r\n{\"hook_event_name\":\"Notification\",\"message\":\"hi\"}";
        let parsed = parse_claude_hook_request(request).expect("request should parse");

        assert_eq!(parsed["hook_event_name"], "Notification");
        assert_eq!(parsed["message"], "hi");
    }

    #[test]
    fn claude_hook_ingress_log_line_keeps_only_routing_fields() {
        let payload = serde_json::json!({
            "hook_event_name": "PreToolUse",
            "cwd": "D:\\cms",
            "session_id": "f9b89878-f7be-453b-90cb-ffd626765d25",
            "message": "Allow Edit?",
            "prompt": "secret user prompt",
            "tool_input": {
                "command": "secret command"
            }
        });
        let line = claude_hook_ingress_log_line(&payload);

        assert!(line.contains("hook_event_name=PreToolUse"));
        assert!(line.contains("cwd=D:\\cms"));
        assert!(line.contains("source=f9b89878-f7be-453b-90cb-ffd626765d25"));
        assert!(!line.contains("Allow Edit?"));
        assert!(!line.contains("secret user prompt"));
        assert!(!line.contains("secret command"));
    }

    #[test]
    fn claude_hook_ingress_status_starts_pending_at_current_url() {
        let status = ClaudeHookIngressStatus::pending();

        assert_eq!(status.url, "http://127.0.0.1:43187/claude-hook");
        assert_eq!(status.state, "pending");
        assert_eq!(status.error, None);
    }

    #[test]
    fn claude_hook_ingress_status_reports_bind_errors() {
        let status = ClaudeHookIngressStatus::error("address already in use".to_string());

        assert_eq!(status.url, "http://127.0.0.1:43187/claude-hook");
        assert_eq!(status.state, "error");
        assert_eq!(status.error, Some("address already in use".to_string()));
    }

    #[test]
    fn empty_pets_driven_state_uses_schema_version_one() {
        assert_eq!(
            empty_pets_driven_state(),
            serde_json::json!({
                "schemaVersion": 1,
                "registeredWorkingDirectories": [],
                "pets": [],
                "petProfiles": []
            })
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let claude_hook_ingress_status =
                Arc::new(Mutex::new(ClaudeHookIngressStatus::pending()));
            app.manage(ClaudeHookIngressSharedStatus(
                claude_hook_ingress_status.clone(),
            ));
            start_claude_hook_ingress(app.handle().clone(), claude_hook_ingress_status);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_claude_hook_ingress_status,
            emit_test_claude_hook_ingress_event,
            read_pets_driven_state,
            write_pets_driven_state,
            list_codex_pet_packages,
            load_codex_pet_spritesheet,
            open_pet_window,
            open_pet_window_playground,
            close_pet_window_playground
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
