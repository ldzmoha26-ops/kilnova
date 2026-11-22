import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  NOMINAL_TELEMETRY,
  SCENARIOS,
  DIGITAL_TWIN_SHELL_LIMIT_C,
  computeSoftSensors,
  getScenarioTarget,
  lerpTelemetrySnapshot,
  computeForecast,
  computeAxialShellProfile,
  tempToColor,
  shellTempToColor,
  classifyFlame,
} from './KilnVisualizer3D.jsx';

test('defines all 11 required scenarios and 16 raw sensor fields', () => {
  const expectedIds = [
    'NORMAL',
    'SHELL_HOTSPOT',
    'CLINKER_RING',
    'KILN_OVERLOAD',
    'BEARING_FAILURE',
    'THERMAL_RUNAWAY',
    'DRIFT_REFRACTORY_WEAR',
    'DRIFT_BEARING_FATIGUE',
    'DRIFT_DRIVE_FRICTION',
    'HIGH_FREE_LIME',
    'HIGH_NOX',
  ];
  assert.equal(SCENARIOS.length, 11);
  for (const id of expectedIds) {
    assert.ok(SCENARIOS.some((s) => s.id === id), `Missing scenario ${id}`);
  }

  const requiredSensors: Array<keyof typeof NOMINAL_TELEMETRY> = [
    '341_01_TE',
    '341_07_TE',
    '341_05_TE',
    '331_01_TE',
    '331_07_TE',
    '331_05_TE',
    'Debit_vent_Prech_F404',
    'Debit_vent_Prech_F403',
    'debit_gaz_Pyroclone',
    'debit_gaz_Bruleur',
    'T_air_Secondaire',
    'Vitesse_Four',
    'Puissance_totale',
    'debit_KK',
    'Debit_F414',
    'Debit_F413',
  ];
  for (const field of requiredSensors) {
    assert.equal(typeof NOMINAL_TELEMETRY[field], 'number', `Missing sensor ${field}`);
  }
});

test('10-second linear ramp interpolates smoothly without instant jumps and NORMAL resets', () => {
  const hotspotTarget = getScenarioTarget('SHELL_HOTSPOT', 10);
  assert.equal(hotspotTarget.kiln_shell_temp, 445);

  const mid = lerpTelemetrySnapshot(NOMINAL_TELEMETRY, hotspotTarget, 0.5) as Record<string, number>;
  assert.equal(mid.kiln_shell_temp, 360);

  const normalTarget = getScenarioTarget('NORMAL', 10);
  const reset = lerpTelemetrySnapshot(hotspotTarget, normalTarget, 1.0) as Record<string, number>;
  assert.equal(reset.kiln_shell_temp, NOMINAL_TELEMETRY.kiln_shell_temp);
  assert.equal(reset.burning_zone_temp, NOMINAL_TELEMETRY.burning_zone_temp);
});

test('drift scenarios evolve over elapsed time', () => {
  const wear0 = getScenarioTarget('DRIFT_REFRACTORY_WEAR', 0);
  const wear60 = getScenarioTarget('DRIFT_REFRACTORY_WEAR', 60);
  assert.ok(Math.abs(wear60.kiln_shell_temp - wear0.kiln_shell_temp - 0.8) < 1e-6);

  const fatigue0 = getScenarioTarget('DRIFT_BEARING_FATIGUE', 0);
  const fatigue60 = getScenarioTarget('DRIFT_BEARING_FATIGUE', 60);
  assert.equal(fatigue0.bearing_vibration, 2.8);
  assert.equal(fatigue60.bearing_vibration, 3.4);

  const fricA = getScenarioTarget('DRIFT_DRIVE_FRICTION', 0);
  const fricB = getScenarioTarget('DRIFT_DRIVE_FRICTION', Math.PI / (2 * 1.4));
  assert.ok(Math.abs(fricB.motor_current - fricA.motor_current - 8) < 1e-4);
});

test('soft sensors stay in nominal target band and respond to fault scenarios', () => {
  const nom = computeSoftSensors(NOMINAL_TELEMETRY, 'NORMAL', 1);
  assert.ok(nom.calcination_deg >= 60 && nom.calcination_deg <= 70);
  assert.ok(nom.free_lime_pct < 2.5);
  assert.ok(nom.nox_ppm < 250);

  const highLimeTarget = getScenarioTarget('HIGH_FREE_LIME', 10);
  const highLime = computeSoftSensors(highLimeTarget, 'HIGH_FREE_LIME', 1);
  assert.ok(highLime.free_lime_pct >= 3.0, `Expected high free lime, got ${highLime.free_lime_pct}`);
  assert.ok(highLime.calcination_deg <= 58, `Expected lower calcination, got ${highLime.calcination_deg}`);

  const highNoxTarget = getScenarioTarget('HIGH_NOX', 10);
  const highNox = computeSoftSensors(highNoxTarget, 'HIGH_NOX', 1);
  assert.ok(highNox.nox_ppm >= 300, `Expected NOx >= 300, got ${highNox.nox_ppm}`);
});

test('forecast bends FOLLOW_ADVICE toward targets while DO_NOTHING extrapolates drift', () => {
  const history = [
    { calcination_deg: 61, free_lime_pct: 2.3, nox_ppm: 260 },
    { calcination_deg: 58, free_lime_pct: 2.8, nox_ppm: 285 },
    { calcination_deg: 55, free_lime_pct: 3.2, nox_ppm: 310 },
  ];
  const current = {
    ...NOMINAL_TELEMETRY,
    calcination_deg: 55,
    free_lime_pct: 3.2,
    nox_ppm: 310,
    kiln_shell_temp: 360,
  };
  const { doNothing, followAdvice } = computeForecast(history, current);
  assert.ok(doNothing.nox_ppm > current.nox_ppm);
  assert.ok(doNothing.free_lime_pct > current.free_lime_pct);
  assert.ok(followAdvice.nox_ppm < current.nox_ppm && followAdvice.nox_ppm >= 220);
  assert.ok(followAdvice.calcination_deg > current.calcination_deg && followAdvice.calcination_deg <= 65);
  assert.ok(followAdvice.free_lime_pct < current.free_lime_pct && followAdvice.free_lime_pct >= 1.8);
});

test('colormap, 370 °C shell threshold gradient, and flame classifier match thermal thresholds', () => {
  assert.equal(DIGITAL_TWIN_SHELL_LIMIT_C, 370);

  const coldCol = tempToColor(300, 300, 900, new THREE.Color());
  assert.equal(coldCol.getHexString(), '2563eb');
  const hotCol = tempToColor(950, 300, 900, new THREE.Color());
  assert.equal(hotCol.getHexString(), 'dc2626');

  const critShell = shellTempToColor(385, new THREE.Color());
  assert.equal(critShell.getHexString(), 'dc2626');

  assert.equal(classifyFlame(1280).state, 'COLD');
  assert.equal(classifyFlame(1280).color, '#00A3E0');
  assert.equal(classifyFlame(1425).state, 'NOMINAL');
  assert.equal(classifyFlame(1485).state, 'WARN');
  assert.equal(classifyFlame(1600).state, 'CRIT');
  assert.equal(classifyFlame(1600).color, '#FFFFFF');
});

test('axial kiln shell profile peaks in burning zone and spikes sharply on SHELL_HOTSPOT', () => {
  const normal = computeAxialShellProfile(275, 'NORMAL');
  assert.equal(normal.length, 20);
  assert.ok(normal[14] > normal[0], 'burning zone should be hotter than inlet');

  const hotspot = computeAxialShellProfile(445, 'SHELL_HOTSPOT');
  assert.equal(hotspot.length, 20);
  assert.ok(hotspot[14] >= 440, `expected hotspot zone 14 >= 440°C, got ${hotspot[14]}`);
  assert.ok(hotspot[14] > hotspot[5] + 80, 'hotspot should stand out sharply above mid-kiln');
});
