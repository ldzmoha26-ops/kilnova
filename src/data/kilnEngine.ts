export type ProcessStatus = 'NORMAL' | 'WARNING' | 'ANOMALY';
export type OperatingMode = 'autopilot' | 'simulation';
export type KilnZoneId = 'preheater' | 'calciner' | 'transition' | 'burning' | 'cooler';

export interface KilnSensorReading {
  id: string;
  zoneId: KilnZoneId;
  name: string;
  locationLabel: string;
  positionMeters: number;
  temperatureC: number;
  limitMinC: number;
  limitMaxC: number;
  pressureMbar: number;
  status: ProcessStatus;
  refractoryRisk: 'LOW' | 'ELEVATED' | 'HIGH';
  /** Normalized position along the 3D kiln axis (-1 = feed/left, +1 = discharge/right) */
  axisNorm: number;
}

export interface KilnProcessInputs {
  fuelFlowTph: number; // Main burner fuel flow (t/h), nominal 9.2
  kilnSpeedRpm: number; // Rotary shell speed (rpm), nominal 3.4
  rawFeedTph: number; // Raw meal feed (t/h), nominal 215
  secondaryAirTempC: number; // Cooler recuperation air (°C), nominal 1020
}

export interface KilnAssessment {
  processId: string;
  timestamp: string;
  mode: OperatingMode;
  overallStatus: ProcessStatus;
  thermalLoadIndex: number; // 0..100 visual load ratio
  affectedZones: KilnZoneId[];
  hotspotAxisNorm: number; // -1..1 location of peak shell thermal anomaly
  hotspotIntensity: number; // 0..1 intensity for 3D thermal anomaly overlay
  refractoryAlert: boolean;
  refractorySummary: string;
  explanation: string;
  contributingFactors: string[];
  recommendations: string[];
  sensors: KilnSensorReading[];
  o2ExhaustPct: number;
  driveTorquePct: number;
}

export interface AutoPilotPreset {
  id: string;
  label: string;
  description: string;
  inputs: KilnProcessInputs;
  shellOffsetC: Partial<Record<KilnZoneId, number>>;
}

export const BASELINE_INPUTS: KilnProcessInputs = {
  fuelFlowTph: 9.2,
  kilnSpeedRpm: 3.4,
  rawFeedTph: 215,
  secondaryAirTempC: 1020,
};

export const AUTOPILOT_PRESETS: readonly AutoPilotPreset[] = [
  {
    id: 'brick-hotspot',
    label: 'Shell Hotspot Watch',
    description: 'Persistent localized temperature rise at transition-to-burning shell.',
    inputs: {
      fuelFlowTph: 9.8,
      kilnSpeedRpm: 3.3,
      rawFeedTph: 212,
      secondaryAirTempC: 1065,
    },
    shellOffsetC: { transition: 48, burning: 26 },
  },
  {
    id: 'nominal',
    label: 'Nominal Equilibrium',
    description: 'Balanced clinkerization corridor across all monitored zones.',
    inputs: { ...BASELINE_INPUTS },
    shellOffsetC: {},
  },
  {
    id: 'combustion-drift',
    label: 'Combustion Drift',
    description: 'Elevated thermal load at calciner and burning hood.',
    inputs: {
      fuelFlowTph: 10.4,
      kilnSpeedRpm: 3.1,
      rawFeedTph: 204,
      secondaryAirTempC: 1095,
    },
    shellOffsetC: { calciner: 34, transition: 64, burning: 52 },
  },
];

interface ZoneSpec {
  id: KilnZoneId;
  sensorId: string;
  name: string;
  locationLabel: string;
  positionMeters: number;
  baseTempC: number;
  limitMinC: number;
  limitMaxC: number;
  basePressureMbar: number;
  axisNorm: number;
}

const ZONE_SPECS: readonly ZoneSpec[] = [
  {
    id: 'preheater',
    sensorId: 'TC-01',
    name: 'Preheater Inlet',
    locationLabel: 'Stage 5 Feed Hood · 4m',
    positionMeters: 4,
    baseTempC: 838,
    limitMinC: 800,
    limitMaxC: 870,
    basePressureMbar: -48.2,
    axisNorm: -0.82,
  },
  {
    id: 'calciner',
    sensorId: 'TC-02',
    name: 'Calcination Zone',
    locationLabel: 'Mid-Upper Shell · 22m',
    positionMeters: 22,
    baseTempC: 1086,
    limitMinC: 1040,
    limitMaxC: 1120,
    basePressureMbar: -22.4,
    axisNorm: -0.36,
  },
  {
    id: 'transition',
    sensorId: 'SCN-04',
    name: 'Upper Transition',
    locationLabel: 'Shell Scanner Ring · 41m',
    positionMeters: 41,
    baseTempC: 1295,
    limitMinC: 1240,
    limitMaxC: 1335,
    basePressureMbar: -8.1,
    axisNorm: 0.14,
  },
  {
    id: 'burning',
    sensorId: 'PYR-01',
    name: 'Burning Zone',
    locationLabel: 'Sintering Core · 54m',
    positionMeters: 54,
    baseTempC: 1448,
    limitMinC: 1410,
    limitMaxC: 1470,
    basePressureMbar: -1.6,
    axisNorm: 0.52,
  },
  {
    id: 'cooler',
    sensorId: 'TC-06',
    name: 'Grate Cooler',
    locationLabel: 'Discharge Hood · 64m',
    positionMeters: 64,
    baseTempC: 136,
    limitMinC: 105,
    limitMaxC: 165,
    basePressureMbar: 12.4,
    axisNorm: 0.86,
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function classifySensorStatus(tempC: number, minC: number, maxC: number): ProcessStatus {
  const highMargin = tempC - maxC;
  const lowMargin = minC - tempC;
  if (highMargin >= 22 || lowMargin >= 30) return 'ANOMALY';
  if (highMargin > 0 || lowMargin > 12) return 'WARNING';
  return 'NORMAL';
}

export function evaluateKilnState(options: {
  inputs: KilnProcessInputs;
  mode: OperatingMode;
  shellOffsetC?: Partial<Record<KilnZoneId, number>>;
  processId?: string;
}): KilnAssessment {
  const { inputs, mode, shellOffsetC = {}, processId } = options;

  const fuelDelta = inputs.fuelFlowTph - BASELINE_INPUTS.fuelFlowTph;
  const speedDelta = inputs.kilnSpeedRpm - BASELINE_INPUTS.kilnSpeedRpm;
  const feedDelta = inputs.rawFeedTph - BASELINE_INPUTS.rawFeedTph;
  const airDelta = inputs.secondaryAirTempC - BASELINE_INPUTS.secondaryAirTempC;

  // Physically grounded linear sensitivity model for rotary kiln thermal behaviour
  const zoneTempOffsets: Record<KilnZoneId, number> = {
    preheater: fuelDelta * 14 - feedDelta * 0.45 + airDelta * 0.12 + (shellOffsetC.preheater ?? 0),
    calciner: fuelDelta * 26 - feedDelta * 0.65 - speedDelta * 18 + airDelta * 0.18 + (shellOffsetC.calciner ?? 0),
    transition: fuelDelta * 36 - feedDelta * 0.8 - speedDelta * 24 + airDelta * 0.28 + (shellOffsetC.transition ?? 0),
    burning: fuelDelta * 44 - feedDelta * 0.72 - speedDelta * 28 + airDelta * 0.36 + (shellOffsetC.burning ?? 0),
    cooler: fuelDelta * 8 + feedDelta * 0.25 - speedDelta * 12 + airDelta * 0.14 + (shellOffsetC.cooler ?? 0),
  };

  const sensors: KilnSensorReading[] = ZONE_SPECS.map((spec) => {
    const tempC = Math.round(spec.baseTempC + zoneTempOffsets[spec.id]);
    const status = classifySensorStatus(tempC, spec.limitMinC, spec.limitMaxC);
    const overLimit = Math.max(0, tempC - spec.limitMaxC);
    const refractoryRisk: 'LOW' | 'ELEVATED' | 'HIGH' =
      (spec.id === 'transition' || spec.id === 'burning') && overLimit >= 22
        ? 'HIGH'
        : overLimit > 0
          ? 'ELEVATED'
          : 'LOW';

    const pressureShift =
      spec.id === 'cooler'
        ? feedDelta * 0.04
        : -fuelDelta * 0.8 + speedDelta * 0.5;

    return {
      id: spec.sensorId,
      zoneId: spec.id,
      name: spec.name,
      locationLabel: spec.locationLabel,
      positionMeters: spec.positionMeters,
      temperatureC: tempC,
      limitMinC: spec.limitMinC,
      limitMaxC: spec.limitMaxC,
      pressureMbar: Number((spec.basePressureMbar + pressureShift).toFixed(1)),
      status,
      refractoryRisk,
      axisNorm: spec.axisNorm,
    };
  });

  const anomalySensors = sensors.filter((s) => s.status === 'ANOMALY');
  const warningSensors = sensors.filter((s) => s.status === 'WARNING');

  const overallStatus: ProcessStatus =
    anomalySensors.length > 0
      ? 'ANOMALY'
      : warningSensors.length > 0
        ? 'WARNING'
        : 'NORMAL';

  const affectedZones = [...anomalySensors, ...warningSensors].map((s) => s.zoneId);

  // Locate peak hotspot along kiln axis for 3D thermal anomaly visualization
  let peakSensor = sensors[3]; // Burning zone default
  let maxExcessRatio = -Infinity;
  for (const s of sensors) {
    const excessRatio = (s.temperatureC - s.limitMaxC) / Math.max(20, s.limitMaxC - s.limitMinC);
    if (excessRatio > maxExcessRatio) {
      maxExcessRatio = excessRatio;
      peakSensor = s;
    }
  }

  const hotspotIntensity = clamp(0.22 + Math.max(0, maxExcessRatio) * 1.15, 0.15, 1);
  const refractoryAlert = sensors.some(
    (s) => s.refractoryRisk === 'HIGH' || (s.zoneId === 'transition' && s.refractoryRisk === 'ELEVATED'),
  );

  const thermalLoadIndex = Math.round(
    clamp(
      62 + fuelDelta * 14 - feedDelta * 0.22 + airDelta * 0.08 + anomalySensors.length * 10 + warningSensors.length * 5,
      24,
      98,
    ),
  );

  const o2ExhaustPct = Number(clamp(2.8 - fuelDelta * 0.55 + feedDelta * 0.012, 0.8, 5.4).toFixed(1));
  const driveTorquePct = Math.round(clamp(64 + feedDelta * 0.32 - speedDelta * 9 + fuelDelta * 2.5, 38, 96));

  const contributingFactors: string[] = [];
  if (fuelDelta > 0.3) {
    contributingFactors.push(`Elevated main burner fuel input (+${fuelDelta.toFixed(1)} t/h above nominal).`);
  } else if (fuelDelta < -0.3) {
    contributingFactors.push(`Reduced main burner thermal input (${fuelDelta.toFixed(1)} t/h vs. nominal).`);
  }
  if (speedDelta < -0.15) {
    contributingFactors.push(`Slower kiln rotation (${inputs.kilnSpeedRpm.toFixed(1)} rpm) lengthening bed residence time.`);
  } else if (speedDelta > 0.2) {
    contributingFactors.push(`Increased kiln rotation (${inputs.kilnSpeedRpm.toFixed(1)} rpm) shifting thermal profile downstream.`);
  }
  if (airDelta > 30) {
    contributingFactors.push(`High secondary air recuperation temperature (${inputs.secondaryAirTempC} °C) concentrating flame intensity.`);
  }
  if ((shellOffsetC.transition ?? 0) > 20 || (shellOffsetC.burning ?? 0) > 20) {
    contributingFactors.push('Persistent shell scanner deviation suggests localized coating loss or refractory brick wear.');
  }
  if (contributingFactors.length === 0) {
    contributingFactors.push('All primary thermal inputs and axial temperature profiles remain within configured bounds.');
  }

  const recommendations: string[] = [];
  if (overallStatus === 'ANOMALY') {
    recommendations.push(
      `Inspect ${peakSensor.name} (${peakSensor.locationLabel}) with external shell thermography for possible refractory brick thinning.`,
    );
    recommendations.push(
      `Trim main burner fuel feed by 0.4–0.6 t/h and stabilize rotation near 3.4 rpm to lower shell heat flux.`,
    );
    recommendations.push('Log incident ticket for Supervisor review and compare against previous shift shell scans.');
  } else if (overallStatus === 'WARNING') {
    recommendations.push(
      `Monitor ${peakSensor.name} (${peakSensor.temperatureC} °C vs. ${peakSensor.limitMaxC} °C ceiling) over the next 20 minutes.`,
    );
    recommendations.push('Verify tertiary and secondary air damper balance to keep flame envelope centered.');
  } else {
    recommendations.push('Maintain current fuel-to-feed ratio and standard shell scanner sweep cadence.');
    recommendations.push('Continue Auto Pilot monitoring for early coating or flame drift.');
  }

  const refractorySummary = refractoryAlert
    ? `Localized thermal rise detected near ${peakSensor.name} (${peakSensor.positionMeters}m). Possible refractory-brick deterioration or protective coating washout — schedule visual/IR verification.`
    : 'Shell temperature distribution remains uniform with no persistent hotspot indicating brick deterioration.';

  const warningSuffix =
    warningSensors.length > 0
      ? ` Plus ${warningSensors.length} warning zone (${warningSensors.map((s) => `${s.name} ${s.temperatureC} °C`).join(', ')}).`
      : '';

  const explanation =
    overallStatus === 'ANOMALY'
      ? `${anomalySensors.length} monitored kiln zone${anomalySensors.length > 1 ? 's' : ''} exceeded upper operating limits (${anomalySensors.map((s) => `${s.name} ${s.temperatureC} °C`).join(', ')}).${warningSuffix} Immediate thermal review advised.`
      : overallStatus === 'WARNING'
        ? `${warningSensors.length} zone${warningSensors.length > 1 ? 's' : ''} operating above nominal envelope (${warningSensors.map((s) => `${s.name} ${s.temperatureC} °C`).join(', ')}). Preventive trim recommended.`
        : 'All five monitored rotary kiln sections operate cleanly within configured thermal limits.';

  return {
    processId: processId ?? (mode === 'simulation' ? 'SIM-LIVE' : 'AP-2410'),
    timestamp: mode === 'simulation' ? 'Scenario Evaluated' : 'Live Cycle · 14:22 UTC',
    mode,
    overallStatus,
    thermalLoadIndex,
    affectedZones,
    hotspotAxisNorm: peakSensor.axisNorm,
    hotspotIntensity,
    refractoryAlert,
    refractorySummary,
    explanation,
    contributingFactors,
    recommendations,
    sensors,
    o2ExhaustPct,
    driveTorquePct,
  };
}

export function runKilnSimulation(
  modifiedInputs: KilnProcessInputs,
  simulationCounter = 1,
): KilnAssessment {
  return evaluateKilnState({
    inputs: modifiedInputs,
    mode: 'simulation',
    processId: `SIM-${String(2410 + simulationCounter)}`,
  });
}
