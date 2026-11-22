import { useEffect, useRef, type FormEvent } from 'react';
import {
  BookOpen,
  Keyboard,
  Loader2,
  Mic,
  MicOff,
  Minus,
  PhoneOff,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  VolumeX,
  X,
} from 'lucide-react';
import { useKilnovaAssistant } from '../context/KilnovaAssistantContext';
import { getOperatingModeMeta, getVoiceStatusMeta } from '../voice/pcmAudio';

interface KilnovaFloatingAssistantProps {
  visible: boolean;
}

const WAVEFORM_WEIGHTS = [0.38, 0.68, 0.92, 1.0, 0.85, 0.62, 0.4];

export function KilnovaFloatingAssistant({ visible }: KilnovaFloatingAssistantProps) {
  const {
    messages,
    draftPrompt,
    setDraftPrompt,
    assistantLanguage,
    setAssistantLanguage,
    isQuerying,
    expandedCitation,
    setExpandedCitation,
    isFloatingOpen,
    openFloatingAssistant,
    minimizeFloatingAssistant,
    interactionView,
    setInteractionView,
    sendTextQuery,
    voice,
  } = useKilnovaAssistant();

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  const modeMeta = getOperatingModeMeta(voice.operatingMode);
  const statusMeta = getVoiceStatusMeta(voice.voiceState, voice.operatingMode);
  const isVoiceSessionActive =
    voice.voiceState === 'requesting_mic' ||
    voice.voiceState === 'connecting' ||
    voice.voiceState === 'listening' ||
    voice.voiceState === 'thinking' ||
    voice.voiceState === 'speaking';

  const isMicDisabled = voice.operatingMode === 'TEXT_ONLY' && voice.voiceState === 'error';

  useEffect(() => {
    if (!isFloatingOpen) return;
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isFloatingOpen, messages.length, voice.liveUserDraft, voice.liveAssistantDraft, isQuerying]);

  useEffect(() => {
    if (isFloatingOpen && interactionView === 'text') {
      const id = window.setTimeout(() => textInputRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
  }, [isFloatingOpen, interactionView]);

  if (!visible) return null;

  const handleTextSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendTextQuery(draftPrompt);
  };

  const getVoicePromptInstruction = (): string => {
    if (voice.operatingMode === 'TEXT_ONLY') {
      return 'Microphone unavailable — use text chat below';
    }
    if (voice.operatingMode === 'CONNECTION_ERROR') {
      return 'Voice connection error — retry or switch to text';
    }
    if (voice.voiceState === 'requesting_mic') {
      return 'Allow microphone access in your browser…';
    }
    if (voice.voiceState === 'connecting') {
      return 'Connecting to KILNOVA Live Voice…';
    }
    if (voice.voiceState === 'listening') {
      return voice.operatingMode === 'STANDARD_VOICE'
        ? 'Recording — tap microphone again to send'
        : 'Listening — speak naturally to KILNOVA';
    }
    if (voice.voiceState === 'thinking') {
      return voice.operatingMode === 'STANDARD_VOICE'
        ? 'Transcribing & checking KILNOVA RAG…'
        : 'Searching KILNOVA knowledge base…';
    }
    if (voice.voiceState === 'speaking') {
      return 'KILNOVA is speaking — tap Stop to interrupt';
    }
    if (voice.operatingMode === 'STANDARD_VOICE') {
      return 'Tap microphone to speak (Standard Voice)';
    }
    return 'Speak to KILNOVA';
  };

  const citationModal = expandedCitation ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="citation-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0C0D]/68 p-4 backdrop-blur-sm"
      onClick={() => setExpandedCitation(null)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-[#CBD5E1] bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] pb-3">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#1D64D8]">
              RAG Source Citation · {expandedCitation.collection}
            </p>
            <h3
              id="citation-modal-title"
              className="mt-1 font-display text-base font-semibold text-[#0B0C0D]"
            >
              {expandedCitation.sectionOrCaseId} — {expandedCitation.sourceName}
            </h3>
            <span className="mt-1 inline-block rounded border border-[#FDE68A] bg-[#FFFBEB] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#92400E]">
              {expandedCitation.verificationStatus}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExpandedCitation(null)}
            aria-label="Close source citation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#CBD5E1] text-[#475569] hover:text-[#0B0C0D] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-4 max-h-[260px] overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-[#334155]">
          {expandedCitation.excerpt}
        </p>

        {expandedCitation.incidentMeta && (
          <div className="mt-4 space-y-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-xs text-[#1E293B]">
            <p className="font-mono text-[10px] font-semibold uppercase text-[#92400E]">
              {expandedCitation.incidentMeta.dataOrigin}
            </p>
            <p>
              <strong>Action Taken:</strong> {expandedCitation.incidentMeta.action_taken}
            </p>
            <p>
              <strong>+30 min:</strong> {expandedCitation.incidentMeta.result_30_min}
            </p>
            <p>
              <strong>+60 min:</strong> {expandedCitation.incidentMeta.result_60_min}
            </p>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => setExpandedCitation(null)}
            className="rounded-md bg-[#0B0C0D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D64D8] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // === MINIMIZED FLOATING LAUNCHER (preserves active session & conversation history) ===
  if (!isFloatingOpen) {
    return (
      <>
        <div className="fixed right-3 bottom-3 z-40 sm:right-5 sm:bottom-5 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            data-testid="kilnova-assistant-launcher"
            onClick={openFloatingAssistant}
            aria-label="Open KILNOVA AI Supervisor Voice Assistant"
            className="group flex items-center gap-2.5 rounded-full border border-[#334155] bg-[#0B0C0D] px-3.5 py-2.5 text-white shadow-lg transition-transform hover:scale-[1.02] hover:border-[#60A5FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D64D8] cursor-pointer"
          >
            <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[#1D64D8] text-white">
              <Mic className="h-4 w-4" aria-hidden="true" />
              {isVoiceSessionActive && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0B0C0D] bg-[#10B981] animate-pulse"
                />
              )}
            </span>
            <span className="flex flex-col items-start text-left leading-tight">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#93C5FD]">
                KILNOVA AI
              </span>
              <span className="text-[11px] font-medium text-white">
                {isVoiceSessionActive ? statusMeta.label : 'Voice Assistant'}
              </span>
            </span>
          </button>
        </div>
        {citationModal}
      </>
    );
  }

  // Recent compact turns for voice-first view (full history remains accessible on scroll)
  const visibleMessages = messages;

  return (
    <>
      <aside
        data-testid="kilnova-floating-assistant"
        aria-label="KILNOVA AI Supervisor Assistant"
        className="fixed inset-x-2 bottom-2 z-40 flex max-h-[82dvh] flex-col overflow-hidden rounded-xl border border-[#CBD5E1] bg-white shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[370px] lg:w-[410px] sm:max-h-[min(620px,calc(100dvh-5.5rem))]"
      >
        {/* TOP HEADER: Scoped KILNOVA Charcoal Identity + Operating Mode + Minimize & Separate End Session */}
        <div className="shrink-0 border-b border-[#1E293B] bg-[#0B0C0D] px-3.5 py-2.5 text-white">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#60A5FA]" aria-hidden="true" />
                <h2 className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
                  <span className="sm:hidden">KILNOVA AI</span>
                  <span className="hidden sm:inline">KILNOVA AI SUPERVISOR</span>
                </h2>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  data-testid="assistant-operating-mode"
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] ${modeMeta.badgeClass}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${modeMeta.dotClass}`} aria-hidden="true" />
                  {modeMeta.label}
                </span>
                <span
                  data-testid="assistant-connection-status"
                  className="hidden font-mono text-[9.5px] text-[#94A3B8] sm:inline"
                >
                  {statusMeta.label}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {/* Desktop Language Toggle (hidden on mobile & narrow tablet to prevent header crowding) */}
              <div
                role="group"
                aria-label="Floating assistant language"
                className="hidden items-center gap-0.5 rounded border border-white/15 bg-white/5 p-0.5 lg:inline-flex"
              >
                {(['auto', 'en', 'fr', 'ar'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    aria-pressed={assistantLanguage === lang}
                    onClick={() => setAssistantLanguage(lang)}
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase transition-colors cursor-pointer ${
                      assistantLanguage === lang
                        ? 'bg-[#1D64D8] font-semibold text-white'
                        : 'text-[#CBD5E1] hover:text-white'
                    }`}
                  >
                    {lang === 'auto' ? 'Auto' : lang}
                  </button>
                ))}
              </div>

              {/* Separate End Session button (terminates voice session cleanly) */}
              {isVoiceSessionActive && (
                <button
                  type="button"
                  data-testid="assistant-end-session-btn"
                  onClick={voice.endVoiceSession}
                  aria-label="End active voice session"
                  title="End voice session"
                  className="inline-flex h-8 items-center gap-1 rounded border border-[#EF4444]/50 bg-[#991B1B]/40 px-2 font-mono text-[9.5px] font-semibold text-[#FECACA] hover:bg-[#DC2626] hover:text-white cursor-pointer"
                >
                  <PhoneOff className="h-3 w-3" aria-hidden="true" />
                  <span className="hidden sm:inline">End</span>
                </button>
              )}

              {/* Minimize button (collapses to floating icon WITHOUT terminating session or history) */}
              <button
                type="button"
                data-testid="assistant-minimize-btn"
                onClick={minimizeFloatingAssistant}
                aria-label="Minimize KILNOVA AI Assistant"
                title="Minimize (keeps active session & history)"
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/20 bg-white/10 text-white hover:bg-[#1D64D8] cursor-pointer"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* === VOICE-FIRST VIEW (DEFAULT ON OPEN) === */}
        {interactionView === 'voice' ? (
          <div className="flex min-h-0 flex-1 flex-col bg-[#F8FAFC]">
            {/* Primary Voice Stage: Prominent Microphone + Animated Waveform + Clear Status */}
            <div className="shrink-0 border-b border-[#E2E8F0] bg-white px-4 py-4 text-center sm:py-3.5">
              {/* Honest Fallback / Error Notice (compact) */}
              {voice.voiceError && (
                <div
                  data-testid="floating-voice-error"
                  className="mb-3 flex items-start justify-between gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-2 text-left text-[11px] leading-snug text-[#991B1B]"
                >
                  <span>{voice.voiceError}</span>
                  <button
                    type="button"
                    onClick={voice.dismissVoiceError}
                    aria-label="Dismiss voice notice"
                    className="shrink-0 rounded p-0.5 text-[#991B1B] hover:bg-[#FEE2E2] cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}

              {voice.fallbackNotice && !voice.voiceError && (
                <div
                  data-testid="floating-voice-fallback-notice"
                  className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-1.5 text-left text-[10.5px] leading-snug text-[#0B4EA2]"
                >
                  <span className="min-w-0 flex-1">{voice.fallbackNotice}</span>
                  <button
                    type="button"
                    data-testid="retry-live-voice-btn"
                    onClick={voice.retryLiveVoice}
                    className="inline-flex shrink-0 items-center gap-1 rounded border border-[#1D64D8] bg-white px-2 py-0.5 font-mono text-[9.5px] font-semibold text-[#1D64D8] hover:bg-[#1D64D8] hover:text-white cursor-pointer"
                  >
                    <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />
                    <span>Retry Live</span>
                  </button>
                </div>
              )}

              <div className="flex flex-col items-center">
                {/* Large Prominent Microphone Button (explicit click activation only — never auto-records) */}
                <button
                  type="button"
                  data-testid="floating-voice-mic-btn"
                  disabled={isMicDisabled}
                  onClick={() => {
                    void voice.startVoiceSession();
                  }}
                  aria-label={
                    voice.voiceState === 'listening'
                      ? voice.operatingMode === 'STANDARD_VOICE'
                        ? 'Send recorded spoken question'
                        : 'Stop live voice session'
                      : 'Start speaking with KILNOVA AI'
                  }
                  className={`relative flex h-16 w-16 items-center justify-center rounded-full border-2 transition-all sm:h-14 sm:w-14 ${
                    isMicDisabled
                      ? 'border-[#CBD5E1] bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed'
                      : voice.voiceState === 'listening'
                        ? 'border-[#059669] bg-[#059669] text-white shadow-lg shadow-[#059669]/25 cursor-pointer'
                        : voice.voiceState === 'speaking'
                          ? 'border-[#1D64D8] bg-[#1D64D8] text-white shadow-lg shadow-[#1D64D8]/25 cursor-pointer'
                          : voice.voiceState === 'connecting' ||
                              voice.voiceState === 'requesting_mic' ||
                              voice.voiceState === 'thinking'
                            ? 'border-[#1D64D8] bg-[#EFF6FF] text-[#1D64D8] cursor-pointer'
                            : 'border-[#0B0C0D] bg-[#0B0C0D] text-white shadow-md hover:border-[#1D64D8] hover:bg-[#1D64D8] cursor-pointer'
                  }`}
                >
                  {voice.voiceState === 'connecting' ||
                  voice.voiceState === 'requesting_mic' ||
                  voice.voiceState === 'thinking' ? (
                    <Loader2 className="h-7 w-7 animate-spin sm:h-6 sm:w-6" aria-hidden="true" />
                  ) : isMicDisabled ? (
                    <MicOff className="h-7 w-7 sm:h-6 sm:w-6" aria-hidden="true" />
                  ) : (
                    <Mic className="h-7 w-7 sm:h-6 sm:w-6" aria-hidden="true" />
                  )}
                </button>

                {/* Simple Animated Waveform */}
                <div
                  data-testid="floating-voice-waveform"
                  aria-label="Voice audio activity waveform"
                  className="mt-3 flex h-5 items-center justify-center gap-1"
                >
                  {WAVEFORM_WEIGHTS.map((weight, idx) => {
                    const isAnimated =
                      voice.voiceState === 'listening' || voice.voiceState === 'speaking';
                    const barHeight = isAnimated
                      ? Math.max(4, Math.round(4 + Math.min(1, voice.audioLevel * weight + 0.14) * 16))
                      : 4;
                    return (
                      <span
                        key={idx}
                        className={`w-1 rounded-full transition-all duration-75 ${
                          voice.voiceState === 'listening'
                            ? 'bg-[#059669]'
                            : voice.voiceState === 'speaking'
                              ? 'bg-[#1D64D8]'
                              : voice.voiceState === 'thinking' || voice.voiceState === 'connecting'
                                ? 'bg-[#60A5FA] animate-pulse'
                                : 'bg-[#CBD5E1]'
                        }`}
                        style={{ height: `${barHeight}px` }}
                      />
                    );
                  })}
                </div>

                {/* Clear Primary Instruction & Live State */}
                <p
                  data-testid="floating-voice-prompt"
                  className="mt-2 text-xs font-semibold text-[#0B0C0D]"
                >
                  {getVoicePromptInstruction()}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${statusMeta.textColorClass}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${statusMeta.dotColorClass}`}
                      aria-hidden="true"
                    />
                    {statusMeta.label}
                  </span>

                  {(voice.isSpeakingAudio || voice.voiceState === 'speaking') && (
                    <button
                      type="button"
                      data-testid="floating-stop-speaking-btn"
                      onClick={voice.stopSpeaking}
                      className="inline-flex items-center gap-1 rounded border border-[#CBD5E1] bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-[#0B0C0D] hover:border-[#1D64D8] hover:text-[#1D64D8] cursor-pointer"
                    >
                      <VolumeX className="h-3 w-3" aria-hidden="true" />
                      <span>Stop</span>
                    </button>
                  )}
                </div>

                {voice.ragLookupNote && !voice.voiceError && (
                  <p className="mt-1 font-mono text-[9.5px] text-[#1D64D8]">{voice.ragLookupNote}</p>
                )}
              </div>
            </div>

            {/* Readable Scrollable Transcript (Short & Clean on Mobile, Full History on Scroll) */}
            <div
              aria-live="polite"
              className="min-h-[120px] flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3"
            >
              {visibleMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={msg.role === 'supervisor' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      msg.role === 'supervisor'
                        ? 'max-w-[88%] rounded-lg bg-[#0B0C0D] px-3 py-2 text-xs leading-[1.5] text-white'
                        : msg.error
                          ? 'max-w-[94%] rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs leading-[1.55] text-[#991B1B]'
                          : 'max-w-[94%] rounded-lg border border-[#BFDBFE] bg-white px-3 py-2 text-xs leading-[1.55] text-[#1E293B]'
                    }
                  >
                    <p
                      className={`mb-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] ${
                        msg.role === 'supervisor' ? 'text-[#93C5FD]' : 'text-[#1D64D8]'
                      }`}
                    >
                      {msg.role === 'supervisor' ? 'You' : 'KILNOVA AI'}
                      {msg.channel === 'voice' ? ' · VOICE' : ''}
                    </p>
                    <p dir="auto" className="whitespace-pre-wrap break-words">
                      {msg.text}
                    </p>

                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 border-t border-[#E2E8F0] pt-1.5">
                        {msg.citations.slice(0, 4).map((cit) => {
                          const isDemo = cit.verificationStatus === 'DEMONSTRATION DATA';
                          return (
                            <button
                              key={cit.chunkId}
                              type="button"
                              onClick={() => setExpandedCitation(cit)}
                              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] cursor-pointer ${
                                isDemo
                                  ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'
                                  : 'border-[#BFDBFE] bg-[#EFF6FF] text-[#0B4EA2]'
                              }`}
                            >
                              <BookOpen className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                              <span className="max-w-[140px] truncate">{cit.sectionOrCaseId}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {voice.liveUserDraft && (
                <div className="flex justify-end">
                  <div className="max-w-[88%] rounded-lg bg-[#0B0C0D]/85 px-3 py-2 text-xs text-white">
                    <p className="mb-0.5 font-mono text-[9px] uppercase text-[#93C5FD]">
                      You · LIVE
                    </p>
                    <p dir="auto">{voice.liveUserDraft}</p>
                  </div>
                </div>
              )}

              {voice.liveAssistantDraft && (
                <div className="flex justify-start">
                  <div className="max-w-[94%] rounded-lg border border-[#BFDBFE] bg-white px-3 py-2 text-xs text-[#1E293B]">
                    <p className="mb-0.5 font-mono text-[9px] uppercase text-[#1D64D8]">
                      KILNOVA AI · SPEAKING
                    </p>
                    <p dir="auto">{voice.liveAssistantDraft}</p>
                  </div>
                </div>
              )}

              <div ref={transcriptEndRef} />
            </div>

            {/* Footer: Advisor Safety Line + Small Switch to Text Chat Option */}
            <div className="shrink-0 flex items-center justify-between gap-2 border-t border-[#E2E8F0] bg-white px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-3.5">
              <span className="font-mono text-[9.5px] text-[#64748B]">
                <span className="sm:hidden">Advisor · &lt; 370 °C</span>
                <span className="hidden sm:inline">Advisor only · Limit &lt; 370 °C</span>
              </span>
              <button
                type="button"
                data-testid="switch-to-text-btn"
                onClick={() => setInteractionView('text')}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 py-1.5 text-[11px] font-medium text-[#0B0C0D] hover:border-[#1D64D8] hover:text-[#1D64D8] cursor-pointer"
              >
                <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Switch to text chat</span>
              </button>
            </div>
          </div>
        ) : (
          /* === TEXT CHAT FALLBACK VIEW (shares exact conversation & RAG backend) === */
          <div className="flex min-h-0 flex-1 flex-col bg-[#F8FAFC]">
            {voice.operatingMode === 'TEXT_ONLY' && (
              <div className="shrink-0 border-b border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-1.5 text-[10.5px] text-[#92400E]">
                {voice.voiceError || 'Audio is unavailable on this device. Full RAG text chat is active.'}
              </div>
            )}

            <div
              aria-live="polite"
              className="min-h-[160px] flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3"
            >
              {visibleMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={msg.role === 'supervisor' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      msg.role === 'supervisor'
                        ? 'max-w-[88%] rounded-lg bg-[#0B0C0D] px-3 py-2 text-xs leading-[1.5] text-white'
                        : msg.error
                          ? 'max-w-[94%] rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs leading-[1.55] text-[#991B1B]'
                          : 'max-w-[94%] rounded-lg border border-[#BFDBFE] bg-white px-3 py-2 text-xs leading-[1.55] text-[#1E293B]'
                    }
                  >
                    <p
                      className={`mb-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] ${
                        msg.role === 'supervisor' ? 'text-[#93C5FD]' : 'text-[#1D64D8]'
                      }`}
                    >
                      {msg.role === 'supervisor' ? 'You' : 'KILNOVA AI'}
                      {msg.channel === 'voice' ? ' · VOICE' : ''}
                    </p>
                    <p dir="auto" className="whitespace-pre-wrap break-words">
                      {msg.text}
                    </p>

                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 border-t border-[#E2E8F0] pt-1.5">
                        {msg.citations.map((cit) => {
                          const isDemo = cit.verificationStatus === 'DEMONSTRATION DATA';
                          return (
                            <button
                              key={cit.chunkId}
                              type="button"
                              onClick={() => setExpandedCitation(cit)}
                              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] cursor-pointer ${
                                isDemo
                                  ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'
                                  : 'border-[#BFDBFE] bg-[#EFF6FF] text-[#0B4EA2]'
                              }`}
                            >
                              <BookOpen className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                              <span className="max-w-[140px] truncate">{cit.sectionOrCaseId}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isQuerying && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-[#BFDBFE] bg-white px-3 py-2 font-mono text-[11px] text-[#1D64D8]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Searching RAG corpus…</span>
                  </div>
                </div>
              )}

              <div ref={transcriptEndRef} />
            </div>

            {/* Sticky Text Composer with Mobile Safe-Area Padding */}
            <div className="shrink-0 border-t border-[#E2E8F0] bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <form onSubmit={handleTextSubmit} className="flex items-center gap-1.5">
                <label htmlFor="floating-kilnova-text-input" className="sr-only">
                  Ask KILNOVA AI
                </label>
                <input
                  ref={textInputRef}
                  id="floating-kilnova-text-input"
                  data-testid="floating-text-input"
                  type="text"
                  value={draftPrompt}
                  onChange={(e) => setDraftPrompt(e.target.value)}
                  placeholder="Ask about 370 °C limit, CAS-2026-081..."
                  className="min-h-[40px] min-w-0 flex-1 rounded-md border border-[#CBD5E1] bg-white px-3 text-xs text-[#0B0C0D] placeholder-[#94A3B8] focus:border-[#1D64D8] focus:outline-none"
                />
                <button
                  type="button"
                  data-testid="switch-to-voice-btn"
                  onClick={() => setInteractionView('voice')}
                  aria-label="Return to voice chat view"
                  title="Switch to voice chat"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#CBD5E1] bg-[#F8FAFC] text-[#0B0C0D] hover:border-[#1D64D8] hover:text-[#1D64D8] cursor-pointer"
                >
                  <Mic className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="submit"
                  data-testid="floating-text-send-btn"
                  disabled={!draftPrompt.trim() || isQuerying}
                  aria-label="Send message to KILNOVA AI"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#1D64D8] text-white hover:bg-[#0B4EA2] disabled:opacity-45 cursor-pointer"
                >
                  <SendHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>
        )}
      </aside>

      {citationModal}
    </>
  );
}
