//! A minimal loopback HTTP/1.1 POST client.
//!
//! The desktop ingress speaks plain HTTP on `127.0.0.1`, so the CLI dials it
//! directly over [`std::net::TcpStream`] rather than pulling in an async HTTP
//! and TLS stack for a call that never leaves the loopback interface. This
//! mirrors what the ingress itself does when it parses and writes raw HTTP.

use std::io::{self, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

/// A failure to reach the ingress or read its reply. A [`TransportError::Connect`]
/// or [`TransportError::Resolve`] is the "app not running" case the caller maps
/// to a friendly answer; the rest are unexpected I/O faults.
#[derive(Debug)]
pub enum TransportError {
    Resolve(String),
    Connect(io::Error),
    Io(io::Error),
}

impl std::fmt::Display for TransportError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TransportError::Resolve(reason) => write!(formatter, "could not resolve ingress origin: {reason}"),
            TransportError::Connect(error) => write!(formatter, "could not connect to ingress: {error}"),
            TransportError::Io(error) => write!(formatter, "ingress request failed: {error}"),
        }
    }
}

impl std::error::Error for TransportError {}

/// A parsed HTTP reply: the status code and the response body bytes. The status
/// lets a caller distinguish an accepted request from a rejection (the Codex
/// forward uses it to fall back to the legacy route on a non-2xx reply).
#[derive(Debug)]
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

impl HttpResponse {
    /// Whether the reply is a 2xx success.
    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.status)
    }
}

/// POST `body` as `application/json` to `path` at `origin` (a `host:port`
/// authority), returning the parsed reply. `timeout` bounds connect, read, and
/// write so a stopped or wedged app never blocks the caller.
pub fn post_json(
    origin: &str,
    path: &str,
    body: &[u8],
    timeout: Duration,
) -> Result<HttpResponse, TransportError> {
    let address = origin
        .to_socket_addrs()
        .map_err(|error| TransportError::Resolve(error.to_string()))?
        .next()
        .ok_or_else(|| TransportError::Resolve(format!("no address resolved for {origin}")))?;

    let mut stream = TcpStream::connect_timeout(&address, timeout).map_err(TransportError::Connect)?;
    stream.set_read_timeout(Some(timeout)).map_err(TransportError::Io)?;
    stream.set_write_timeout(Some(timeout)).map_err(TransportError::Io)?;

    // The body must travel in the request body, never in a header or the request
    // line, so a non-ASCII path (a Korean OneDrive folder, say) is delivered as
    // bytes rather than re-encoded.
    let head = format!(
        "POST {path} HTTP/1.1\r\nHost: {origin}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(head.as_bytes()).map_err(TransportError::Io)?;
    stream.write_all(body).map_err(TransportError::Io)?;
    stream.flush().map_err(TransportError::Io)?;

    // The ingress replies with `Connection: close`, so read to EOF.
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).map_err(TransportError::Io)?;

    parse_response(&raw)
}

/// Split a raw HTTP reply into its status code and body. Content-Length framing
/// is implicit because the ingress always sends `Connection: close`, so the body
/// is everything after the header terminator.
fn parse_response(raw: &[u8]) -> Result<HttpResponse, TransportError> {
    let header_end = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| TransportError::Io(io::Error::new(io::ErrorKind::InvalidData, "no HTTP header terminator")))?;

    let status = std::str::from_utf8(&raw[..header_end])
        .ok()
        .and_then(|headers| headers.lines().next())
        .and_then(|status_line| status_line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .unwrap_or(0);

    Ok(HttpResponse {
        status,
        body: raw[header_end + 4..].to_vec(),
    })
}
