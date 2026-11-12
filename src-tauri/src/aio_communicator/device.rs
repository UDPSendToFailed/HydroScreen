use super::constants::{VID, SUPPORTED_PIDS, IMG_TX};
use anyhow::{Result, anyhow};
use hidapi::{HidApi, HidDevice};
use log::info;
use std::sync::atomic::{AtomicU8, AtomicU16};

pub static LCD_BRIGHTNESS: AtomicU8 = AtomicU8::new(100);
pub static LCD_ROTATION: AtomicU16 = AtomicU16::new(0);

pub struct CorsairH150i {
    pub device: HidDevice,
}

impl CorsairH150i {
    pub fn new() -> Result<Self> {
        let api = HidApi::new()?;
        
        for &pid in SUPPORTED_PIDS {
            if let Ok(device) = api.open(VID, pid) {
                info!("[RUST] Connected to Corsair LCD (PID: {:04x})", pid);
                return Ok(Self { device });
            }
        }

        Err(anyhow!("No supported Corsair LCD device found."))
    }

    fn send_feature(&self, payload: &[u8]) -> Result<()> {
        let mut packet = [0u8; 32];
        packet[0] = 0x03; // Report ID
        for (i, &b) in payload.iter().enumerate() {
            if i + 1 < packet.len() {
                packet[i + 1] = b;
            }
        }
        self.device.send_feature_report(&packet)?;
        Ok(())
    }

    pub fn set_brightness(&self, percent: u8, persist: bool) -> Result<()> {
        let raw_val = match percent {
            0..=16 => 0x01,
            17..=49 => 0x04,
            50..=83 => 0x10,
            _ => 0x40,
        };

        info!("[RUST] Setting brightness to {}% (register: 0x{:02x})...", percent, raw_val);
        self.send_feature(&[0x0B, raw_val])?;

        if persist {
            info!("[RUST] Persisting brightness to onboard flash...");
            self.send_feature(&[0x19, raw_val])?;
        }

        Ok(())
    }

    pub fn set_rotation(&self, angle: u16, persist: bool) -> Result<()> {
        let raw_val = match angle {
            0 => 0x00,
            90 => 0x01,
            180 => 0x02,
            270 => 0x03,
            _ => return Err(anyhow!("Invalid rotation angle: {}", angle)),
        };

        info!("[RUST] Setting display rotation to {}° (index: 0x{:02x})...", angle, raw_val);
        self.send_feature(&[0x0C, raw_val])?;

        if persist {
            info!("[RUST] Persisting rotation to onboard flash...");
            self.send_feature(&[0x19, raw_val])?;
        }

        Ok(())
    }

    pub fn send_image(&self, jpeg_data: &[u8]) -> Result<()> {
        // NOTE: No global mutex needed here. The LCD cap is a separate USB HID device
        // (PIDs: 0x0c39, 0x0c33, 0x0c4e) from the pump/controller that the sensor-bridge
        // communicates with. The CorsairLinkReadWriteGuardMutex is for pump/controller
        // access only. Acquiring it here caused ~1s periodic stuttering due to contention
        // with sensor-bridge's device.Refresh() calls.

        let max_len = 1024;
        let header_size = 8;
        let real_max_len = max_len - header_size;

        for (part_num, chunk) in (0_u16..).zip(jpeg_data.chunks(real_max_len)) {
            let chunk_len = chunk.len();
            let is_end = if (part_num as usize * real_max_len) + chunk_len >= jpeg_data.len() {
                1u8
            } else {
                0u8
            };

            let mut packet = Vec::with_capacity(max_len);
            
            packet.push(IMG_TX);
            packet.push(0x05);
            packet.push(0x40);
            packet.push(is_end);
            packet.extend_from_slice(&part_num.to_le_bytes());
            packet.extend_from_slice(&(chunk_len as u16).to_le_bytes());
            packet.extend_from_slice(chunk);

            if chunk_len < real_max_len {
                packet.resize(max_len, 0x00);
            }

            let written = self.device.write(&packet)?;
            if written != packet.len() {
                return Err(anyhow!("Incomplete write: {}/{}", written, packet.len()));
            }
        }

        Ok(())
    }
}