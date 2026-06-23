mod claude_hook_ingress;
mod pet_assets;
mod pet_windows;
mod state_store;
mod terminal_channel;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let claude_hook_ingress_status = claude_hook_ingress::create_status_handle();
            app.manage(claude_hook_ingress::ClaudeHookIngressSharedStatus(
                claude_hook_ingress_status.clone(),
            ));
            claude_hook_ingress::start_claude_hook_ingress(
                app.handle().clone(),
                claude_hook_ingress_status,
            );

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            claude_hook_ingress::get_claude_hook_ingress_status,
            claude_hook_ingress::emit_test_claude_hook_ingress_event,
            state_store::read_pets_driven_state,
            state_store::write_pets_driven_state,
            pet_assets::list_codex_pet_packages,
            pet_assets::load_codex_pet_spritesheet,
            pet_windows::open_adopted_pet_window,
            pet_windows::open_pet_window_playground,
            pet_windows::close_pet_window_playground,
            pet_windows::close_all_pet_windows,
            terminal_channel::focus_window,
            terminal_channel::start_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
