//! The system tray icon and its menu.
//!
//! The menu is the app's one surface that exists while the window is closed, so
//! it is also the one surface the shell has to label by itself — and the shell
//! has no locale. It cannot get one cheaply either: the user's language is not
//! only the OS display language but a stored override the settings switcher
//! writes, and that lives in the webview's localStorage.
//!
//! So the tray starts in the app's default locale and the frontend hands it the
//! user's words as soon as it has resolved them (`set_tray_labels`, called from
//! `use-tray-labels.ts`). The alternative — reading the OS language here — would
//! answer differently from the rest of the app for exactly the users who set an
//! override, which is worse than being briefly English.

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Wry,
};

/// The app's default locale (`en`), and all the shell can say before the
/// webview reports the user's language.
const DEFAULT_OPEN_LABEL: &str = "Open";
const DEFAULT_QUIT_LABEL: &str = "Quit";

/// The menu items, kept so their text can be replaced once the frontend knows
/// what language to use.
pub(crate) struct TrayMenuItems {
    open: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

/// Bring the main window back up, wherever the request came from.
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub(crate) fn build(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "show", DEFAULT_OPEN_LABEL, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", DEFAULT_QUIT_LABEL, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    app.manage(TrayMenuItems {
        open: open.clone(),
        quit: quit.clone(),
    });

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Put the tray menu in the user's language.
///
/// Called by the frontend whenever the active locale changes, including once on
/// startup. The ids stay fixed — only the text the user reads moves — so the
/// menu handler above never has to know which language it is in.
#[tauri::command]
pub(crate) fn set_tray_labels(app: AppHandle, open: String, quit: String) -> Result<(), String> {
    let items = app.state::<TrayMenuItems>();

    items
        .open
        .set_text(open)
        .map_err(|error| format!("Could not label the tray's open item: {error}"))?;
    items
        .quit
        .set_text(quit)
        .map_err(|error| format!("Could not label the tray's quit item: {error}"))?;

    Ok(())
}
