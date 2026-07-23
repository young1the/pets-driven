use std::{
    env,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use tauri::Emitter;

const CLAUDE_HOOK_INGRESS_EVENT: &str = "claude-hook:received:v1";
const CLAUDE_HOOK_INGRESS_PATH: &str = "/claude-hook";
const CODEX_HOOK_INGRESS_PATH: &str = "/codex-hook";
const CLAUDE_HOOK_INGRESS_PORT: u16 = 43187;
const PETS_DRIVEN_HATCH_PATH: &str = "/pets-driven/hatch";
const PETS_DRIVEN_SHOW_PATH: &str = "/pets-driven/show";
const PETS_DRIVEN_HIDE_PATH: &str = "/pets-driven/hide";
const PETS_DRIVEN_PING_PATH: &str = "/pets-driven/ping";
const PETS_DRIVEN_OPTIONS_PATH: &str = "/pets-driven/options";
const PETS_DRIVEN_LIST_PATH: &str = "/pets-driven/list";
const PETS_DRIVEN_PET_PATH: &str = "/pets-driven/pet";
const PETS_DRIVEN_PET_UPDATE_PATH: &str = "/pets-driven/pet/update";
const PETS_DRIVEN_PET_DELETE_PATH: &str = "/pets-driven/pet/delete";
const PETS_DRIVEN_API_PATH: &str = "/pets-driven/api";
const PETS_DRIVEN_STATE_CHANGED_EVENT: &str = "pets-driven:state-changed";
const PETS_DRIVEN_PET_COMMAND_EVENT: &str = "pets-driven:pet-command";

pub(crate) type ClaudeHookIngressStatusHandle = Arc<Mutex<ClaudeHookIngressStatus>>;

pub(crate) struct ClaudeHookIngressSharedStatus(pub(crate) ClaudeHookIngressStatusHandle);

/// What the settings tab can say about the ingress without a console.
///
/// `state` only ever answers "did the listener claim the port"; the three
/// `last_event_*` / `received_count` fields answer the separate question "is a
/// hook actually arriving", which is invisible in a release build otherwise
/// (the process has no console, so the `eprintln!` traces below go nowhere).
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClaudeHookIngressStatus {
    url: String,
    state: String,
    error: Option<String>,
    /// Unix epoch milliseconds of the most recent accepted hook event, or
    /// `None` while none has arrived since the app started.
    last_event_at: Option<u64>,
    /// Hook events accepted since the app started. Never persisted.
    received_count: u64,
    /// The most recent event's `hook_event_name`.
    ///
    /// PRIVACY: this is the only payload-derived value that leaves this module,
    /// and it is a subset of the routing whitelist `claude_hook_ingress_log_line`
    /// already uses. Hook payloads carry `prompt` and `tool_input.command` in
    /// clear text; nothing outside that whitelist may be copied in here.
    last_event_name: Option<String>,
}

impl ClaudeHookIngressStatus {
    fn with_state(state: &str, error: Option<String>) -> Self {
        Self {
            url: claude_hook_ingress_url(),
            state: state.to_string(),
            error,
            last_event_at: None,
            received_count: 0,
            last_event_name: None,
        }
    }

    fn pending() -> Self {
        Self::with_state("pending", None)
    }

    fn listening() -> Self {
        Self::with_state("listening", None)
    }

    fn error(error: String) -> Self {
        Self::with_state("error", Some(error))
    }

    /// Fold one accepted hook event into the status. `received_at` is injected
    /// so the counter can be tested without a clock.
    fn record_event(&mut self, payload: &serde_json::Value, received_at: u64) {
        self.received_count = self.received_count.saturating_add(1);
        self.last_event_at = Some(received_at);
        self.last_event_name = claude_hook_event_name(payload).map(str::to_string);
    }
}

pub(crate) fn create_status_handle() -> ClaudeHookIngressStatusHandle {
    Arc::new(Mutex::new(ClaudeHookIngressStatus::pending()))
}

fn claude_hook_ingress_url() -> String {
    format!("http://127.0.0.1:{CLAUDE_HOOK_INGRESS_PORT}{CLAUDE_HOOK_INGRESS_PATH}")
}

fn is_agent_hook_ingress_path(path: &str) -> bool {
    path == CLAUDE_HOOK_INGRESS_PATH || path == CODEX_HOOK_INGRESS_PATH
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

fn parse_http_request(request: &[u8]) -> Result<(String, serde_json::Value), String> {
    let body_start =
        http_body_start(request).ok_or_else(|| "Malformed ingress HTTP request".to_string())?;
    let headers = std::str::from_utf8(&request[..body_start - 4])
        .map_err(|error| format!("Invalid UTF-8 request headers: {error}"))?;
    let body = std::str::from_utf8(&request[body_start..])
        .map_err(|error| format!("Invalid UTF-8 ingress body: {error}"))?;
    let mut lines = headers.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| "Missing ingress HTTP request line".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or_default();

    if method != "POST" {
        return Err("Ingress only accepts POST".to_string());
    }

    // Read-only endpoints (ping/options/list/pet) take no body; treat blank
    // as `{}` rather than failing JSON parsing on an empty string.
    let payload = if body.trim().is_empty() {
        serde_json::json!({})
    } else {
        serde_json::from_str(body).map_err(|error| format!("Could not parse ingress JSON: {error}"))?
    };

    Ok((path.to_string(), payload))
}

use crate::state_store::hatch_input_field;

/// Unlike the `hatch_pet_record` command, the HTTP endpoint requires a folder:
/// an agent hook only ever hatches for the directory it is running in.
fn hatch_input_from_payload(
    payload: &serde_json::Value,
) -> Result<crate::state_store::HatchInput, String> {
    hatch_input_field(payload, "cwd")?;

    crate::state_store::hatch_input_from_payload(payload)
}

fn handle_hatch_request(app: &tauri::AppHandle, payload: &serde_json::Value, stream: &mut TcpStream) {
    let input = match hatch_input_from_payload(payload) {
        Ok(input) => input,
        Err(error) => {
            let _ = write_http_response(
                stream,
                "400 Bad Request",
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
            return;
        }
    };

    match crate::state_store::hatch_pet(app, input) {
        Ok(next_state) => {
            let _ = app.emit_to("main", PETS_DRIVEN_STATE_CHANGED_EVENT, ());
            if let Some(pet_id) = crate::state_store::find_pet_id_by_cwd(
                &next_state,
                hatch_input_field(payload, "cwd").unwrap_or_default().as_str(),
            ) {
                let _ = app.emit_to(
                    "main",
                    PETS_DRIVEN_PET_COMMAND_EVENT,
                    serde_json::json!({ "action": "show", "petId": pet_id }),
                );
            }
            let _ = write_http_response(stream, "200 OK", r#"{"ok":true}"#);
        }
        Err(error) => {
            let _ = write_http_response(
                stream,
                "409 Conflict",
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
        }
    }
}

fn handle_show_hide_request(
    app: &tauri::AppHandle,
    payload: &serde_json::Value,
    stream: &mut TcpStream,
    action: &str,
) {
    let cwd = match hatch_input_field(payload, "cwd") {
        Ok(cwd) => cwd,
        Err(error) => {
            let _ = write_http_response(
                stream,
                "400 Bad Request",
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
            return;
        }
    };

    let state = match crate::state_store::read_state_pub(app) {
        Ok(state) => state,
        Err(error) => {
            let _ = write_http_response(
                stream,
                "500 Internal Server Error",
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
            return;
        }
    };

    match crate::state_store::find_pet_id_by_cwd(&state, &cwd) {
        Some(pet_id) => {
            let _ = app.emit_to(
                "main",
                PETS_DRIVEN_PET_COMMAND_EVENT,
                serde_json::json!({ "action": action, "petId": pet_id }),
            );
            let _ = write_http_response(stream, "200 OK", r#"{"ok":true}"#);
        }
        None => {
            let _ = write_http_response(
                stream,
                "404 Not Found",
                r#"{"ok":false,"error":"No pet found for that working directory"}"#,
            );
        }
    }
}

// coupling: keep in sync with the path match arms in
// handle_claude_hook_connection below — every route this ingress serves
// should have one descriptor here so an external caller can discover the
// whole API from `/pets-driven/api` alone.
fn api_endpoint_descriptors() -> serde_json::Value {
    serde_json::json!([
        {
            "path": PETS_DRIVEN_API_PATH,
            "method": "POST",
            "body": null,
            "description": "This endpoint: an index of every HTTP route this ingress serves."
        },
        {
            "path": PETS_DRIVEN_PING_PATH,
            "method": "POST",
            "body": null,
            "description": "Health check: confirms the pets-driven ingress server is up and listening."
        },
        {
            "path": PETS_DRIVEN_OPTIONS_PATH,
            "method": "POST",
            "body": null,
            "description": "Lists every personality preset (id + trait values) and every hatchable pet asset (bundled with the app, plus the user's pet source folder) accepted by /pets-driven/hatch."
        },
        {
            "path": PETS_DRIVEN_LIST_PATH,
            "method": "POST",
            "body": null,
            "description": "Lists every pet currently in state: id, name, assetId, personalityId, cwd, visible, archived, adoptedAt. cwd is null for a pet with no folder bound."
        },
        {
            "path": PETS_DRIVEN_PET_PATH,
            "method": "POST",
            "body": {
                "petId": "string, optional",
                "cwd": "string, optional (petId takes precedence when both are given)"
            },
            "description": "Reads one pet by petId or by the cwd it is registered to. 404 if neither matches a pet."
        },
        {
            "path": PETS_DRIVEN_HATCH_PATH,
            "method": "POST",
            "body": {
                "cwd": "string",
                "assetId": "string, see /pets-driven/options",
                "name": "string",
                "personalityId": "string, see /pets-driven/options"
            },
            "description": "Creates a new pet bound to cwd. 409 if that folder already has a pet."
        },
        {
            "path": PETS_DRIVEN_PET_UPDATE_PATH,
            "method": "POST",
            "body": {
                "petId": "string",
                "name": "string, optional",
                "personalityId": "string, optional, see /pets-driven/options",
                "visible": "bool, optional",
                "archived": "bool, optional",
                "memo": "string, optional",
                "cwd": "string or null, optional — a string re-binds the pet to that folder, null detaches it"
            },
            "description": "Patches one pet's editable fields. Only petId is required; omitted fields are left unchanged. A pet with cwd null keeps living with no folder bound, so no agent event routes to it. 409 if the requested folder already belongs to another pet."
        },
        {
            "path": PETS_DRIVEN_PET_DELETE_PATH,
            "method": "POST",
            "body": { "petId": "string" },
            "description": "Permanently removes a pet, its personality profile, and its registered working directory."
        },
        {
            "path": PETS_DRIVEN_SHOW_PATH,
            "method": "POST",
            "body": { "cwd": "string" },
            "description": "Shows the desktop window for the pet registered to cwd. 404 if no pet is registered there."
        },
        {
            "path": PETS_DRIVEN_HIDE_PATH,
            "method": "POST",
            "body": { "cwd": "string" },
            "description": "Hides the desktop window for the pet registered to cwd. 404 if no pet is registered there."
        },
        {
            "path": CLAUDE_HOOK_INGRESS_PATH,
            "method": "POST",
            "body": "A Claude Code lifecycle hook event, forwarded unchanged",
            "description": "Routes a Claude Code hook event to the pet whose registered working directory matches the event's cwd."
        },
        {
            "path": CODEX_HOOK_INGRESS_PATH,
            "method": "POST",
            "body": "A Codex lifecycle hook event, forwarded unchanged",
            "description": "Same routing as /claude-hook, for Codex."
        }
    ])
}

fn handle_api_request(stream: &mut TcpStream) {
    let body = serde_json::json!({ "ok": true, "endpoints": api_endpoint_descriptors() }).to_string();
    let _ = write_http_response(stream, "200 OK", &body);
}

fn handle_ping_request(stream: &mut TcpStream) {
    let _ = write_http_response(
        stream,
        "200 OK",
        r#"{"ok":true,"app":"pets-driven","status":"listening"}"#,
    );
}

fn handle_options_request(app: &tauri::AppHandle, stream: &mut TcpStream) {
    let personalities: Vec<serde_json::Value> = crate::state_store::PERSONALITY_IDS
        .iter()
        .filter_map(|id| {
            crate::state_store::personality_preset(id)
                .map(|traits| serde_json::json!({ "id": id, "traits": traits }))
        })
        .collect();
    let assets = crate::pet_assets::list_hatchable_pet_assets(app);

    let body = serde_json::json!({
        "ok": true,
        "personalities": personalities,
        "assets": assets,
    })
    .to_string();

    let _ = write_http_response(stream, "200 OK", &body);
}

fn handle_list_pets_request(app: &tauri::AppHandle, stream: &mut TcpStream) {
    match crate::state_store::read_state_pub(app) {
        Ok(state) => {
            let pets = crate::state_store::list_pets_view(&state);
            let body = serde_json::json!({ "ok": true, "pets": pets }).to_string();
            let _ = write_http_response(stream, "200 OK", &body);
        }
        Err(error) => {
            let _ = write_http_response(
                stream,
                "500 Internal Server Error",
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
        }
    }
}

/// Resolve a single pet by `petId` (preferred) or `cwd`, and reply with its
/// joined view, or 404 when neither matches.
fn handle_get_pet_request(
    app: &tauri::AppHandle,
    payload: &serde_json::Value,
    stream: &mut TcpStream,
) {
    let state = match crate::state_store::read_state_pub(app) {
        Ok(state) => state,
        Err(error) => {
            let _ = write_http_response(
                stream,
                "500 Internal Server Error",
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
            return;
        }
    };

    let pet_id = payload
        .get("petId")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .or_else(|| {
            payload
                .get("cwd")
                .and_then(|value| value.as_str())
                .and_then(|cwd| crate::state_store::find_pet_id_by_cwd(&state, cwd))
        });

    let pet = pet_id.and_then(|pet_id| crate::state_store::find_pet_view(&state, &pet_id));

    match pet {
        Some(pet) => {
            let body = serde_json::json!({ "ok": true, "pet": pet }).to_string();
            let _ = write_http_response(stream, "200 OK", &body);
        }
        None => {
            let _ = write_http_response(
                stream,
                "404 Not Found",
                r#"{"ok":false,"error":"No matching pet"}"#,
            );
        }
    }
}

/// Read the tri-state `cwd` field of a pet-update payload: absent leaves the
/// pet's folder binding alone, an explicit `null` detaches it, and a string
/// re-binds the pet to that folder.
fn handle_update_pet_request(
    app: &tauri::AppHandle,
    payload: &serde_json::Value,
    stream: &mut TcpStream,
) {
    let input = match crate::state_store::pet_update_input_from_payload(payload) {
        Ok(input) => input,
        Err(error) => {
            let _ = write_http_response(
                stream,
                "400 Bad Request",
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
            return;
        }
    };
    let pet_id = input.pet_id.clone();

    match crate::state_store::update_pet(app, input) {
        Ok(next_state) => {
            let _ = app.emit_to("main", PETS_DRIVEN_STATE_CHANGED_EVENT, ());
            let pet = crate::state_store::find_pet_view(&next_state, &pet_id);
            let body = serde_json::json!({ "ok": true, "pet": pet }).to_string();
            let _ = write_http_response(stream, "200 OK", &body);
        }
        Err(error) => {
            let status = if error.starts_with("No pet found") {
                "404 Not Found"
            } else if error.starts_with("Working directory already has pet") {
                // Same shape as /pets-driven/hatch: the folder is taken.
                "409 Conflict"
            } else {
                "400 Bad Request"
            };
            let _ = write_http_response(
                stream,
                status,
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
        }
    }
}

fn handle_delete_pet_request(
    app: &tauri::AppHandle,
    payload: &serde_json::Value,
    stream: &mut TcpStream,
) {
    let Some(pet_id) = payload.get("petId").and_then(|value| value.as_str()) else {
        let _ = write_http_response(
            stream,
            "400 Bad Request",
            r#"{"ok":false,"error":"Missing required field: petId"}"#,
        );
        return;
    };

    match crate::state_store::remove_pet(app, pet_id) {
        Ok(_next_state) => {
            let _ = app.emit_to("main", PETS_DRIVEN_STATE_CHANGED_EVENT, ());
            // Tear down any open window for the now-deleted pet; `hidePet` on
            // the frontend closes the window and no-ops safely on a pet id
            // that is no longer in state.
            let _ = app.emit_to(
                "main",
                PETS_DRIVEN_PET_COMMAND_EVENT,
                serde_json::json!({ "action": "hide", "petId": pet_id }),
            );
            let _ = write_http_response(stream, "200 OK", r#"{"ok":true}"#);
        }
        Err(error) => {
            let _ = write_http_response(
                stream,
                "404 Not Found",
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
        }
    }
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

/// The lifecycle name of a hook event (`PreToolUse`, `Notification`, …).
///
/// PRIVACY: `hook_event_name` is a routing field, part of the same whitelist
/// `claude_hook_ingress_log_line` keeps to. Everything else on a hook payload —
/// `prompt`, `message`, `tool_input.command` — is user content and stays here.
fn claude_hook_event_name(payload: &serde_json::Value) -> Option<&str> {
    payload.get("hook_event_name").and_then(|value| value.as_str())
}

fn claude_hook_ingress_log_line(payload: &serde_json::Value) -> String {
    let hook_event_name = claude_hook_event_name(payload).unwrap_or("-");
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

fn unix_epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or_default()
}

/// Mark that a hook event reached the ingress. Called on receipt rather than
/// after the emit, so the indicator separates "no hook arrived" from "a hook
/// arrived but the window never got it".
fn record_claude_hook_ingress_event(
    status: &ClaudeHookIngressStatusHandle,
    payload: &serde_json::Value,
) {
    if let Ok(mut current_status) = status.lock() {
        current_status.record_event(payload, unix_epoch_millis());
    }
}

fn handle_claude_hook_connection(
    app: tauri::AppHandle,
    status: ClaudeHookIngressStatusHandle,
    mut stream: TcpStream,
) {
    let request = match read_http_request(&mut stream) {
        Ok(request) => request,
        Err(error) => {
            eprintln!("[pets-driven-hook] rejected 400: {error}");
            let _ = write_http_response(
                &mut stream,
                "400 Bad Request",
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
            return;
        }
    };

    match parse_http_request(&request) {
        Ok((path, payload)) => match path.as_str() {
            path if is_agent_hook_ingress_path(path) => {
                eprintln!("{}", claude_hook_ingress_log_line(&payload));
                // A release build has no console for the line above, so the
                // same arrival is also folded into the polled status.
                record_claude_hook_ingress_event(&status, &payload);

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
            PETS_DRIVEN_HATCH_PATH => {
                handle_hatch_request(&app, &payload, &mut stream);
            }
            PETS_DRIVEN_SHOW_PATH => {
                handle_show_hide_request(&app, &payload, &mut stream, "show");
            }
            PETS_DRIVEN_HIDE_PATH => {
                handle_show_hide_request(&app, &payload, &mut stream, "hide");
            }
            PETS_DRIVEN_API_PATH => {
                handle_api_request(&mut stream);
            }
            PETS_DRIVEN_PING_PATH => {
                handle_ping_request(&mut stream);
            }
            PETS_DRIVEN_OPTIONS_PATH => {
                handle_options_request(&app, &mut stream);
            }
            PETS_DRIVEN_LIST_PATH => {
                handle_list_pets_request(&app, &mut stream);
            }
            PETS_DRIVEN_PET_UPDATE_PATH => {
                handle_update_pet_request(&app, &payload, &mut stream);
            }
            PETS_DRIVEN_PET_DELETE_PATH => {
                handle_delete_pet_request(&app, &payload, &mut stream);
            }
            PETS_DRIVEN_PET_PATH => {
                handle_get_pet_request(&app, &payload, &mut stream);
            }
            _ => {
                eprintln!("[pets-driven-hook] rejected 404: unknown ingress path {path}");
                let _ = write_http_response(
                    &mut stream,
                    "404 Not Found",
                    r#"{"ok":false,"error":"Unknown ingress path"}"#,
                );
            }
        },
        Err(error) => {
            // The reason (never the payload) goes to stderr: forward's post()
            // discards responses, so a silent 400 here is invisible on both ends.
            eprintln!("[pets-driven-hook] rejected 400: {error}");
            let _ = write_http_response(
                &mut stream,
                "400 Bad Request",
                &format!(r#"{{"ok":false,"error":{}}}"#, serde_json::json!(error)),
            );
        }
    }
}

pub(crate) fn start_claude_hook_ingress(
    app: tauri::AppHandle,
    status: ClaudeHookIngressStatusHandle,
) {
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
                    let status = Arc::clone(&status);
                    thread::spawn(move || handle_claude_hook_connection(app, status, stream));
                }
                Err(error) => {
                    eprintln!("Claude hook ingress connection failed: {error}");
                }
            }
        }
    });
}

#[tauri::command]
pub(crate) fn get_claude_hook_ingress_status(
    status: tauri::State<'_, ClaudeHookIngressSharedStatus>,
) -> Result<ClaudeHookIngressStatus, String> {
    status
        .0
        .lock()
        .map(|status| status.clone())
        .map_err(|error| format!("Could not read Claude hook ingress status: {error}"))
}

#[tauri::command]
pub(crate) fn emit_test_claude_hook_ingress_event(
    app: tauri::AppHandle,
    cwd: Option<String>,
) -> Result<(), String> {
    let cwd = cwd.unwrap_or_else(|| {
        env::current_dir()
            .map(|path| path.display().to_string())
            .unwrap_or_else(|_| String::new())
    });
    let payload = serde_json::json!({
        "hook_event_name": "PermissionRequest",
        "sourceId": "agent-a",
        "cwd": cwd,
        "message": "Test Claude hook",
    });

    app.emit_to("main", CLAUDE_HOOK_INGRESS_EVENT, payload)
        .map_err(|error| format!("Could not emit Claude hook test event: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let (path, parsed) = parse_http_request(request).expect("request should parse");

        assert_eq!(path, "/claude-hook");
        assert_eq!(parsed["hook_event_name"], "Notification");
        assert_eq!(parsed["message"], "hi");
    }

    #[test]
    fn api_endpoint_descriptors_include_every_known_route() {
        let descriptors = api_endpoint_descriptors();
        let paths: Vec<&str> = descriptors
            .as_array()
            .expect("descriptors should be a JSON array")
            .iter()
            .map(|descriptor| descriptor["path"].as_str().expect("descriptor should have a path"))
            .collect();

        for expected in [
            CLAUDE_HOOK_INGRESS_PATH,
            CODEX_HOOK_INGRESS_PATH,
            PETS_DRIVEN_HATCH_PATH,
            PETS_DRIVEN_SHOW_PATH,
            PETS_DRIVEN_HIDE_PATH,
            PETS_DRIVEN_PING_PATH,
            PETS_DRIVEN_OPTIONS_PATH,
            PETS_DRIVEN_LIST_PATH,
            PETS_DRIVEN_PET_PATH,
            PETS_DRIVEN_PET_UPDATE_PATH,
            PETS_DRIVEN_PET_DELETE_PATH,
            PETS_DRIVEN_API_PATH,
        ] {
            assert!(paths.contains(&expected), "missing api descriptor for {expected}");
        }
    }

    #[test]
    fn read_only_ingress_paths_accept_an_empty_body() {
        let request = b"POST /pets-driven/ping HTTP/1.1\r\nContent-Length: 0\r\n\r\n";
        let (path, parsed) = parse_http_request(request).expect("empty body should parse");

        assert_eq!(path, "/pets-driven/ping");
        assert_eq!(parsed, serde_json::json!({}));
    }

    #[test]
    fn hatch_ingress_parses_path_and_body() {
        let body = r#"{"cwd":"D:/proj","assetId":"cato","name":"Rex","personalityId":"playful"}"#;
        let request =
            format!("POST /pets-driven/hatch HTTP/1.1\r\nContent-Length: {}\r\n\r\n{body}", body.len());
        let (path, parsed) = parse_http_request(request.as_bytes()).expect("request should parse");

        assert_eq!(path, "/pets-driven/hatch");
        let input = hatch_input_from_payload(&parsed).expect("payload should map to hatch input");
        assert_eq!(input.cwd.as_deref(), Some("D:/proj"));
        assert_eq!(input.asset_id, "cato");
        assert_eq!(input.name, "Rex");
        assert_eq!(input.personality_id, "playful");
    }

    #[test]
    fn hatch_input_requires_all_fields() {
        let payload = serde_json::json!({ "cwd": "D:/proj", "assetId": "cato" });
        assert!(hatch_input_from_payload(&payload).is_err());
    }

    #[test]
    fn hatch_over_http_still_requires_a_working_directory() {
        // The command surface allows a folderless pet; this endpoint does not.
        let payload =
            serde_json::json!({ "assetId": "cato", "name": "Rex", "personalityId": "playful" });
        assert!(hatch_input_from_payload(&payload).is_err());
    }

    #[test]
    fn agent_hook_ingress_accepts_claude_and_codex_paths() {
        assert!(is_agent_hook_ingress_path("/claude-hook"));
        assert!(is_agent_hook_ingress_path("/codex-hook"));
        assert!(!is_agent_hook_ingress_path("/unknown"));
    }

    #[test]
    fn show_hide_ingress_parses_cwd_field() {
        let body = r#"{"cwd":"D:/my-project"}"#;
        let request =
            format!("POST /pets-driven/show HTTP/1.1\r\nContent-Length: {}\r\n\r\n{body}", body.len());
        let (path, parsed) = parse_http_request(request.as_bytes()).expect("should parse");

        assert_eq!(path, "/pets-driven/show");
        assert_eq!(hatch_input_field(&parsed, "cwd").unwrap(), "D:/my-project");
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
    fn claude_hook_ingress_status_starts_with_no_received_events() {
        let status = ClaudeHookIngressStatus::listening();

        assert_eq!(status.received_count, 0);
        assert_eq!(status.last_event_at, None);
        assert_eq!(status.last_event_name, None);
    }

    #[test]
    fn claude_hook_ingress_status_counts_events_and_keeps_the_latest_time() {
        let mut status = ClaudeHookIngressStatus::listening();

        status.record_event(&serde_json::json!({ "hook_event_name": "PreToolUse" }), 1_000);
        assert_eq!(status.received_count, 1);
        assert_eq!(status.last_event_at, Some(1_000));
        assert_eq!(status.last_event_name.as_deref(), Some("PreToolUse"));

        status.record_event(&serde_json::json!({ "hook_event_name": "Stop" }), 4_500);
        assert_eq!(status.received_count, 2);
        assert_eq!(status.last_event_at, Some(4_500));
        assert_eq!(status.last_event_name.as_deref(), Some("Stop"));
    }

    #[test]
    fn claude_hook_ingress_status_leaves_a_nameless_event_unnamed_but_counted() {
        let mut status = ClaudeHookIngressStatus::listening();

        status.record_event(&serde_json::json!({ "cwd": "D:\\cms" }), 7);

        assert_eq!(status.received_count, 1);
        assert_eq!(status.last_event_at, Some(7));
        assert_eq!(status.last_event_name, None);
    }

    #[test]
    fn claude_hook_ingress_status_keeps_only_routing_fields() {
        // Same whitelist as claude_hook_ingress_log_line: a hook payload carries
        // the user's prompt and shell commands, and none of it may reach the UI.
        let mut status = ClaudeHookIngressStatus::listening();
        status.record_event(
            &serde_json::json!({
                "hook_event_name": "PreToolUse",
                "cwd": "D:\\cms",
                "session_id": "f9b89878-f7be-453b-90cb-ffd626765d25",
                "message": "Allow Edit?",
                "prompt": "secret user prompt",
                "tool_input": { "command": "secret command" },
            }),
            1_700_000_000_000,
        );

        let serialized = serde_json::to_string(&status).expect("status should serialize");

        assert!(serialized.contains("\"lastEventName\":\"PreToolUse\""));
        assert!(serialized.contains("\"receivedCount\":1"));
        assert!(serialized.contains("\"lastEventAt\":1700000000000"));
        assert!(!serialized.contains("Allow Edit?"));
        assert!(!serialized.contains("secret user prompt"));
        assert!(!serialized.contains("secret command"));
        assert!(!serialized.contains("f9b89878"));
        assert!(!serialized.contains("cms"));
    }

    #[test]
    fn claude_hook_ingress_status_reports_bind_errors() {
        let status = ClaudeHookIngressStatus::error("address already in use".to_string());

        assert_eq!(status.url, "http://127.0.0.1:43187/claude-hook");
        assert_eq!(status.state, "error");
        assert_eq!(status.error, Some("address already in use".to_string()));
    }
}
