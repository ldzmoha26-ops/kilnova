/**
 * Pure PCM16 audio encoding/decoding, resampling, RMS level estimation,
 * and honest voice session state helpers for Gemini Live API (16kHz in / 24kHz out).
 */

export type VoiceSessionState =
  | 'idle'
  | 'requesting_mic'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

export interface VoiceStatusMeta {
  label: string;
  isLiveConnected: boolean;
  dotColorClass: string;
  textColorClass: string;
}

export function getVoiceStatusMeta(state: VoiceSessionState): VoiceStatusMeta {
  switch (state) {
    case 'requesting_mic':
      return {
        label: 'Requesting Mic…',
        isLiveConnected: false,
        dotColorClass: 'bg-[#D97706]',
        textColorClass: 'text-[#92400E]',
      };
    case 'connecting':
      return {
        label: 'Connecting…',
        isLiveConnected: false,
        dotColorClass: 'bg-[#1D64D8] animate-pulse',
        textColorClass: 'text-[#1D64D8]',
      };
    case 'listening':
      return {
        label: 'Listening · Live',
        isLiveConnected: true,
        dotColorClass: 'bg-[#059669]',
        textColorClass: 'text-[#065F46]',
      };
    case 'thinking':
      return {
        label: 'Searching RAG…',
        isLiveConnected: true,
        dotColorClass: 'bg-[#1D64D8] animate-pulse',
        textColorClass: 'text-[#0B4EA2]',
      };
    case 'speaking':
      return {
        label: 'Speaking · Live',
        isLiveConnected: true,
        dotColorClass: 'bg-[#1D64D8]',
        textColorClass: 'text-[#0B4EA2]',
      };
    case 'error':
      return {
        label: 'Voice Unavailable',
        isLiveConnected: false,
        dotColorClass: 'bg-[#DC2626]',
        textColorClass: 'text-[#991B1B]',
      };
    case 'idle':
    default:
      return {
        label: 'Voice Off',
        isLiveConnected: false,
        dotColorClass: 'bg-[#94A3B8]',
        textColorClass: 'text-[#64748B]',
      };
  }
}

/**
 * Linear-interpolation resampler to guarantee exact 16 kHz input PCM for Gemini Live
 * even when the browser/OS hardware AudioContext forces 44.1 kHz or 48 kHz.
 */
export function downsampleBuffer(
  samples: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): Float32Array {
  if (inputSampleRate <= 0 || targetSampleRate <= 0) {
    return samples;
  }
  if (Math.round(inputSampleRate) === Math.round(targetSampleRate)) {
    return samples;
  }
  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.floor(samples.length / ratio));
  const result = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    if (end <= start) {
      result[i] = samples[Math.min(start, samples.length - 1)] ?? 0;
    } else {
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += samples[j];
      }
      result[i] = sum / (end - start);
    }
  }
  return result;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Manual Float32 [-1, 1] -> 16-bit signed little-endian PCM base64 encoder.
 */
export function float32ToPcm16Base64(samples: Float32Array): string {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    view.setInt16(i * 2, int16, true);
  }
  return bytesToBase64(new Uint8Array(buffer));
}

/**
 * Manual 16-bit signed little-endian PCM base64 -> Float32 [-1, 1] decoder (for 24 kHz playback).
 */
export function pcm16Base64ToFloat32(base64: string): Float32Array<ArrayBuffer> {
  if (!base64) return new Float32Array(new ArrayBuffer(0));
  const bytes = base64ToBytes(base64);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  const out = new Float32Array(new ArrayBuffer(sampleCount * 4));
  for (let i = 0; i < sampleCount; i++) {
    out[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return out;
}

/**
 * Computes normalized RMS audio level (0..1) for subtle waveform visualization.
 */
export function computeRmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sumSq / samples.length);
  return Math.min(1, rms * 3.5);
}

/**
 * Produces clear, honest, actionable error messages for mic/audio/network/Gemini Live failures.
 */
export function mapVoiceErrorMessage(err: unknown): { code: string; message: string } {
  if (err && typeof err === 'object') {
    const name = 'name' in err ? String((err as { name?: unknown }).name) : '';
    const msg = 'message' in err ? String((err as { message?: unknown }).message) : '';

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return {
        code: 'MIC_PERMISSION_DENIED',
        message:
          'Microphone permission was denied. Allow microphone access in your browser settings to use voice, or continue with text chat.',
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        code: 'MIC_UNAVAILABLE',
        message:
          'No microphone device was detected on this workstation. Connect a microphone or continue using text chat.',
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        code: 'MIC_BUSY',
        message:
          'Microphone is currently in use by another application or could not be opened. Text chat remains available.',
      };
    }
    if (msg) {
      return {
        code: 'VOICE_ERROR',
        message: msg,
      };
    }
  }
  return {
    code: 'VOICE_ERROR',
    message: 'Unable to start voice session. Text chat remains available.',
  };
}
