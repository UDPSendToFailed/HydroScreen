import type { ThemeDefinition } from '../types';

let currentVal = 0;

export const theme: ThemeDefinition = {
    id: 'hydro-gauge',
    name: 'Hydro Gauge',
    author: 'HydroScreen',
    description: 'Automotive-style gauge with smooth animated gradient ring.',
    slots: [
        { id: 'main', label: 'Primary Value', type: 'number', allowedTypes: ['Temperature', 'Load', 'Level', 'Power', 'Control'] },
        { id: 'sub', label: 'Secondary Data', type: 'number' }
    ],
    options: [
        { id: 'startColor', label: 'Gradient Start', type: 'color', default: '#3b82f6' },
        { id: 'endColor', label: 'Gradient End', type: 'color', default: '#8b5cf6' },
        { id: 'bgColor', label: 'Background', type: 'color', default: '#000000' },
        { id: 'trackWidth', label: 'Stroke Width', type: 'range', default: 30, min: 10, max: 60 },
        { id: 'mainLabel', label: 'Primary Label', type: 'text', default: '' },
        { id: 'subLabel', label: 'Secondary Label', type: 'text', default: '' }
    ],
    renderFn: (ctx, w, h, values, formatted, config, tick) => {
        const targetVal = values['main'] || 0;
        const mainStr = formatted['main'] || '--';
        const subStr = formatted['sub'] || '';
        
        const diff = targetVal - currentVal;
        if (Math.abs(diff) > 0.1) {
            currentVal += diff * 0.15;
        } else {
            currentVal = targetVal;
        }
        
        ctx.fillStyle = config.bgColor;
        ctx.fillRect(0, 0, w, h);
        
        const cx = w / 2;
        const cy = h / 2;
        const radius = (w / 2) - 40;
        const width = config.trackWidth;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = width;
        ctx.stroke();

        const startAngle = Math.PI * 0.75;
        const maxAngle = Math.PI * 2.25;
        const progress = Math.min(Math.max(currentVal, 0), 100) / 100;
        const endAngle = startAngle + (progress * (maxAngle - startAngle));

        const grad = ctx.createLinearGradient(0, h, w, 0);
        grad.addColorStop(0, config.startColor);
        grad.addColorStop(1, config.endColor);

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = grad;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        
        ctx.shadowColor = config.endColor;
        ctx.shadowBlur = 20;
        ctx.stroke();
        ctx.shadowBlur = 0;

        const nubX = cx + Math.cos(endAngle) * radius;
        const nubY = cy + Math.sin(endAngle) * radius;
        
        ctx.beginPath();
        ctx.arc(nubX, nubY, width/2 - 4, 0, Math.PI*2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 120px Inter, sans-serif';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 10;
        ctx.fillText(mainStr, cx, cy + 20);
        ctx.shadowBlur = 0;

        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.fillStyle = config.endColor; 
        ctx.fillText(config.mainLabel.toUpperCase(), cx, cy - 80);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '500 24px Inter, sans-serif';
        ctx.fillText(subStr, cx, cy + 90);

        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillText(config.subLabel.toUpperCase(), cx, cy + 115);
    }
};