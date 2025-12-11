import type { ThemeDefinition } from '../types';

export const theme: ThemeDefinition = {
    id: 'quantum',
    name: 'Quantum HUD',
    author: 'HydroScreen',
    description: 'Sci-fi technical display with rotating elements.',
    slots: [
        { id: 'core', label: 'Core Value', type: 'number' },
        { id: 'aux', label: 'Aux Data', type: 'number' }
    ],
    options: [
        { id: 'hudColor', label: 'HUD Color', type: 'color', default: '#0ea5e9' },
        { id: 'coreLabel', label: 'Core Label', type: 'text', default: 'QUANTUM SENSOR' },
        { id: 'auxLabel', label: 'Aux Label', type: 'text', default: 'AUXILIARY' },
        { id: 'fontFamily', label: 'Font Family', type: 'font', default: 'Inter' }
    ],
    renderFn: (ctx, w, h, values, formatted, config, tick) => {
        const core = formatted['core'] || '--';
        const aux = formatted['aux'] || 'N/A';
        const color = config.hudColor;
        const font = config.fontFamily || 'Inter';

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        const cx = w/2;
        const cy = h/2;

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tick * 0.005);
        ctx.setLineDash([40, 20]);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, 180, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-tick * 0.01);
        ctx.setLineDash([10, 15]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 140, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        drawHex(ctx, cx, cy, 220);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.font = `bold 90px "${font}"`;
        ctx.fillText(core, cx, cy - 10);
        
        ctx.font = `16px "${font}"`;
        ctx.fillText(config.coreLabel.toUpperCase(), cx, cy + 50);

        ctx.fillStyle = '#fff';
        ctx.font = `bold 30px "${font}"`;
        ctx.fillText(aux, cx, h - 60);
        
        ctx.font = `12px "${font}"`;
        ctx.fillStyle = color;
        ctx.fillText(config.auxLabel.toUpperCase(), cx, h - 35);
        
        ctx.shadowBlur = 0;
    }
};

function drawHex(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        ctx.lineTo(x + r * Math.cos(i * Math.PI / 3), y + r * Math.sin(i * Math.PI / 3));
    }
    ctx.closePath();
    ctx.stroke();
}