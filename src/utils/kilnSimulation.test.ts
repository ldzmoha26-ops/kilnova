import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_PILOT_PRESETS,
  INITIAL_PROCESS_HISTORY,
  SHELL_SAFETY_LIMIT_C,
  classifyShellTemperature,
  evaluateKilnState,
} from './kilnSimulation';

test('AUTO_PILOT_PRESETS cover nominal, warning, and anomaly states against 370 C limit', () => {
  assert.equal(SHELL_SAFETY_LIMIT_C, 370);
  const conditions = AUTO_PILOT_PRESETS.map(
    (preset) => evaluateKilnState(preset.params, 'AUTO_PILOT').condition
  );
  assert.deepEqual(conditions, ['NORMAL', 'WARNING', 'ANOMALY']);
});

test('evaluateKilnState flags ANOMALY when shell temperature exceeds 370 C', () => {
  const nominal = evaluateKilnState(AUTO_PILOT_PRESETS[0].params, 'AUTO_PILOT');
  assert.equal(nominal.condition, 'NORMAL');
  assert.equal(nominal.sensors.length, 6);
  assert.equal(nominal.report.shellAssessment.isExceeded, false);

  const critical = evaluateKilnState(
    {
      ...AUTO_PILOT_PRESETS[0].params,
      shellMaxTemp: 378,
    },
    'MANUAL_SIMULATION'
  );
  assert.equal(critical.condition, 'ANOMALY');
  assert.equal(critical.report.shellAssessment.isExceeded, true);
  assert.equal(critical.report.shellAssessment.deviationC, 8);
});

test('classifyShellTemperature distinguishes approaching, at-threshold, critical, and emergency tiers', () => {
  assert.equal(classifyShellTemperature(354).level, 'NORMAL');
  assert.equal(classifyShellTemperature(365).level, 'APPROACHING_LIMIT');
  assert.equal(classifyShellTemperature(370).level, 'AT_THRESHOLD');
  assert.equal(classifyShellTemperature(382).level, 'CRITICAL');
  assert.equal(classifyShellTemperature(412).level, 'EMERGENCY');
});

test('INITIAL_PROCESS_HISTORY preserves demonstration baseline (5 records, PRC-2048 at 412 C)', () => {
  assert.equal(INITIAL_PROCESS_HISTORY.length, 5);
  assert.equal(INITIAL_PROCESS_HISTORY[0].id, 'PRC-2048');
  assert.equal(INITIAL_PROCESS_HISTORY[0].shellMaxTemp, 412);
  assert.equal(
    INITIAL_PROCESS_HISTORY.filter((r) => r.condition === 'ANOMALY').length,
    1
  );
  assert.equal(
    INITIAL_PROCESS_HISTORY.filter((r) => r.condition === 'WARNING').length,
    2
  );
});
