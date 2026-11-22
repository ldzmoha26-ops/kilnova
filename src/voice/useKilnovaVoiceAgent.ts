import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantLanguage, KnowledgeCollection, RagCitation } from '../rag/types';
import {
  computeRmsLevel,
  downsampleBuffer,
  float32ToPcm16Base64,
  mapVoiceErrorMessage,
  pcm16Base64ToFloat32,
  type VoiceSessionState,
} from './pcmAudio';

export interface VoiceTurnCommit {
  userTranscript?: string;
  assistantTranscript?: string;
  citations?: RagCitation[];
  advisorDisclaimer?: string;
}

interface UseKilnovaVoiceAgentOptions {
  language: AssistantLanguage;
  collectionFilter: KnowledgeCollection | 'all';
  operationalContext: {
    shellMaxTemp: number;
    burningZoneTemp: number;
    affectedZone: string;
    condition: string;
    flaggedSensors: number;
  };
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

export function useKilnovaVoiceAgent(options: UseKilnovaVoiceAgentOptions) {
  const [voiceState, setVoiceState] = useState<VoiceSessionState>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [ragLookupNote, setRagLookupNote] = useState<string | null>(null);
  const [liveUserDraft, setLiveUserDraft] = useState('');
  const [liveAssistantDraft, setLiveAssistantDraft] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeakingAudio, setIsSpeakingAudio] = useState(false);

  // Refs for all mutable session objects accessed inside audio/WS callbacks (never stale closures)
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);

  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const isLiveConnectedRef = useRef(false);
  const voiceStateRef = useRef<VoiceSessionState>('idle');

  const userTranscriptBufRef = useRef('');
  const assistantTranscriptBufRef = useRef('');
  const pendingCitationsRef = useRef<RagCitation[]>([]);
  const advisorDisclaimerRef = useRef<string | undefined>(undefined);
  const lastLevelEmitRef = useRef(0);

  const setStateSynced = useCallback((next: VoiceSessionState) => {
    voiceStateRef.current = next;
    setVoiceState(next);
  }, []);

  const stopPlaybackQueue = useCallback(() => {
    for (const node of activeSourcesRef.current) {
      try {
        node.onended = null;
        node.stop();
        node.disconnect();
      } catch {
        // Ignore already-stopped source nodes
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setIsSpeakingAudio(false);
  }, []);

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
      });
    }

    userTranscriptBufRef.current = '';
    assistantTranscriptBufRef.current = '';
    pendingCitationsRef.current = [];
    setLiveUserDraft('');
    setLiveAssistantDraft('');
    setRagLookupNote(null);
  }, []);

  const teardownMediaAndSocket = useCallback(
    (sendEndSignal: boolean) => {
      isLiveConnectedRef.current = false;
      stopPlaybackQueue();

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

      setAudioLevel(0);
    },
    [stopPlaybackQueue]
  );

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

        // Subtle waveform animation during model speech
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
            ? `Audio playback issue: ${err.message}. Spoken transcript remains visible below.`
            : 'Audio playback issue. Spoken transcript remains visible below.'
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
    if (isLiveConnectedRef.current) {
      setStateSynced('listening');
    }
  }, [setStateSynced, stopPlaybackQueue]);

  const endVoiceSession = useCallback(() => {
    flushBufferedTurn();
    teardownMediaAndSocket(true);
    setVoiceError(null);
    setRagLookupNote(null);
    setStateSynced('idle');
  }, [flushBufferedTurn, setStateSynced, teardownMediaAndSocket]);

  const startVoiceSession = useCallback(async () => {
    // Clean any stale resources first
    teardownMediaAndSocket(true);
    setVoiceError(null);
    setRagLookupNote(null);
    userTranscriptBufRef.current = '';
    assistantTranscriptBufRef.current = '';
    pendingCitationsRef.current = [];
    setLiveUserDraft('');
    setLiveAssistantDraft('');

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setVoiceError(
        'Microphone capture is unavailable in this browser context. Text chat remains fully available.'
      );
      setStateSynced('error');
      return;
    }

    setStateSynced('requesting_mic');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      const mapped = mapVoiceErrorMessage(err);
      setVoiceError(mapped.message);
      setStateSynced('error');
      return;
    }

    mediaStreamRef.current = stream;

    // Create separate 16kHz input and 24kHz output AudioContexts per Gemini Live spec
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const inCtx = new AudioCtx({ sampleRate: 16000 });
      const outCtx = new AudioCtx({ sampleRate: 24000 });
      if (inCtx.state === 'suspended') await inCtx.resume();
      if (outCtx.state === 'suspended') await outCtx.resume();
      inputCtxRef.current = inCtx;
      outputCtxRef.current = outCtx;
      nextStartTimeRef.current = outCtx.currentTime;
    } catch (err) {
      teardownMediaAndSocket(false);
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
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

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

      if (msg.type === 'status') {
        if (msg.state === 'connecting') {
          isLiveConnectedRef.current = false;
          setStateSynced('connecting');
        } else if (msg.state === 'connected') {
          isLiveConnectedRef.current = true;
          advisorDisclaimerRef.current = msg.advisorDisclaimer;
          setVoiceError(null);
          setStateSynced('listening');

          // Begin streaming 16kHz PCM16 mic chunks ONLY once Gemini Live is genuinely connected
          const inCtx = inputCtxRef.current;
          const activeStream = mediaStreamRef.current;
          if (inCtx && activeStream && !processorRef.current) {
            const srcNode = inCtx.createMediaStreamSource(activeStream);
            const processor = inCtx.createScriptProcessor(4096, 1, 1);
            // Route through zero-gain node so processor fires without local mic echo
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

              // Update subtle waveform meter at ~15Hz while listening
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
          teardownMediaAndSocket(false);
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
        flushBufferedTurn();
        teardownMediaAndSocket(false);
        setVoiceError(
          msg.message || 'Gemini Live voice session failed. Text chat remains available.'
        );
        setStateSynced('error');
      }
    };

    ws.onerror = () => {
      if (voiceStateRef.current === 'idle') return;
      teardownMediaAndSocket(false);
      setVoiceError(
        'Network error connecting to the KILNOVA Voice Live server. Text chat remains available.'
      );
      setStateSynced('error');
    };

    ws.onclose = () => {
      if (isLiveConnectedRef.current) {
        flushBufferedTurn();
        teardownMediaAndSocket(false);
        setVoiceError('Voice session disconnected unexpectedly. Click the microphone to reconnect.');
        setStateSynced('error');
      } else if (voiceStateRef.current === 'connecting') {
        teardownMediaAndSocket(false);
        setVoiceError('Unable to establish live voice connection. Text chat remains available.');
        setStateSynced('error');
      }
    };
  }, [flushBufferedTurn, playPcm24kChunk, setStateSynced, stopPlaybackQueue, teardownMediaAndSocket]);

  const dismissVoiceError = useCallback(() => {
    setVoiceError(null);
    if (voiceStateRef.current === 'error') {
      setStateSynced('idle');
    }
  }, [setStateSynced]);

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      teardownMediaAndSocket(true);
    };
  }, [teardownMediaAndSocket]);

  return {
    voiceState,
    voiceError,
    ragLookupNote,
    liveUserDraft,
    liveAssistantDraft,
    audioLevel,
    isSpeakingAudio,
    startVoiceSession,
    stopSpeaking,
    endVoiceSession,
    dismissVoiceError,
  };
}
