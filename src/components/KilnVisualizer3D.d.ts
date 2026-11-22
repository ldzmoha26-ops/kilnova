import type { ComponentType } from 'react';
import type * as THREE from 'three';

export const DIGITAL_TWIN_SHELL_LIMIT_C: number;
export const NOMINAL_TELEMETRY: Record<string, number>;
export const SCENARIOS: ReadonlyArray<{
  id: string;
  label: string;
  severity: 'normal' | 'warn' | 'crit';
  overrides: Record<string, number>;
}>;

export function computeSoftSensors(
  raw: Record<string, number>,
  scenarioId?: string,
  rampAlpha?: number
): { calcination_deg: number; free_lime_pct: number; nox_ppm: number };

export function getScenarioTarget(scenarioId: string, elapsedSec?: number): Record<string, number>;
export function lerpTelemetrySnapshot(
  fromObj: Record<string, number>,
  toObj: Record<string, number>,
  alpha: number
): Record<string, number>;
export function computeAxialShellProfile(kilnShellTemp: number, scenarioId?: string): number[];
export function computeForecast(
  history: Array<{ calcination_deg: number; free_lime_pct: number; nox_ppm: number }>,
  current: Record<string, number>
): {
  doNothing: { calcination_deg: number; free_lime_pct: number; nox_ppm: number; shell_temp: number };
  followAdvice: { calcination_deg: number; free_lime_pct: number; nox_ppm: number; shell_temp: number };
};
export function tempToColor(value: number, minTemp: number, maxTemp: number, outColor?: THREE.Color): THREE.Color;
export function shellTempToColor(tempC: number, outColor?: THREE.Color): THREE.Color;
export function classifyFlame(burningZoneTemp: number): {
  state: 'COLD' | 'NOMINAL' | 'WARN' | 'CRIT';
  color: string;
  scale: number;
  intensity: number;
};

export interface KilnVisualizer3DProps {
  telemetry?: Record<string, number>;
  activeScenario?: string;
  embedded?: boolean;
}

export const KilnVisualizer3D: ComponentType<KilnVisualizer3DProps>;
export default KilnVisualizer3D;
