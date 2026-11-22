import { SHELL_SAFETY_LIMIT_C, type KilnInputParams } from '../utils/kilnSimulation';

export type OperatingRegime = 'NORMAL' | 'STARTUP' | 'SHUTDOWN' | 'TRANSITIONAL';

export interface ThermalKpiSnapshot {
  specificThermalEnergyKcalKg: number;
  specificThermalEnergyMjT: number;
  mainBurnerFuelNm3h: number;
  precalcinerFuelNm3h: number;
  totalFuelNm3h: number;
  alternativeFuelRatioPct: number;
  naturalGasRatioPct: number;
  tertiaryAirTempC: number;
  tertiaryAirDamperPct: number;
  combustionStabilityIndex: number;
  alternativeFuelReadinessNote: string;
}

export interface ElectricalKpiSnapshot {
  specificElectricalKwhT: number;
  workshopTotalPowerKw: number;
  mainExhaustFansKw: number;
  exhaustFanSpeedRpm: number;
  coolerFansV1V10Kw: number;
  kilnMainDriveKw: number;
  kilnMainDriveCurrentA: number;
  auxiliaryFansKw: number;
  optimizationOpportunityNote: string;
}

export interface StabilityStat {
  id: string;
  variable: string;
  unit: string;
  currentValue: number;
  mean: number;
  stdDev: number;
  variance: number;
  trend: 'rising' | 'falling' | 'stable';
  stabilityIndex: number; // 0 - 100
  targetBand: string;
  category: 'Action' | 'State';
}

export interface PredictivePoint {
  minuteOffset: number; // -60 to +60
  label: string;
  measured: number | null;
  predicted: number | null;
  labSample?: number | null;
}

export interface PredictiveMetricSeries {
  id:
    | 'shell_temp'
    | 'free_lime'
    | 'precalciner_temp'
    | 'inlet_o2'
    | 'draft_pressure'
    | 'fuel_flow'
    | 'electrical_kwh'
    | 'clinker_tph';
  label: string;
  unit: string;
  limitValue?: number;
  limitLabel?: string;
  residenceLagNote: string;
  softSensorUsed: boolean;
  points: PredictivePoint[];
}

export type SensorHealthState = 'Nominal' | 'Warning' | 'Flagged' | 'Offline';
export type DiagnosticFaultClass = 'NOMINAL' | 'PROCESS_ANOMALY' | 'SENSOR_FAULT';

export interface SensorDiagnosticItem {
  id: string;
  tag: string;
  name: string;
  parameter: string;
  zone: string;
  valueDisplay: string;
  configuredLimit: string;
  state: SensorHealthState;
  faultClass: DiagnosticFaultClass;
  availabilityPct: number;
  missingDataPct: number;
  driftPer24h: string;
  commStatus: 'OPC-UA Sim OK' | 'Intermittent Poll' | 'Calibration Flag';
  freshnessSeconds: number;
  analyzerReliabilityPct: number;
  syncOffsetMs: number;
  diagnosticExplanation: string;
  operatorGuidance: string;
}

export function computeStabilityStats(
  values: readonly number[],
  nominalSpread: number
): {
  mean: number;
  stdDev: number;
  variance: number;
  trend: 'rising' | 'falling' | 'stable';
  stabilityIndex: number;
} {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, variance: 0, trend: 'stable', stabilityIndex: 100 };
  }
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const half = Math.max(1, Math.floor(values.length / 2));
  const firstHalfMean = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondHalf = values.slice(half);
  const secondHalfMean =
    secondHalf.length > 0
      ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
      : firstHalfMean;

  const delta = secondHalfMean - firstHalfMean;
  const trendThreshold = Math.max(0.02, nominalSpread * 0.25);
  const trend: 'rising' | 'falling' | 'stable' =
    delta > trendThreshold ? 'rising' : delta < -trendThreshold ? 'falling' : 'stable';

  const ratio = nominalSpread > 0 ? stdDev / nominalSpread : 0;
  const stabilityIndex = Math.max(25, Math.min(99, Math.round(100 - ratio * 22)));

  return {
    mean: Number(mean.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    variance: Number(variance.toFixed(3)),
    trend,
    stabilityIndex,
  };
}

export function computeThermalKpis(
  params: KilnInputParams,
  regime: OperatingRegime = 'NORMAL'
): ThermalKpiSnapshot {
  const regimeFactor =
    regime === 'STARTUP' ? 1.12 : regime === 'SHUTDOWN' ? 0.78 : regime === 'TRANSITIONAL' ? 1.06 : 1.0;

  // Derived demonstration figures consistent with SCAEK dry-process order of magnitude
  const mainBurnerFuelNm3h = Math.round(4950 * (params.fuelFlowPct / 82) * regimeFactor);
  const precalcinerFuelNm3h = Math.round(7400 * (params.feedRateTph / 245) * regimeFactor);
  const totalFuelNm3h = mainBurnerFuelNm3h + precalcinerFuelNm3h;

  const clinkerTph = Math.max(85, params.feedRateTph * 0.58);
  const specificThermalEnergyKcalKg = Math.round(
    755 + (params.fuelFlowPct - 82) * 3.8 + (regime === 'TRANSITIONAL' ? 28 : regime === 'STARTUP' ? 65 : 0)
  );
  const specificThermalEnergyMjT = Math.round(specificThermalEnergyKcalKg * 4.184);

  const combustionPenalty =
    Math.max(0, params.shellMaxTemp - SHELL_SAFETY_LIMIT_C) * 0.5 +
    Math.max(0, params.draftPressureMbar - -1.45) * 18 +
    (regime === 'NORMAL' ? 0 : 12);
  const combustionStabilityIndex = Math.max(48, Math.min(97, Math.round(93 - combustionPenalty)));

  // Higher combustion stability supports safer controlled alternative fuel substitution
  const alternativeFuelRatioPct = Number(
    Math.max(0, Math.min(18, (combustionStabilityIndex - 58) * 0.35)).toFixed(1)
  );
  const naturalGasRatioPct = Number((100 - alternativeFuelRatioPct).toFixed(1));

  const tertiaryAirTempC = Math.round(
    835 + (params.coolerAirflowPct - 80) * 2.4 + (params.burningZoneTemp - 1450) * 0.55
  );
  const tertiaryAirDamperPct = Math.max(45, Math.min(92, Math.round(68 + (params.fuelFlowPct - 82) * 0.6)));

  const alternativeFuelReadinessNote =
    combustionStabilityIndex >= 82
      ? 'Combustion stability supports gradual, operator-supervised alternative fuel mixing ratio evaluation.'
      : 'Stabilize burning-zone combustion and tertiary air balance before increasing alternative fuel substitution.';

  return {
    specificThermalEnergyKcalKg,
    specificThermalEnergyMjT,
    mainBurnerFuelNm3h,
    precalcinerFuelNm3h,
    totalFuelNm3h,
    alternativeFuelRatioPct,
    naturalGasRatioPct,
    tertiaryAirTempC,
    tertiaryAirDamperPct,
    combustionStabilityIndex,
    alternativeFuelReadinessNote,
  };
}

export function computeElectricalKpis(
  params: KilnInputParams,
  regime: OperatingRegime = 'NORMAL'
): ElectricalKpiSnapshot {
  const regimeMult = regime === 'STARTUP' ? 1.09 : regime === 'SHUTDOWN' ? 0.68 : regime === 'TRANSITIONAL' ? 1.05 : 1.0;

  // Main exhaust ID fans (2 fans ~1,000 rpm preliminary note)
  const exhaustFanSpeedRpm = Math.round(
    (960 + Math.abs(params.draftPressureMbar + 1.5) * 95 + (params.fuelFlowPct - 82) * 3.5) * regimeMult
  );
  const mainExhaustFansKw = Math.round(1420 * Math.pow(exhaustFanSpeedRpm / 1000, 2.3));

  // Grate cooler fans V1-V10
  const coolerFansV1V10Kw = Math.round(1080 * Math.pow(params.coolerAirflowPct / 85, 1.9) * regimeMult);

  // Kiln main drive (torque increases with feed/ringing)
  const kilnMainDriveCurrentA = Math.round(
    188 + (params.feedRateTph - 245) * 1.1 + Math.max(0, params.shellMaxTemp - 360) * 0.45
  );
  const kilnMainDriveKw = Math.round(kilnMainDriveCurrentA * 3.05);

  const auxiliaryFansKw = Math.round(310 * regimeMult);
  const workshopTotalPowerKw = mainExhaustFansKw + coolerFansV1V10Kw + kilnMainDriveKw + auxiliaryFansKw;
  const clinkerTph = Math.max(85, params.feedRateTph * 0.58);
  const specificElectricalKwhT = Number((workshopTotalPowerKw / clinkerTph).toFixed(1));

  const optimizationOpportunityNote =
    mainExhaustFansKw > 1550
      ? 'ID fan specific draw elevated: verify false-air infiltration and cyclone pressure drops before increasing fan RPM.'
      : coolerFansV1V10Kw > 1180
      ? 'Cooler V1–V10 fan draw high: rebalance under-grate zones to protect secondary/tertiary air heat recovery.'
      : 'Workshop electrical load balanced across ID fans, grate cooler V1–V10, and kiln main drive.';

  return {
    specificElectricalKwhT,
    workshopTotalPowerKw,
    mainExhaustFansKw,
    exhaustFanSpeedRpm,
    coolerFansV1V10Kw,
    kilnMainDriveKw,
    kilnMainDriveCurrentA,
    auxiliaryFansKw,
    optimizationOpportunityNote,
  };
}

export function computeProcessStabilityBoard(
  params: KilnInputParams,
  regime: OperatingRegime = 'NORMAL'
): StabilityStat[] {
  const thermal = computeThermalKpis(params, regime);
  const jitterScale =
    regime === 'NORMAL' ? 1.0 : regime === 'TRANSITIONAL' ? 1.85 : regime === 'STARTUP' ? 2.2 : 1.9;

  const mkSeries = (base: number, amp: number, drift: number) => [
    base - drift * 0.8 - amp * 0.5 * jitterScale,
    base - drift * 0.5 + amp * 0.6 * jitterScale,
    base - drift * 0.2 - amp * 0.4 * jitterScale,
    base + drift * 0.1 + amp * 0.7 * jitterScale,
    base + drift * 0.4 - amp * 0.3 * jitterScale,
    base + drift * 0.7 + amp * 0.2 * jitterScale,
  ];

  const rows: Array<{
    id: string;
    variable: string;
    unit: string;
    currentValue: number;
    series: number[];
    nominalSpread: number;
    targetBand: string;
    category: 'Action' | 'State';
  }> = [
    {
      id: 'feed',
      variable: 'Raw Meal Feed Rate',
      unit: 't/h',
      currentValue: params.feedRateTph,
      series: mkSeries(params.feedRateTph, 2.2, regime === 'TRANSITIONAL' ? 4.5 : 0.8),
      nominalSpread: 3.5,
      targetBand: '230 — 260 t/h (Pending validation)',
      category: 'Action',
    },
    {
      id: 'burner_fuel',
      variable: 'Main Burner CH₄ Flow',
      unit: 'Nm³/h',
      currentValue: thermal.mainBurnerFuelNm3h,
      series: mkSeries(thermal.mainBurnerFuelNm3h, 95, params.fuelFlowPct > 88 ? 160 : 25),
      nominalSpread: 140,
      targetBand: '~5,000 Nm³/h nominal (Pending validation)',
      category: 'Action',
    },
    {
      id: 'calciner_fuel',
      variable: 'Precalciner Fuel Flow',
      unit: 'Nm³/h',
      currentValue: thermal.precalcinerFuelNm3h,
      series: mkSeries(thermal.precalcinerFuelNm3h, 120, regime === 'NORMAL' ? 30 : 210),
      nominalSpread: 180,
      targetBand: 'Balanced to 800–830 °C kiln inlet',
      category: 'Action',
    },
    {
      id: 'rpm',
      variable: 'Kiln Rotation Speed',
      unit: 'rpm',
      currentValue: params.rotationRpm,
      series: mkSeries(params.rotationRpm, 0.06, params.rotationRpm < 3.3 ? -0.14 : 0.02),
      nominalSpread: 0.12,
      targetBand: 'Variable · Note ref ~2.14 rpm / Demo 3.6 rpm',
      category: 'Action',
    },
    {
      id: 'draft',
      variable: 'Main Exhaust Fan Draft',
      unit: 'mbar',
      currentValue: params.draftPressureMbar,
      series: mkSeries(params.draftPressureMbar, 0.07, params.draftPressureMbar > -1.4 ? 0.22 : -0.02),
      nominalSpread: 0.14,
      targetBand: 'Negative hood pressure (-0.1 to -0.2 note / -1.9 demo)',
      category: 'Action',
    },
    {
      id: 'primary_air',
      variable: 'Primary Air Flow',
      unit: '%',
      currentValue: Math.round(11.5 + (params.fuelFlowPct - 82) * 0.12),
      series: mkSeries(11.5 + (params.fuelFlowPct - 82) * 0.12, 0.35, 0.15),
      nominalSpread: 0.7,
      targetBand: '10 — 13 % combustion air',
      category: 'Action',
    },
    {
      id: 'tertiary_air',
      variable: 'Tertiary Air Temperature',
      unit: '°C',
      currentValue: thermal.tertiaryAirTempC,
      series: mkSeries(thermal.tertiaryAirTempC, 9, regime === 'NORMAL' ? 4 : 18),
      nominalSpread: 14,
      targetBand: '810 — 890 °C',
      category: 'Action',
    },
    {
      id: 'cooler_air',
      variable: 'Cooler Fan Airflow (V1–V10)',
      unit: '%',
      currentValue: params.coolerAirflowPct,
      series: mkSeries(params.coolerAirflowPct, 1.8, params.coolerAirflowPct < 78 ? -3.2 : 0.5),
      nominalSpread: 2.8,
      targetBand: '80 — 92 %',
      category: 'Action',
    },
    {
      id: 'shell_peak',
      variable: 'Shell Max Temp (Ring B-04)',
      unit: '°C',
      currentValue: params.shellMaxTemp,
      series: mkSeries(params.shellMaxTemp, 4.5, params.shellMaxTemp > SHELL_SAFETY_LIMIT_C ? 14 : 1.5),
      nominalSpread: 8.0,
      targetBand: `Limit < ${SHELL_SAFETY_LIMIT_C} °C (Prototype)`,
      category: 'State',
    },
  ];

  return rows.map((row) => {
    const stats = computeStabilityStats(row.series, row.nominalSpread);
    return {
      id: row.id,
      variable: row.variable,
      unit: row.unit,
      currentValue: Number(row.currentValue.toFixed(2)),
      ...stats,
      targetBand: row.targetBand,
      category: row.category,
    };
  });
}

export function generatePredictiveSeries(
  params: KilnInputParams,
  regime: OperatingRegime = 'NORMAL'
): PredictiveMetricSeries[] {
  const thermal = computeThermalKpis(params, regime);
  const elec = computeElectricalKpis(params, regime);
  const clinkerBase = Number((params.feedRateTph * 0.58).toFixed(1));
  const offsets = [-60, -45, -30, -15, 0, 15, 30, 45, 60];

  const build = (
    base: number,
    pastSlope: number,
    futureDrift: number,
    wave: number,
    labSparse = false
  ): PredictivePoint[] =>
    offsets.map((m, idx) => {
      const label = m === 0 ? 'NOW' : m > 0 ? `+${m}m` : `${m}m`;
      const ripple = Math.sin(idx * 1.1) * wave;
      if (m < 0) {
        const val = Number((base + (m / 60) * pastSlope + ripple).toFixed(2));
        return {
          minuteOffset: m,
          label,
          measured: val,
          predicted: null,
          labSample: labSparse && (m === -60 || m === -30) ? Number((val + 0.08).toFixed(2)) : null,
        };
      }
      if (m === 0) {
        const val = Number(base.toFixed(2));
        return {
          minuteOffset: 0,
          label: 'NOW',
          measured: val,
          predicted: val,
          labSample: labSparse ? val : null,
        };
      }
      // Nonlinear residence-time response over 30-60 min horizon
      const frac = m / 60;
      const nonlinear = Math.pow(frac, 1.18);
      const pred = Number((base + nonlinear * futureDrift + ripple * 0.4).toFixed(2));
      return {
        minuteOffset: m,
        label,
        measured: null,
        predicted: pred,
        labSample: null,
      };
    });

  const shellDrift =
    params.shellMaxTemp > SHELL_SAFETY_LIMIT_C
      ? 14
      : params.shellMaxTemp >= 355
      ? 9
      : 2;

  const freeLimeNow = Number(
    Math.max(
      0.8,
      Math.min(3.6, 1.55 + (params.feedRateTph - 245) * 0.035 - (params.burningZoneTemp - 1450) * 0.014)
    ).toFixed(2)
  );
  const freeLimeDrift = params.feedRateTph > 252 ? 0.55 : -0.12;

  return [
    {
      id: 'shell_temp',
      label: 'Kiln Shell Peak (Ring B-04)',
      unit: '°C',
      limitValue: SHELL_SAFETY_LIMIT_C,
      limitLabel: 'Configured Limit 370 °C',
      residenceLagNote: 'Refractory thermal inertia & shell radiative lag (~20–40 min).',
      softSensorUsed: false,
      points: build(params.shellMaxTemp, shellDrift * 0.8, shellDrift, 1.8),
    },
    {
      id: 'free_lime',
      label: 'Clinker Free Lime (Soft Sensor)',
      unit: '%',
      limitValue: 2.5,
      limitLabel: 'Target < 2.5 %',
      residenceLagNote: '30–60 min material residence-time lag between burner/feed actions and cooler lab sampling.',
      softSensorUsed: true,
      points: build(freeLimeNow, 0.18, freeLimeDrift, 0.06, true),
    },
    {
      id: 'precalciner_temp',
      label: 'Precalciner Temperature',
      unit: '°C',
      limitValue: 890,
      limitLabel: 'Operating Envelope ~850–890 °C',
      residenceLagNote: 'Tightly coupled with tertiary air temperature & precalciner fuel flow.',
      softSensorUsed: false,
      points: build(862 + (params.fuelFlowPct - 82) * 1.4, 6, 8, 2.5),
    },
    {
      id: 'inlet_o2',
      label: 'Kiln Inlet Gas O₂',
      unit: '%',
      limitValue: 1.5,
      limitLabel: 'Min Safe Excess O₂ (1.5 %)',
      residenceLagNote: 'Coupled to ID exhaust draft and combustion excess-air balance.',
      softSensorUsed: false,
      points: build(
        Number(Math.max(1.2, 2.8 + (params.draftPressureMbar + 1.9) * 1.1).toFixed(2)),
        -0.25,
        params.draftPressureMbar > -1.4 ? -0.45 : 0.08,
        0.09
      ),
    },
    {
      id: 'draft_pressure',
      label: 'Kiln Hood Draft Pressure',
      unit: 'mbar',
      limitValue: -0.2,
      limitLabel: 'Maintain Negative Draft',
      residenceLagNote: 'Fast aerodynamic coupling between ID fans and cooler grate air.',
      softSensorUsed: false,
      points: build(params.draftPressureMbar, 0.12, params.draftPressureMbar > -1.4 ? 0.25 : -0.04, 0.04),
    },
    {
      id: 'fuel_flow',
      label: 'Total Fuel Flow (CH₄ / AF eq.)',
      unit: 'Nm³/h',
      limitValue: 13500,
      limitLabel: 'Note Ref ~13,500 Nm³/h',
      residenceLagNote: 'Thermal demand tracks feed rate and preheater heat recovery.',
      softSensorUsed: false,
      points: build(thermal.totalFuelNm3h, 180, regime === 'NORMAL' ? 90 : 320, 45),
    },
    {
      id: 'electrical_kwh',
      label: 'Workshop Specific Electrical Energy',
      unit: 'kWh/t',
      limitValue: 26,
      limitLabel: 'Reference Target Band',
      residenceLagNote: 'Driven by ID exhaust fans (F403/F404), cooler V1–V10, and kiln main drive.',
      softSensorUsed: false,
      points: build(elec.specificElectricalKwhT, 0.4, elec.mainExhaustFansKw > 1550 ? 0.9 : -0.2, 0.15),
    },
    {
      id: 'clinker_tph',
      label: 'Estimated Clinker Output',
      unit: 't/h',
      residenceLagNote: 'Estimated from raw meal feed × ~0.58 flour-to-clinker factor (pending validation) with 45 min residence lag.',
      softSensorUsed: true,
      points: build(clinkerBase, 1.2, regime === 'NORMAL' ? 0.6 : -2.4, 0.45),
    },
  ];
}

/**
 * Preserved 3/6 Nominal — 3 Flagged demonstration System Health diagnostics.
 * Explicitly distinguishes genuine PROCESS ANOMALIES from SENSOR FAULTS.
 */
export const SYSTEM_HEALTH_SENSORS: readonly SensorDiagnosticItem[] = [
  {
    id: 'SNS-IR04',
    tag: 'TI-404-B04',
    name: 'Shell IR Scanner B-04',
    parameter: 'Kiln Shell Temperature (Meter 39–43)',
    zone: 'Shell Ring B-04',
    valueDisplay: '412 °C',
    configuredLimit: 'Limit < 370 °C (+42 °C)',
    state: 'Flagged',
    faultClass: 'PROCESS_ANOMALY',
    availabilityPct: 99.8,
    missingDataPct: 0.2,
    driftPer24h: '+0.1 °C/24h (Calibrated)',
    commStatus: 'OPC-UA Sim OK',
    freshnessSeconds: 2,
    analyzerReliabilityPct: 98.6,
    syncOffsetMs: 18,
    diagnosticExplanation:
      'PROCESS ANOMALY (Not a sensor fault): Optical scanner calibration, ambient reference, and adjacent zone readings are healthy. The 412 °C reading reflects a confirmed localized thermal hotspot exceeding the configured 370 °C limit.',
    operatorGuidance:
      'Treat as a genuine safety alarm. Verify with handheld IR pyrometer at meters 39–43 and review cooling fan deployment.',
  },
  {
    id: 'SNS-BZ01',
    tag: 'PYR-401-BZ',
    name: 'Burning Zone Pyrometer',
    parameter: 'Burning Zone Flame Core Temperature',
    zone: 'Burning Zone',
    valueDisplay: '1,486 °C',
    configuredLimit: '1,430 — 1,465 °C',
    state: 'Flagged',
    faultClass: 'PROCESS_ANOMALY',
    availabilityPct: 99.4,
    missingDataPct: 0.6,
    driftPer24h: '+0.4 °C/24h',
    commStatus: 'OPC-UA Sim OK',
    freshnessSeconds: 3,
    analyzerReliabilityPct: 96.2,
    syncOffsetMs: 24,
    diagnosticExplanation:
      'PROCESS ANOMALY: Signal lens purge is active and dust attenuation is normal. Reading correlates with elevated main burner fuel load and Ring B-04 heating.',
    operatorGuidance:
      'Monitor flame shape and secondary air recuperation; do not dismiss as lens fouling.',
  },
  {
    id: 'SNS-O206',
    tag: 'AI-406-O2DR',
    name: 'Kiln Hood Draft & O₂ Analyzer',
    parameter: 'Smoke Chamber O₂ & Hood Draft Pressure',
    zone: 'Calcination / Kiln Inlet',
    valueDisplay: '-1.10 mbar',
    configuredLimit: '-2.20 — -1.45 mbar',
    state: 'Flagged',
    faultClass: 'SENSOR_FAULT',
    availabilityPct: 91.2,
    missingDataPct: 8.8,
    driftPer24h: '+0.38 % O₂ zero-drift / 24h',
    commStatus: 'Calibration Flag',
    freshnessSeconds: 47,
    analyzerReliabilityPct: 71.4,
    syncOffsetMs: 410,
    diagnosticExplanation:
      'FAULTY SENSOR / ANALYZER DRIFT (Do NOT automatically treat as a process event): Probe blowback overdue, 8.8% missing packets, and 47 s stale timestamp. Zero-drift is skewing excess-air readings.',
    operatorGuidance:
      'Dispatch instrumentation technician for probe purge and span calibration before making fuel or ID fan adjustments based on this analyzer.',
  },
  {
    id: 'SNS-PR02',
    tag: 'TI-402-C4',
    name: 'Preheater Cyclone C4 Thermocouple',
    parameter: 'Stage 4 Twin-Branch Material Entry',
    zone: 'Preheater Tower',
    valueDisplay: '828 °C',
    configuredLimit: '~800 — 860 °C',
    state: 'Nominal',
    faultClass: 'NOMINAL',
    availabilityPct: 99.9,
    missingDataPct: 0.1,
    driftPer24h: '0.0 °C/24h',
    commStatus: 'OPC-UA Sim OK',
    freshnessSeconds: 1,
    analyzerReliabilityPct: 99.4,
    syncOffsetMs: 12,
    diagnosticExplanation:
      'Sensor healthy and synchronized. Thermocouple loop resistance and cold-junction compensation are nominal.',
    operatorGuidance: 'No maintenance action required.',
  },
  {
    id: 'SNS-TR05',
    tag: 'TI-405-TR',
    name: 'Transition Zone Shell Sensor',
    parameter: 'Transition Zone Thermal Profile',
    zone: 'Transition Zone',
    valueDisplay: '312 °C',
    configuredLimit: 'Limit < 370 °C',
    state: 'Nominal',
    faultClass: 'NOMINAL',
    availabilityPct: 99.7,
    missingDataPct: 0.3,
    driftPer24h: '+0.1 °C/24h',
    commStatus: 'OPC-UA Sim OK',
    freshnessSeconds: 2,
    analyzerReliabilityPct: 99.1,
    syncOffsetMs: 16,
    diagnosticExplanation:
      'Signal steady and cross-verified with neighboring IR scanner bands.',
    operatorGuidance: 'No maintenance action required.',
  },
  {
    id: 'SNS-CL03',
    tag: 'TI-403-CL',
    name: 'Grate Cooler Discharge & Fans V1–V10',
    parameter: 'Clinker Discharge & Under-Grate Ventilation',
    zone: 'Grate Cooler',
    valueDisplay: '138 °C',
    configuredLimit: '105 — 148 °C',
    state: 'Nominal',
    faultClass: 'NOMINAL',
    availabilityPct: 99.6,
    missingDataPct: 0.4,
    driftPer24h: '0.0 °C/24h',
    commStatus: 'OPC-UA Sim OK',
    freshnessSeconds: 2,
    analyzerReliabilityPct: 98.8,
    syncOffsetMs: 19,
    diagnosticExplanation:
      'Cooler discharge thermocouple and V1–V10 fan feedback telemetry synchronized.',
    operatorGuidance: 'Continue routine under-grate pressure monitoring.',
  },
] as const;
