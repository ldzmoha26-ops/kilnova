import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AssistantLanguage,
  KnowledgeCollection,
  RagCitation,
  RagQueryResponse,
} from '../rag/types';
import {
  useKilnovaVoiceAgent,
  type OperationalVoiceContext,
  type VoiceTurnCommit,
} from '../voice/useKilnovaVoiceAgent';
import type { VoiceOperatingMode, VoiceSessionState } from '../voice/pcmAudio';

export interface RagChatMessage {
  id: string;
  role: 'supervisor' | 'assistant';
  text: string;
  channel?: 'text' | 'voice';
  voiceMode?: VoiceOperatingMode;
  citations?: RagCitation[];
  model?: string;
  usedEmbeddings?: boolean;
  advisorDisclaimer?: string;
  error?: boolean;
}

export const INITIAL_ASSISTANT_MESSAGES: RagChatMessage[] = [
  {
    id: 'init-rag-welcome',
    role: 'assistant',
    text: 'KILNOVA AI Supervisor Agent is connected to the Gemini RAG knowledge base (technical documents, parameter registry, and synthetic demonstration incident archive CAS-2026-081 / 092 / 105). Ask about the 370 °C shell limit, PRC-2048, electrical/thermal KPIs, or historical corrective actions.',
    advisorDisclaimer: 'Advisor only — does not execute live DCS commands.',
  },
];

const DEFAULT_OPERATIONAL_CONTEXT: OperationalVoiceContext = {
  shellMaxTemp: 412,
  burningZoneTemp: 1486,
  affectedZone: 'Shell Ring B-04 · Meter 39–43',
  condition: 'ANOMALY',
  flaggedSensors: 3,
};

export type AssistantInteractionView = 'voice' | 'text';

interface KilnovaAssistantContextValue {
  messages: RagChatMessage[];
  draftPrompt: string;
  setDraftPrompt: (val: string) => void;
  collectionFilter: KnowledgeCollection | 'all';
  setCollectionFilter: (val: KnowledgeCollection | 'all') => void;
  assistantLanguage: AssistantLanguage;
  setAssistantLanguage: (val: AssistantLanguage) => void;
  isQuerying: boolean;
  expandedCitation: RagCitation | null;
  setExpandedCitation: (cit: RagCitation | null) => void;
  operationalContext: OperationalVoiceContext;
  setOperationalContext: (ctx: OperationalVoiceContext) => void;

  // Floating universal assistant open/minimize & voice-first view state (preserved across page navigation)
  isFloatingOpen: boolean;
  openFloatingAssistant: () => void;
  minimizeFloatingAssistant: () => void;
  interactionView: AssistantInteractionView;
  setInteractionView: (view: AssistantInteractionView) => void;

  // Shared RAG text query
  sendTextQuery: (question: string) => Promise<void>;

  // Shared voice engine (single mic stream & single session across Operator + Supervisor)
  voice: {
    operatingMode: VoiceOperatingMode;
    voiceState: VoiceSessionState;
    voiceError: string | null;
    fallbackNotice: string | null;
    ragLookupNote: string | null;
    liveUserDraft: string;
    liveAssistantDraft: string;
    audioLevel: number;
    isSpeakingAudio: boolean;
    startVoiceSession: (forceLiveRetry?: boolean) => Promise<void>;
    retryLiveVoice: () => void;
    stopSpeaking: () => void;
    endVoiceSession: () => void;
    dismissVoiceError: () => void;
  };
}

const KilnovaAssistantContext = createContext<KilnovaAssistantContextValue | null>(null);

export function KilnovaAssistantProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<RagChatMessage[]>(INITIAL_ASSISTANT_MESSAGES);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [collectionFilter, setCollectionFilter] = useState<KnowledgeCollection | 'all'>('all');
  const [assistantLanguage, setAssistantLanguage] = useState<AssistantLanguage>('auto');
  const [isQuerying, setIsQuerying] = useState(false);
  const [expandedCitation, setExpandedCitation] = useState<RagCitation | null>(null);
  const [operationalContext, setOperationalContext] = useState<OperationalVoiceContext>(
    DEFAULT_OPERATIONAL_CONTEXT
  );

  // Floating assistant starts minimized so dashboards stay unobstructed; opens into VOICE-FIRST view by default
  const [isFloatingOpen, setIsFloatingOpen] = useState(false);
  const [interactionView, setInteractionView] = useState<AssistantInteractionView>('voice');

  const handleVoiceTurnCommit = useCallback((turn: VoiceTurnCommit) => {
    setMessages((prev) => {
      const next = [...prev];
      const baseStamp = Date.now();
      if (turn.userTranscript) {
        next.push({
          id: `vu-${baseStamp}`,
          role: 'supervisor',
          channel: 'voice',
          voiceMode: turn.voiceMode,
          text: turn.userTranscript,
        });
      }
      if (turn.assistantTranscript) {
        next.push({
          id: `va-${baseStamp + 1}`,
          role: 'assistant',
          channel: 'voice',
          voiceMode: turn.voiceMode,
          text: turn.assistantTranscript,
          citations: turn.citations,
          model: turn.model ?? 'gemini-3.8-live',
          advisorDisclaimer:
            turn.advisorDisclaimer ?? 'Advisor only — does not execute live DCS commands.',
        });
      }
      return next;
    });
  }, []);

  const voice = useKilnovaVoiceAgent({
    language: assistantLanguage,
    collectionFilter,
    operationalContext,
    onCommitTurn: handleVoiceTurnCommit,
  });

  const sendTextQuery = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isQuerying) return;

      const stamp = Date.now();
      setMessages((prev) => [
        ...prev,
        { id: `u-${stamp}`, role: 'supervisor', channel: 'text', text: trimmed },
      ]);
      setDraftPrompt('');
      setIsQuerying(true);

      try {
        const response = await fetch('/api/rag/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: trimmed,
            collectionFilter,
            preferredLanguage: assistantLanguage,
            operationalContext,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.error || `HTTP ${response.status} from RAG API`);
        }

        const data = payload as RagQueryResponse;
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            channel: 'text',
            text: data.answer,
            citations: data.citations,
            model: data.model,
            usedEmbeddings: data.usedEmbeddings,
            advisorDisclaimer: data.advisorDisclaimer,
          },
        ]);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to reach KILNOVA RAG Supervisor backend.';
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            channel: 'text',
            text: `RAG Error: ${msg}`,
            error: true,
          },
        ]);
      } finally {
        setIsQuerying(false);
      }
    },
    [assistantLanguage, collectionFilter, isQuerying, operationalContext]
  );

  // Minimize collapses the floating window WITHOUT terminating active voice sessions or resetting state
  const minimizeFloatingAssistant = useCallback(() => {
    setIsFloatingOpen(false);
  }, []);

  const openFloatingAssistant = useCallback(() => {
    setIsFloatingOpen(true);
  }, []);

  const value = useMemo<KilnovaAssistantContextValue>(
    () => ({
      messages,
      draftPrompt,
      setDraftPrompt,
      collectionFilter,
      setCollectionFilter,
      assistantLanguage,
      setAssistantLanguage,
      isQuerying,
      expandedCitation,
      setExpandedCitation,
      operationalContext,
      setOperationalContext,
      isFloatingOpen,
      openFloatingAssistant,
      minimizeFloatingAssistant,
      interactionView,
      setInteractionView,
      sendTextQuery,
      voice,
    }),
    [
      assistantLanguage,
      collectionFilter,
      draftPrompt,
      expandedCitation,
      interactionView,
      isFloatingOpen,
      isQuerying,
      messages,
      minimizeFloatingAssistant,
      openFloatingAssistant,
      operationalContext,
      sendTextQuery,
      voice,
    ]
  );

  return (
    <KilnovaAssistantContext.Provider value={value}>
      {children}
    </KilnovaAssistantContext.Provider>
  );
}

export function useKilnovaAssistant(): KilnovaAssistantContextValue {
  const ctx = useContext(KilnovaAssistantContext);
  if (!ctx) {
    throw new Error('useKilnovaAssistant must be used inside KilnovaAssistantProvider');
  }
  return ctx;
}
