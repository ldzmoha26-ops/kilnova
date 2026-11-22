import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOPILOT_PRESETS,
  BASELINE_INPUTS,
  evaluateKilnState,
  runKilnSimulation,
} from './kilnEngine';

test('evaluateKilnState reports NORMAL under nominal baseline parameters', () => {
  const result = evaluateKilnState({
    inputs: BASELINE_INPUTS,
    mode: 'autopilot',
  });
  assert.equal(result.overallStatus, 'NORMAL');
  assert.equal(result.affectedZones.length, 0);
  assert.equal(result.refractoryAlert, false);
  assert.equal(result.sensors.length, 5);
});

test('evaluateKilnState detects ANOMALY and refractory alert on persistent shell hotspot preset', () => {
  const hotspotPreset = AUTOPILOT_PRESETS[0];
  const result = evaluateKilnState({
    inputs: hotspotPreset.inputs,
    mode: 'autopilot',
    shellOffsetC: hotspotPreset.shellOffsetC,
  });
  assert.equal(result.overallStatus, 'ANOMALY');
  assert.equal(result.refractoryAlert, true);
  assert.ok(result.affectedZones.includes('transition'));
  assert.ok(result.hotspotIntensity > 0.5);
});

test('runKilnSimulation responds deterministically to elevated fuel and slower rotation', () => {
  const baseline = runKilnSimulation(BASELINE_INPUTS, 1);
  const stressed = runKilnSimulation(
    {
      fuelFlowTph: 10.6,
      kilnSpeedRpm: 2.9,
      rawFeedTph: 200,
      secondaryAirTempC: 1110,
    },
    2,
  );

  assert.equal(stressed.mode, 'simulation');
  assert.equal(stressed.processId, 'SIM-2412');
  assert.equal(stressed.overallStatus, 'ANOMALY');
  assert.ok(stressed.thermalLoadIndex > baseline.thermalLoadIndex);
  assert.ok(stressed.sensors[3].temperatureC > baseline.sensors[3].temperatureC);
  assert.ok(stressed.recommendations.length >= 2);
});
