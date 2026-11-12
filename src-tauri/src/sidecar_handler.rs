use tauri::{AppHandle, Emitter, Manager};
use log::{info, error, debug, warn};
use std::process::Command;
use std::time::Duration;
use std::net::UdpSocket;
use std::thread;
use std::env;
use std::path::PathBuf;
use std::os::windows::process::CommandExt;
use std::sync::{Arc};
use std::sync::atomic::{AtomicBool, Ordering};

// Windows constant to hide the console window created by PowerShell.
const CREATE_NO_WINDOW: u32 = 0x08000000;
const BRIDGE_SERVICE_NAME: &str = "HydroScreenSensorBridge";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BridgeServiceState {
    Running,
    StartPending,
    Stopped,
    NotInstalled,
}

fn parse_sc_query_state(exit_success: bool, stdout: &str) -> BridgeServiceState {
    if !exit_success {
        return BridgeServiceState::NotInstalled;
    }

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("STATE") {
            if trimmed.contains("RUNNING") {
                return BridgeServiceState::Running;
            }
            if trimmed.contains("START_PENDING") {
                return BridgeServiceState::StartPending;
            }
            return BridgeServiceState::Stopped;
        }
    }

    BridgeServiceState::Stopped
}

fn query_bridge_service_state() -> BridgeServiceState {
    match Command::new("sc.exe")
        .args(["query", BRIDGE_SERVICE_NAME])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            parse_sc_query_state(output.status.success(), &stdout)
        }
        Err(_) => BridgeServiceState::NotInstalled,
    }
}

lazy_static::lazy_static! {
    static ref SPAWN_THREAD_RUNNING: AtomicBool = AtomicBool::new(false);
    static ref SHOULD_RETRY: Arc<AtomicBool> = Arc::new(AtomicBool::new(true));
}

#[tauri::command]
pub fn retry_sidecar(app: AppHandle, debug_mode: bool) {
    if SPAWN_THREAD_RUNNING.load(Ordering::SeqCst) {
        // If already running, just signal to retry.
        SHOULD_RETRY.store(true, Ordering::SeqCst);
        info!("Retry signal sent to existing spawn thread.");
    } else {
        // If not running, start it.
        info!("Restarting spawn thread...");
        spawn_sensor_bridge(app, debug_mode);
    }
}

pub fn spawn_sensor_bridge(app: AppHandle, debug_mode: bool) {
    // Prevent multiple spawn threads
    if SPAWN_THREAD_RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        warn!("Spawn thread already running.");
        return;
    }

    let binary_name = "lhm-bridge.exe";
    let suffixed_binary_name = "lhm-bridge-x86_64-pc-windows-msvc.exe";
    let current_exe = env::current_exe().unwrap_or_default();
    let exe_dir = current_exe.parent().unwrap_or(&current_exe);

    debug!("Current EXE: {:?}", current_exe);
    debug!("EXE Dir: {:?}", exe_dir);

    let resolve_path = |name: &str| {
        let path_a = exe_dir.join(name);
        let path_b = exe_dir.join("binaries").join(name);
        let path_c = exe_dir.parent().unwrap_or(exe_dir).join("binaries").join(name);
        
        debug!("Checking: {:?}", path_a);
        if path_a.exists() { return Some(path_a); }
        debug!("Checking: {:?}", path_b);
        if path_b.exists() { return Some(path_b); }
        debug!("Checking: {:?}", path_c);
        if path_c.exists() { return Some(path_c); }
        
        None
    };

    let final_path = resolve_path(binary_name)
        .or_else(|| {
            debug!("Base binary not found, checking for suffixed version...");
            resolve_path(suffixed_binary_name)
        })
        .unwrap_or_else(|| {
            warn!("Binary not found in standard locations, falling back to name only.");
            PathBuf::from(binary_name)
        });

    let final_binary_name = final_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(binary_name)
        .to_string();

    let bridge_path = final_path.to_string_lossy()
        .strip_prefix("\\\\?\\")
        .unwrap_or(&final_path.to_string_lossy())
        .to_string();

    info!("Sidecar path resolved: {} (Name: {})", bridge_path, final_binary_name);

    let app_for_thread = app.clone();
    
    // Spawn Thread
    thread::spawn(move || {
        match query_bridge_service_state() {
            BridgeServiceState::Running | BridgeServiceState::StartPending => {
                info!("{} Windows Service is active; skipping sidecar spawn.", BRIDGE_SERVICE_NAME);
                SPAWN_THREAD_RUNNING.store(false, Ordering::SeqCst);
                return;
            }
            BridgeServiceState::Stopped => {
                warn!("{} Windows Service is installed but stopped.", BRIDGE_SERVICE_NAME);
                let _ = app_for_thread.emit("sidecar-error", "Sensor bridge service is stopped");
                SPAWN_THREAD_RUNNING.store(false, Ordering::SeqCst);
                return;
            }
            BridgeServiceState::NotInstalled => {
                info!("{} Windows Service not installed; using standalone sidecar fallback.", BRIDGE_SERVICE_NAME);
            }
        }

        let mut consecutive_failures = 0;
        SHOULD_RETRY.store(true, Ordering::SeqCst); // Ensure we try at least once

        loop {
            // Check if we should even be trying
            if !SHOULD_RETRY.load(Ordering::SeqCst) {
                 thread::sleep(Duration::from_secs(2));
                 continue;
            }

            // First check if already running
            let output = Command::new("tasklist")
                .args(["/FI", &format!("IMAGENAME eq {}", final_binary_name), "/NH"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            let is_running = match output {
                Ok(o) => String::from_utf8_lossy(&o.stdout).contains(&final_binary_name),
                Err(_) => false,
            };

            if is_running {
                // If running, reset state
                consecutive_failures = 0;
                SHOULD_RETRY.store(true, Ordering::SeqCst); 
                thread::sleep(Duration::from_secs(5));
                continue;
            }

            // Attempt spawn
            let debug_flag = if debug_mode { " --debug" } else { "" };
            info!("Spawning sidecar: {} {}", bridge_path, debug_flag);

            // PREPARE VARIABLES FOR FORMAT MACRO
            let working_dir = final_path.parent().unwrap_or(&final_path).to_string_lossy().replace("'", "''");
            let bridge_path_escaped = bridge_path.replace("'", "''");

            let ps_script = if debug_mode {
                format!(
                    "try {{ Start-Process -FilePath '{}' -WorkingDirectory '{}' -ArgumentList '--debug' -Verb RunAs -WindowStyle Hidden -ErrorAction Stop; exit 0 }} catch {{ exit 1 }}",
                    bridge_path_escaped, working_dir
                )
            } else {
                format!(
                    "try {{ Start-Process -FilePath '{}' -WorkingDirectory '{}' -Verb RunAs -WindowStyle Hidden -ErrorAction Stop; exit 0 }} catch {{ exit 1 }}",
                    bridge_path_escaped, working_dir
                )
            };

            let status = Command::new("powershell")
                .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &ps_script])
                .creation_flags(CREATE_NO_WINDOW)
                .status();

            match status {
                Ok(exit_status) if exit_status.success() => {
                    info!("Sidecar spawn command succeeded.");
                    consecutive_failures = 0;
                    thread::sleep(Duration::from_secs(5));
                }
                Ok(exit_status) => {
                    warn!("Sidecar spawn failed or cancelled (Exit Code: {:?})", exit_status.code());
                    consecutive_failures += 1;
                    
                    // IF UAC DENIED (which triggers exit code 1), we STOP auto-retry and ask user.
                    error!("UAC/Spawn failed. Stopping auto-retry and notifying UI.");
                    SHOULD_RETRY.store(false, Ordering::SeqCst);
                    let _ = app_for_thread.emit("sidecar-error", "UAC Denied or Failed to start");
                    
                    // Bring window to front if minimized/hidden
                    if let Some(window) = app_for_thread.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                Err(e) => {
                    error!("Failed to execute spawn command: {}", e);
                    consecutive_failures += 1;
                }
            }

            // Exponential backoff
            if consecutive_failures > 0 && SHOULD_RETRY.load(Ordering::SeqCst) {
                let backoff_secs = std::cmp::min(300, 5 * (1 << (consecutive_failures - 1)));
                thread::sleep(Duration::from_secs(backoff_secs));
            }
        }
    });
    
    let app_clone = app.clone();
    thread::spawn(move || {
        // This fails if address in use, so it naturally prevents duplicates if we ignore the error
        let socket = match UdpSocket::bind("127.0.0.1:14242") {
            Ok(s) => s,
            Err(e) => {
                debug!("UDP Bind failed (probably already running): {}", e);
                return;
            }
        };
        
        let _ = socket.set_read_timeout(Some(Duration::from_secs(2)));
        let mut buf = [0u8; 65535];

        loop {
            if let Ok((amt, _)) = socket.recv_from(&mut buf)
                && let Ok(json_str) = std::str::from_utf8(&buf[..amt])
            {
                let _ = app_clone.emit("sensors-update", json_str);
            }
        }
    });

    thread::spawn(move || {
        let socket = match UdpSocket::bind("127.0.0.1:0") {
             Ok(s) => s,
             Err(_) => return,
        };
        loop {
            let _ = socket.send_to(b"ping", "127.0.0.1:14243");
            thread::sleep(Duration::from_secs(3));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_running_service_state() {
        let out = "SERVICE_NAME: HydroScreenSensorBridge\n        TYPE               : 10  WIN32_OWN_PROCESS\n        STATE              : 4  RUNNING\n";
        assert_eq!(parse_sc_query_state(true, out), BridgeServiceState::Running);
    }

    #[test]
    fn parses_start_pending_service_state() {
        let out = "SERVICE_NAME: HydroScreenSensorBridge\n        STATE              : 2  START_PENDING\n";
        assert_eq!(parse_sc_query_state(true, out), BridgeServiceState::StartPending);
    }

    #[test]
    fn parses_stopped_service_state() {
        let out = "SERVICE_NAME: HydroScreenSensorBridge\n        STATE              : 1  STOPPED\n";
        assert_eq!(parse_sc_query_state(true, out), BridgeServiceState::Stopped);
    }

    #[test]
    fn parses_not_installed_service_state() {
        let out = "[SC] EnumQueryServicesStatus:OpenService FAILED 1060:\nThe specified service does not exist as an installed service.\n";
        assert_eq!(parse_sc_query_state(false, out), BridgeServiceState::NotInstalled);
    }
}