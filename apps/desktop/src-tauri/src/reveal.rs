use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// Open a folder in the OS file manager (Explorer on Windows).
///
/// The pet-folder settings surface a "reveal in Explorer" action so the user can
/// jump from the app to the directory on disk. The path is user-chosen data, so
/// this stays a trusted backend command rather than a scoped JS `opener` call:
/// the folder can be anywhere the picker allowed, which no static path scope can
/// enumerate ahead of time.
#[tauri::command]
pub fn reveal_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|error| error.to_string())
}
