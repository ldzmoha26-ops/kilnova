import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROCESS_HISTORY,
  SUPERVISOR_SENSORS,
  generateSupervisorAgentReply,
} from './supervisorAgent';

test('generateSupervisorAgentReply lists flagged sensors when asked which sensors require attention', () => {
  const reply = generateSupervisorAgentReply('Which sensors require attention?');
  assert.ok(reply.text.includes('3 sensor readings'));
  assert.ok(reply.text.includes('SCN-04'));
  assert.ok(reply.text.includes('PYR-01'));
  assert.ok(reply.referencedIds.includes('GAS-03'));
});

test('generateSupervisorAgentReply summarizes abnormalities with real record IDs', () => {
  const reply = generateSupervisorAgentReply('Summarize the latest detected abnormalities.');
  assert.ok(reply.text.includes('PRC-2410'));
  assert.ok(reply.text.includes('ANOMALY'));
  assert.ok(reply.referencedIds.includes('PRC-2410'));
});

test('generateSupervisorAgentReply inspects specific process record by ID', () => {
  const reply = generateSupervisorAgentReply('Explain PRC-2405');
  assert.ok(reply.text.includes('PRC-2405'));
  assert.ok(reply.text.includes('Upper Transition'));
  assert.deepEqual(reply.referencedIds, ['PRC-2405']);
});

test('generateSupervisorAgentReply identifies recurring transition zone refractory risk', () => {
  const reply = generateSupervisorAgentReply('Any recurring refractory brick issues?');
  assert.ok(reply.text.includes('Upper Transition'));
  assert.ok(reply.text.includes('PRC-2410'));
  assert.ok(reply.text.includes('PRC-2405'));
});

test('supervisor datasets include both normal and attention-requiring entries', () => {
  assert.ok(PROCESS_HISTORY.some((r) => r.status === 'NORMAL'));
  assert.ok(PROCESS_HISTORY.some((r) => r.status === 'ANOMALY'));
  assert.ok(SUPERVISOR_SENSORS.some((s) => s.status === 'WARNING'));
});
