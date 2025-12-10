import { derived } from 'svelte/store';
import { settings } from './settings';
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

export const themeRegistry = derived(settings, ($settings) => {
    const customThemes: ThemeDefinition[] = [];

    if ($settings.customThemes && Array.isArray($settings.customThemes)) {
        $settings.customThemes.forEach((code, index) => {
            // Skip themes with ES module syntax as they can't be executed in global scope
            if (code.includes('import ') || code.includes('export ')) {
                console.warn(`Skipping custom theme ${index}: Contains ES module syntax which is not supported`);
                return;
            }

            try {
                // Safety: Create function
                const createTheme = new Function(code);
                const themeObj = createTheme() as ThemeDefinition;

                // Validate: Ensure required properties exist and are correct types
                if (themeObj &&
                    typeof themeObj.id === 'string' &&
                    typeof themeObj.name === 'string' &&
                    typeof themeObj.author === 'string' &&
                    typeof themeObj.description === 'string' &&
                    Array.isArray(themeObj.slots) &&
                    Array.isArray(themeObj.options) &&
                    typeof themeObj.renderFn === 'function') {

                    // Sanitize: Ensure critical arrays have valid items
                    themeObj.slots = themeObj.slots.filter(slot =>
                        typeof slot.id === 'string' &&
                        typeof slot.label === 'string' &&
                        ['number', 'text'].includes(slot.type)
                    );
                    themeObj.options = themeObj.options.filter(opt =>
                        typeof opt.id === 'string' &&
                        typeof opt.label === 'string' &&
                        ['color', 'boolean', 'range', 'file'].includes(opt.type) &&
                        typeof opt.default !== 'undefined'
                    );

                    // Tag as custom
                    (themeObj as any)._isCustom = true;
                    (themeObj as any)._customIndex = index;

                    // Handle collisions
                    if (BUILT_INS.find(t => t.id === themeObj.id)) {
                        themeObj.id = `${themeObj.id}_custom_${index}`;
                    }
                    customThemes.push(themeObj);
                }
            } catch (e) {
                console.error("Failed to load custom theme", e);
            }
        });
    }

    return [...BUILT_INS, ...customThemes];
});