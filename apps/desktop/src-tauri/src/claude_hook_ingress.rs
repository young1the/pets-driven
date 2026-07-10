use std::{
    env,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use tauri::Emitter;

const CLAUDE_HOOK_INGRESS_EVENT: &str = "claude-hook:received:v1";
const CLAUDE_HOOK_INGRESS_PATH: &str = "/claude-hook";
const CODEX_HOOK_INGRESS_PATH: &str = "/codex-hook";
const CLAUDE_HOOK_INGRESS_PORT: u16 = 43187;
const PETS_DRIVEN_HATCH_PATH: &str = "/pets-driven/hatch";
const PETS_DRIVEN_SHOW_PATH: &str = "/pets-driven/show";
const PETS_DRIVEN_HIDE_PATH: &str = "/pets-driven/hide";
const PETS_DRIVEN_STATE_CHANGED_EVENT: &str = "pets-driven:state-changed";
const PETS_DRIVEN_PET_COMMAND_EVENT: &str = "pets-driven:pet-command";

pub(crate) type ClaudeHookIngressStatusHandle = Arc<Mutex<ClaudeHookIngressStatus>>;

pub(crate) struct ClaudeHookIngressSharedStatus(pub(crate) ClaudeHookIngressStatusHandle);

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub(crate) struct ClaudeHookIngressStatus {
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

    let payload = serde_json::from_str(body)
        .map_err(|error| format!("Could not parse ingress JSON: {error}"))?;

    Ok((path.to_string(), payload))
}

fn hatch_input_field(payload: &serde_json::Value, field: &str) -> Result<String, String> {
    payload
        .get(field)
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("Hatch request is missing required field: {field}"))
}

fn hatch_input_from_payload(
    payload: &serde_json::Value,
) -> Result<crate::state_store::HatchInput, String> {
    Ok(crate::state_store::HatchInput {
        cwd: hatch_input_field(payload, "cwd")?,
        asset_id: hatch_input_field(payload, "assetId")?,
        name: hatch_input_field(payload, "name")?,
        personality_id: hatch_input_field(payload, "personalityId")?,
    })
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

    match parse_http_request(&request) {
        Ok((path, payload)) => match path.as_str() {
            path if is_agent_hook_ingress_path(path) => {
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
            PETS_DRIVEN_HATCH_PATH => {
                handle_hatch_request(&app, &payload, &mut stream);
            }
            PETS_DRIVEN_SHOW_PATH => {
                handle_show_hide_request(&app, &payload, &mut stream, "show");
            }
            PETS_DRIVEN_HIDE_PATH => {
                handle_show_hide_request(&app, &payload, &mut stream, "hide");
            }
            _ => {
                let _ = write_http_response(
                    &mut stream,
                    "404 Not Found",
                    r#"{"ok":false,"error":"Unknown ingress path"}"#,
                );
            }
        },
        Err(error) => {
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
    fn hatch_ingress_parses_path_and_body() {
        let body = r#"{"cwd":"D:/proj","assetId":"cato","name":"Rex","personalityId":"playful"}"#;
        let request =
            format!("POST /pets-driven/hatch HTTP/1.1\r\nContent-Length: {}\r\n\r\n{body}", body.len());
        let (path, parsed) = parse_http_request(request.as_bytes()).expect("request should parse");

        assert_eq!(path, "/pets-driven/hatch");
        let input = hatch_input_from_payload(&parsed).expect("payload should map to hatch input");
        assert_eq!(input.cwd, "D:/proj");
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
    fn claude_hook_ingress_status_reports_bind_errors() {
        let status = ClaudeHookIngressStatus::error("address already in use".to_string());

        assert_eq!(status.url, "http://127.0.0.1:43187/claude-hook");
        assert_eq!(status.state, "error");
        assert_eq!(status.error, Some("address already in use".to_string()));
    }
}
