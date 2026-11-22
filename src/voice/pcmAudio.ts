/**
 * Pure PCM16 / WAV audio encoding & decoding, resampling, RMS level estimation,
 * operating mode badges, and honest voice session state helpers for KILNOVA.
 */

export type VoiceOperatingMode =
  | 'LIVE_VOICE'
  | 'STANDARD_VOICE'
  | 'TEXT_ONLY'
  | 'CONNECTION_ERROR';

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

export interface OperatingModeMeta {
  label: 'LIVE VOICE' | 'STANDARD VOICE' | 'TEXT ONLY' | 'CONNECTION ERROR';
  badgeClass: string;
  dotClass: string;
}

export function getOperatingModeMeta(mode: VoiceOperatingMode): OperatingModeMeta {
  switch (mode) {
    case 'LIVE_VOICE':
      return {
        label: 'LIVE VOICE',
        badgeClass: 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]',
        dotClass: 'bg-[#059669]',
      };
    case 'STANDARD_VOICE':
      return {
        label: 'STANDARD VOICE',
        badgeClass: 'border-[#BFDBFE] bg-[#EFF6FF] text-[#0B4EA2]',
        dotClass: 'bg-[#1D64D8]',
      };
    case 'TEXT_ONLY':
      return {
        label: 'TEXT ONLY',
        badgeClass: 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]',
        dotClass: 'bg-[#D97706]',
      };
    case 'CONNECTION_ERROR':
    default:
      return {
        label: 'CONNECTION ERROR',
        badgeClass: 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]',
        dotClass: 'bg-[#DC2626]',
      };
  }
}

export function getVoiceStatusMeta(
  state: VoiceSessionState,
  mode: VoiceOperatingMode = 'LIVE_VOICE'
): VoiceStatusMeta {
  const modeSuffix = mode === 'STANDARD_VOICE' ? 'Standard' : 'Live';
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
        label: `Listening · ${modeSuffix}`,
        isLiveConnected: true,
        dotColorClass: 'bg-[#059669]',
        textColorClass: 'text-[#065F46]',
      };
    case 'thinking':
      return {
        label: mode === 'STANDARD_VOICE' ? 'Transcribing & Searching RAG…' : 'Searching RAG…',
        isLiveConnected: true,
        dotColorClass: 'bg-[#1D64D8] animate-pulse',
        textColorClass: 'text-[#0B4EA2]',
      };
    case 'speaking':
      return {
        label: `Speaking · ${modeSuffix}`,
        isLiveConnected: true,
        dotColorClass: 'bg-[#1D64D8]',
        textColorClass: 'text-[#0B4EA2]',
      };
    case 'error':
      return {
        label: mode === 'TEXT_ONLY' ? 'Text Only' : 'Voice Unavailable',
        isLiveConnected: false,
        dotColorClass: mode === 'TEXT_ONLY' ? 'bg-[#D97706]' : 'bg-[#DC2626]',
        textColorClass: mode === 'TEXT_ONLY' ? 'text-[#92400E]' : 'text-[#991B1B]',
      };
    case 'idle':
    default:
      return {
        label: mode === 'TEXT_ONLY' ? 'Text Only' : 'Ready · Voice Off',
        isLiveConnected: false,
        dotColorClass: mode === 'TEXT_ONLY' ? 'bg-[#D97706]' : 'bg-[#94A3B8]',
        textColorClass: mode === 'TEXT_ONLY' ? 'text-[#92400E]' : 'text-[#64748B]',
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

export function bytesToBase64(bytes: Uint8Array): string {
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

export function base64ToBytes(base64: string): Uint8Array {
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
 * Encodes Float32 mono samples into a complete RIFF WAV (16-bit PCM) base64 payload
 * for universal browser fallback in Standard Voice mode (Safari/iOS/Firefox/Chrome).
 */
export function encodeFloat32ToWavBase64(samples: Float32Array, sampleRate = 16000): string {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    view.setInt16(44 + i * 2, int16, true);
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
 * Produces clear, honest, actionable error messages for mic/audio/network/Gemini Live failures,
 * plus whether the failure requires TEXT_ONLY mode (missing/denied mic hardware).
 */
export function mapVoiceErrorMessage(err: unknown): {
  code: string;
  message: string;
  requiresTextOnly: boolean;
} {
  if (err && typeof err === 'object') {
    const name = 'name' in err ? String((err as { name?: unknown }).name) : '';
    const msg = 'message' in err ? String((err as { message?: unknown }).message) : '';

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return {
        code: 'MIC_PERMISSION_DENIED',
        message:
          'Microphone permission was denied. Allow microphone access in your browser settings to speak, or continue with text chat.',
        requiresTextOnly: true,
      };
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return {
        code: 'MIC_UNAVAILABLE',
        message:
          'No microphone device was detected on this workstation. Connect a microphone or continue using text chat.',
        requiresTextOnly: true,
      };
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return {
        code: 'MIC_BUSY',
        message:
          'Microphone is currently in use by another application or could not be opened. Text chat remains available.',
        requiresTextOnly: true,
      };
    }
    if (msg) {
      return {
        code: 'VOICE_ERROR',
        message: msg,
        requiresTextOnly: false,
      };
    }
  }
  return {
    code: 'VOICE_ERROR',
    message: 'Unable to start voice session. Text chat remains available.',
    requiresTextOnly: false,
  };
}
