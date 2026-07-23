use std::process::ExitCode;

/// The `pets` binary: a thin wrapper that dispatches to the library and maps its
/// exit code onto the process exit status.
fn main() -> ExitCode {
    ExitCode::from(pets_driven_cli::run() as u8)
}
