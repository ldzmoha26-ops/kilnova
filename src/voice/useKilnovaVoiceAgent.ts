import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantLanguage, KnowledgeCollection, RagCitation } from '../rag/types';
import {
  base64ToBytes,
  bytesToBase64,
  computeRmsLevel,
  downsampleBuffer,
  encodeFloat32ToWavBase64,
  float32ToPcm16Base64,
  mapVoiceErrorMessage,
  pcm16Base64ToFloat32,
  type VoiceOperatingMode,
  type VoiceSessionState,
} from './pcmAudio';

export interface VoiceTurnCommit {
  userTranscript?: string;
  assistantTranscript?: string;
  citations?: RagCitation[];
  advisorDisclaimer?: string;
  model?: string;
  voiceMode?: VoiceOperatingMode;
}

export interface OperationalVoiceContext {
  shellMaxTemp: number;
  burningZoneTemp: number;
  affectedZone: string;
  condition: string;
  flaggedSensors: number;
}

interface UseKilnovaVoiceAgentOptions {
  language: AssistantLanguage;
  collectionFilter: KnowledgeCollection | 'all';
  operationalContext: OperationalVoiceContext;
  onCommitTurn: (turn: VoiceTurnCommit) => void;
}

interface ServerVoiceMessage {
  type:
    | 'status'
    | 'audio'
    | 'input_transcript'
    | 'output_transcript'
    | 'rag_lookup_started'
    | 'rag_citations'
    | 'rag_error'
    | 'turn_complete'
    | 'interrupted'
    | 'pong'
    | 'error';
  state?: 'connecting' | 'connected' | 'disconnected';
  model?: string;
  data?: string;
  text?: string;
  query?: string;
  citations?: RagCitation[];
  advisorDisclaimer?: string;
  code?: string;
  message?: string;
}

interface StandardVoiceApiResponse {
  transcript: string;
  answer: string;
  citations: RagCitation[];
  usedEmbeddings: boolean;
  advisorDisclaimer: string;
  ragModel: string;
  sttModel: string;
  ttsModel: string;
  audioBase64: string | null;
  audioMimeType: string | null;
  ttsWarning?: string;
  error?: string;
}

const LIVE_CONNECT_TIMEOUT_MS = 8500;
const WS_KEEPALIVE_INTERVAL_MS = 20000;

function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const mime of candidates) {
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return '';
}

export function useKilnovaVoiceAgent(options: UseKilnovaVoiceAgentOptions) {
  const [operatingMode, setOperatingMode] = useState<VoiceOperatingMode>('LIVE_VOICE');
  const [voiceState, setVoiceState] = useState<VoiceSessionState>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [ragLookupNote, setRagLookupNote] = useState<string | null>(null);
  const [liveUserDraft, setLiveUserDraft] = useState('');
  const [liveAssistantDraft, setLiveAssistantDraft] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeakingAudio, setIsSpeakingAudio] = useState(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const operatingModeRef = useRef<VoiceOperatingMode>('LIVE_VOICE');
  const voiceStateRef = useRef<VoiceSessionState>('idle');
  const isLiveConnectedRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const wsTimeoutRef = useRef<number | null>(null);
  const wsPingRef = useRef<number | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);

  // Live 24kHz PCM playback queue
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

  // Standard Voice fallback recording & WAV playback refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const fallbackPcmChunksRef = useRef<Float32Array[]>([]);
  const standardAudioElRef = useRef<HTMLAudioElement | null>(null);
  const standardAudioUrlRef = useRef<string | null>(null);
  const standardAbortRef = useRef<AbortController | null>(null);
  const standardMeterRafRef = useRef<number | null>(null);
  const standardAnalyserRef = useRef<AnalyserNode | null>(null);
  const liveFallbackTriggeredRef = useRef(false);

  const userTranscriptBufRef = useRef('');
  const assistantTranscriptBufRef = useRef('');
  const pendingCitationsRef = useRef<RagCitation[]>([]);
  const advisorDisclaimerRef = useRef<string | undefined>(undefined);
  const lastLevelEmitRef = useRef(0);

  const setStateSynced = useCallback((next: VoiceSessionState) => {
    voiceStateRef.current = next;
    setVoiceState(next);
  }, []);

  const setModeSynced = useCallback((next: VoiceOperatingMode) => {
    operatingModeRef.current = next;
    setOperatingMode(next);
  }, []);

  // Probe backend voice capabilities once so serverless hosts (e.g. Vercel, where persistent WSS is unsupported)
  // start directly in Standard Voice (HTTPS) without triggering failed WebSocket handshake errors.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { liveVoiceSupported?: boolean; standardVoiceConfigured?: boolean } | null) => {
        if (cancelled || !data) return;
        if (data.liveVoiceSupported === false && voiceStateRef.current === 'idle') {
          setModeSynced('STANDARD_VOICE');
          if (data.standardVoiceConfigured === false) {
            setVoiceError(
              'GEMINI_API_KEY is not configured in Vercel Environment Variables. Add GEMINI_API_KEY and redeploy.'
            );
          } else {
            setFallbackNotice(
              'Serverless hosting detected — Standard Voice (HTTPS) is active.'
            );
          }
        }
      })
      .catch(() => {
        // Ignore transient probe errors; startVoiceSession handles fallback automatically
      });
    return () => {
      cancelled = true;
    };
  }, [setModeSynced]);

  const clearSocketTimers = useCallback(() => {
    if (wsTimeoutRef.current !== null) {
      window.clearTimeout(wsTimeoutRef.current);
      wsTimeoutRef.current = null;
    }
    if (wsPingRef.current !== null) {
      window.clearInterval(wsPingRef.current);
      wsPingRef.current = null;
    }
  }, []);

  const stopStandardMeter = useCallback(() => {
    if (standardMeterRafRef.current !== null) {
      window.cancelAnimationFrame(standardMeterRafRef.current);
      standardMeterRafRef.current = null;
    }
    if (standardAnalyserRef.current) {
      try {
        standardAnalyserRef.current.disconnect();
      } catch {
        // ignore
      }
      standardAnalyserRef.current = null;
    }
  }, []);

  const stopStandardAudioPlayback = useCallback(() => {
    if (standardAudioElRef.current) {
      try {
        standardAudioElRef.current.pause();
        standardAudioElRef.current.onended = null;
        standardAudioElRef.current.onerror = null;
        standardAudioElRef.current.src = '';
      } catch {
        // ignore
      }
      standardAudioElRef.current = null;
    }
    if (standardAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(standardAudioUrlRef.current);
      } catch {
        // ignore
      }
      standardAudioUrlRef.current = null;
    }
  }, []);

  const stopPlaybackQueue = useCallback(() => {
    stopStandardAudioPlayback();
    for (const node of activeSourcesRef.current) {
      try {
        node.onended = null;
        node.stop();
        node.disconnect();
      } catch {
        // ignore
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setIsSpeakingAudio(false);
  }, [stopStandardAudioPlayback]);

  const flushBufferedTurn = useCallback(() => {
    const userText = userTranscriptBufRef.current.trim();
    const assistantText = assistantTranscriptBufRef.current.trim();
    const citations = pendingCitationsRef.current;

    if (userText || assistantText) {
      optionsRef.current.onCommitTurn({
        userTranscript: userText || undefined,
        assistantTranscript: assistantText || undefined,
        citations: citations.length > 0 ? [...citations] : undefined,
        advisorDisclaimer: advisorDisclaimerRef.current,
        model: 'gemini-3.8-live',
        voiceMode: 'LIVE_VOICE',
      });
    }

    userTranscriptBufRef.current = '';
    assistantTranscriptBufRef.current = '';
    pendingCitationsRef.current = [];
    setLiveUserDraft('');
    setLiveAssistantDraft('');
    setRagLookupNote(null);
  }, []);

  const closeSocketOnly = useCallback(
    (sendEndSignal: boolean) => {
      clearSocketTimers();
      isLiveConnectedRef.current = false;
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        try {
          if (sendEndSignal && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'end' }));
          }
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        } catch {
          // ignore
        }
      }
    },
    [clearSocketTimers]
  );

  const disconnectInputProcessor = useCallback(() => {
    stopStandardMeter();
    if (processorRef.current) {
      try {
        processorRef.current.onaudioprocess = null;
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceNodeRef.current = null;
    }
    if (silentGainRef.current) {
      try {
        silentGainRef.current.disconnect();
      } catch {
        // ignore
      }
      silentGainRef.current = null;
    }
  }, [stopStandardMeter]);

  const stopStandardRecorderOnly = useCallback(() => {
    if (mediaRecorderRef.current) {
      const rec = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      try {
        rec.ondataavailable = null;
        rec.onstop = null;
        rec.onerror = null;
        if (rec.state !== 'inactive') {
          rec.stop();
        }
      } catch {
        // ignore
      }
    }
    recordedChunksRef.current = [];
    fallbackPcmChunksRef.current = [];
  }, []);

  const teardownAll = useCallback(
    (sendEndSignal: boolean) => {
      closeSocketOnly(sendEndSignal);
      stopStandardRecorderOnly();
      if (standardAbortRef.current) {
        try {
          standardAbortRef.current.abort();
        } catch {
          // ignore
        }
        standardAbortRef.current = null;
      }
      stopPlaybackQueue();
      disconnectInputProcessor();

      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getTracks()) {
          try {
            track.stop();
          } catch {
            // ignore
          }
        }
        mediaStreamRef.current = null;
      }

      if (inputCtxRef.current) {
        void inputCtxRef.current.close().catch(() => {});
        inputCtxRef.current = null;
      }

      if (outputCtxRef.current) {
        void outputCtxRef.current.close().catch(() => {});
        outputCtxRef.current = null;
      }

      setAudioLevel(0);
    },
    [closeSocketOnly, disconnectInputProcessor, stopPlaybackQueue, stopStandardRecorderOnly]
  );

  // Plays unary WAV returned by Standard Voice TTS (`gemini-3.8-flash-lite-tts`)
  const playStandardWavAudio = useCallback(
    (audioBase64: string, audioMimeType: string) => {
      stopPlaybackQueue();
      try {
        const bytes = base64ToBytes(audioBase64);
        const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
          type: audioMimeType || 'audio/wav',
        });
        const url = URL.createObjectURL(blob);
        standardAudioUrlRef.current = url;

        const audioEl = new Audio(url);
        standardAudioElRef.current = audioEl;
        setIsSpeakingAudio(true);
        setStateSynced('speaking');
        setAudioLevel(0.55);

        audioEl.onended = () => {
          stopStandardAudioPlayback();
          setIsSpeakingAudio(false);
          setAudioLevel(0);
          if (voiceStateRef.current === 'speaking') {
            setStateSynced('idle');
          }
        };

        audioEl.onerror = () => {
          stopStandardAudioPlayback();
          setIsSpeakingAudio(false);
          setAudioLevel(0);
          setVoiceError('Spoken audio could not play in this browser; the cited answer is shown in the transcript.');
          setStateSynced('idle');
        };

        void audioEl.play().catch(() => {
          stopStandardAudioPlayback();
          setIsSpeakingAudio(false);
          setAudioLevel(0);
          setVoiceError('Browser blocked automatic audio playback. Click the speaker or view the written response.');
          setStateSynced('idle');
        });
      } catch {
        setIsSpeakingAudio(false);
        setAudioLevel(0);
        setStateSynced('idle');
      }
    },
    [setStateSynced, stopPlaybackQueue, stopStandardAudioPlayback]
  );

  // Submit recorded clip to HTTPS POST /api/voice/standard (STT -> existing RAG -> TTS)
  const submitStandardVoiceClip = useCallback(
    async (audioBase64: string, mimeType: string) => {
      setStateSynced('thinking');
      setRagLookupNote('Transcribing audio & querying KILNOVA RAG…');
      setAudioLevel(0);

      const controller = new AbortController();
      standardAbortRef.current = controller;

      try {
        const opts = optionsRef.current;
        const response = await fetch('/api/voice/standard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            audioBase64,
            mimeType,
            preferredLanguage: opts.language,
            collectionFilter: opts.collectionFilter,
            operationalContext: opts.operationalContext,
          }),
        });

        const rawBody = await response.text();
        let payload: StandardVoiceApiResponse | null = null;
        if (rawBody) {
          try {
            payload = JSON.parse(rawBody) as StandardVoiceApiResponse;
          } catch {
            payload = null;
          }
        }
        if (!payload) {
          if (response.status === 404) {
            throw new Error(
              'Standard Voice API (/api/voice/standard) returned HTTP 404. Redeploy with the Node.js backend running (not static-only hosting).'
            );
          }
          throw new Error(
            `Standard Voice backend returned a non-JSON response (HTTP ${response.status}).`
          );
        }
        if (!response.ok) {
          throw new Error(payload.error || `HTTP ${response.status} from Standard Voice API`);
        }

        setRagLookupNote(null);
        setVoiceError(payload.ttsWarning ?? null);

        optionsRef.current.onCommitTurn({
          userTranscript: payload.transcript,
          assistantTranscript: payload.answer,
          citations: payload.citations,
          advisorDisclaimer: payload.advisorDisclaimer,
          model: `${payload.sttModel} → ${payload.ragModel} → ${payload.ttsModel}`,
          voiceMode: 'STANDARD_VOICE',
        });

        if (payload.audioBase64) {
          playStandardWavAudio(payload.audioBase64, payload.audioMimeType || 'audio/wav');
        } else {
          setStateSynced('idle');
        }
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setRagLookupNote(null);
        const msg =
          err instanceof Error
            ? err.message
            : 'Standard Voice request failed. Text chat remains available.';
        const isConnectivity =
          msg.includes('Failed to fetch') ||
          msg.includes('NetworkError') ||
          msg.includes('HTTP 502') ||
          msg.includes('HTTP 503');
        setVoiceError(msg);
        if (isConnectivity) {
          setModeSynced('CONNECTION_ERROR');
          setStateSynced('error');
        } else {
          setStateSynced('idle');
        }
      } finally {
        standardAbortRef.current = null;
      }
    },
    [playStandardWavAudio, setModeSynced, setStateSynced]
  );

  // Start capturing audio in Secondary Mode (STANDARD VOICE) using an active MediaStream
  const beginStandardVoiceRecording = useCallback(
    (stream: MediaStream, reasonBanner?: string) => {
      closeSocketOnly(false);
      disconnectInputProcessor();
      stopStandardRecorderOnly();
      stopPlaybackQueue();

      setModeSynced('STANDARD_VOICE');
      if (reasonBanner) {
        setFallbackNotice(reasonBanner);
      }
      setVoiceError(null);
      setRagLookupNote('Tap microphone again to send spoken question');
      setStateSynced('listening');

      // Live RMS waveform meter for Standard Voice
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!inputCtxRef.current) {
          inputCtxRef.current = new AudioCtx();
        }
        const inCtx = inputCtxRef.current;
        if (inCtx.state === 'suspended') {
          void inCtx.resume();
        }
        const srcNode = inCtx.createMediaStreamSource(stream);
        const analyser = inCtx.createAnalyser();
        analyser.fftSize = 512;
        srcNode.connect(analyser);
        sourceNodeRef.current = srcNode;
        standardAnalyserRef.current = analyser;

        const dataBuf = new Float32Array(analyser.fftSize);
        const tickMeter = () => {
          if (!standardAnalyserRef.current || voiceStateRef.current !== 'listening') return;
          standardAnalyserRef.current.getFloatTimeDomainData(dataBuf);
          const now = performance.now();
          if (now - lastLevelEmitRef.current > 65) {
            lastLevelEmitRef.current = now;
            setAudioLevel(computeRmsLevel(dataBuf));
          }
          standardMeterRafRef.current = window.requestAnimationFrame(tickMeter);
        };
        standardMeterRafRef.current = window.requestAnimationFrame(tickMeter);
      } catch {
        // Waveform metering is best-effort; recording still works
      }

      const preferredMime = pickRecorderMimeType();
      if (preferredMime !== null && typeof MediaRecorder !== 'undefined') {
        try {
          recordedChunksRef.current = [];
          const recorder = preferredMime
            ? new MediaRecorder(stream, { mimeType: preferredMime })
            : new MediaRecorder(stream);

          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              recordedChunksRef.current.push(ev.data);
            }
          };

          recorder.onstop = async () => {
            stopStandardMeter();
            const chunks = recordedChunksRef.current;
            recordedChunksRef.current = [];
            if (chunks.length === 0) {
              setStateSynced('idle');
              setRagLookupNote(null);
              return;
            }
            const actualMime = recorder.mimeType || preferredMime || 'audio/webm';
            const blob = new Blob(chunks, { type: actualMime });
            const arrayBuf = await blob.arrayBuffer();
            const base64 = bytesToBase64(new Uint8Array(arrayBuf));
            await submitStandardVoiceClip(base64, actualMime);
          };

          recorder.onerror = () => {
            stopStandardMeter();
            setVoiceError('Microphone recording interrupted. You can retry or switch to text chat.');
            setStateSynced('idle');
          };

          mediaRecorderRef.current = recorder;
          recorder.start(250);
          return;
        } catch {
          // Fall through to pure PCM WAV capture if MediaRecorder throws on Safari/edge browsers
        }
      }

      // Universal fallback: pure Web Audio PCM -> WAV encoder (works when MediaRecorder is unavailable)
      const inCtx = inputCtxRef.current;
      if (inCtx) {
        fallbackPcmChunksRef.current = [];
        const srcNode = sourceNodeRef.current ?? inCtx.createMediaStreamSource(stream);
        const processor = inCtx.createScriptProcessor(4096, 1, 1);
        const muteGain = inCtx.createGain();
        muteGain.gain.value = 0;

        srcNode.connect(processor);
        processor.connect(muteGain);
        muteGain.connect(inCtx.destination);

        sourceNodeRef.current = srcNode;
        processorRef.current = processor;
        silentGainRef.current = muteGain;

        processor.onaudioprocess = (ev) => {
          if (voiceStateRef.current !== 'listening') return;
          const raw = ev.inputBuffer.getChannelData(0);
          const downsampled = downsampleBuffer(raw, inCtx.sampleRate, 16000);
          fallbackPcmChunksRef.current.push(new Float32Array(downsampled));
        };
      }
    },
    [
      closeSocketOnly,
      disconnectInputProcessor,
      setModeSynced,
      setStateSynced,
      stopPlaybackQueue,
      stopStandardMeter,
      stopStandardRecorderOnly,
      submitStandardVoiceClip,
    ]
  );

  // Stop Standard Voice recording & dispatch recorded audio to /api/voice/standard
  const finishStandardVoiceRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        return;
      } catch {
        // fall through
      }
    }

    // Pure PCM WAV fallback flush
    const chunks = fallbackPcmChunksRef.current;
    fallbackPcmChunksRef.current = [];
    disconnectInputProcessor();
    if (chunks.length === 0) {
      setStateSynced('idle');
      setRagLookupNote(null);
      return;
    }
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    const wavBase64 = encodeFloat32ToWavBase64(merged, 16000);
    void submitStandardVoiceClip(wavBase64, 'audio/wav');
  }, [disconnectInputProcessor, setStateSynced, submitStandardVoiceClip]);

  const playPcm24kChunk = useCallback(
    (base64Pcm: string) => {
      const ctx = outputCtxRef.current;
      if (!ctx) return;

      try {
        if (ctx.state === 'suspended') {
          void ctx.resume();
        }
        const floatSamples = pcm16Base64ToFloat32(base64Pcm);
        if (floatSamples.length === 0) return;

        const now = performance.now();
        if (now - lastLevelEmitRef.current > 65) {
          lastLevelEmitRef.current = now;
          setAudioLevel(computeRmsLevel(floatSamples));
        }

        const audioBuffer = ctx.createBuffer(1, floatSamples.length, 24000);
        audioBuffer.copyToChannel(floatSamples, 0);

        const src = ctx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(ctx.destination);

        const startAt = Math.max(ctx.currentTime + 0.01, nextStartTimeRef.current);
        nextStartTimeRef.current = startAt + audioBuffer.duration;

        activeSourcesRef.current.add(src);
        setIsSpeakingAudio(true);
        if (voiceStateRef.current !== 'speaking') {
          setStateSynced('speaking');
        }

        src.onended = () => {
          activeSourcesRef.current.delete(src);
          if (activeSourcesRef.current.size === 0) {
            setIsSpeakingAudio(false);
            if (isLiveConnectedRef.current && voiceStateRef.current === 'speaking') {
              setStateSynced('listening');
            }
          }
        };

        src.start(startAt);
      } catch (err) {
        setVoiceError(
          err instanceof Error
            ? `Audio playback issue: ${err.message}. Spoken transcript remains visible.`
            : 'Audio playback issue. Spoken transcript remains visible.'
        );
      }
    },
    [setStateSynced]
  );

  const stopSpeaking = useCallback(() => {
    stopPlaybackQueue();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
      } catch {
        // ignore
      }
    }
    if (operatingModeRef.current === 'LIVE_VOICE' && isLiveConnectedRef.current) {
      setStateSynced('listening');
    } else if (voiceStateRef.current === 'speaking') {
      setStateSynced('idle');
    }
  }, [setStateSynced, stopPlaybackQueue]);

  const endVoiceSession = useCallback(() => {
    flushBufferedTurn();
    teardownAll(true);
    setVoiceError(null);
    setFallbackNotice(null);
    setRagLookupNote(null);
    liveFallbackTriggeredRef.current = false;
    setStateSynced('idle');
  }, [flushBufferedTurn, setStateSynced, teardownAll]);

  const triggerAutomaticFallbackToStandard = useCallback(
    (reason: string) => {
      if (liveFallbackTriggeredRef.current) return;
      liveFallbackTriggeredRef.current = true;
      flushBufferedTurn();
      closeSocketOnly(false);

      const activeStream = mediaStreamRef.current;
      if (activeStream && activeStream.getAudioTracks().some((t) => t.readyState === 'live')) {
        beginStandardVoiceRecording(
          activeStream,
          `Live Voice unavailable (${reason}). Switched automatically to Standard Voice — speak now and tap the mic to send.`
        );
      } else {
        teardownAll(false);
        setModeSynced('STANDARD_VOICE');
        setFallbackNotice(
          `Live Voice unavailable (${reason}). Switched to Standard Voice — click the microphone to record a question.`
        );
        setStateSynced('idle');
      }
    },
    [beginStandardVoiceRecording, closeSocketOnly, flushBufferedTurn, setModeSynced, setStateSynced, teardownAll]
  );

  const acquireMicrophone = useCallback(async (): Promise<MediaStream | null> => {
    // Re-use already-live stream to avoid duplicate microphone streams
    if (
      mediaStreamRef.current &&
      mediaStreamRef.current.getAudioTracks().some((t) => t.readyState === 'live')
    ) {
      return mediaStreamRef.current;
    }

    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setModeSynced('TEXT_ONLY');
      setVoiceError(
        'Microphone access requires HTTPS in production. Open KILNOVA over HTTPS or continue using text chat.'
      );
      setStateSynced('error');
      return null;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setModeSynced('TEXT_ONLY');
      setVoiceError(
        'Microphone capture is unavailable in this browser. Text chat remains fully available.'
      );
      setStateSynced('error');
      return null;
    }

    setStateSynced('requesting_mic');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      return stream;
    } catch (err) {
      const mapped = mapVoiceErrorMessage(err);
      setModeSynced(mapped.requiresTextOnly ? 'TEXT_ONLY' : 'CONNECTION_ERROR');
      setVoiceError(mapped.message);
      setStateSynced('error');
      return null;
    }
  }, [setModeSynced, setStateSynced]);

  const startVoiceSession = useCallback(
    async (forceLiveRetry = false) => {
      // If currently recording in Standard Voice mode, tapping the mic submits the spoken turn
      if (!forceLiveRetry && operatingModeRef.current === 'STANDARD_VOICE') {
        if (voiceStateRef.current === 'listening') {
          finishStandardVoiceRecording();
          return;
        }
        if (voiceStateRef.current === 'speaking') {
          stopSpeaking();
          return;
        }
        if (voiceStateRef.current === 'thinking') {
          return;
        }
        const stream = await acquireMicrophone();
        if (!stream) return;
        beginStandardVoiceRecording(stream);
        return;
      }

      // If Live Voice is already active, tapping the mic cleanly ends the active session
      if (
        !forceLiveRetry &&
        operatingModeRef.current === 'LIVE_VOICE' &&
        (voiceStateRef.current === 'listening' ||
          voiceStateRef.current === 'speaking' ||
          voiceStateRef.current === 'thinking' ||
          voiceStateRef.current === 'connecting')
      ) {
        endVoiceSession();
        return;
      }

      // Fresh Live Voice start (or explicit manual Retry Live Voice)
      teardownAll(true);
      liveFallbackTriggeredRef.current = false;
      setModeSynced('LIVE_VOICE');
      setVoiceError(null);
      setFallbackNotice(null);
      setRagLookupNote(null);
      userTranscriptBufRef.current = '';
      assistantTranscriptBufRef.current = '';
      pendingCitationsRef.current = [];
      setLiveUserDraft('');
      setLiveAssistantDraft('');

      // Pre-create AudioContexts inside user click gesture for Safari/iOS HTTPS autoplay compliance
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const inCtx = new AudioCtx({ sampleRate: 16000 });
        const outCtx = new AudioCtx({ sampleRate: 24000 });
        inputCtxRef.current = inCtx;
        outputCtxRef.current = outCtx;
      } catch {
        // Will retry after mic grant or fall back cleanly
      }

      const stream = await acquireMicrophone();
      if (!stream) {
        teardownAll(false);
        return;
      }

      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!inputCtxRef.current) inputCtxRef.current = new AudioCtx({ sampleRate: 16000 });
        if (!outputCtxRef.current) outputCtxRef.current = new AudioCtx({ sampleRate: 24000 });
        if (inputCtxRef.current.state === 'suspended') await inputCtxRef.current.resume();
        if (outputCtxRef.current.state === 'suspended') await outputCtxRef.current.resume();
        nextStartTimeRef.current = outputCtxRef.current.currentTime;
      } catch (err) {
        teardownAll(false);
        setModeSynced('TEXT_ONLY');
        setVoiceError(
          err instanceof Error
            ? `Audio hardware initialization failed: ${err.message}`
            : 'Audio hardware initialization failed.'
        );
        setStateSynced('error');
        return;
      }

      setStateSynced('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/voice/live`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        triggerAutomaticFallbackToStandard('WebSocket blocked by browser/network');
        return;
      }
      wsRef.current = ws;

      // Guard against hung WSS upgrades in production proxies/firewalls (no infinite wait)
      wsTimeoutRef.current = window.setTimeout(() => {
        if (!isLiveConnectedRef.current && voiceStateRef.current === 'connecting') {
          triggerAutomaticFallbackToStandard('real-time connection timed out');
        }
      }, LIVE_CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        const opts = optionsRef.current;
        ws.send(
          JSON.stringify({
            type: 'start',
            language: opts.language,
            collectionFilter: opts.collectionFilter,
            operationalContext: opts.operationalContext,
          })
        );
      };

      ws.onmessage = (event) => {
        let msg: ServerVoiceMessage;
        try {
          msg = JSON.parse(String(event.data)) as ServerVoiceMessage;
        } catch {
          return;
        }

        if (msg.type === 'pong') return;

        if (msg.type === 'status') {
          if (msg.state === 'connecting') {
            isLiveConnectedRef.current = false;
            setStateSynced('connecting');
          } else if (msg.state === 'connected') {
            if (wsTimeoutRef.current !== null) {
              window.clearTimeout(wsTimeoutRef.current);
              wsTimeoutRef.current = null;
            }
            isLiveConnectedRef.current = true;
            advisorDisclaimerRef.current = msg.advisorDisclaimer;
            setModeSynced('LIVE_VOICE');
            setVoiceError(null);
            setFallbackNotice(null);
            setStateSynced('listening');

            // Keepalive ping every 20s for Cloud Run / proxy WSS longevity
            if (wsPingRef.current === null) {
              wsPingRef.current = window.setInterval(() => {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  try {
                    wsRef.current.send(JSON.stringify({ type: 'ping' }));
                  } catch {
                    // ignore
                  }
                }
              }, WS_KEEPALIVE_INTERVAL_MS);
            }

            const inCtx = inputCtxRef.current;
            const activeStream = mediaStreamRef.current;
            if (inCtx && activeStream && !processorRef.current) {
              const srcNode = inCtx.createMediaStreamSource(activeStream);
              const processor = inCtx.createScriptProcessor(4096, 1, 1);
              const muteGain = inCtx.createGain();
              muteGain.gain.value = 0;

              srcNode.connect(processor);
              processor.connect(muteGain);
              muteGain.connect(inCtx.destination);

              sourceNodeRef.current = srcNode;
              processorRef.current = processor;
              silentGainRef.current = muteGain;

              processor.onaudioprocess = (audioEvent) => {
                const socket = wsRef.current;
                if (!isLiveConnectedRef.current || !socket || socket.readyState !== WebSocket.OPEN) {
                  return;
                }
                const rawChannel = audioEvent.inputBuffer.getChannelData(0);
                const resampled = downsampleBuffer(rawChannel, inCtx.sampleRate, 16000);

                if (activeSourcesRef.current.size === 0) {
                  const now = performance.now();
                  if (now - lastLevelEmitRef.current > 65) {
                    lastLevelEmitRef.current = now;
                    setAudioLevel(computeRmsLevel(resampled));
                  }
                }

                const base64Pcm = float32ToPcm16Base64(resampled);
                socket.send(JSON.stringify({ type: 'audio', data: base64Pcm }));
              };
            }
          } else if (msg.state === 'disconnected') {
            flushBufferedTurn();
            teardownAll(false);
            if (voiceStateRef.current !== 'error') {
              setStateSynced('idle');
            }
          }
          return;
        }

        if (msg.type === 'input_transcript' && msg.text) {
          userTranscriptBufRef.current += msg.text;
          setLiveUserDraft(userTranscriptBufRef.current.trim());
          return;
        }

        if (msg.type === 'output_transcript' && msg.text) {
          assistantTranscriptBufRef.current += msg.text;
          setLiveAssistantDraft(assistantTranscriptBufRef.current.trim());
          return;
        }

        if (msg.type === 'rag_lookup_started') {
          setRagLookupNote(`Searching RAG: "${msg.query ?? 'knowledge base'}"`);
          setStateSynced('thinking');
          return;
        }

        if (msg.type === 'rag_citations' && Array.isArray(msg.citations)) {
          const existingIds = new Set(pendingCitationsRef.current.map((c) => c.chunkId));
          for (const cit of msg.citations) {
            if (!existingIds.has(cit.chunkId)) {
              pendingCitationsRef.current.push(cit);
              existingIds.add(cit.chunkId);
            }
          }
          setRagLookupNote(`Retrieved ${pendingCitationsRef.current.length} RAG source(s)`);
          return;
        }

        if (msg.type === 'rag_error') {
          setRagLookupNote(`RAG warning: ${msg.message ?? 'retrieval error'}`);
          return;
        }

        if (msg.type === 'audio' && msg.data) {
          playPcm24kChunk(msg.data);
          return;
        }

        if (msg.type === 'interrupted') {
          stopPlaybackQueue();
          flushBufferedTurn();
          if (isLiveConnectedRef.current) {
            setStateSynced('listening');
          }
          return;
        }

        if (msg.type === 'turn_complete') {
          flushBufferedTurn();
          if (isLiveConnectedRef.current && activeSourcesRef.current.size === 0) {
            setStateSynced('listening');
          }
          return;
        }

        if (msg.type === 'error') {
          if (msg.code === 'MISSING_API_KEY') {
            flushBufferedTurn();
            teardownAll(false);
            setModeSynced('CONNECTION_ERROR');
            setVoiceError(
              msg.message || 'Server GEMINI_API_KEY is not configured. Voice is unavailable.'
            );
            setStateSynced('error');
            return;
          }
          // Automatic non-looping fallback to Secondary Mode (STANDARD VOICE)
          triggerAutomaticFallbackToStandard(msg.code || 'Gemini Live error');
        }
      };

      ws.onerror = () => {
        if (voiceStateRef.current === 'idle') return;
        triggerAutomaticFallbackToStandard('WebSocket transport error');
      };

      ws.onclose = () => {
        if (liveFallbackTriggeredRef.current) return;
        if (isLiveConnectedRef.current || voiceStateRef.current === 'connecting') {
          triggerAutomaticFallbackToStandard('live stream closed');
        }
      };
    },
    [
      acquireMicrophone,
      beginStandardVoiceRecording,
      endVoiceSession,
      finishStandardVoiceRecording,
      flushBufferedTurn,
      playPcm24kChunk,
      setModeSynced,
      setStateSynced,
      stopPlaybackQueue,
      stopSpeaking,
      teardownAll,
      triggerAutomaticFallbackToStandard,
    ]
  );

  const retryLiveVoice = useCallback(() => {
    void startVoiceSession(true);
  }, [startVoiceSession]);

  const dismissVoiceError = useCallback(() => {
    setVoiceError(null);
    if (voiceStateRef.current === 'error') {
      setStateSynced('idle');
    }
  }, [setStateSynced]);

  useEffect(() => {
    return () => {
      teardownAll(true);
    };
  }, [teardownAll]);

  return {
    operatingMode,
    voiceState,
    voiceError,
    fallbackNotice,
    ragLookupNote,
    liveUserDraft,
    liveAssistantDraft,
    audioLevel,
    isSpeakingAudio,
    startVoiceSession,
    retryLiveVoice,
    stopSpeaking,
    endVoiceSession,
    dismissVoiceError,
  };
}
