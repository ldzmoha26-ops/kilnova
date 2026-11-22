import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRmsLevel,
  downsampleBuffer,
  float32ToPcm16Base64,
  getVoiceStatusMeta,
  mapVoiceErrorMessage,
  pcm16Base64ToFloat32,
} from './pcmAudio';

test('float32ToPcm16Base64 and pcm16Base64ToFloat32 round-trip PCM16 accurately', () => {
  const input = new Float32Array([0, 0.5, -0.5, 0.99, -1.0, 0.25]);
  const encoded = float32ToPcm16Base64(input);
  assert.ok(encoded.length > 0);
  const decoded = pcm16Base64ToFloat32(encoded);
  assert.equal(decoded.length, input.length);
  for (let i = 0; i < input.length; i++) {
    assert.ok(
      Math.abs(decoded[i] - input[i]) < 0.001,
      `Sample ${i} drifted: expected ${input[i]}, got ${decoded[i]}`
    );
  }
});

test('downsampleBuffer reduces 48kHz audio cleanly to 16kHz', () => {
  const input = new Float32Array(480);
  for (let i = 0; i < input.length; i++) {
    input[i] = Math.sin((i / 480) * Math.PI * 2);
  }
  const output = downsampleBuffer(input, 48000, 16000);
  assert.equal(output.length, 160);
  // Same sample rate returns unchanged
  const passthrough = downsampleBuffer(output, 16000, 16000);
  assert.equal(passthrough.length, 160);
});

test('computeRmsLevel returns 0 for silence and bounded positive value for speech', () => {
  assert.equal(computeRmsLevel(new Float32Array(128)), 0);
  const loud = new Float32Array(128).fill(0.8);
  assert.equal(computeRmsLevel(loud), 1);
  const soft = new Float32Array(128).fill(0.1);
  const level = computeRmsLevel(soft);
  assert.ok(level > 0.2 && level < 0.5);
});

test('getVoiceStatusMeta never reports connected when idle, connecting, requesting mic, or error', () => {
  assert.equal(getVoiceStatusMeta('idle').isLiveConnected, false);
  assert.equal(getVoiceStatusMeta('requesting_mic').isLiveConnected, false);
  assert.equal(getVoiceStatusMeta('connecting').isLiveConnected, false);
  assert.equal(getVoiceStatusMeta('error').isLiveConnected, false);
  assert.equal(getVoiceStatusMeta('listening').isLiveConnected, true);
  assert.equal(getVoiceStatusMeta('thinking').isLiveConnected, true);
  assert.equal(getVoiceStatusMeta('speaking').isLiveConnected, true);
});

test('mapVoiceErrorMessage distinguishes permission denied and unavailable mic', () => {
  const denied = mapVoiceErrorMessage({ name: 'NotAllowedError' });
  assert.equal(denied.code, 'MIC_PERMISSION_DENIED');
  assert.match(denied.message, /permission/i);

  const missing = mapVoiceErrorMessage({ name: 'NotFoundError' });
  assert.equal(missing.code, 'MIC_UNAVAILABLE');
  assert.match(missing.message, /No microphone/i);
});
