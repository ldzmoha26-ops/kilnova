import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import {
  computeRmsLevel,
  downsampleBuffer,
  encodeFloat32ToWavBase64,
  float32ToPcm16Base64,
  getOperatingModeMeta,
  getVoiceStatusMeta,
  mapVoiceErrorMessage,
  pcm16Base64ToFloat32,
} from './pcmAudio';
import { normalizeAudioMimeType, prepareTextForSpeech } from './standardVoiceService';
import { isAllowedOrigin } from './liveVoiceBridge';

test('float32ToPcm16Base64 and pcm16Base64ToFloat32 round-trip PCM16 accurately', () => {
  const input = new Float32Array([0, 0.5, -0.5, 0.99, -0.99]);
  const b64 = float32ToPcm16Base64(input);
  assert.ok(b64.length > 0);
  const decoded = pcm16Base64ToFloat32(b64);
  assert.equal(decoded.length, input.length);
  for (let i = 0; i < input.length; i++) {
    assert.ok(Math.abs(decoded[i] - input[i]) < 0.002, `Sample ${i} drifted too far`);
  }
});

test('downsampleBuffer reduces 48kHz audio cleanly to 16kHz', () => {
  const samples48k = new Float32Array(480);
  for (let i = 0; i < samples48k.length; i++) {
    samples48k[i] = Math.sin((2 * Math.PI * i) / 48);
  }
  const down = downsampleBuffer(samples48k, 48000, 16000);
  assert.equal(down.length, 160);
});

test('computeRmsLevel returns 0 for silence and bounded positive value for speech', () => {
  assert.equal(computeRmsLevel(new Float32Array(128)), 0);
  const tone = new Float32Array(128).fill(0.25);
  const level = computeRmsLevel(tone);
  assert.ok(level > 0.5 && level <= 1);
});

test('getVoiceStatusMeta never reports connected when idle, connecting, requesting mic, or error', () => {
  assert.equal(getVoiceStatusMeta('idle').isLiveConnected, false);
  assert.equal(getVoiceStatusMeta('requesting_mic').isLiveConnected, false);
  assert.equal(getVoiceStatusMeta('connecting').isLiveConnected, false);
  assert.equal(getVoiceStatusMeta('error').isLiveConnected, false);
  assert.equal(getVoiceStatusMeta('listening', 'LIVE_VOICE').isLiveConnected, true);
  assert.equal(getVoiceStatusMeta('speaking', 'STANDARD_VOICE').label, 'Speaking · Standard');
});

test('getOperatingModeMeta exposes all four honest operating modes', () => {
  assert.equal(getOperatingModeMeta('LIVE_VOICE').label, 'LIVE VOICE');
  assert.equal(getOperatingModeMeta('STANDARD_VOICE').label, 'STANDARD VOICE');
  assert.equal(getOperatingModeMeta('TEXT_ONLY').label, 'TEXT ONLY');
  assert.equal(getOperatingModeMeta('CONNECTION_ERROR').label, 'CONNECTION ERROR');
});

test('mapVoiceErrorMessage distinguishes permission denied and unavailable mic as TEXT_ONLY', () => {
  const denied = mapVoiceErrorMessage({ name: 'NotAllowedError' });
  assert.equal(denied.code, 'MIC_PERMISSION_DENIED');
  assert.equal(denied.requiresTextOnly, true);
  const missing = mapVoiceErrorMessage({ name: 'NotFoundError' });
  assert.equal(missing.code, 'MIC_UNAVAILABLE');
  assert.equal(missing.requiresTextOnly, true);
});

test('encodeFloat32ToWavBase64 generates valid RIFF WAVE 16kHz mono header', () => {
  const samples = new Float32Array(160).fill(0.1);
  const b64 = encodeFloat32ToWavBase64(samples, 16000);
  const bytes = Buffer.from(b64, 'base64');
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(bytes.readUInt32LE(24), 16000);
  assert.equal(bytes.byteLength, 44 + 160 * 2);
});

test('normalizeAudioMimeType strips codec parameters and rejects non-audio MIME types', () => {
  assert.equal(normalizeAudioMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(normalizeAudioMimeType('audio/x-wav'), 'audio/wav');
  assert.equal(normalizeAudioMimeType('audio/mp4'), 'audio/mp4');
  assert.equal(normalizeAudioMimeType('text/html'), null);
  assert.equal(normalizeAudioMimeType('application/javascript'), null);
});

test('prepareTextForSpeech strips markdown while preserving 370 °C and incident IDs', () => {
  const md = '### 1. Safety\n- **Limit**: `370 °C` on **Ring B-04** (see CAS-2026-081).';
  const spoken = prepareTextForSpeech(md);
  assert.ok(!spoken.includes('###'));
  assert.ok(!spoken.includes('**'));
  assert.ok(spoken.includes('370 °C'));
  assert.ok(spoken.includes('CAS-2026-081'));
});

test('isAllowedOrigin permits Cloud Run forwarded HTTPS hosts and blocks untrusted origins', () => {
  const cloudRunReq = {
    headers: {
      origin: 'https://ais-pre-gtlp34avwfdouokcfznaol-561704381000.europe-west2.run.app',
      host: 'localhost:3000',
      'x-forwarded-host': 'ais-pre-gtlp34avwfdouokcfznaol-561704381000.europe-west2.run.app:443',
    },
  } as unknown as IncomingMessage;
  assert.equal(isAllowedOrigin(cloudRunReq), true);

  const evilReq = {
    headers: {
      origin: 'https://evil-attacker.example.com',
      host: 'ais-pre-gtlp34avwfdouokcfznaol-561704381000.europe-west2.run.app',
    },
  } as unknown as IncomingMessage;
  assert.equal(isAllowedOrigin(evilReq), false);
});
