mod claude_hook_ingress;
mod claude_plugin;
mod embedded_terminal;
mod pet_assets;
mod pet_windows;
mod reveal;
mod state_commands;
mod state_watch;
mod terminal_channel;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(embedded_terminal::EmbeddedTerminalSessions::default())
        .setup(|app| {
            // Build the one core over the shared on-disk state repository and
            // manage it before anything can touch state (the ingress thread and
            // the Tauri commands both reach persisted state only through it).
            app.manage(state_commands::PetsDrivenCoreState(
                state_commands::build_core().map_err(|error| error.to_string())?,
            ));

            // The CLI can write the same state file while the app runs; watch it
            // so an external change (a `pdd` hatch, say) reloads the webview.
            state_watch::start(app.handle().clone());

            let claude_hook_ingress_status = claude_hook_ingress::create_status_handle();
            app.manage(claude_hook_ingress::ClaudeHookIngressSharedStatus(
                claude_hook_ingress_status.clone(),
            ));
            claude_hook_ingress::start_claude_hook_ingress(
                app.handle().clone(),
                claude_hook_ingress_status,
            );

            let show = MenuItem::with_id(app, "show", "열기", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } = event {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            claude_hook_ingress::get_claude_hook_ingress_status,
            claude_hook_ingress::send_test_claude_hook_ingress_event,
            claude_plugin::get_claude_plugin_status,
            claude_plugin::plan_claude_plugin_command,
            claude_plugin::install_claude_plugin,
            claude_plugin::uninstall_claude_plugin,
            state_commands::read_pets_driven_state,
            state_commands::write_pets_driven_state,
            state_commands::hatch_pet_record,
            state_commands::update_pet_record,
            state_commands::delete_pet_record,
            state_commands::update_pets_driven_settings,
            state_commands::reset_pets_driven_settings,
            pet_assets::list_codex_pet_packages,
            pet_assets::list_designated_pet_packages,
            pet_assets::load_codex_pet_spritesheet,
            pet_assets::list_pet_source_directory_options,
            pet_assets::copy_bundled_pets_to_source_directory,
            reveal::reveal_path,
            pet_windows::open_adopted_pet_window,
            pet_windows::open_pet_window_playground,
            pet_windows::close_all_pet_windows,
            pet_windows::close_adopted_pet_window,
            pet_windows::open_pet_context_menu,
            pet_windows::place_pet_windows,
            terminal_channel::focus_window,
            terminal_channel::start_session,
            terminal_channel::connect_window,
            embedded_terminal::terminal_open,
            embedded_terminal::terminal_write,
            embedded_terminal::terminal_resize,
            embedded_terminal::terminal_close,
            embedded_terminal::list_terminal_shells
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
