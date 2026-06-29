use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use crate::pet_assets::validate_asset_id;

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

#[tauri::command]
pub(crate) async fn open_pet_window_playground(
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
        .inner_size(192.0, 268.0)
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
pub(crate) async fn open_adopted_pet_window(
    app: tauri::AppHandle,
    pet_id: String,
    asset_id: String,
) -> Result<(), String> {
    validate_asset_id(&pet_id).map_err(|_| "Invalid pet id".to_string())?;
    validate_asset_id(&asset_id)?;

    let label = format!("pet-window-{pet_id}");
    let url =
        format!("index.html?surface=pet-window&petId={pet_id}&assetId={asset_id}&windowIndex=1");

    if app.get_webview_window(&label).is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::App(url.into()))
        .title("Pet Window")
        .inner_size(192.0, 268.0)
        .position(120.0, 120.0)
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

    Ok(())
}

#[tauri::command]
pub(crate) async fn close_pet_window_playground(app: tauri::AppHandle) -> Result<(), String> {
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

#[tauri::command]
pub(crate) async fn close_all_pet_windows(app: tauri::AppHandle) -> Result<(), String> {
    for (label, window) in app.webview_windows() {
        if label.starts_with("pet-window-") {
            window
                .destroy()
                .map_err(|error| format!("Could not close {label}: {error}"))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub(crate) async fn close_adopted_pet_window(
    app: tauri::AppHandle,
    pet_id: String,
) -> Result<(), String> {
    validate_asset_id(&pet_id).map_err(|_| "Invalid pet id".to_string())?;

    let label = format!("pet-window-{pet_id}");

    if let Some(window) = app.get_webview_window(&label) {
        window
            .destroy()
            .map_err(|error| format!("Could not close {label}: {error}"))?;
    }

    let menu_label = format!("pet-context-menu-{pet_id}");

    if let Some(menu_window) = app.get_webview_window(&menu_label) {
        menu_window.destroy().ok();
    }

    Ok(())
}

#[tauri::command]
pub(crate) async fn open_pet_context_menu(
    app: tauri::AppHandle,
    pet_id: String,
    x: f64,
    y: f64,
) -> Result<(), String> {
    validate_asset_id(&pet_id).map_err(|_| "Invalid pet id".to_string())?;

    let label = format!("pet-context-menu-{pet_id}");
    let url = format!("index.html?surface=pet-context-menu&petId={pet_id}");

    if let Some(existing) = app.get_webview_window(&label) {
        existing.destroy().ok();
    }

    WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::App(url.into()))
        .title("Pet Menu")
        .inner_size(192.0, 132.0)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(true)
        .build()
        .map_err(|error| format!("Could not create {label}: {error}"))?;

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
}
