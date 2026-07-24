//! End-to-end transport tests: drive the CLI against a mock ingress listening
//! on a real loopback port, so the raw HTTP request the CLI writes and the
//! reply it prints are exercised together.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

use pets_driven_cli::run_with;

/// What the mock ingress captured from one request.
struct CapturedRequest {
    request_line: String,
    body: String,
}

/// Start a one-shot mock ingress that accepts a single connection, captures the
/// request, and replies with `response_body`. Returns the `host:port` origin and
/// a handle that yields the captured request once served.
fn mock_ingress(response_body: &'static str) -> (String, thread::JoinHandle<CapturedRequest>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback");
    let origin = listener.local_addr().expect("addr").to_string();

    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept");

        // Read headers, then exactly Content-Length body bytes.
        let mut buffer = Vec::new();
        let mut chunk = [0u8; 1024];
        let header_end = loop {
            if let Some(position) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
                break position;
            }
            let read = stream.read(&mut chunk).expect("read request");
            if read == 0 {
                break buffer.len();
            }
            buffer.extend_from_slice(&chunk[..read]);
        };

        let headers = String::from_utf8_lossy(&buffer[..header_end]).to_string();
        let content_length = headers
            .lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.trim()
                    .eq_ignore_ascii_case("content-length")
                    .then(|| value.trim().parse::<usize>().ok())
                    .flatten()
            })
            .unwrap_or(0);

        let body_start = header_end + 4;
        while buffer.len() < body_start + content_length {
            let read = stream.read(&mut chunk).expect("read body");
            if read == 0 {
                break;
            }
            buffer.extend_from_slice(&chunk[..read]);
        }

        let request_line = headers.lines().next().unwrap_or_default().to_string();
        let body = String::from_utf8_lossy(&buffer[body_start..body_start + content_length]).to_string();

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            response_body.len(),
            response_body
        );
        stream.write_all(response.as_bytes()).expect("write response");
        stream.flush().ok();

        CapturedRequest { request_line, body }
    });

    (origin, handle)
}

fn args(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| item.to_string()).collect()
}

#[test]
fn hatch_sends_the_expected_request_and_prints_the_reply() {
    let (origin, server) = mock_ingress(r#"{"ok":true}"#);

    let mut out = Vec::new();
    let mut err = Vec::new();
    let code = run_with(
        &args(&["hatch", "cato", "Rex", "playful", "D:/proj"]),
        &origin,
        "D:/ignored",
        Vec::new,
        &mut out,
        &mut err,
    );

    let captured = server.join().expect("server thread");

    assert_eq!(code, 0);
    assert_eq!(captured.request_line, "POST /pets-driven/hatch HTTP/1.1");
    assert_eq!(
        captured.body,
        r#"{"cwd":"D:/proj","assetId":"cato","name":"Rex","personalityId":"playful"}"#
    );
    assert_eq!(String::from_utf8(out).unwrap().trim_end(), r#"{"ok":true}"#);
    assert!(err.is_empty());
}

#[test]
fn list_posts_to_the_list_route_with_an_empty_body() {
    let (origin, server) = mock_ingress(r#"{"ok":true,"pets":[]}"#);

    let mut out = Vec::new();
    let mut err = Vec::new();
    run_with(&args(&["list"]), &origin, "D:/proj", Vec::new, &mut out, &mut err);

    let captured = server.join().expect("server thread");
    assert_eq!(captured.request_line, "POST /pets-driven/list HTTP/1.1");
    assert_eq!(captured.body, "");
    assert_eq!(String::from_utf8(out).unwrap().trim_end(), r#"{"ok":true,"pets":[]}"#);
}

#[test]
fn attach_forwards_a_notification_to_the_hook_route() {
    let (origin, server) = mock_ingress(r#"{"ok":true}"#);

    let mut out = Vec::new();
    let mut err = Vec::new();
    let code = run_with(&args(&["attach"]), &origin, "D:/proj", Vec::new, &mut out, &mut err);

    let captured = server.join().expect("server thread");
    assert_eq!(code, 0);
    assert_eq!(captured.request_line, "POST /claude-hook HTTP/1.1");
    assert!(captured.body.contains(r#""hook_event_name":"Notification""#));
    assert!(captured.body.contains(r#""cwd":"D:/proj""#));
    // Fire-and-forget prints nothing.
    assert!(out.is_empty());
}

#[test]
fn codex_forward_posts_a_synthesized_event_to_the_codex_route() {
    let (origin, server) = mock_ingress(r#"{"ok":true}"#);

    let mut out = Vec::new();
    let mut err = Vec::new();
    let code = run_with(
        &args(&["forward-codex", "Stop"]),
        &origin,
        "D:/proj",
        Vec::new, // empty stdin -> synthesized Stop event
        &mut out,
        &mut err,
    );

    let captured = server.join().expect("server thread");
    assert_eq!(code, 0);
    assert_eq!(captured.request_line, "POST /codex-hook HTTP/1.1");
    assert!(captured.body.contains(r#""summary":"Codex turn completed""#));
    assert!(captured.body.contains(r#""sourceId":"codex""#));
}

#[test]
fn codex_forward_relays_a_real_stdin_payload_unchanged() {
    let (origin, server) = mock_ingress(r#"{"ok":true}"#);

    let payload = br#"{"hook_event_name":"Stop","cwd":"D:/proj","sourceId":"codex"}"#;
    let mut out = Vec::new();
    let mut err = Vec::new();
    let code = run_with(
        &args(&["forward-codex", "Stop"]),
        &origin,
        "D:/proj",
        || payload.to_vec(),
        &mut out,
        &mut err,
    );

    let captured = server.join().expect("server thread");
    assert_eq!(code, 0);
    assert_eq!(captured.request_line, "POST /codex-hook HTTP/1.1");
    assert_eq!(captured.body.as_bytes(), payload);
}

#[test]
fn forward_relays_a_stdin_body_verbatim() {
    let (origin, server) = mock_ingress(r#"{"ok":true}"#);

    let payload = br#"{"hook_event_name":"Stop","cwd":"D:/proj"}"#;
    let mut out = Vec::new();
    let mut err = Vec::new();
    run_with(
        &args(&["forward"]),
        &origin,
        "D:/proj",
        || payload.to_vec(),
        &mut out,
        &mut err,
    );

    let captured = server.join().expect("server thread");
    assert_eq!(captured.request_line, "POST /claude-hook HTTP/1.1");
    assert_eq!(captured.body.as_bytes(), payload);
}
