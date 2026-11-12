import { writable, get } from 'svelte/store';
import { load } from '@tauri-apps/plugin-store';
import { BaseDirectory, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import type { SensorMapping } from '#lib/types.ts';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { refreshThemes } from './themeStore';
import { invoke } from '@tauri-apps/api/core';

const STORE_PATH = 'settings.json';

export const settingsReady = writable(false);

interface AppSettings {
    activeThemeId: string;
    mappings: Record<string, SensorMapping>;
    themeConfigs: Record<string, Record<string, any>>;
    appBehavior: {
        minimizeToTray: boolean;
        autoStart: boolean;
        startMinimized: boolean;
    };
    customThemes?: string[];
    lcdConfig?: {
        brightness: number;
        rotation: number;
    };
}

const defaultSettings: AppSettings = {
    activeThemeId: 'liquid-flow',
    mappings: {},
    themeConfigs: {},
    appBehavior: {
        minimizeToTray: true,
        autoStart: false,
        startMinimized: false
    },
    lcdConfig: {
        brightness: 100,
        rotation: 0
    }
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let cachedDiskStore: Awaited<ReturnType<typeof load>> | null = null;

async function getDiskStore() {
    if (!cachedDiskStore) {
        cachedDiskStore = await load(STORE_PATH);
    }
    return cachedDiskStore;
}

async function migrateCustomThemes(val: AppSettings, diskStore: Awaited<ReturnType<typeof load>>) {
    if (!val.customThemes || val.customThemes.length === 0) return;

    try {
        const hasDir = await exists('themes', { baseDir: BaseDirectory.AppData });
        if (!hasDir) {
            await mkdir('themes', { baseDir: BaseDirectory.AppData, recursive: true });
        }

        for (const code of val.customThemes) {
            const idMatch = code.match(/id:\s*['"]([^'"]+)['"]/);
            if (idMatch && idMatch[1]) {
                const id = idMatch[1];
                await writeTextFile(`themes/${id}.js`, code, { baseDir: BaseDirectory.AppData });
            }
        }

        val.customThemes = [];
        await diskStore.set('config', val);
        await diskStore.save();
        await refreshThemes();
    } catch (migrationErr) {
        console.error("Migration failed:", migrationErr);
    }
}

function createSettingsStore() {
    const store = writable<AppSettings>(defaultSettings);
    const { subscribe, set, update } = store;

    return {
        subscribe,
        init: async () => {
            if (get(settingsReady)) return;

            try {
                const diskStore = await getDiskStore();
                const val = await diskStore.get<AppSettings>('config');

                const finalSettings: AppSettings = {
                    ...defaultSettings,
                    ...val,
                    appBehavior: { ...defaultSettings.appBehavior, ...val?.appBehavior },
                    lcdConfig: {
                        brightness: val?.lcdConfig?.brightness ?? defaultSettings.lcdConfig!.brightness,
                        rotation: val?.lcdConfig?.rotation ?? defaultSettings.lcdConfig!.rotation
                    }
                };

                set(finalSettings);

                // Send initial LCD config to backend (persist: false)
                if (finalSettings.lcdConfig) {
                    try {
                        await invoke('set_lcd_brightness', { percent: finalSettings.lcdConfig.brightness, persist: false });
                        await invoke('set_lcd_rotation', { angle: finalSettings.lcdConfig.rotation, persist: false });
                    } catch (err) {
                        console.error("Failed to set initial LCD config:", err);
                    }
                }

                if (val) {
                    await migrateCustomThemes(val, diskStore);

                    const shouldAutoStart = val.appBehavior?.autoStart ?? false;
                    const currentlyEnabled = await isEnabled();
                    if (shouldAutoStart && !currentlyEnabled) await enable();
                    else if (!shouldAutoStart && currentlyEnabled) await disable();
                }
            } catch (e) {
                console.error("Settings init failed", e);
            } finally {
                settingsReady.set(true);
            }
        },
        setActiveTheme: (id: string) => {
            update(s => {
                const next = { ...s, activeThemeId: id };
                triggerSave(next);
                return next;
            });
        },
        updateMapping: (themeId: string, slotId: string, data: { hwId: string; sensorId: string; sensorType: string } | null) => {
            update(s => {
                const next = { ...s };
                if (!next.mappings[themeId]) next.mappings[themeId] = {};
                next.mappings[themeId][slotId] = data;
                triggerSave(next);
                return next;
            });
        },
        updateThemeConfig: (themeId: string, optionId: string, value: any) => {
            update(s => {
                const next = { ...s };
                if (!next.themeConfigs[themeId]) next.themeConfigs[themeId] = {};
                next.themeConfigs[themeId][optionId] = value;
                triggerSave(next, 500);
                return next;
            });
        },
        resetThemeConfig: (themeId: string) => {
            update(s => {
                const next = { ...s };
                next.themeConfigs[themeId] = {};
                triggerSave(next);
                return next;
            });
        },
        toggleAppBehavior: (key: 'minimizeToTray' | 'autoStart' | 'startMinimized') => {
            update(s => {
                const next = { ...s };
                next.appBehavior[key] = !next.appBehavior[key];
                if (key === 'autoStart') {
                    if (next.appBehavior.autoStart) enable();
                    else disable();
                }
                triggerSave(next);
                return next;
            });
        },
        updateLcdBrightness: async (percent: number) => {
            update(s => {
                const next = { ...s };
                if (!next.lcdConfig) {
                    next.lcdConfig = { brightness: 100, rotation: 0 };
                }
                next.lcdConfig.brightness = percent;
                triggerSave(next);
                return next;
            });
            try {
                await invoke('set_lcd_brightness', { percent, persist: true });
            } catch (err) {
                console.error("Failed to send brightness command:", err);
            }
        },
        updateLcdRotation: async (angle: number) => {
            update(s => {
                const next = { ...s };
                if (!next.lcdConfig) {
                    next.lcdConfig = { brightness: 100, rotation: 0 };
                }
                next.lcdConfig.rotation = angle;
                triggerSave(next);
                return next;
            });
            try {
                await invoke('set_lcd_rotation', { angle, persist: true });
            } catch (err) {
                console.error("Failed to send rotation command:", err);
            }
        }
    };
}

function triggerSave(val: AppSettings, delay = 0) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            const diskStore = await getDiskStore();
            await diskStore.set('config', val);
            await diskStore.save();
        } catch (e) {
            console.error("[Settings] Failed to save:", e);
        }
    }, delay);
}

export const settings = createSettingsStore();