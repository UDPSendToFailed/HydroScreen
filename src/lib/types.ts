export type SensorType = 'Temperature' | 'Load' | 'Clock' | 'Power' | 'Voltage' | 'Data' | 'Level' | 'Control' | 'Factor' | 'Throughput';

export interface Sensor {
    Id: string;
    Name: string;
    Type: SensorType;
    Value: number;
}

export interface Hardware {
    Id: string;
    Name: string;
    Type: string;
    Sensors: Sensor[];
}

export interface ThemeSlot {
    id: string;
    label: string;
    allowedTypes?: SensorType[];
    type: 'number' | 'text';
}

export interface ThemeOption {
    id: string;
    label: string;
    type: 'color' | 'boolean' | 'range' | 'file' | 'text';
    default: any;
    min?: number;
    max?: number;
}

export type RenderFunction = (
    ctx: CanvasRenderingContext2D, 
    w: number, 
    h: number, 
    values: Record<string, number>,
    formatted: Record<string, string>,
    config: Record<string, any>, 
    tick: number,
    assets: Record<string, any> 
) => void;

export interface ThemeDefinition {
    id: string;
    name: string;
    author: string;
    description: string;
    slots: ThemeSlot[];
    options: ThemeOption[];
    renderFn: RenderFunction;
}

export interface SensorMapping {
    [slotId: string]: { hwId: string; sensorId: string; sensorType: string } | null;
}