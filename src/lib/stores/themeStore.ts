import { writable } from 'svelte/store';
import { readDir, readTextFile, BaseDirectory, mkdir, exists } from '@tauri-apps/plugin-fs';
import type { ThemeDefinition } from '#lib/types.ts';

import { theme as CustomMedia } from '#lib/themes/library/custom_media.ts';
import { theme as HydroGauge } from '#lib/themes/library/hydro_gauge.ts';
import { theme as TerminalZero } from '#lib/themes/library/terminal_zero.ts';
import { theme as Quantum } from '#lib/themes/library/quantum.ts';
import { theme as LiquidFlow } from '#lib/themes/library/liquid_flow.ts';

const BUILT_INS: ThemeDefinition[] = [
    CustomMedia,
    HydroGauge,
    LiquidFlow,
    Quantum,
    TerminalZero
];

// SECURITY NOTE: Custom themes are loaded via `new Function(code)` which executes
// arbitrary JavaScript. This is intentional to allow user-created themes, but means
// theme files from untrusted sources could be malicious. Only load themes the user
// explicitly imports.

// Shared validation logic
export function validateTheme(code: string, fileName?: string): ThemeDefinition {
    // 1. Syntax Check
    const createTheme = new Function(code);
    const themeObj = createTheme();

    if (!themeObj || typeof themeObj !== 'object') {
        throw new Error("Script executed but did not return a valid object.");
    }

    // 2. Property Check
    const required = ["id", "name", "author", "description"];
    const missing = required.filter(field => !themeObj[field] || typeof themeObj[field] !== "string");

    if (missing.length > 0) {
        throw new Error(`Missing or invalid properties: ${missing.join(", ")}`);
    }

    if (typeof themeObj.renderFn !== "function") {
        throw new Error("Missing 'renderFn' (must be a function).");
    }

    if (!Array.isArray(themeObj.slots)) {
        throw new Error("'slots' must be an array.");
    }

    // 3. ID Safety Check (Simple regex)
    if (!/^[a-z0-9-_]+$/i.test(themeObj.id)) {
        throw new Error(`Invalid ID '${themeObj.id}'. Use only letters, numbers, hyphens, and underscores.`);
    }

    // Attach metadata
    if (!themeObj.options) themeObj.options = [];
    (themeObj as any)._isCustom = true;
    if (fileName) (themeObj as any)._fileName = fileName;

    return themeObj as ThemeDefinition;
}

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
                const seenIds = new Set<string>();

                for (const entry of entries) {
                    if (entry.isFile && entry.name.endsWith('.js')) {
                        try {
                            const code = await readTextFile(`themes/${entry.name}`, { baseDir: BaseDirectory.AppData });
                            try {
                                const themeObj = validateTheme(code, entry.name);

                                // Reject themes whose ID collides with a built-in
                                if (BUILT_INS.find(t => t.id === themeObj.id)) {
                                    console.warn(`Custom theme "${entry.name}" has ID "${themeObj.id}" which conflicts with a built-in theme — skipping`);
                                    continue;
                                }

                                // Deduplicate: skip if another custom theme already claimed this ID
                                if (seenIds.has(themeObj.id)) {
                                    console.warn(`Duplicate custom theme ID "${themeObj.id}" in "${entry.name}" — skipping`);
                                    continue;
                                }

                                seenIds.add(themeObj.id);
                                customThemes.push(themeObj);
                            } catch (validationErr) {
                                console.error(`Invalid theme ${entry.name}:`, validationErr);
                            }
                        } catch (err) {
                            console.error(`Error reading theme file ${entry.name}`, err);
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