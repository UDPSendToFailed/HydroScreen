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
    // 1. Binary Name (Simple format as requested)
    let binary_name = "lhm-bridge.exe";

    // 2. Robust Path Finding
    // We check multiple locations because 'current_exe' differs between Dev and Release
    let current_exe = env::current_exe().unwrap_or_default();
    let exe_dir = current_exe.parent().unwrap_or(&current_exe);

    // Location A: Next to executable (Release/Installed)
    let path_a = exe_dir.join(binary_name);
    // Location B: In 'binaries' folder next to executable (Dev/Debug)
    let path_b = exe_dir.join("binaries").join(binary_name);
    // Location C: One level up in binaries (Source tree structure)
    let path_c = exe_dir.parent().unwrap_or(exe_dir).join("binaries").join(binary_name);

    let final_path = if path_a.exists() {
        path_a
    } else if path_b.exists() {
        path_b
    } else if path_c.exists() {
        path_c
    } else {
        // Fallback: Just the name (hopes it is in PATH)
        PathBuf::from(binary_name)
    };

    // Clean up the path string for PowerShell (Remove UNC prefix if present)
    let raw_path_str = final_path.to_string_lossy().to_string();
    let path_str = raw_path_str.strip_prefix("\\\\?\\").unwrap_or(&raw_path_str).to_string();

    println!("[RUST] Found bridge at: {}", path_str);

    // 3. Spawn as Admin using PowerShell
    // This triggers the UAC prompt for the bridge ONLY, leaving the main app as Standard User
    thread::spawn(move || {
        let _ = Command::new("powershell")
            .args(&[
                "-NoProfile",
                "-WindowStyle", "Hidden",
                "-Command",
                &format!("Start-Process -FilePath '{}' -Verb RunAs -WindowStyle Hidden", path_str)
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    });

    // 4. UDP Listener (Receives JSON from Bridge)
    let app_clone = app.clone();
    thread::spawn(move || {
        // Bind strictly to Localhost (127.0.0.1) to avoid Firewall popups
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
            if let Ok((amt, _src)) = socket.recv_from(&mut buf) {
                // Parse JSON from bytes
                if let Ok(json_str) = std::str::from_utf8(&buf[..amt]) {
                    let _ = app_clone.emit("sensors-update", json_str);
                }
            }
        }
    });

    // 5. UDP Heartbeat Sender (Keeps Bridge Alive)
    thread::spawn(move || {
        // Bind strictly to Localhost (Ephemeral port)
        let socket = UdpSocket::bind("127.0.0.1:0").unwrap();
        loop {
            let _ = socket.send_to(b"ping", "127.0.0.1:14243");
            thread::sleep(Duration::from_secs(3));
        }
    });
}