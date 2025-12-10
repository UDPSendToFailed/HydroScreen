export function formatUnit(value: number, type: string): string {
    if (value === undefined || value === null) return '--';
    const v = Math.round(value);
    
    switch (type) {
        case 'Temperature': return `${v}°C`;
        case 'Load': return `${v}%`;
        case 'Clock': return value > 1000 ? `${(value/1000).toFixed(1)}GHz` : `${v}MHz`;
        case 'Power': return `${v}W`;
        case 'Voltage': return `${value.toFixed(2)}V`;
        case 'Data': return `${v}GB`; // Simplified
        case 'Level': return `${v}%`;
        case 'Control': return `${v}RPM`;
        default: return `${v}`;
    }
}