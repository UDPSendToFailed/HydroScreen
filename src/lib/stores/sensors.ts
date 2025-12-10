import { writable } from 'svelte/store';
import { listen } from '@tauri-apps/api/event';
import type { Hardware } from '$lib/types';

// The raw list of hardware from LibreHardwareMonitor
export const rawHardware = writable<Hardware[]>([]);

// True if we have received data in the last few seconds
export const isConnected = writable(false);

// Timestamp of the last successful data packet
export const lastUpdate = writable(Date.now());

const CONNECTION_TIMEOUT = 30000; // 30 seconds

export async function initSensorListener() {
    // Listen for the 'sensors-update' event emitted by the Rust sidecar handler
    await listen<string>('sensors-update', (event) => {
        try {
            // The payload is a JSON string from the C# bridge
            const data = JSON.parse(event.payload);

            // Update stores
            rawHardware.set(data);
            isConnected.set(true);
            lastUpdate.set(Date.now());

        } catch (e) {
            console.error("[Sensors] Failed to parse payload:", e);
        }
    });

    // Check connection status periodically
    setInterval(() => {
        lastUpdate.update((last) => {
            if (Date.now() - last > CONNECTION_TIMEOUT) {
                isConnected.set(false);
            }
            return last;
        });
    }, 5000); // Check every 5 seconds
}