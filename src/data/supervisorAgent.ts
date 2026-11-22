import type { ProcessStatus } from './kilnEngine';

export interface ProcessHistoryRecord {
  id: string;
  timestamp: string;
  mode: 'Auto Pilot' | 'Manual Simulation';
  status: ProcessStatus;
  burningTempC: number;
  shellPeakC: number;
  kilnRpm: number;
  affectedZone: string;
  summary: string;
  findings: string;
  recommendations: string[];
}

export interface SupervisorSensorItem {
  id: string;
  name: string;
  zone: string;
  reading: string;
  limit: string;
  status: ProcessStatus;
  availability: 'ONLINE' | 'INTERMITTENT' | 'CALIBRATION DUE';
  note: string;
}

export interface AgentMessage {
  id: string;
  sender: 'supervisor' | 'assistant';
  text: string;
  timestamp: string;
  referencedIds?: string[];
}

export const PROCESS_HISTORY: readonly ProcessHistoryRecord[] = [
  {
    id: 'PRC-2410',
    timestamp: 'Today · 14:18',
    mode: 'Auto Pilot',
    status: 'ANOMALY',
    burningTempC: 1492,
    shellPeakC: 1368,
    kilnRpm: 3.3,
    affectedZone: 'Upper Transition (41m)',
    summary: 'Persistent shell temperature rise above operating ceiling.',
    findings:
      'Shell scanner ring SCN-04 recorded a sustained +33 °C excursion over 25 minutes alongside elevated burning-zone radiant flux. Pattern aligns with localized protective coating thinning or early refractory brick wear.',
    recommendations: [
      'Schedule targeted IR verification on kiln shell ring between 39m and 43m.',
      'Trim main burner fuel by 0.5 t/h and review flame momentum alignment.',
    ],
  },
  {
    id: 'SIM-2409',
    timestamp: 'Today · 13:45',
    mode: 'Manual Simulation',
    status: 'WARNING',
    burningTempC: 1478,
    shellPeakC: 1344,
    kilnRpm: 3.2,
    affectedZone: 'Burning Zone (54m)',
    summary: 'Fuel reduction scenario evaluated before shift ramp.',
    findings:
      'Simulated reduction of raw feed to 205 t/h at 9.7 t/h fuel elevated burning-zone temperatures slightly above the 1,470 °C upper bound.',
    recommendations: [
      'Pair any raw meal feed reduction with proportional burner fuel trim.',
    ],
  },
  {
    id: 'PRC-2408',
    timestamp: 'Today · 12:30',
    mode: 'Auto Pilot',
    status: 'WARNING',
    burningTempC: 1474,
    shellPeakC: 1342,
    kilnRpm: 3.4,
    affectedZone: 'Calcination Zone (22m)',
    summary: 'Secondary air temperature spike raised precalciner load.',
    findings:
      'Grate cooler recuperation air rose to 1,078 °C following a brief clinker bed surge, pushing calcination zone temperatures 12 °C above nominal.',
    recommendations: [
      'Balance tertiary air damper and hold cooler grate cadence steady.',
    ],
  },
  {
    id: 'PRC-2407',
    timestamp: 'Today · 10:15',
    mode: 'Auto Pilot',
    status: 'NORMAL',
    burningTempC: 1446,
    shellPeakC: 1292,
    kilnRpm: 3.4,
    affectedZone: 'All Zones Balanced',
    summary: 'Steady clinkerization corridor across all monitored sections.',
    findings:
      'All temperature, exhaust oxygen, and drive torque channels stayed centered inside target envelopes throughout the morning cycle.',
    recommendations: ['Continue standard Auto Pilot monitoring cadence.'],
  },
  {
    id: 'PRC-2406',
    timestamp: 'Today · 08:00',
    mode: 'Auto Pilot',
    status: 'NORMAL',
    burningTempC: 1442,
    shellPeakC: 1288,
    kilnRpm: 3.4,
    affectedZone: 'All Zones Balanced',
    summary: 'Shift handover verification completed cleanly.',
    findings: 'Stable thermal profile at handover with balanced exhaust draft.',
    recommendations: ['No intervention required.'],
  },
  {
    id: 'PRC-2405',
    timestamp: 'Yesterday · 22:40',
    mode: 'Auto Pilot',
    status: 'ANOMALY',
    burningTempC: 1496,
    shellPeakC: 1364,
    kilnRpm: 3.1,
    affectedZone: 'Upper Transition (41m)',
    summary: 'Recurring transition shell hotspot during night shift.',
    findings:
      'Similar localized heat elevation observed on SCN-04 during low-RPM feed adjustment, indicating recurring vulnerability near 41m shell segment.',
    recommendations: [
      'Compare PRC-2405 and PRC-2410 thermal profiles during maintenance planning.',
      'Flag 41m refractory lining band for next planned kiln inspection.',
    ],
  },
];

export const SUPERVISOR_SENSORS: readonly SupervisorSensorItem[] = [
  {
    id: 'SCN-04',
    name: 'Shell Thermal Scanner · 41m',
    zone: 'Upper Transition',
    reading: '1,368 °C',
    limit: '≤ 1,335 °C',
    status: 'ANOMALY',
    availability: 'ONLINE',
    note: 'Sustained localized rise; possible coating loss or refractory wear.',
  },
  {
    id: 'PYR-01',
    name: 'Burning Zone Optical Pyrometer',
    zone: 'Burning Zone',
    reading: '1,492 °C',
    limit: '1,410 – 1,470 °C',
    status: 'ANOMALY',
    availability: 'ONLINE',
    note: 'Elevated radiant peak correlated with high fuel-to-feed ratio.',
  },
  {
    id: 'GAS-03',
    name: 'Kiln Inlet O₂ Analyzer',
    zone: 'Calcination Zone',
    reading: '1.6 %',
    limit: '2.0 – 3.5 %',
    status: 'WARNING',
    availability: 'CALIBRATION DUE',
    note: 'Low oxygen margin; probe zero-check scheduled.',
  },
  {
    id: 'TC-01',
    name: 'Preheater Stage 5 Thermocouple',
    zone: 'Preheater Inlet',
    reading: '846 °C',
    limit: '800 – 870 °C',
    status: 'NORMAL',
    availability: 'ONLINE',
    note: 'Steady suspension heating profile.',
  },
  {
    id: 'TC-02',
    name: 'Precalciner Outlet Sensor',
    zone: 'Calcination Zone',
    reading: '1,104 °C',
    limit: '1,040 – 1,120 °C',
    status: 'NORMAL',
    availability: 'ONLINE',
    note: 'Within calcination corridor.',
  },
  {
    id: 'TRQ-01',
    name: 'Main Drive Torque Sensor',
    zone: 'Girth Gear Drive',
    reading: '71 %',
    limit: '≤ 82 %',
    status: 'NORMAL',
    availability: 'ONLINE',
    note: 'Mechanical drive load steady.',
  },
  {
    id: 'PRS-02',
    name: 'Kiln Hood Draft Transmitter',
    zone: 'Discharge Hood',
    reading: '-1.9 mbar',
    limit: '-4.0 – 0.0 mbar',
    status: 'NORMAL',
    availability: 'INTERMITTENT',
    note: 'Minor telemetry packet jitter logged; values remain within range.',
  },
  {
    id: 'TC-06',
    name: 'Grate Cooler Secondary Air',
    zone: 'Grate Cooler',
    reading: '1,065 °C',
    limit: '960 – 1,075 °C',
    status: 'NORMAL',
    availability: 'ONLINE',
    note: 'Approaching upper recuperation envelope.',
  },
];

export const INITIAL_AGENT_MESSAGES: readonly AgentMessage[] = [
  {
    id: 'msg-1',
    sender: 'supervisor',
    text: 'Summarize the latest detected abnormalities.',
    timestamp: '14:19',
  },
  {
    id: 'msg-2',
    sender: 'assistant',
    text: 'Two monitored areas showed unusual temperature behaviour across PRC-2410 and PRC-2405: Upper Transition (41m, SCN-04 at 1,368 °C) and Burning Zone (54m, PYR-01 at 1,492 °C). Review the associated thermal reports for refractory-brick investigation.',
    timestamp: '14:19',
    referencedIds: ['PRC-2410', 'PRC-2405'],
  },
];

export function generateSupervisorAgentReply(
  question: string,
  records: readonly ProcessHistoryRecord[] = PROCESS_HISTORY,
  sensors: readonly SupervisorSensorItem[] = SUPERVISOR_SENSORS,
): { text: string; referencedIds: string[] } {
  const q = question.trim().toLowerCase();

  // Check if user referenced a specific process ID
  const matchedRecord = records.find((rec) => q.includes(rec.id.toLowerCase()));
  if (matchedRecord) {
    return {
      text: `${matchedRecord.id} (${matchedRecord.timestamp} · ${matchedRecord.mode}) recorded ${matchedRecord.status} in ${matchedRecord.affectedZone}. Burning zone reached ${matchedRecord.burningTempC} °C with shell peak ${matchedRecord.shellPeakC} °C. ${matchedRecord.findings} Recommended action: ${matchedRecord.recommendations[0]}`,
      referencedIds: [matchedRecord.id],
    };
  }

  // Sensor attention queries
  if (
    q.includes('sensor') ||
    q.includes('attention') ||
    q.includes('flagged') ||
    q.includes('offline') ||
    q.includes('calibrat')
  ) {
    const flagged = sensors.filter(
      (s) => s.status !== 'NORMAL' || s.availability !== 'ONLINE',
    );
    const criticalList = flagged
      .filter((s) => s.status !== 'NORMAL')
      .map((s) => `${s.id} (${s.zone}, ${s.reading} — ${s.status})`)
      .join('; ');
    const availabilityNotes = flagged
      .filter((s) => s.availability !== 'ONLINE')
      .map((s) => `${s.id}: ${s.availability}`)
      .join(', ');

    return {
      text: `${flagged.filter((s) => s.status !== 'NORMAL').length} sensor readings are currently flagged for review: ${criticalList}. Additional availability checks: ${availabilityNotes || 'all channels online'}.`,
      referencedIds: flagged.map((s) => s.id),
    };
  }

  // Recurring issues / refractory / transition zone queries
  if (
    q.includes('recur') ||
    q.includes('refract') ||
    q.includes('brick') ||
    q.includes('transition') ||
    q.includes('cause') ||
    q.includes('41m')
  ) {
    const transitionAnomalies = records.filter(
      (r) => r.status === 'ANOMALY' && r.affectedZone.toLowerCase().includes('transition'),
    );
    return {
      text: `Upper Transition (41m, SCN-04) shows a recurring anomaly across ${transitionAnomalies.length} recent records (${transitionAnomalies.map((r) => r.id).join(', ')}). Both events occurred alongside slower kiln rotation and elevated burner heat flux, pointing to protective coating washout or localized refractory-brick thinning. Recommend external IR shell scan and a 0.5 t/h burner fuel trim.`,
      referencedIds: transitionAnomalies.map((r) => r.id),
    };
  }

  // Abnormality / alert summary
  if (
    q.includes('abnormal') ||
    q.includes('anomal') ||
    q.includes('alert') ||
    q.includes('warning') ||
    q.includes('issue')
  ) {
    const anomalies = records.filter((r) => r.status === 'ANOMALY');
    const warnings = records.filter((r) => r.status === 'WARNING');
    return {
      text: `Current log holds ${anomalies.length} ANOMALY records (${anomalies.map((r) => `${r.id} · ${r.affectedZone}`).join('; ')}) and ${warnings.length} WARNING records (${warnings.map((r) => r.id).join(', ')}). Highest priority is SCN-04 at 1,368 °C in the Upper Transition zone.`,
      referencedIds: [...anomalies, ...warnings].map((r) => r.id),
    };
  }

  // Shift / general process summary
  const normalCount = records.filter((r) => r.status === 'NORMAL').length;
  const attentionCount = records.length - normalCount;
  const flaggedSensors = sensors.filter((s) => s.status !== 'NORMAL').length;
  return {
    text: `Shift overview across ${records.length} logged cycles: ${normalCount} NORMAL and ${attentionCount} requiring review (${records.filter((r) => r.status === 'ANOMALY').length} ANOMALY, ${records.filter((r) => r.status === 'WARNING').length} WARNING). ${flaggedSensors} sensors are currently flagged, led by SCN-04 (Upper Transition) and PYR-01 (Burning Zone). Open PRC-2410 for full thermal diagnostics.`,
    referencedIds: ['PRC-2410', 'SCN-04', 'PYR-01'],
  };
}
