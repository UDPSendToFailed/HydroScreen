#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod aio_communicator;
mod sidecar_handler;

use crossbeam_channel::{bounded, Sender};
use font_loader::system_fonts;
use std::sync::Mutex;
use std::thread;
use tauri::{Manager, State};
use tauri_plugin_autostart::MacosLauncher;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, MouseButton, TrayIconEvent};
use tauri_plugin_log::{Target, TargetKind, RotationStrategy};
use log::info;

pub struct ImageChannel {
    pub tx: Mutex<Sender<aio_communicator::AioMessage>>,
}

#[tauri::command]
fn send_frame(jpeg_data: Vec<u8>, state: State<ImageChannel>) {
    if let Ok(tx) = state.tx.lock() {
        let _ = tx.try_send(aio_communicator::AioMessage::Frame(jpeg_data));
    }
}

#[tauri::command]
fn set_lcd_brightness(percent: u8, persist: bool, state: State<ImageChannel>) {
    aio_communicator::device::LCD_BRIGHTNESS.store(percent, std::sync::atomic::Ordering::Relaxed);
    if let Ok(tx) = state.tx.lock() {
        let _ = tx.try_send(aio_communicator::AioMessage::Brightness { percent, persist });
    }
}

#[tauri::command]
fn set_lcd_rotation(angle: u16, persist: bool, state: State<ImageChannel>) {
    aio_communicator::device::LCD_ROTATION.store(angle, std::sync::atomic::Ordering::Relaxed);
    if let Ok(tx) = state.tx.lock() {
        let _ = tx.try_send(aio_communicator::AioMessage::Rotation { angle, persist });
    }
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
    let mut fonts = system_fonts::query_all();
    fonts.sort();
    fonts.dedup();
    fonts
}

fn main() {
    let (tx, rx) = bounded::<aio_communicator::AioMessage>(2);
    
    let args: Vec<String> = std::env::args().collect();
    let debug_mode = args.contains(&"--debug".to_string()) || cfg!(debug_assertions);

    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let log_dir = std::path::Path::new(&app_data).join("com.hydroscreen.app").join("logs");

    if !log_dir.exists() {
        let _ = std::fs::create_dir_all(&log_dir);
    }

    info!("[RUST] Starting HydroScreen (Debug: {})", debug_mode);
    info!("[RUST] Log Dir: {:?}", log_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new()
            .targets([
                Target::new(TargetKind::Stdout),
                Target::new(TargetKind::Folder { path: log_dir, file_name: Some("app".to_string()) }),
            ])
            .level(if debug_mode { log::LevelFilter::Debug } else { log::LevelFilter::Info })
            .max_file_size(10 * 1024 * 1024)
            .rotation_strategy(RotationStrategy::KeepOne)
            .build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.get_webview_window("main").expect("no main window").set_focus();
        }))
        .manage(ImageChannel { tx: Mutex::new(tx) })
        .invoke_handler(tauri::generate_handler![
            send_frame,
            get_system_fonts,
            sidecar_handler::retry_sidecar,
            set_lcd_brightness,
            set_lcd_rotation
        ])
        .setup(move |app| {
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let restart_i = MenuItem::with_id(app, "restart", "Restart", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &restart_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "restart" => app.request_restart(),
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

            sidecar_handler::spawn_sensor_bridge(app.handle().clone(), debug_mode);
            
            thread::spawn(move || {
                aio_communicator::run_aio_loop(rx);
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}