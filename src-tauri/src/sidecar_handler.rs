use tauri::{AppHandle, Emitter};
use std::process::Command;
use std::time::Duration;
use std::net::UdpSocket;
use std::thread;
use std::env;
use std::path::PathBuf;
use std::os::windows::process::CommandExt;

// Windows constant to hide the console window created by PowerShell
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn spawn_sensor_bridge(app: AppHandle) {
    let binary_name = "lhm-bridge.exe";
    let current_exe = env::current_exe().unwrap_or_default();
    let exe_dir = current_exe.parent().unwrap_or(&current_exe);

    let path_a = exe_dir.join(binary_name);
    let path_b = exe_dir.join("binaries").join(binary_name);
    let path_c = exe_dir.parent().unwrap_or(exe_dir).join("binaries").join(binary_name);

    let final_path = if path_a.exists() { path_a } 
    else if path_b.exists() { path_b } 
    else if path_c.exists() { path_c } 
    else { PathBuf::from(binary_name) };

    let raw_path = final_path.to_string_lossy().to_string();
    let bridge_path = raw_path.strip_prefix("\\\\?\\").unwrap_or(&raw_path).to_string();

    println!("[RUST] Sidecar path resolved: {}", bridge_path);

    thread::spawn(move || {
        loop {
            let output = Command::new("tasklist")
                .args(&["/FI", "IMAGENAME eq lhm-bridge.exe", "/NH"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            let is_running = match output {
                Ok(o) => String::from_utf8_lossy(&o.stdout).contains("lhm-bridge.exe"),
                Err(_) => false,
            };

            if !is_running {
                println!("[RUST] Sensor Bridge not running. Spawning...");
                
                let _ = Command::new("powershell")
                    .args(&[
                        "-NoProfile",
                        "-WindowStyle", "Hidden",
                        "-Command",
                        &format!("Start-Process -FilePath '{}' -Verb RunAs -WindowStyle Hidden", bridge_path)
                    ])
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();
                
                thread::sleep(Duration::from_secs(5));
            }

            thread::sleep(Duration::from_secs(5));
        }
    });

    let app_clone = app.clone();
    thread::spawn(move || {
        let socket = match UdpSocket::bind("127.0.0.1:14242") {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[RUST] UDP Bind failed: {}", e);
                return;
            }
        };
        
        let _ = socket.set_read_timeout(Some(Duration::from_secs(2)));
        let mut buf = [0u8; 65535];

        loop {
            if let Ok((amt, _)) = socket.recv_from(&mut buf) {
                if let Ok(json_str) = std::str::from_utf8(&buf[..amt]) {
                    let _ = app_clone.emit("sensors-update", json_str);
                }
            }
        }
    });

    thread::spawn(move || {
        let socket = UdpSocket::bind("127.0.0.1:0").unwrap();
        loop {
            let _ = socket.send_to(b"ping", "127.0.0.1:14243");
            thread::sleep(Duration::from_secs(3));
        }
    });
}