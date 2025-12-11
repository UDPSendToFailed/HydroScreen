import type { ThemeDefinition } from '../types';

export const theme: ThemeDefinition = {
    id: 'terminal-zero',
    name: 'Terminal Zero',
    author: 'HydroScreen',
    description: 'Authentic 1980s CRT monitor simulation.',
    slots: [
        { id: 'top', label: 'System Metric A', type: 'number' },
        { id: 'bot', label: 'System Metric B', type: 'number' }
    ],
    options: [
        { id: 'phosphor', label: 'Phosphor Color', type: 'color', default: '#33ff33' },
        { id: 'bloom', label: 'Glow Intensity', type: 'range', default: 50, min: 0, max: 100 },
        { id: 'topLabel', label: 'Top Label', type: 'text', default: 'PRIMARY_SENSOR_INPUT' },
        { id: 'botLabel', label: 'Bottom Label', type: 'text', default: 'SECONDARY_SENSOR_INPUT' },
        { id: 'fontFamily', label: 'Font Family', type: 'font', default: 'Consolas' }
    ],
    renderFn: (ctx, w, h, values, formatted, config, tick) => {
        const topVal = formatted['top'] || 'N/A';
        const botVal = formatted['bot'] || 'N/A';
        const color = config.phosphor;
        const blurAmount = (config.bloom / 100) * 15;
        const font = config.fontFamily || 'Consolas';

        ctx.fillStyle = '#020202';
        ctx.fillRect(0, 0, w, h);

        ctx.font = `bold 36px "${font}"`;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.textAlign = 'left';
        
        ctx.shadowColor = color;
        ctx.shadowBlur = blurAmount;

        ctx.fillText('// HYDRO_BIOS v1.0', 40, 60);
        ctx.fillRect(40, 80, w - 80, 2);

        ctx.font = `20px "${font}"`;
        ctx.fillText(config.topLabel.toUpperCase(), 40, 140);
        ctx.font = `bold 110px "${font}"`;
        ctx.fillText(topVal, 35, 240);

        ctx.font = `20px "${font}"`;
        ctx.fillText(config.botLabel.toUpperCase(), 40, 320);
        ctx.font = `bold 80px "${font}"`;
        ctx.fillText(botVal, 35, 400);

        if (Math.floor(tick / 20) % 2 === 0) {
            const width = ctx.measureText(botVal).width;
            ctx.fillRect(45 + width, 340, 25, 60);
        }

        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        for (let y = 0; y < h; y += 4) {
            ctx.fillRect(0, y, w, 2);
        }

        const barY = (tick * 2) % (h + 100);
        const grad = ctx.createLinearGradient(0, barY, 0, barY + 50);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.fillStyle = grad;
        ctx.fillRect(0, barY, w, 50);
        
        const vig = ctx.createRadialGradient(w/2, h/2, w/2.5, w/2, h/2, w*0.8);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, w, h);
    }
};