import type { ThemeDefinition } from '../types';

let currentFill = 0;

export const theme: ThemeDefinition = {
    id: 'liquid-flow',
    name: 'Deep Liquid',
    author: 'HydroScreen',
    description: 'Realistic dual-layer liquid simulation with physics and smooth tides.',
    slots: [
        { id: 'level', label: 'Fluid Level', type: 'number', allowedTypes: ['Load', 'Level', 'Temperature'] }
    ],
    options: [
        { id: 'waterColor', label: 'Liquid Color', type: 'color', default: '#4f46e5' },
        { id: 'bgColor', label: 'Background Color', type: 'color', default: '#0f172a' },
        { id: 'waveSpeed', label: 'Flow Speed', type: 'range', default: 20, min: 0, max: 100 },
        { id: 'levelLabel', label: 'Sensor Label', type: 'text', default: '' }
    ],
    renderFn: (ctx, w, h, values, formatted, config, tick) => {
        const val = values['level'] || 0;
        const str = formatted['level'] || `${Math.round(val)}%`;
        
        const targetFill = Math.min(Math.max(val, 0), 100) / 100;
        
        const diff = targetFill - currentFill;
        if (Math.abs(diff) > 0.001) {
            currentFill += diff * 0.05; 
        } else {
            currentFill = targetFill;
        }

        const waterLevel = h - (h * currentFill);
        const speedMultiplier = (config.waveSpeed / 100) * 0.05; 

        ctx.fillStyle = config.bgColor;
        ctx.fillRect(0, 0, w, h);

        const primaryColor = config.waterColor;
        
        ctx.fillStyle = adjustOpacity(primaryColor, 0.4);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 5) {
            const y = waterLevel + Math.sin((x * 0.015) + (tick * speedMultiplier * 0.8)) * 15;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.fill();

        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 5) {
            const bob = Math.sin(tick * 0.05) * 5; 
            const y = (waterLevel + bob) + Math.sin((x * 0.02) + (tick * speedMultiplier) + 2) * 20;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        for(let i=0; i<6; i++) {
            const speed = (i + 1) * 0.5;
            const bx = (w/6 * i + tick * speedMultiplier * 20) % w;
            const by = (h - ((tick * speed + i*50) % h));
            
            if (by > waterLevel + 20) {
                 ctx.beginPath();
                 ctx.arc(bx, by, 4 + i, 0, Math.PI*2);
                 ctx.fill();
            }
        }

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 120px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 20;
        ctx.fillText(str, w/2, h/2 - 20);

        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.fillText(config.levelLabel.toUpperCase(), w/2, h/2 + 60);
        
        ctx.shadowBlur = 0;
    }
};

function adjustOpacity(color: string, alpha: number) {
    if (color.startsWith('#')) {
        let r = parseInt(color.slice(1, 3), 16);
        let g = parseInt(color.slice(3, 5), 16);
        let b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
}