use crossbeam_channel::Receiver;
use std::time::Duration;
use std::thread;
use log::{info, error};

pub mod constants;
pub mod device;
#[allow(dead_code)]
pub mod global_mutex;

use device::{CorsairH150i, LCD_BRIGHTNESS, LCD_ROTATION};

pub enum AioMessage {
    Frame(Vec<u8>),
    Brightness { percent: u8, persist: bool },
    Rotation { angle: u16, persist: bool },
}

pub fn run_aio_loop(rx: Receiver<AioMessage>) {
    info!("[RUST] Starting AIO Loop...");

    let mut device_opt: Option<CorsairH150i> = None;

    loop {
        match rx.recv_timeout(Duration::from_secs(10)) {
            Ok(message) => {
                // Drain the channel to always send the most recent frame and apply all settings.
                let mut latest_frame = None;
                let mut pending_messages = Vec::new();

                match message {
                    AioMessage::Frame(f) => latest_frame = Some(f),
                    other => pending_messages.push(other),
                }

                while let Ok(msg) = rx.try_recv() {
                    match msg {
                        AioMessage::Frame(f) => {
                            latest_frame = Some(f);
                        }
                        other => {
                            pending_messages.push(other);
                        }
                    }
                }

                if device_opt.is_none() {
                    match CorsairH150i::new() {
                        Ok(d) => {
                            info!("[RUST] Corsair Device Connected!");
                            // Apply current cached settings on fresh connection
                            let brightness = LCD_BRIGHTNESS.load(std::sync::atomic::Ordering::Relaxed);
                            let rotation = LCD_ROTATION.load(std::sync::atomic::Ordering::Relaxed);
                            if let Err(e) = d.set_brightness(brightness, false) {
                                error!("[RUST] Failed to set initial brightness: {}", e);
                            }
                            if let Err(e) = d.set_rotation(rotation, false) {
                                error!("[RUST] Failed to set initial rotation: {}", e);
                            }
                            device_opt = Some(d);
                        },
                        Err(e) => {
                            error!("[RUST] Device not found: {}", e);
                            thread::sleep(Duration::from_millis(2000));
                            continue;
                        }
                    }
                }

                if let Some(device) = &device_opt {
                    // Process any configuration changes first
                    for msg in pending_messages {
                        match msg {
                            AioMessage::Brightness { percent, persist } => {
                                if let Err(e) = device.set_brightness(percent, persist) {
                                    error!("[RUST] Brightness write error: {}", e);
                                }
                            }
                            AioMessage::Rotation { angle, persist } => {
                                if let Err(e) = device.set_rotation(angle, persist) {
                                    error!("[RUST] Rotation write error: {}", e);
                                }
                            }
                            _ => {}
                        }
                    }

                    // Then process the latest frame if there is one
                    if let Some(frame) = latest_frame
                        && let Err(e) = device.send_image(&frame)
                    {
                        error!("[RUST] Write error (Dropping connection): {}", e);
                        device_opt = None;
                    }
                }
            }
            Err(_) => {
                if device_opt.is_some() {
                    info!("[RUST] Idle timeout (10s) - Closing device connection.");
                    device_opt = None;
                }
            }
        }
    }
}