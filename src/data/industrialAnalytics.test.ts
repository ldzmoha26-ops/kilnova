import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_PILOT_PRESETS,
  INITIAL_PROCESS_HISTORY,
  SHELL_SAFETY_LIMIT_C,
  classifyShellTemperature,
  evaluateKilnState,
} from '../utils/kilnSimulation';
import {
  SYSTEM_HEALTH_SENSORS,
  computeElectricalKpis,
  computeProcessStabilityBoard,
  computeStabilityStats,
  computeThermalKpis,
  generatePredictiveSeries,
} from './industrialAnalytics';

test('370 C safety rule classifies temperatures across all 5 severity tiers', () => {
  assert.equal(SHELL_SAFETY_LIMIT_C, 370);

  const normal = classifyShellTemperature(345);
  assert.equal(normal.level, 'NORMAL');
  assert.equal(normal.isExceeded, false);

  const approaching = classifyShellTemperature(365);
  assert.equal(approaching.level, 'APPROACHING_LIMIT');
  assert.equal(approaching.isExceeded, false);

  const atLimit = classifyShellTemperature(370);
  assert.equal(atLimit.level, 'AT_THRESHOLD');
  assert.equal(atLimit.deviationC, 0);

  const critical = classifyShellTemperature(385);
  assert.equal(critical.level, 'CRITICAL');
  assert.equal(critical.isExceeded, true);
  assert.equal(critical.deviationC, 15);

  const emergency = classifyShellTemperature(412);
  assert.equal(emergency.level, 'EMERGENCY');
  assert.equal(emergency.isExceeded, true);
  assert.equal(emergency.isEmergency, true);
  assert.equal(emergency.deviationC, 42);
});

test('Preserved demonstration operational records and 3/6 Nominal vs 3 Flagged sensors stay intact', () => {
  assert.equal(INITIAL_PROCESS_HISTORY.length, 5);
  assert.equal(INITIAL_PROCESS_HISTORY[0].id, 'PRC-2048');
  assert.equal(INITIAL_PROCESS_HISTORY[0].shellMaxTemp, 412);

  assert.equal(SYSTEM_HEALTH_SENSORS.length, 6);
  const nominal = SYSTEM_HEALTH_SENSORS.filter((s) => s.state === 'Nominal');
  const flagged = SYSTEM_HEALTH_SENSORS.filter((s) => s.state !== 'Nominal');
  assert.equal(nominal.length, 3);
  assert.equal(flagged.length, 3);

  const processAnomalies = SYSTEM_HEALTH_SENSORS.filter((s) => s.faultClass === 'PROCESS_ANOMALY');
  const sensorFaults = SYSTEM_HEALTH_SENSORS.filter((s) => s.faultClass === 'SENSOR_FAULT');
  assert.equal(processAnomalies.length, 2);
  assert.equal(sensorFaults.length, 1);
  assert.equal(sensorFaults[0].id, 'SNS-O206');
});

test('computeStabilityStats calculates accurate mean, variance, stdDev, and trend', () => {
  const rising = computeStabilityStats([100, 102, 104, 110, 114, 118], 5);
  assert.equal(rising.trend, 'rising');
  assert.ok(rising.mean > 107 && rising.mean < 109);
  assert.ok(rising.stdDev > 0);
  assert.ok(rising.variance > 0);

  const flat = computeStabilityStats([250, 250, 250, 250], 5);
  assert.equal(flat.stdDev, 0);
  assert.equal(flat.trend, 'stable');
  assert.equal(flat.stabilityIndex, 99);
});

test('Thermal, Electrical, Stability KPIs and 30-60 min Predictive Series are internally consistent', () => {
  const anomalyParams = AUTO_PILOT_PRESETS[2].params;
  const evalResult = evaluateKilnState(anomalyParams, 'AUTO_PILOT');
  assert.equal(evalResult.condition, 'ANOMALY');
  assert.equal(evalResult.report.shellAssessment.deviationC, 42);

  const thermal = computeThermalKpis(anomalyParams, 'NORMAL');
  assert.equal(thermal.totalFuelNm3h, thermal.mainBurnerFuelNm3h + thermal.precalcinerFuelNm3h);
  assert.ok(
    Math.abs(thermal.alternativeFuelRatioPct + thermal.naturalGasRatioPct - 100) < 0.11
  );

  const electrical = computeElectricalKpis(anomalyParams, 'NORMAL');
  assert.equal(
    electrical.workshopTotalPowerKw,
    electrical.mainExhaustFansKw +
      electrical.coolerFansV1V10Kw +
      electrical.kilnMainDriveKw +
      electrical.auxiliaryFansKw
  );
  assert.ok(electrical.specificElectricalKwhT > 0);

  const board = computeProcessStabilityBoard(anomalyParams, 'TRANSITIONAL');
  assert.ok(board.length >= 8);

  const predictive = generatePredictiveSeries(anomalyParams, 'NORMAL');
  assert.equal(predictive.length, 8);
  const shellSeries = predictive.find((s) => s.id === 'shell_temp')!;
  const nowPoint = shellSeries.points.find((p) => p.minuteOffset === 0)!;
  assert.equal(nowPoint.measured, nowPoint.predicted);
  assert.equal(shellSeries.limitValue, 370);
});
