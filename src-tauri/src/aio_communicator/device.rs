use super::constants::{VID, SUPPORTED_PIDS, IMG_TX};
use anyhow::{Result, anyhow};
use hidapi::{HidApi, HidDevice};

pub struct CorsairH150i {
    pub device: HidDevice,
}

impl CorsairH150i {
    pub fn new() -> Result<Self> {
        let api = HidApi::new()?;
        
        for &pid in SUPPORTED_PIDS {
            if let Ok(device) = api.open(VID, pid) {
                println!("[RUST] Connected to Corsair LCD (PID: {:04x})", pid);
                return Ok(Self { device });
            }
        }

        Err(anyhow!("No supported Corsair LCD device found."))
    }

    pub fn send_image(&self, jpeg_data: &[u8]) -> Result<()> {
        let mut part_num: u16 = 0;
        let max_len = 1024;
        let header_size = 8;
        let real_max_len = max_len - header_size;

        for chunk in jpeg_data.chunks(real_max_len) {
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

            part_num += 1;
        }

        Ok(())
    }
}