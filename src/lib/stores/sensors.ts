import { writable, get } from 'svelte/store';
import { listen } from '@tauri-apps/api/event';
import type { Hardware } from '#lib/types.ts';

// The raw list of hardware from LibreHardwareMonitor
export const rawHardware = writable<Hardware[]>([]);

// True if we have received data in the last few seconds
export const isConnected = writable(false);

// True if user dismissed UAC / chose to run without sensors
export const isSensorless = writable(false);

// Timestamp of the last successful data packet
export const lastUpdate = writable(Date.now());

export const CONNECTION_TIMEOUT = 8000; // 8 seconds

let initialized = false;
let cleanupFn: (() => void) | null = null;

export async function initSensorListener() {
    // Prevent duplicate listeners if called multiple times
    if (initialized) return;
    initialized = true;

    // Listen for the 'sensors-update' event emitted by the Rust sidecar handler
    const unlisten = await listen<string>('sensors-update', (event) => {
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
    const intervalId = setInterval(() => {
        const last = get(lastUpdate);
        if (Date.now() - last > CONNECTION_TIMEOUT) {
            isConnected.set(false);
        }
    }, 5000); // Check every 5 seconds

    // Store cleanup function for teardown
    cleanupFn = () => {
        unlisten();
        clearInterval(intervalId);
        initialized = false;
    };
}

export function destroySensorListener() {
    if (cleanupFn) {
        cleanupFn();
        cleanupFn = null;
    }
}