use crossbeam_channel::Receiver;
use std::time::Duration;
use std::thread;

pub mod constants;
pub mod device;

use device::CorsairH150i;

pub fn run_aio_loop(rx: Receiver<Vec<u8>>) {
    println!("[RUST] Starting AIO Loop...");

    loop {
        match CorsairH150i::new() {
            Ok(device) => {
                println!("[RUST] Corsair Device Connected!");

                loop {
                    match rx.recv() {
                        Ok(jpeg_frame) => {
                            if let Err(e) = device.send_image(&jpeg_frame) {
                                eprintln!("[RUST] Failed to send image to device: {}", e);
                                break;
                            }
                        }
                        Err(e) => {
                            eprintln!("[RUST] Channel receive error: {}", e);
                            return;
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("[RUST] Failed to initialize Corsair device: {}", e);
                thread::sleep(Duration::from_secs(2));
            }
        }
    }
}