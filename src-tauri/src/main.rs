#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod aio_communicator;
mod sidecar_handler;

use crossbeam_channel::{bounded, Sender};
use std::sync::Mutex;
use std::thread;
use tauri::{Manager, State};
use tauri_plugin_autostart::MacosLauncher;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, MouseButton, TrayIconEvent};

pub struct ImageChannel {
    pub tx: Mutex<Sender<Vec<u8>>>,
}

#[tauri::command]
fn send_frame(jpeg_data: Vec<u8>, state: State<ImageChannel>) {
    if let Ok(tx) = state.tx.lock() {
        let _ = tx.try_send(jpeg_data);
    }
}

fn main() {
    let (tx, rx) = bounded::<Vec<u8>>(2);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_process::init())
        .manage(ImageChannel { tx: Mutex::new(tx) })
        .invoke_handler(tauri::generate_handler![send_frame])
        .setup(move |app| {
            // --- SYSTEM TRAY ---
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            // -------------------

            sidecar_handler::spawn_sensor_bridge(app.handle().clone());
            
            thread::spawn(move || {
                aio_communicator::run_aio_loop(rx);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}