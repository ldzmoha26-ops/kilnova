export type KilnCondition = 'NORMAL' | 'WARNING' | 'ANOMALY';
export type AssessmentStatus = KilnCondition;
export type OperatingMode = 'AUTO_PILOT' | 'MANUAL_SIMULATION';
export type KilnZoneId = 'feed' | 'calcination' | 'transition' | 'burning' | 'cooler';

export interface KilnZoneTelemetry {
  id: KilnZoneId;
  name: string;
  temperatureC: number;
  shellTempC?: number;
  meterRange?: string;
  summary?: string;
  status: AssessmentStatus;
  normalRange: string;
  note: string;
}

/**
 * Configured KILNOVA / SCAEK prototype maximum shell temperature safety threshold.
 * Subject to formal validation by the plant engineering and safety team.
 */
export const SHELL_SAFETY_LIMIT_C = 370;
export const SHELL_WARNING_THRESHOLD_C = 355;
export const SHELL_EMERGENCY_THRESHOLD_C = 400;

export type ShellSafetyLevel = 'NORMAL' | 'APPROACHING_LIMIT' | 'AT_THRESHOLD' | 'CRITICAL' | 'EMERGENCY';

export interface ShellThresholdAssessment {
  temperatureC: number;
  limitC: number;
  deviationC: number;
  level: ShellSafetyLevel;
  isExceeded: boolean;
  isEmergency: boolean;
  badgeText: string;
  message: string;
  disclaimer: string;
}

export function classifyShellTemperature(temperatureC: number): ShellThresholdAssessment {
  const rounded = Math.round(temperatureC);
  const deviationC = rounded - SHELL_SAFETY_LIMIT_C;
  const disclaimer =
    'Configured KILNOVA/SCAEK prototype safety threshold (370 °C), subject to validation by plant engineering and safety teams.';

  if (rounded >= SHELL_EMERGENCY_THRESHOLD_C) {
    return {
      temperatureC: rounded,
      limitC: SHELL_SAFETY_LIMIT_C,
      deviationC,
      level: 'EMERGENCY',
      isExceeded: true,
      isEmergency: true,
      badgeText: 'CRITICAL SAFETY ALARM · EMERGENCY',
      message: `Shell temperature ${rounded} °C exceeds configured 370 °C threshold by +${deviationC} °C. Immediate thermal inspection and refractory protection check required.`,
      disclaimer,
    };
  }
  if (rounded > SHELL_SAFETY_LIMIT_C) {
    return {
      temperatureC: rounded,
      limitC: SHELL_SAFETY_LIMIT_C,
      deviationC,
      level: 'CRITICAL',
      isExceeded: true,
      isEmergency: false,
      badgeText: 'CRITICAL SAFETY ALARM',
      message: `Shell temperature ${rounded} °C exceeds configured 370 °C threshold by +${deviationC} °C.`,
      disclaimer,
    };
  }
  if (rounded === SHELL_SAFETY_LIMIT_C) {
    return {
      temperatureC: rounded,
      limitC: SHELL_SAFETY_LIMIT_C,
      deviationC: 0,
      level: 'AT_THRESHOLD',
      isExceeded: false,
      isEmergency: false,
      badgeText: 'AT SAFETY THRESHOLD',
      message: `Shell temperature ${rounded} °C is directly at the configured 370 °C limit (0 °C margin).`,
      disclaimer,
    };
  }
  if (rounded >= SHELL_WARNING_THRESHOLD_C) {
    return {
      temperatureC: rounded,
      limitC: SHELL_SAFETY_LIMIT_C,
      deviationC,
      level: 'APPROACHING_LIMIT',
      isExceeded: false,
      isEmergency: false,
      badgeText: 'WARNING · APPROACHING LIMIT',
      message: `Shell temperature ${rounded} °C is approaching the configured 370 °C threshold (${deviationC} °C margin).`,
      disclaimer,
    };
  }
  return {
    temperatureC: rounded,
    limitC: SHELL_SAFETY_LIMIT_C,
    deviationC,
    level: 'NORMAL',
    isExceeded: false,
    isEmergency: false,
    badgeText: 'NOMINAL · BELOW LIMIT',
    message: `Shell temperature ${rounded} °C is within the configured < 370 °C envelope (${Math.abs(deviationC)} °C safety margin).`,
    disclaimer,
  };
}

export interface KilnInputParams {
  burningZoneTemp: number; // °C (nominal 1430 - 1465)
  shellMaxTemp: number; // °C (configured prototype limit < 370 °C)
  rotationRpm: number; // RPM (preliminary note ~2.14 rpm variable; demo 3.2 - 4.0)
  feedRateTph: number; // t/h (preliminary note 230 - 260 t/h)
  fuelFlowPct: number; // % of nominal burner capacity
  draftPressureMbar: number; // mbar (negative draft, e.g. -0.15 to -2.2)
  coolerAirflowPct: number; // %
}

export interface SensorReading {
  id: string;
  name: string;
  zone: 'Preheater' | 'Calcination' | 'Transition' | 'Burning Zone' | 'Shell Ring B-04' | 'Cooler';
  value: number;
  unit: string;
  normalRange: string;
  status: KilnCondition;
  anchorPosition: [number, number, number];
  signalNote: string;
}

export interface DiagnosticReport {
  id: string;
  timestamp: string;
  condition: KilnCondition;
  headline: string;
  affectedZone: string;
  thermalStabilityPct: number;
  energyEfficiencyPct: number;
  probableCauses: string[];
  recommendedActions: string[];
  shellAssessment: ShellThresholdAssessment;
  summary: string;
}

export interface ProcessHistoryRecord {
  id: string;
  timestamp: string;
  mode: OperatingMode;
  condition: KilnCondition;
  burningZoneTemp: number;
  shellMaxTemp: number;
  affectedZone: string;
  operatorNote: string;
  summary: string;
  probableCause: string;
  actionTaken: string;
}

export interface AutoPilotPreset {
  id: 'nominal' | 'warning' | 'anomaly';
  label: string;
  shortDesc: string;
  params: KilnInputParams;
}

export const AUTO_PILOT_PRESETS: readonly AutoPilotPreset[] = [
  {
    id: 'nominal',
    label: 'Steady Clinkerization',
    shortDesc: 'Balanced flame, uniform coating, shell peak 318 °C (< 370 °C limit).',
    params: {
      burningZoneTemp: 1450,
      shellMaxTemp: 318,
      rotationRpm: 3.6,
      feedRateTph: 245,
      fuelFlowPct: 82,
      draftPressureMbar: -1.9,
      coolerAirflowPct: 85,
    },
  },
  {
    id: 'warning',
    label: 'Transition Thermal Drift',
    shortDesc: 'Elevated shell reading at 365 °C — approaching 370 °C threshold.',
    params: {
      burningZoneTemp: 1474,
      shellMaxTemp: 365,
      rotationRpm: 3.4,
      feedRateTph: 256,
      fuelFlowPct: 91,
      draftPressureMbar: -1.35,
      coolerAirflowPct: 76,
    },
  },
  {
    id: 'anomaly',
    label: 'Ring B-04 Shell Hotspot',
    shortDesc: 'Demonstration anomaly at 412 °C (+42 °C over 370 °C limit) · Meter 39–43.',
    params: {
      burningZoneTemp: 1486,
      shellMaxTemp: 412,
      rotationRpm: 3.1,
      feedRateTph: 260,
      fuelFlowPct: 96,
      draftPressureMbar: -1.1,
      coolerAirflowPct: 71,
    },
  },
] as const;

export function evaluateKilnState(
  params: KilnInputParams,
  mode: OperatingMode = 'AUTO_PILOT'
): {
  condition: KilnCondition;
  sensors: SensorReading[];
  report: DiagnosticReport;
} {
  const shellAssessment = classifyShellTemperature(params.shellMaxTemp);
  const burningExcess = Math.max(0, params.burningZoneTemp - 1465);
  const shellExcess = Math.max(0, params.shellMaxTemp - SHELL_SAFETY_LIMIT_C);
  const draftWeakness = Math.max(0, params.draftPressureMbar - -1.4);
  const rpmDeviation = Math.abs(params.rotationRpm - 3.6);

  let condition: KilnCondition = 'NORMAL';
  if (
    params.shellMaxTemp > SHELL_SAFETY_LIMIT_C ||
    params.burningZoneTemp >= 1495 ||
    params.draftPressureMbar >= -0.95
  ) {
    condition = 'ANOMALY';
  } else if (
    params.shellMaxTemp >= SHELL_WARNING_THRESHOLD_C ||
    params.burningZoneTemp >= 1470 ||
    params.draftPressureMbar >= -1.4 ||
    params.coolerAirflowPct < 78
  ) {
    condition = 'WARNING';
  }

  const shellStatus: KilnCondition =
    params.shellMaxTemp > SHELL_SAFETY_LIMIT_C
      ? 'ANOMALY'
      : params.shellMaxTemp >= SHELL_WARNING_THRESHOLD_C
      ? 'WARNING'
      : 'NORMAL';

  const burningStatus: KilnCondition =
    params.burningZoneTemp >= 1495
      ? 'ANOMALY'
      : params.burningZoneTemp >= 1470
      ? 'WARNING'
      : 'NORMAL';

  const draftStatus: KilnCondition =
    params.draftPressureMbar >= -0.95
      ? 'ANOMALY'
      : params.draftPressureMbar >= -1.4
      ? 'WARNING'
      : 'NORMAL';

  const coolerTemp = Math.round(
    118 + (100 - params.coolerAirflowPct) * 2.1 + burningExcess * 0.45
  );
  const coolerStatus: KilnCondition =
    coolerTemp >= 185 ? 'ANOMALY' : coolerTemp >= 152 ? 'WARNING' : 'NORMAL';

  const preheaterTemp = Math.round(825 + (params.fuelFlowPct - 82) * 3.2 - draftWeakness * 18);
  const preheaterStatus: KilnCondition =
    preheaterTemp >= 895 ? 'ANOMALY' : preheaterTemp >= 868 ? 'WARNING' : 'NORMAL';

  const transitionTemp = Math.round(
    1190 + (params.shellMaxTemp - 318) * 1.15 + (params.feedRateTph - 245) * 0.65
  );
  const transitionStatus: KilnCondition =
    transitionTemp >= 1295 ? 'ANOMALY' : transitionTemp >= 1245 ? 'WARNING' : 'NORMAL';

  const sensors: SensorReading[] = [
    {
      id: 'SNS-IR04',
      name: 'Shell IR Scanner B-04',
      zone: 'Shell Ring B-04',
      value: Math.round(params.shellMaxTemp),
      unit: '°C',
      normalRange: `Limit < ${SHELL_SAFETY_LIMIT_C} °C`,
      status: shellStatus,
      anchorPosition: [1.55, 1.32, 0.3],
      signalNote:
        shellStatus === 'ANOMALY'
          ? `CRITICAL: +${Math.round(params.shellMaxTemp - SHELL_SAFETY_LIMIT_C)} °C over configured 370 °C limit (Meter 39–43)`
          : shellStatus === 'WARNING'
          ? `Approaching 370 °C limit (${Math.round(params.shellMaxTemp - SHELL_SAFETY_LIMIT_C)} °C margin)`
          : `Nominal (< ${SHELL_SAFETY_LIMIT_C} °C configured limit)`,
    },
    {
      id: 'SNS-BZ01',
      name: 'Burning Zone Pyrometer',
      zone: 'Burning Zone',
      value: Math.round(params.burningZoneTemp),
      unit: '°C',
      normalRange: '1,430 — 1,465 °C',
      status: burningStatus,
      anchorPosition: [2.55, 1.28, -0.1],
      signalNote:
        burningStatus === 'NORMAL'
          ? 'Optical flame focus centered'
          : 'Peak flame core shifted toward refractory lining',
    },
    {
      id: 'SNS-PR02',
      name: 'Preheater Cyclone C4',
      zone: 'Preheater',
      value: preheaterTemp,
      unit: '°C',
      normalRange: '800 — 860 °C',
      status: preheaterStatus,
      anchorPosition: [-3.95, 2.25, 0],
      signalNote:
        preheaterStatus === 'NORMAL'
          ? 'Twin-branch suspension flow stable'
          : 'Elevated exhaust heat carryover',
    },
    {
      id: 'SNS-TR05',
      name: 'Transition Zone Thermocouple',
      zone: 'Transition',
      value: transitionTemp,
      unit: '°C',
      normalRange: '1,160 — 1,240 °C',
      status: transitionStatus,
      anchorPosition: [0.1, 1.36, 0.2],
      signalNote:
        transitionStatus === 'NORMAL'
          ? 'Coating adhesion balanced'
          : 'Thermal stress rising along transition bricks',
    },
    {
      id: 'SNS-CL03',
      name: 'Grate Cooler Discharge',
      zone: 'Cooler',
      value: coolerTemp,
      unit: '°C',
      normalRange: '105 — 148 °C',
      status: coolerStatus,
      anchorPosition: [4.25, 0.95, 0.25],
      signalNote:
        coolerStatus === 'NORMAL'
          ? 'Fans V1–V10 secondary air recovery nominal'
          : 'Reduced quenching margin at grate discharge',
    },
    {
      id: 'SNS-O206',
      name: 'Kiln Hood Draft & O₂ Sensor',
      zone: 'Calcination',
      value: Number(params.draftPressureMbar.toFixed(2)),
      unit: 'mbar',
      normalRange: '-2.20 — -1.45 mbar',
      status: draftStatus,
      anchorPosition: [-2.05, 1.44, -0.2],
      signalNote:
        draftStatus === 'NORMAL'
          ? 'Negative draft steady across ID fans'
          : 'Draft degradation + analyzer zero-drift flagged',
    },
  ];

  const thermalStabilityPct = Math.max(
    42,
    Math.min(
      99,
      Math.round(97 - shellExcess * 0.72 - burningExcess * 0.55 - draftWeakness * 14 - rpmDeviation * 6)
    )
  );

  const energyEfficiencyPct = Math.max(
    61,
    Math.min(
      96,
      Math.round(
        93 - Math.abs(params.fuelFlowPct - 82) * 0.62 - Math.max(0, 85 - params.coolerAirflowPct) * 0.45
      )
    )
  );

  const affectedZone =
    shellStatus === 'ANOMALY'
      ? 'Shell Ring B-04 · Meter 39–43'
      : burningStatus !== 'NORMAL'
      ? 'Burning Zone · Meter 44–52'
      : draftStatus !== 'NORMAL'
      ? 'Kiln Inlet & Calcination · Meter 14–22'
      : 'All Zones Balanced';

  const probableCauses: string[] = [];
  const recommendedActions: string[] = [];

  if (shellStatus === 'ANOMALY') {
    probableCauses.push(
      `Localized refractory brick thinning or coating loss at Shell Ring B-04 (${Math.round(
        params.shellMaxTemp
      )} °C, +${Math.round(params.shellMaxTemp - SHELL_SAFETY_LIMIT_C)} °C above 370 °C limit).`
    );
    recommendedActions.push(
      'ADVISOR RECOMMENDATION (Requires Operator Validation): Deploy external shell cooling fans at meters 39–43 and consider reducing main burner gas flow by 3–5% while monitoring pyrometer stability.'
    );
  } else if (shellStatus === 'WARNING') {
    probableCauses.push(
      `Shell temperature (${Math.round(params.shellMaxTemp)} °C) approaching configured 370 °C limit due to gradual coating thinning.`
    );
    recommendedActions.push(
      'ADVISOR RECOMMENDATION: Increase IR scanner sweep cadence on Ring B-04 and trim fuel excess before shell exceeds 370 °C.'
    );
  }

  if (burningStatus !== 'NORMAL') {
    probableCauses.push(
      `Main burner fuel load (${params.fuelFlowPct}%) elevating burning zone core to ${Math.round(
        params.burningZoneTemp
      )} °C.`
    );
    recommendedActions.push(
      'ADVISOR RECOMMENDATION: Verify primary air swirl / tertiary air balance to prevent localized flame impingement on refractory coating.'
    );
  }

  if (draftStatus !== 'NORMAL') {
    probableCauses.push(
      `Weakened kiln hood negative draft (${params.draftPressureMbar.toFixed(
        2
      )} mbar) reducing exhaust evacuation and increasing combustion instability.`
    );
    recommendedActions.push(
      'ADVISOR RECOMMENDATION: Inspect ID exhaust fans (F403/F404) damper position and cross-check smoke chamber O₂ analyzer calibration before adjusting draft.'
    );
  }

  if (coolerStatus !== 'NORMAL') {
    probableCauses.push(
      `Grate cooler airflow (${params.coolerAirflowPct}%) limiting clinker quenching and destabilizing secondary/tertiary air recuperation.`
    );
    recommendedActions.push(
      'ADVISOR RECOMMENDATION: Balance cooler fans V1–V10 under-grate pressure to restore secondary air temperature without excessive electrical draw.'
    );
  }

  if (probableCauses.length === 0) {
    probableCauses.push(
      'All monitored zones are operating inside the configured < 370 °C shell limit and steady clinkerization envelope.'
    );
    recommendedActions.push(
      'Maintain current feed-to-fuel ratio, monitor 30–60 min predictive stability trend, and verify next laboratory free-lime sample.'
    );
  }

  const headline =
    condition === 'ANOMALY'
      ? `CRITICAL THERMAL ALARM · ${affectedZone}`
      : condition === 'WARNING'
      ? `Thermal Drift Warning · ${affectedZone}`
      : 'Nominal Rotary Kiln Operation (< 370 °C Limit)';

  const summary =
    condition === 'ANOMALY'
      ? `${mode === 'AUTO_PILOT' ? 'Auto Pilot' : 'Manual Simulation'} flagged a critical shell violation at ${affectedZone} (${Math.round(
          params.shellMaxTemp
        )} °C vs configured 370 °C threshold, +${Math.round(
          params.shellMaxTemp - SHELL_SAFETY_LIMIT_C
        )} °C). Advisory guidance generated for human operator review.`
      : condition === 'WARNING'
      ? `Elevated thermal gradient approaching the 370 °C prototype threshold at ${affectedZone} (${Math.round(
          params.shellMaxTemp
        )} °C). Early preventive review advised.`
      : `Kiln thermal profile is balanced across preheater, burning zone (${Math.round(
          params.burningZoneTemp
        )} °C), shell (${Math.round(params.shellMaxTemp)} °C < 370 °C), and cooler.`;

  return {
    condition,
    sensors,
    report: {
      id: condition === 'ANOMALY' ? 'PRC-2048' : condition === 'WARNING' ? 'PRC-2047' : 'PRC-2046',
      timestamp: 'Demonstration Shift · 14:22 UTC',
      condition,
      headline,
      affectedZone,
      thermalStabilityPct,
      energyEfficiencyPct,
      probableCauses,
      recommendedActions,
      shellAssessment,
      summary,
    },
  };
}

/**
 * Preserved existing demonstration process history (Context A).
 * Explicitly marked as demonstration records, not live SCAEK plant measurements.
 */
export const INITIAL_PROCESS_HISTORY: readonly ProcessHistoryRecord[] = [
  {
    id: 'PRC-2048',
    timestamp: 'Today · 14:18 UTC',
    mode: 'AUTO_PILOT',
    condition: 'ANOMALY',
    burningZoneTemp: 1486,
    shellMaxTemp: 412,
    affectedZone: 'Shell Ring B-04 · Meter 39–43',
    operatorNote:
      'Demonstration anomaly: Shell IR Scanner B-04 recorded 412 °C (+42 °C over 370 °C limit).',
    summary:
      'Critical hotspot above configured 370 °C shell safety threshold with localized coating loss signature.',
    probableCause:
      'Localized refractory wear or detached protective coating combined with high burning-zone thermal flux.',
    actionTaken:
      'Advisory issued: deploy cooling blowers at meters 39–43, review main burner fuel trim, schedule ultrasonic refractory inspection.',
  },
  {
    id: 'PRC-2047',
    timestamp: 'Today · 11:45 UTC',
    mode: 'MANUAL_SIMULATION',
    condition: 'WARNING',
    burningZoneTemp: 1474,
    shellMaxTemp: 365,
    affectedZone: 'Transition Zone · Meter 34–39',
    operatorNote: 'Elevated feed-rate and fuel load simulation approaching 370 °C threshold.',
    summary:
      'Shell temperature climbed to 365 °C (-5 °C margin below 370 °C limit) under 91% burner flow.',
    probableCause:
      'High fuel input without proportional cooler airflow and tertiary air damper compensation.',
    actionTaken:
      'Operator reviewed simulation output and held live burner flow within nominal bounds.',
  },
  {
    id: 'PRC-2046',
    timestamp: 'Today · 08:30 UTC',
    mode: 'AUTO_PILOT',
    condition: 'NORMAL',
    burningZoneTemp: 1450,
    shellMaxTemp: 316,
    affectedZone: 'All Zones Balanced',
    operatorNote: 'Morning shift handover steady-state demonstration check.',
    summary:
      'Uniform axial temperature distribution with 54 °C margin below 370 °C shell limit and steady draft.',
    probableCause: 'Nominal operating envelope across all six monitored instrument channels.',
    actionTaken: 'No corrective intervention required; routine shift logging completed.',
  },
  {
    id: 'PRC-2045',
    timestamp: 'Yesterday · 21:10 UTC',
    mode: 'AUTO_PILOT',
    condition: 'WARNING',
    burningZoneTemp: 1468,
    shellMaxTemp: 358,
    affectedZone: 'Kiln Inlet & Hood Draft · Meter 14–22',
    operatorNote: 'Draft pressure drifted toward -1.32 mbar; O₂ analyzer calibration lag noted.',
    summary:
      'Negative hood draft weakened toward warning band alongside slight shell warming to 358 °C.',
    probableCause:
      'Cyclone pressure drop increase and partial ID fan inlet louver restriction.',
    actionTaken:
      'ID exhaust fan damper re-trimmed and O₂ analyzer zero-calibration scheduled.',
  },
  {
    id: 'PRC-2044',
    timestamp: 'Yesterday · 15:05 UTC',
    mode: 'MANUAL_SIMULATION',
    condition: 'NORMAL',
    burningZoneTemp: 1446,
    shellMaxTemp: 311,
    affectedZone: 'All Zones Balanced',
    operatorNote: 'Simulated 4% alternative fuel substitution stability test.',
    summary:
      'Simulated firing profile remained well below 370 °C shell threshold with stable calcination.',
    probableCause: 'Adequate tertiary air temperature and balanced grate cooler recuperation.',
    actionTaken: 'Reference scenario archived in demonstration log.',
  },
] as const;
