use serde::Serialize;
use tauri::{ipc::Channel, AppHandle};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    current_version: String,
    version: String,
    notes: Option<String>,
    date: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateEvent {
    event: &'static str,
    content_length: Option<u64>,
    chunk_length: Option<usize>,
}

impl AppUpdateEvent {
    fn started(content_length: Option<u64>) -> Self {
        Self {
            event: "started",
            content_length,
            chunk_length: None,
        }
    }

    fn progress(chunk_length: usize) -> Self {
        Self {
            event: "progress",
            content_length: None,
            chunk_length: Some(chunk_length),
        }
    }

    fn finished() -> Self {
        Self {
            event: "finished",
            content_length: None,
            chunk_length: None,
        }
    }
}

fn send_event(channel: &Channel<AppUpdateEvent>, event: AppUpdateEvent) {
    let _ = channel.send(event);
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn check_app_update(app: AppHandle) -> Result<Option<AppUpdateInfo>, String> {
    let current_version = get_app_version(app.clone());
    let update = app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;

    Ok(update.map(|update| AppUpdateInfo {
        current_version,
        version: update.version,
        notes: update.body,
        date: update.date.map(|date| date.to_string()),
    }))
}

#[tauri::command]
pub async fn install_app_update(
    app: AppHandle,
    expected_version: String,
    on_event: Channel<AppUpdateEvent>,
) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No update is currently available.".to_string())?;

    if update.version != expected_version {
        return Err(format!(
            "The available update changed from {expected_version} to {}. Check again before installing.",
            update.version
        ));
    }

    let mut started = false;
    update
        .download_and_install(
            |chunk_length, content_length| {
                if !started {
                    send_event(&on_event, AppUpdateEvent::started(content_length));
                    started = true;
                }
                send_event(&on_event, AppUpdateEvent::progress(chunk_length));
            },
            || send_event(&on_event, AppUpdateEvent::finished()),
        )
        .await
        .map_err(|error| error.to_string())
}
