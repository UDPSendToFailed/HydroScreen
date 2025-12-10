import type { SensorType } from '../types';

export interface ThemeSlot {
    id: string;
    label: string;
    type: 'number' | 'text'; // Future proofing
    allowedTypes?: SensorType[];
}

export interface ThemeOption {
    id: string;
    label: string;
    type: 'color' | 'boolean' | 'range' | 'file';
    default: any;
    min?: number;
    max?: number;
}

// The Render Function Signature
// ctx: The Canvas Context
// w, h: Dimensions (480x480)
// values: The sensor data mapped by the user
// tick: A continuous counter (0, 1, 2...) for calculating animations
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
    author: string;      // Credit the creator
    description: string;
    slots: ThemeSlot[];
    options: ThemeOption[];
    renderFn: RenderFunction;
}