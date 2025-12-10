import { writable } from 'svelte/store';
import { readDir, readTextFile, BaseDirectory, mkdir, exists } from '@tauri-apps/plugin-fs';
import type { ThemeDefinition } from '$lib/types';

import { theme as CustomMedia } from '$lib/themes/library/custom_media';
import { theme as HydroGauge } from '$lib/themes/library/hydro_gauge';
import { theme as TerminalZero } from '$lib/themes/library/terminal_zero';
import { theme as Quantum } from '$lib/themes/library/quantum';
import { theme as LiquidFlow } from '$lib/themes/library/liquid_flow';

const BUILT_INS: ThemeDefinition[] = [
    CustomMedia,
    HydroGauge,
    LiquidFlow,
    Quantum,
    TerminalZero
];

function createThemeStore() {
    const { subscribe, set, update } = writable<ThemeDefinition[]>(BUILT_INS);

    return {
        subscribe,
        load: async () => {
            try {
                const hasDir = await exists('themes', { baseDir: BaseDirectory.AppData });
                if (!hasDir) {
                    await mkdir('themes', { baseDir: BaseDirectory.AppData, recursive: true });
                    set([...BUILT_INS]);
                    return;
                }

                const entries = await readDir('themes', { baseDir: BaseDirectory.AppData });
                const customThemes: ThemeDefinition[] = [];

                for (const entry of entries) {
                    if (entry.isFile && entry.name.endsWith('.js')) {
                        try {
                            const code = await readTextFile(`themes/${entry.name}`, { baseDir: BaseDirectory.AppData });
                            const createTheme = new Function(code);
                            const themeObj = createTheme() as ThemeDefinition;

                            if (themeObj && themeObj.id) {
                                if(!themeObj.options) themeObj.options = [];
                                if(!themeObj.slots) themeObj.slots = [];

                                (themeObj as any)._isCustom = true;
                                (themeObj as any)._fileName = entry.name;
                                
                                if (BUILT_INS.find(t => t.id === themeObj.id)) {
                                    themeObj.id = `${themeObj.id}_custom`;
                                }
                                customThemes.push(themeObj);
                            }
                        } catch (err) {
                            console.error(`Error loading theme ${entry.name}`, err);
                        }
                    }
                }

                set([...BUILT_INS, ...customThemes]);

            } catch (e) {
                console.error("Theme load failed", e);
                set([...BUILT_INS]);
            }
        },
        refresh: async () => {
            await themeRegistry.load();
        }
    };
}

export const themeRegistry = createThemeStore();
export const refreshThemes = themeRegistry.load;