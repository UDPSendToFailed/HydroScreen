import { writable } from 'svelte/store';
import { load } from '@tauri-apps/plugin-store';
import { BaseDirectory, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import type { SensorMapping } from '$lib/types';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { refreshThemes } from './themeStore';

const STORE_PATH = 'settings.json';

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
}

const defaultSettings: AppSettings = {
    activeThemeId: 'liquid-flow', // Updated default per request
    mappings: {},
    themeConfigs: {},
    appBehavior: {
        minimizeToTray: true,
        autoStart: false,
        startMinimized: false
    }
};

let saveTimer: any = null;

function createSettingsStore() {
    const store = writable<AppSettings>(defaultSettings);
    const { subscribe, set, update } = store;

    return {
        subscribe,
        init: async () => {
            try {
                const diskStore = await load(STORE_PATH);
                const val = await diskStore.get<AppSettings>('config');
                
                if (val) {
                    if (val.customThemes && val.customThemes.length > 0) {
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

                    set({ 
                        ...defaultSettings, 
                        ...val, 
                        appBehavior: { ...defaultSettings.appBehavior, ...val.appBehavior }
                    });
                    
                    const shouldAutoStart = val.appBehavior?.autoStart ?? false;
                    const currentlyEnabled = await isEnabled();
                    if (shouldAutoStart && !currentlyEnabled) await enable();
                    else if (!shouldAutoStart && currentlyEnabled) await disable();
                }
            } catch (e) {
                console.error("Settings init failed", e);
            }
        },
        setActiveTheme: async (id: string) => {
            update(s => {
                const next = { ...s, activeThemeId: id };
                triggerSave(next); 
                return next;
            });
        },
        updateMapping: async (themeId: string, slotId: string, data: { hwId: string; sensorId: string; sensorType: string } | null) => {
            update(s => {
                const next = { ...s };
                if (!next.mappings[themeId]) next.mappings[themeId] = {};
                next.mappings[themeId][slotId] = data;
                triggerSave(next);
                return next;
            });
        },
        updateThemeConfig: async (themeId: string, optionId: string, value: any) => {
            update(s => {
                const next = { ...s };
                if (!next.themeConfigs[themeId]) next.themeConfigs[themeId] = {};
                next.themeConfigs[themeId][optionId] = value;
                triggerSave(next, 500); 
                return next;
            });
        },
        resetThemeConfig: async (themeId: string) => {
            update(s => {
                const next = { ...s };
                next.themeConfigs[themeId] = {};
                triggerSave(next);
                return next;
            });
        },
        toggleAppBehavior: async (key: 'minimizeToTray' | 'autoStart' | 'startMinimized') => {
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
        addCustomTheme: (code: string) => { return; }
    };
}

async function triggerSave(val: AppSettings, delay = 0) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            const diskStore = await load(STORE_PATH);
            await diskStore.set('config', val);
            await diskStore.save();
        } catch (e) { }
    }, delay);
}

export const settings = createSettingsStore();