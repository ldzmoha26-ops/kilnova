import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  BookOpen,
  CheckCircle2,
  FilePlus2,
  FileText,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  PlusCircle,
  SendHorizontal,
  Sparkles,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AUTO_PILOT_PRESETS,
  INITIAL_PROCESS_HISTORY,
  SHELL_SAFETY_LIMIT_C,
  type KilnCondition,
  type ProcessHistoryRecord,
} from '../utils/kilnSimulation';
import { SYSTEM_HEALTH_SENSORS, type OperatingRegime } from '../data/industrialAnalytics';
import { SYNTHETIC_DEMO_INCIDENTS } from '../rag/knowledgeCorpus';
import type {
  AssistantLanguage,
  HistoricalIncidentRecord,
  KnowledgeCollection,
  KnowledgeDocument,
  RagCitation,
  RagQueryResponse,
} from '../rag/types';
import { auth, saveUserRagDocument, saveUserRagIncident } from '../lib/firebase';
import { getVoiceStatusMeta } from '../voice/pcmAudio';
import { useKilnovaVoiceAgent, type VoiceTurnCommit } from '../voice/useKilnovaVoiceAgent';
import { IndustrialKpiPanel } from './IndustrialKpiPanel';
import { ParameterRegistryPanel } from './ParameterRegistryPanel';

interface SupervisorDashboardPageProps {
  onOpenSystemHealth?: () => void;
}

interface RagChatMessage {
  id: string;
  role: 'supervisor' | 'assistant';
  text: string;
  channel?: 'text' | 'voice';
  citations?: RagCitation[];
  model?: string;
  usedEmbeddings?: boolean;
  advisorDisclaimer?: string;
  error?: boolean;
}

const RAG_QUICK_PROMPTS = [
  'Shell reached 412 °C on Ring B-04. What is the configured limit and any similar past incident?',
  'Summarize demonstration incident CAS-2026-081 and its 30 min / 60 min outcomes.',
  'Which workshop equipment dominates electrical energy (kWh/t)?',
  'Distinguish the faulty O2 analyzer from real kiln process anomalies.',
] as const;

const INITIAL_ASSISTANT_MESSAGES: RagChatMessage[] = [
  {
    id: 'init-rag-welcome',
    role: 'assistant',
    text: 'KILNOVA AI Supervisor Agent is connected to the Gemini RAG knowledge base (technical documents, parameter registry, and synthetic demonstration incident archive CAS-2026-081 / 092 / 105). Ask about the 370 °C shell limit, PRC-2048, electrical/thermal KPIs, or historical corrective actions.',
    advisorDisclaimer: 'Advisor only — does not execute live DCS commands.',
  },
];

function statusIndicatorClasses(status: KilnCondition): { dot: string; text: string } {
  if (status === 'ANOMALY') {
    return { dot: 'bg-[#DC2626]', text: 'text-[#DC2626] font-semibold' };
  }
  if (status === 'WARNING') {
    return { dot: 'bg-[#1D64D8]', text: 'text-[#1D64D8] font-semibold' };
  }
  return { dot: 'bg-[#94A3B8]', text: 'text-[#475569] font-medium' };
}

export function SupervisorDashboardPage({ onOpenSystemHealth }: SupervisorDashboardPageProps) {
  const [statusFilter, setStatusFilter] = useState<'ALL' | KilnCondition>('ALL');
  const [selectedRecordId, setSelectedRecordId] = useState<string>(INITIAL_PROCESS_HISTORY[0].id);
  const [inspectedReport, setInspectedReport] = useState<ProcessHistoryRecord | null>(null);
  const [lowerTab, setLowerTab] = useState<'kpis' | 'incidents' | 'registry'>('kpis');
  const [regime, setRegime] = useState<OperatingRegime>('NORMAL');

  // Real RAG AI Supervisor Agent state (shared across text & live voice)
  const [messages, setMessages] = useState<RagChatMessage[]>(INITIAL_ASSISTANT_MESSAGES);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [collectionFilter, setCollectionFilter] = useState<KnowledgeCollection | 'all'>('all');
  const [assistantLanguage, setAssistantLanguage] = useState<AssistantLanguage>('auto');
  const [isQuerying, setIsQuerying] = useState(false);
  const [expandedCitation, setExpandedCitation] = useState<RagCitation | null>(null);

  const [incidents, setIncidents] = useState<HistoricalIncidentRecord[]>([
    ...SYNTHETIC_DEMO_INCIDENTS,
  ]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);

  // Ingestion modals
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [incModalOpen, setIncModalOpen] = useState(false);
  const [ingestFeedback, setIngestFeedback] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [isSubmittingIngest, setIsSubmittingIngest] = useState(false);

  const [docTitle, setDocTitle] = useState('');
  const [docSection, setDocSection] = useState('');
  const [docSource, setDocSource] = useState('');
  const [docCollection, setDocCollection] = useState<
    'technical_docs' | 'equipment_registry' | 'procedures'
  >('technical_docs');
  const [docStatus, setDocStatus] = useState<
    'VERIFIED' | 'PENDING PLANT VALIDATION' | 'PROTOTYPE CONFIGURED'
  >('PENDING PLANT VALIDATION');
  const [docContent, setDocContent] = useState('');

  const [incCaseId, setIncCaseId] = useState('CAS-2026-112');
  const [incDate, setIncDate] = useState('2026-11-22');
  const [incSeverity, setIncSeverity] = useState<'WARNING' | 'CRITICAL' | 'EMERGENCY'>('CRITICAL');
  const [incProblem, setIncProblem] = useState('');
  const [incContext, setIncContext] = useState('');
  const [incAction, setIncAction] = useState('');
  const [incRes30, setIncRes30] = useState('');
  const [incRes60, setIncRes60] = useState('');
  const [incTags, setIncTags] = useState('Shell Hotspot, Ring B-04');

  const threadContainerRef = useRef<HTMLDivElement | null>(null);
  const hasInteractedRef = useRef(false);

  useEffect(() => {
    fetch('/api/rag/incidents')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.incidents) && data.incidents.length > 0) {
          setIncidents(data.incidents);
        }
      })
      .catch(() => {});

    fetch('/api/rag/documents')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.documents)) {
          setDocuments(data.documents);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasInteractedRef.current) return;
    const container = threadContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isQuerying]);

  useEffect(() => {
    if (!inspectedReport) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInspectedReport(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inspectedReport]);

  const visibleRecords =
    statusFilter === 'ALL'
      ? INITIAL_PROCESS_HISTORY
      : INITIAL_PROCESS_HISTORY.filter((r) => r.condition === statusFilter);

  const selectedRecord =
    visibleRecords.find((r) => r.id === selectedRecordId) ??
    visibleRecords[0] ??
    INITIAL_PROCESS_HISTORY[0];

  const nominalCount = SYSTEM_HEALTH_SENSORS.filter((s) => s.state === 'Nominal').length;
  const flaggedSensorsCount = SYSTEM_HEALTH_SENSORS.length - nominalCount;
  const anomalyCount = INITIAL_PROCESS_HISTORY.filter((r) => r.condition === 'ANOMALY').length;
  const warningCount = INITIAL_PROCESS_HISTORY.filter((r) => r.condition === 'WARNING').length;

  const handleVoiceTurnCommit = useCallback((turn: VoiceTurnCommit) => {
    hasInteractedRef.current = true;
    setMessages((prev) => {
      const next = [...prev];
      const baseStamp = Date.now();
      if (turn.userTranscript) {
        next.push({
          id: `vu-${baseStamp}`,
          role: 'supervisor',
          channel: 'voice',
          text: turn.userTranscript,
        });
      }
      if (turn.assistantTranscript) {
        next.push({
          id: `va-${baseStamp + 1}`,
          role: 'assistant',
          channel: 'voice',
          text: turn.assistantTranscript,
          citations: turn.citations,
          model: 'gemini-3.8-live',
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
    operationalContext: {
      shellMaxTemp: 412,
      burningZoneTemp: 1486,
      affectedZone: 'Shell Ring B-04 · Meter 39–43',
      condition: 'ANOMALY',
      flaggedSensors: flaggedSensorsCount,
    },
    onCommitTurn: handleVoiceTurnCommit,
  });

  const voiceMeta = getVoiceStatusMeta(voice.voiceState);
  const isVoiceBarVisible = voice.voiceState !== 'idle' || Boolean(voice.voiceError);

  useEffect(() => {
    if (!hasInteractedRef.current && !voice.liveUserDraft && !voice.liveAssistantDraft) return;
    const container = threadContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [voice.liveUserDraft, voice.liveAssistantDraft]);

  const sendSupervisorQuery = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isQuerying) return;

    const stamp = Date.now();
    hasInteractedRef.current = true;
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
          operationalContext: {
            shellMaxTemp: 412,
            burningZoneTemp: 1486,
            affectedZone: 'Shell Ring B-04 · Meter 39–43',
            condition: 'ANOMALY',
            flaggedSensors: flaggedSensorsCount,
          },
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
          text: data.answer,
          citations: data.citations,
          model: data.model,
          usedEmbeddings: data.usedEmbeddings,
          advisorDisclaimer: data.advisorDisclaimer,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          error: true,
          text:
            err instanceof Error
              ? `RAG service error: ${err.message}`
              : 'Unable to reach AI Supervisor RAG backend.',
        },
      ]);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendSupervisorQuery(draftPrompt);
  };

  const handleCreateDocument = async (e: FormEvent) => {
    e.preventDefault();
    setIngestError(null);
    setIngestFeedback(null);
    setIsSubmittingIngest(true);
    try {
      const res = await fetch('/api/rag/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: docTitle,
          section: docSection,
          source: docSource,
          collection: docCollection,
          verificationStatus: docStatus,
          content: docContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to add technical document');

      const savedDoc = data.document as KnowledgeDocument;
      setDocuments((prev) => [savedDoc, ...prev]);

      if (auth.currentUser) {
        await saveUserRagDocument({
          id: savedDoc.id,
          title: savedDoc.title,
          section: savedDoc.section,
          source: savedDoc.source,
          collection: docCollection,
          verificationStatus: docStatus,
          content: savedDoc.content,
        });
      }

      setIngestFeedback(`Indexed "${savedDoc.title}" into RAG store (${data.chunks} chunks).`);
      setDocTitle('');
      setDocSection('');
      setDocSource('');
      setDocContent('');
      setDocModalOpen(false);
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Failed to store technical document.');
    } finally {
      setIsSubmittingIngest(false);
    }
  };

  const handleCreateIncident = async (e: FormEvent) => {
    e.preventDefault();
    setIngestError(null);
    setIngestFeedback(null);
    setIsSubmittingIngest(true);
    try {
      const tagList = incTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch('/api/rag/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: incCaseId,
          date: incDate,
          severity: incSeverity,
          problem: incProblem,
          context: incContext,
          action_taken: incAction,
          result_30_min: incRes30,
          result_60_min: incRes60,
          tags: tagList,
          dataOrigin: 'USER SUBMITTED LOG',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to add incident log');

      const savedInc = data.incident as HistoricalIncidentRecord;
      setIncidents((prev) => [savedInc, ...prev]);

      if (auth.currentUser) {
        await saveUserRagIncident({
          id: savedInc.case_id,
          ...savedInc,
        });
      }

      setIngestFeedback(`Indexed incident ${savedInc.case_id} (${data.chunks} chunks).`);
      setIncCaseId(`CAS-2026-${Math.floor(113 + Math.random() * 800)}`);
      setIncProblem('');
      setIncContext('');
      setIncAction('');
      setIncRes30('');
      setIncRes60('');
      setIncModalOpen(false);
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Failed to store incident record.');
    } finally {
      setIsSubmittingIngest(false);
    }
  };

  return (
    <div
      data-testid="supervisor-dashboard-page"
      className="min-h-screen bg-[#F1F5F9] pt-16 text-[#0B0C0D]"
    >
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-3.5 p-3.5">
        {ingestFeedback && (
          <div className="flex items-center gap-2 rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] px-3.5 py-2 text-xs font-medium text-[#065F46]">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{ingestFeedback}</span>
          </div>
        )}

        {/* ORIGINAL TOP 4-CARD KPI OVERSIGHT STRIP (Preserved Overall Kiln Status + 370 °C Limit) */}
        <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center justify-between rounded-lg border border-[#DC2626] bg-[#0B0C0D] px-4 py-2.5 text-white">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#FCA5A5]">
                Overall Kiln Status · Demo Data
              </p>
              <p className="mt-0.5 font-display text-base font-semibold">ANOMALY · Ring B-04</p>
              <p className="font-mono text-[10px] text-[#FCA5A5]">
                Limit &lt; {SHELL_SAFETY_LIMIT_C} °C (+{412 - SHELL_SAFETY_LIMIT_C} °C)
              </p>
            </div>
            <span className="font-mono text-sm font-bold tabular-nums text-[#F87171]">412 °C</span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#D4DCE7] bg-white px-4 py-2.5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                Logged Processes
              </p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[#0B0C0D]">
                {INITIAL_PROCESS_HISTORY.length} Records
              </p>
            </div>
            <span className="font-mono text-[11px] font-semibold text-[#1D64D8]">
              {anomalyCount} Anomaly · {warningCount} Warn
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#D4DCE7] bg-white px-4 py-2.5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                Sensor Health
              </p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[#0B0C0D]">
                {nominalCount} / {SYSTEM_HEALTH_SENSORS.length} Nominal
              </p>
            </div>
            {onOpenSystemHealth ? (
              <button
                type="button"
                onClick={onOpenSystemHealth}
                className="font-mono text-[11px] font-semibold text-[#1D64D8] hover:underline cursor-pointer"
              >
                {flaggedSensorsCount} Flagged →
              </button>
            ) : (
              <span className="font-mono text-[11px] font-semibold text-[#1D64D8]">
                {flaggedSensorsCount} Flagged
              </span>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#D4DCE7] bg-white px-4 py-2.5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                Active Thermal Focus
              </p>
              <p className="mt-0.5 text-sm font-semibold text-[#0B0C0D]">Meter 39 — 43 Shell</p>
            </div>
            <button
              type="button"
              onClick={() => setInspectedReport(INITIAL_PROCESS_HISTORY[0])}
              className="rounded border border-[#1D64D8] bg-[#EFF6FF] px-2.5 py-1 font-mono text-[10px] font-semibold text-[#0B4EA2] hover:bg-[#1D64D8] hover:text-white cursor-pointer"
            >
              PRC-2048
            </button>
          </div>
        </div>

        {/* ORIGINAL MAIN 7 / 5 OPERATIONAL SPLIT */}
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          {/* Left 7 Columns: Original Process History & Reports + Original Sensor Condition Overview */}
          <div className="flex flex-col gap-3.5 lg:col-span-7">
            {/* A. Original Process History & Reports */}
            <section
              aria-label="Process History and Reports"
              className="flex flex-col overflow-hidden rounded-lg border border-[#D4DCE7] bg-white"
            >
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0B0C0D]">
                  Process History &amp; Reports
                </p>

                <div
                  role="tablist"
                  aria-label="Filter process history by status"
                  className="flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-white p-0.5"
                >
                  {(['ALL', 'NORMAL', 'WARNING', 'ANOMALY'] as const).map((tab) => {
                    const active = statusFilter === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setStatusFilter(tab)}
                        className={`rounded px-2.5 py-1 font-mono text-[10px] font-medium transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#0B0C0D] text-white font-semibold'
                            : 'text-[#475569] hover:text-[#0B0C0D]'
                        }`}
                      >
                        {tab === 'ALL' ? 'All' : tab}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] border-collapse text-left">
                  <thead className="bg-white">
                    <tr className="border-b border-[#E2E8F0] font-mono text-[10px] uppercase tracking-[0.06em] text-[#64748B]">
                      <th className="px-4 py-2 font-medium">Process ID</th>
                      <th className="px-2.5 py-2 font-medium">Date &amp; Time</th>
                      <th className="px-2.5 py-2 font-medium">Mode</th>
                      <th className="px-2.5 py-2 text-right font-medium">Burning / Shell</th>
                      <th className="px-2.5 py-2 text-right font-medium">Status</th>
                      <th className="px-4 py-2 text-right font-medium">Report</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-xs">
                    {visibleRecords.map((record) => {
                      const selected = record.id === selectedRecord.id;
                      const indicator = statusIndicatorClasses(record.condition);
                      return (
                        <tr
                          key={record.id}
                          onClick={() => setSelectedRecordId(record.id)}
                          className={`cursor-pointer transition-colors ${
                            selected ? 'bg-[#EFF6FF]/75' : 'hover:bg-[#F8FAFC]'
                          }`}
                        >
                          <td className="px-4 py-2.5 font-mono font-semibold text-[#0B0C0D]">
                            {record.id}
                          </td>
                          <td className="px-2.5 py-2.5 font-mono text-[11px] tabular-nums text-[#475569]">
                            {record.timestamp}
                          </td>
                          <td className="px-2.5 py-2.5 text-[#1E293B]">
                            {record.mode === 'AUTO_PILOT' ? 'Auto Pilot' : 'Manual Simulation'}
                          </td>
                          <td className="px-2.5 py-2.5 text-right font-mono text-[11px] tabular-nums text-[#0B0C0D]">
                            {record.burningZoneTemp} °C /{' '}
                            <span
                              className={
                                record.shellMaxTemp > SHELL_SAFETY_LIMIT_C
                                  ? 'font-bold text-[#DC2626]'
                                  : ''
                              }
                            >
                              {record.shellMaxTemp} °C
                            </span>
                          </td>
                          <td className="px-2.5 py-2.5 text-right">
                            <span
                              className={`inline-flex items-center justify-end gap-1.5 font-mono text-[10px] tracking-[0.04em] ${indicator.text}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-[1px] ${indicator.dot}`}
                                aria-hidden="true"
                              />
                              {record.condition}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRecordId(record.id);
                                setInspectedReport(record);
                              }}
                              aria-label={`Inspect report ${record.id}`}
                              className="inline-flex items-center gap-1 rounded border border-[#CBD5E1] bg-white px-2 py-0.5 text-[11px] font-medium text-[#0B0C0D] transition-colors hover:border-[#1D64D8] hover:text-[#1D64D8] cursor-pointer"
                            >
                              <FileText className="h-3 w-3" aria-hidden="true" />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-xs">
                <p className="min-w-0 flex-1 truncate text-[#334155]">
                  <span className="font-mono font-semibold text-[#0B0C0D]">
                    {selectedRecord.id}
                  </span>{' '}
                  · {selectedRecord.summary}
                </p>
                <button
                  type="button"
                  onClick={() => setInspectedReport(selectedRecord)}
                  className="shrink-0 font-mono text-[11px] font-semibold text-[#1D64D8] hover:underline cursor-pointer"
                >
                  Open Full Report →
                </button>
              </div>
            </section>

            {/* B. Original 3x2 Sensor Condition Overview */}
            <section
              aria-label="Sensor Condition Overview"
              className="flex flex-col overflow-hidden rounded-lg border border-[#D4DCE7] bg-white"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0B0C0D]">
                  Sensor Condition Overview
                </p>
                <span className="font-mono text-[10px] font-semibold text-[#1D64D8]">
                  {flaggedSensorsCount} Require Attention · {SYSTEM_HEALTH_SENSORS.length} Total
                </span>
              </div>

              <div className="grid flex-1 grid-cols-1 divide-y divide-[#E2E8F0] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
                {SYSTEM_HEALTH_SENSORS.map((sensor, idx) => {
                  const isProcAnomaly = sensor.faultClass === 'PROCESS_ANOMALY';
                  const isSensorFault = sensor.faultClass === 'SENSOR_FAULT';
                  return (
                    <div
                      key={sensor.id}
                      className={`flex flex-col justify-between p-3 ${
                        sensor.id === 'SNS-IR04'
                          ? 'bg-[#FEF2F2]'
                          : isProcAnomaly
                            ? 'bg-[#EFF6FF]/60'
                            : isSensorFault
                              ? 'bg-[#FFFBEB]'
                              : 'bg-white'
                      } ${idx >= 3 ? 'lg:border-t lg:border-[#E2E8F0]' : ''} ${
                        idx % 3 !== 0 ? 'lg:border-l lg:border-[#E2E8F0]' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold leading-snug text-[#0B0C0D]">
                          {sensor.name}
                        </p>
                        <span
                          className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${
                            sensor.id === 'SNS-IR04' ? 'text-[#DC2626]' : 'text-[#0B0C0D]'
                          }`}
                        >
                          {sensor.valueDisplay}
                        </span>
                      </div>

                      <div className="mt-1.5">
                        <p className="text-[10px] text-[#64748B]">
                          {sensor.zone} · {sensor.configuredLimit}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between font-mono text-[10px]">
                          <span
                            className={
                              sensor.id === 'SNS-IR04'
                                ? 'font-semibold text-[#DC2626]'
                                : isSensorFault
                                  ? 'font-semibold text-[#B45309]'
                                  : isProcAnomaly
                                    ? 'font-semibold text-[#1D64D8]'
                                    : 'text-[#64748B]'
                            }
                          >
                            {isSensorFault
                              ? 'SENSOR FAULT'
                              : sensor.id === 'SNS-IR04'
                                ? 'ANOMALY'
                                : isProcAnomaly
                                  ? 'WARNING'
                                  : 'NORMAL'}
                          </span>
                          <span
                            className={
                              sensor.commStatus === 'OPC-UA Sim OK'
                                ? 'text-[#64748B]'
                                : 'font-semibold text-[#B45309]'
                            }
                          >
                            {sensor.commStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Right 5 Columns: ORIGINAL AI SUPERVISOR AGENT DESIGN (Powered by Real Gemini RAG) */}
          <section
            data-testid="ai-supervisor-agent"
            aria-label="AI Supervisor Agent"
            className="flex h-[560px] flex-col overflow-hidden rounded-lg border border-[#CBD5E1] bg-white lg:col-span-5 lg:h-[600px]"
          >
            <div className="shrink-0 border-b border-[#1E293B] bg-[#0B0C0D] px-4 py-3 text-white">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-[#60A5FA]" aria-hidden="true" />
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#93C5FD]">
                      AI Supervisor Agent · RAG
                    </p>
                  </div>
                  <h1 className="mt-0.5 font-display text-base font-semibold text-white">
                    Operational Data &amp; Report Intelligence
                  </h1>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="open-add-document-btn"
                    onClick={() => {
                      setIngestError(null);
                      setDocModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded border border-white/20 bg-white/10 px-2 py-1 font-mono text-[10px] text-white hover:bg-[#1D64D8] cursor-pointer"
                  >
                    <FilePlus2 className="h-3 w-3" aria-hidden="true" />
                    <span>+ Doc</span>
                  </button>
                  <button
                    type="button"
                    data-testid="open-add-incident-btn"
                    onClick={() => {
                      setIngestError(null);
                      setIncModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded border border-white/20 bg-white/10 px-2 py-1 font-mono text-[10px] text-white hover:bg-[#1D64D8] cursor-pointer"
                  >
                    <PlusCircle className="h-3 w-3" aria-hidden="true" />
                    <span>+ Incident</span>
                  </button>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'technical_docs', label: 'Tech Docs' },
                      { id: 'equipment_registry', label: 'Registry' },
                      { id: 'demo_incidents', label: 'Demo Incidents' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCollectionFilter(item.id)}
                      className={`rounded px-2 py-0.5 font-mono text-[9px] transition-colors cursor-pointer ${
                        collectionFilter === item.id
                          ? 'bg-[#1D64D8] text-white font-semibold'
                          : 'bg-white/10 text-[#CBD5E1] hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div
                  role="group"
                  aria-label="Assistant language preference"
                  className="inline-flex items-center gap-0.5 rounded border border-white/15 bg-white/5 p-0.5"
                >
                  {(
                    [
                      { id: 'auto', label: 'Auto' },
                      { id: 'en', label: 'EN' },
                      { id: 'fr', label: 'FR' },
                      { id: 'ar', label: 'AR' },
                    ] as const
                  ).map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      data-testid={`assistant-lang-${lang.id}`}
                      aria-pressed={assistantLanguage === lang.id}
                      onClick={() => setAssistantLanguage(lang.id)}
                      className={`rounded px-1.5 py-0.5 font-mono text-[9px] transition-colors cursor-pointer ${
                        assistantLanguage === lang.id
                          ? 'bg-[#1D64D8] text-white font-semibold'
                          : 'text-[#CBD5E1] hover:text-white'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Original Light Scrollable Thread */}
            <div
              ref={threadContainerRef}
              aria-live="polite"
              className="flex-1 space-y-3 overflow-y-auto bg-[#F8FAFC] p-4"
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={msg.role === 'supervisor' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={
                      msg.role === 'supervisor'
                        ? 'max-w-[86%] rounded-lg bg-[#0B0C0D] px-3.5 py-2.5 text-xs leading-[1.55] text-white'
                        : msg.error
                          ? 'max-w-[94%] rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3 text-xs leading-[1.6] text-[#991B1B]'
                          : 'max-w-[94%] rounded-lg border border-[#BFDBFE] bg-white px-3.5 py-3 text-xs leading-[1.6] text-[#1E293B]'
                    }
                  >
                    <p
                      className={`mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${
                        msg.role === 'supervisor' ? 'text-[#93C5FD]' : 'text-[#1D64D8]'
                      }`}
                    >
                      {msg.role === 'supervisor' ? 'Supervisor' : 'KILNOVA AI'}
                      {msg.channel === 'voice' ? ' · VOICE' : ''}
                    </p>
                    <p dir="auto" className="whitespace-pre-wrap break-words">
                      {msg.text}
                    </p>

                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-2.5 border-t border-[#E2E8F0] pt-2">
                        <p className="font-mono text-[9px] font-semibold uppercase text-[#64748B]">
                          Sources ({msg.citations.length}) — click to inspect
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {msg.citations.map((cit) => {
                            const isDemo = cit.verificationStatus === 'DEMONSTRATION DATA';
                            return (
                              <button
                                key={cit.chunkId}
                                type="button"
                                onClick={() => setExpandedCitation(cit)}
                                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9.5px] transition-colors cursor-pointer ${
                                  isDemo
                                    ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E] hover:bg-[#FEF3C7]'
                                    : 'border-[#BFDBFE] bg-[#EFF6FF] text-[#0B4EA2] hover:bg-[#DBEAFE]'
                                }`}
                              >
                                <BookOpen className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                <span className="max-w-[165px] truncate">
                                  {cit.sectionOrCaseId}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {msg.advisorDisclaimer && (
                      <p className="mt-1.5 font-mono text-[9.5px] text-[#64748B]">
                        {msg.advisorDisclaimer}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {voice.liveUserDraft && (
                <div className="flex justify-end">
                  <div className="max-w-[86%] rounded-lg bg-[#0B0C0D]/85 px-3.5 py-2 text-xs leading-[1.55] text-white">
                    <p className="mb-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#93C5FD]">
                      Supervisor · VOICE (LIVE)
                    </p>
                    <p dir="auto" className="whitespace-pre-wrap break-words">
                      {voice.liveUserDraft}
                    </p>
                  </div>
                </div>
              )}

              {voice.liveAssistantDraft && (
                <div className="flex justify-start">
                  <div className="max-w-[94%] rounded-lg border border-[#BFDBFE] bg-white px-3.5 py-2.5 text-xs leading-[1.6] text-[#1E293B]">
                    <p className="mb-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#1D64D8]">
                      KILNOVA AI · VOICE (SPEAKING)
                    </p>
                    <p dir="auto" className="whitespace-pre-wrap break-words">
                      {voice.liveAssistantDraft}
                    </p>
                  </div>
                </div>
              )}

              {isQuerying && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-[#BFDBFE] bg-white px-3 py-2 font-mono text-[11px] text-[#1D64D8]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Searching RAG corpus &amp; generating cited answer...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Original Quick Queries + Compact Collapsible Voice Control Bar + Input Bar */}
            <div className="shrink-0 border-t border-[#E2E8F0] bg-white p-3">
              {isVoiceBarVisible && (
                <div
                  data-testid="voice-control-bar"
                  className={`mb-2 rounded-md border px-2.5 py-2 ${
                    voice.voiceError
                      ? 'border-[#FECACA] bg-[#FEF2F2]'
                      : 'border-[#CBD5E1] bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${voiceMeta.dotColorClass}`}
                        aria-hidden="true"
                      />
                      <span
                        data-testid="voice-status-label"
                        className={`truncate font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${voiceMeta.textColorClass}`}
                      >
                        {voiceMeta.label}
                      </span>

                      {(voice.voiceState === 'listening' || voice.voiceState === 'speaking') && (
                        <div
                          data-testid="voice-waveform"
                          aria-label="Live audio activity"
                          className="flex h-3.5 items-center gap-0.5"
                        >
                          {[0.45, 0.85, 1.0, 0.7, 0.5].map((weight, idx) => {
                            const heightPx = Math.max(
                              3,
                              Math.round(3 + Math.min(1, voice.audioLevel * weight + 0.12) * 11)
                            );
                            return (
                              <span
                                key={idx}
                                className={`w-0.5 rounded-full transition-all duration-75 ${
                                  voice.voiceState === 'speaking'
                                    ? 'bg-[#1D64D8]'
                                    : 'bg-[#059669]'
                                }`}
                                style={{ height: `${heightPx}px` }}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {(voice.isSpeakingAudio || voice.voiceState === 'speaking') && (
                        <button
                          type="button"
                          data-testid="voice-stop-speaking-btn"
                          onClick={voice.stopSpeaking}
                          className="inline-flex items-center gap-1 rounded border border-[#CBD5E1] bg-white px-2 py-1 font-mono text-[10px] font-semibold text-[#0B0C0D] hover:border-[#1D64D8] hover:text-[#1D64D8] cursor-pointer"
                        >
                          <VolumeX className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>Stop Speaking</span>
                        </button>
                      )}

                      {voice.voiceState !== 'idle' && voice.voiceState !== 'error' && (
                        <button
                          type="button"
                          data-testid="voice-end-session-btn"
                          onClick={voice.endVoiceSession}
                          className="inline-flex items-center gap-1 rounded border border-[#FECACA] bg-white px-2 py-1 font-mono text-[10px] font-semibold text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer"
                        >
                          <PhoneOff className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>End Session</span>
                        </button>
                      )}

                      {voice.voiceError && (
                        <button
                          type="button"
                          onClick={voice.dismissVoiceError}
                          aria-label="Dismiss voice error"
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#FECACA] bg-white text-[#991B1B] hover:bg-[#FEE2E2] cursor-pointer"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  {voice.ragLookupNote && !voice.voiceError && (
                    <p className="mt-1 truncate font-mono text-[9.5px] text-[#475569]">
                      {voice.ragLookupNote}
                    </p>
                  )}

                  {voice.voiceError && (
                    <p
                      data-testid="voice-error-message"
                      className="mt-1 break-words text-[11px] leading-snug text-[#991B1B]"
                    >
                      {voice.voiceError}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {RAG_QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={isQuerying}
                    onClick={() => void sendSupervisorQuery(prompt)}
                    className="truncate rounded border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 py-1.5 text-left text-[11px] font-medium leading-snug text-[#1E293B] transition-colors hover:border-[#1D64D8] hover:bg-[#EFF6FF] hover:text-[#0B4EA2] disabled:opacity-50 cursor-pointer"
                    title={prompt}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <form onSubmit={handleFormSubmit} className="mt-2.5 flex items-center gap-2">
                <label htmlFor="supervisor-ai-input" className="sr-only">
                  Ask KILNOVA AI about process history or sensor conditions
                </label>
                <input
                  id="supervisor-ai-input"
                  type="text"
                  value={draftPrompt}
                  onChange={(e) => setDraftPrompt(e.target.value)}
                  disabled={isQuerying}
                  placeholder="Ask about 370 °C limit, CAS-2026-081, reports, or sensors..."
                  className="min-h-[40px] min-w-0 flex-1 rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-xs text-[#0B0C0D] placeholder:text-[#94A3B8] focus:border-[#1D64D8] focus:outline-none"
                />
                <button
                  type="button"
                  data-testid="voice-mic-btn"
                  onClick={() => {
                    if (voice.voiceState === 'idle' || voice.voiceState === 'error') {
                      void voice.startVoiceSession();
                    } else {
                      voice.endVoiceSession();
                    }
                  }}
                  aria-label={
                    voice.voiceState === 'idle' || voice.voiceState === 'error'
                      ? 'Start live voice conversation with KILNOVA AI'
                      : 'End live voice conversation'
                  }
                  aria-pressed={voiceMeta.isLiveConnected}
                  title={
                    voice.voiceState === 'idle' || voice.voiceState === 'error'
                      ? 'Start Live Voice (EN / FR / AR)'
                      : 'End Live Voice Session'
                  }
                  className={`inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-md border transition-colors cursor-pointer ${
                    voiceMeta.isLiveConnected
                      ? 'border-[#DC2626] bg-[#DC2626] text-white hover:bg-[#B91C1C]'
                      : voice.voiceState === 'connecting' || voice.voiceState === 'requesting_mic'
                        ? 'border-[#1D64D8] bg-[#EFF6FF] text-[#1D64D8]'
                        : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#0B0C0D] hover:border-[#1D64D8] hover:bg-[#EFF6FF] hover:text-[#1D64D8]'
                  }`}
                >
                  {voiceMeta.isLiveConnected ? (
                    <MicOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Mic className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="submit"
                  disabled={isQuerying || !draftPrompt.trim()}
                  aria-label="Send question to KILNOVA AI"
                  className="inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-md bg-[#1D64D8] text-white transition-colors hover:bg-[#0B4EA2] disabled:opacity-50 cursor-pointer"
                >
                  <SendHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            </div>
          </section>
        </div>

        {/* Clean Original-Style Lower Tabs: Additional KPIs / Demo Incidents / Parameter Registry */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#D4DCE7] bg-white px-4 py-2">
            <div role="tablist" aria-label="Supervisor reference tabs" className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'kpis', label: 'Additional Process KPIs' },
                  { id: 'incidents', label: `Demo Incident Archive (${incidents.length})` },
                  { id: 'registry', label: 'Equipment Parameter Registry' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={lowerTab === tab.id}
                  onClick={() => setLowerTab(tab.id)}
                  className={`rounded px-3 py-1.5 font-mono text-[11px] font-medium transition-colors cursor-pointer ${
                    lowerTab === tab.id
                      ? 'bg-[#0B0C0D] text-white font-semibold'
                      : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0B0C0D]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <span className="font-mono text-[10px] text-[#64748B]">
              Indexed RAG Docs: {documents.length} · Incidents: {incidents.length}
            </span>
          </div>

          {lowerTab === 'kpis' && (
            <IndustrialKpiPanel
              params={AUTO_PILOT_PRESETS[2].params}
              regime={regime}
              onChangeRegime={setRegime}
            />
          )}

          {lowerTab === 'incidents' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {incidents.map((inc) => (
                <article
                  key={inc.case_id}
                  className="flex flex-col justify-between rounded-lg border border-[#D4DCE7] bg-white p-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-[#0B0C0D]">
                        {inc.case_id}
                      </span>
                      <span className="rounded border border-[#FDE68A] bg-[#FFFBEB] px-2 py-0.5 font-mono text-[9.5px] font-semibold text-[#92400E]">
                        {inc.dataOrigin}
                      </span>
                    </div>
                    <h3 className="mt-1.5 font-display text-sm font-semibold text-[#0B0C0D]">
                      {inc.problem}
                    </h3>
                    <p className="mt-0.5 font-mono text-[10px] text-[#64748B]">
                      {inc.date} · {inc.severity}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-[#334155]">{inc.context}</p>
                    <div className="mt-2.5 rounded border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 text-[11px] text-[#1E293B]">
                      <p className="font-mono text-[9.5px] font-semibold uppercase text-[#1D64D8]">
                        Action Taken
                      </p>
                      <p className="mt-1 leading-relaxed">{inc.action_taken}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#E2E8F0] pt-2.5 font-mono text-[10px]">
                    <div className="rounded bg-[#F8FAFC] p-2">
                      <p className="text-[#64748B]">+30 min</p>
                      <p className="mt-0.5 font-medium text-[#0B0C0D]">{inc.result_30_min}</p>
                    </div>
                    <div className="rounded bg-[#F8FAFC] p-2">
                      <p className="text-[#64748B]">+60 min</p>
                      <p className="mt-0.5 font-medium text-[#059669]">{inc.result_60_min}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {lowerTab === 'registry' && <ParameterRegistryPanel />}
        </section>
      </main>

      {/* Original White Process Report Detail Modal */}
      {inspectedReport && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="supervisor-report-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        >
          <div
            aria-hidden="true"
            onClick={() => setInspectedReport(null)}
            className="absolute inset-0 bg-[#0B0C0D]/68 backdrop-blur-sm"
          />

          <div
            data-testid="supervisor-report-modal"
            className="relative z-10 w-full max-w-xl rounded-xl border border-[#CBD5E1] bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] pb-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1D64D8]">
                  Process Inspection Report · {inspectedReport.mode}
                </p>
                <h2
                  id="supervisor-report-modal-title"
                  className="mt-1 font-display text-xl font-semibold text-[#0B0C0D]"
                >
                  {inspectedReport.id} — {inspectedReport.affectedZone}
                </h2>
                <p className="mt-1 font-mono text-xs text-[#475569]">
                  {inspectedReport.timestamp} · Status: {inspectedReport.condition}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInspectedReport(null)}
                aria-label="Close process inspection report"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#CBD5E1] text-[#475569] hover:border-[#0B0C0D] hover:text-[#0B0C0D] cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <p className="font-mono text-[10px] uppercase text-[#64748B]">Burning Zone</p>
                <p className="mt-1 font-mono text-base font-semibold tabular-nums text-[#0B0C0D]">
                  {inspectedReport.burningZoneTemp} °C
                </p>
              </div>
              <div
                className={`rounded-lg border p-3 ${
                  inspectedReport.shellMaxTemp > SHELL_SAFETY_LIMIT_C
                    ? 'border-[#FECACA] bg-[#FEF2F2]'
                    : 'border-[#E2E8F0] bg-[#F8FAFC]'
                }`}
              >
                <p className="font-mono text-[10px] uppercase text-[#64748B]">
                  Shell Peak (Limit &lt; {SHELL_SAFETY_LIMIT_C} °C)
                </p>
                <p
                  className={`mt-1 font-mono text-base font-semibold tabular-nums ${
                    inspectedReport.shellMaxTemp > SHELL_SAFETY_LIMIT_C
                      ? 'text-[#DC2626]'
                      : 'text-[#0B0C0D]'
                  }`}
                >
                  {inspectedReport.shellMaxTemp} °C
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm leading-[1.65] text-[#334155]">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase text-[#0B0C0D]">
                  Diagnostic Findings
                </p>
                <p className="mt-1 text-xs leading-[1.65]">{inspectedReport.summary}</p>
                <p className="mt-1 text-xs text-[#64748B]">{inspectedReport.probableCause}</p>
              </div>
              <div className="border-t border-[#E2E8F0] pt-3">
                <p className="font-mono text-[11px] font-semibold uppercase text-[#1D64D8]">
                  Recommended Follow-Up
                </p>
                <p className="mt-1 text-xs leading-[1.65]">{inspectedReport.actionTaken}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-[#E2E8F0] pt-4">
              <button
                type="button"
                onClick={() => setInspectedReport(null)}
                className="rounded-md bg-[#0B0C0D] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1D64D8] cursor-pointer"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* White Citation Detail Modal */}
      {expandedCitation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="citation-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            aria-hidden="true"
            onClick={() => setExpandedCitation(null)}
            className="absolute inset-0 bg-[#0B0C0D]/68 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-xl rounded-xl border border-[#CBD5E1] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] pb-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#1D64D8]">
                  RAG Source Citation · {expandedCitation.collection}
                </p>
                <h2
                  id="citation-modal-title"
                  className="mt-1 font-display text-lg font-semibold text-[#0B0C0D]"
                >
                  {expandedCitation.sectionOrCaseId} — {expandedCitation.sourceName}
                </h2>
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

            <p className="mt-4 whitespace-pre-wrap text-xs leading-relaxed text-[#334155]">
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
      )}

      {/* White Add Technical Document Modal */}
      {docModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-doc-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            aria-hidden="true"
            onClick={() => setDocModalOpen(false)}
            className="absolute inset-0 bg-[#0B0C0D]/68 backdrop-blur-sm"
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#CBD5E1] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] pb-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#1D64D8]">
                  RAG Knowledge Ingestion
                </p>
                <h2 id="add-doc-modal-title" className="mt-1 font-display text-lg font-semibold">
                  Add Technical Document
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDocModalOpen(false)}
                aria-label="Close add document modal"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#CBD5E1] text-[#475569] cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateDocument} className="mt-4 space-y-3 text-xs">
              <div>
                <label htmlFor="rag-doc-title" className="mb-1 block font-medium text-[#1E293B]">
                  Document Title
                </label>
                <input
                  id="rag-doc-title"
                  required
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[#0B0C0D]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rag-doc-section" className="mb-1 block font-medium text-[#1E293B]">
                    Section
                  </label>
                  <input
                    id="rag-doc-section"
                    required
                    value={docSection}
                    onChange={(e) => setDocSection(e.target.value)}
                    className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[#0B0C0D]"
                  />
                </div>
                <div>
                  <label htmlFor="rag-doc-source" className="mb-1 block font-medium text-[#1E293B]">
                    Source
                  </label>
                  <input
                    id="rag-doc-source"
                    required
                    value={docSource}
                    onChange={(e) => setDocSource(e.target.value)}
                    className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[#0B0C0D]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rag-doc-col" className="mb-1 block font-medium text-[#1E293B]">
                    Collection
                  </label>
                  <select
                    id="rag-doc-col"
                    value={docCollection}
                    onChange={(e) => setDocCollection(e.target.value as typeof docCollection)}
                    className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-[#0B0C0D]"
                  >
                    <option value="technical_docs">Technical Docs</option>
                    <option value="equipment_registry">Equipment Registry</option>
                    <option value="procedures">Procedures</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="rag-doc-status" className="mb-1 block font-medium text-[#1E293B]">
                    Verification Status
                  </label>
                  <select
                    id="rag-doc-status"
                    value={docStatus}
                    onChange={(e) => setDocStatus(e.target.value as typeof docStatus)}
                    className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-[#0B0C0D]"
                  >
                    <option value="PENDING PLANT VALIDATION">PENDING PLANT VALIDATION</option>
                    <option value="PROTOTYPE CONFIGURED">PROTOTYPE CONFIGURED</option>
                    <option value="VERIFIED">VERIFIED</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="rag-doc-content" className="mb-1 block font-medium text-[#1E293B]">
                  Content (min 20 chars)
                </label>
                <textarea
                  id="rag-doc-content"
                  required
                  rows={4}
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[#0B0C0D]"
                />
              </div>
              {ingestError && (
                <p role="alert" className="text-xs font-medium text-[#DC2626]">
                  {ingestError}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDocModalOpen(false)}
                  className="rounded-md border border-[#CBD5E1] px-4 py-2 text-xs text-[#475569] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingIngest}
                  className="rounded-md bg-[#1D64D8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4EA2] disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingIngest ? 'Indexing...' : 'Save & Index'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* White Add Historical Incident Modal */}
      {incModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-inc-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            aria-hidden="true"
            onClick={() => setIncModalOpen(false)}
            className="absolute inset-0 bg-[#0B0C0D]/68 backdrop-blur-sm"
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[#CBD5E1] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] pb-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#1D64D8]">
                  Historical Incident Ingestion
                </p>
                <h2 id="add-inc-modal-title" className="mt-1 font-display text-lg font-semibold">
                  Add Historical Incident
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIncModalOpen(false)}
                aria-label="Close add incident modal"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#CBD5E1] text-[#475569] cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="inc-id" className="mb-1 block font-medium text-[#1E293B]">
                    Case ID
                  </label>
                  <input
                    id="inc-id"
                    required
                    value={incCaseId}
                    onChange={(e) => setIncCaseId(e.target.value)}
                    className="w-full rounded-lg border border-[#CBD5E1] px-2.5 py-1.5 font-mono text-[#0B0C0D]"
                  />
                </div>
                <div>
                  <label htmlFor="inc-date" className="mb-1 block font-medium text-[#1E293B]">
                    Date
                  </label>
                  <input
                    id="inc-date"
                    type="date"
                    required
                    value={incDate}
                    onChange={(e) => setIncDate(e.target.value)}
                    className="w-full rounded-lg border border-[#CBD5E1] px-2.5 py-1.5 font-mono text-[#0B0C0D]"
                  />
                </div>
                <div>
                  <label htmlFor="inc-sev" className="mb-1 block font-medium text-[#1E293B]">
                    Severity
                  </label>
                  <select
                    id="inc-sev"
                    value={incSeverity}
                    onChange={(e) => setIncSeverity(e.target.value as typeof incSeverity)}
                    className="w-full rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[#0B0C0D]"
                  >
                    <option value="WARNING">WARNING</option>
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="EMERGENCY">EMERGENCY</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="inc-problem" className="mb-1 block font-medium text-[#1E293B]">
                  Problem
                </label>
                <input
                  id="inc-problem"
                  required
                  value={incProblem}
                  onChange={(e) => setIncProblem(e.target.value)}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-1.5 text-[#0B0C0D]"
                />
              </div>
              <div>
                <label htmlFor="inc-context" className="mb-1 block font-medium text-[#1E293B]">
                  Operational Context
                </label>
                <textarea
                  id="inc-context"
                  required
                  rows={2}
                  value={incContext}
                  onChange={(e) => setIncContext(e.target.value)}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-1.5 text-[#0B0C0D]"
                />
              </div>
              <div>
                <label htmlFor="inc-action" className="mb-1 block font-medium text-[#1E293B]">
                  Action Taken
                </label>
                <textarea
                  id="inc-action"
                  required
                  rows={2}
                  value={incAction}
                  onChange={(e) => setIncAction(e.target.value)}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-1.5 text-[#0B0C0D]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="inc-res30" className="mb-1 block font-medium text-[#1E293B]">
                    Result (+30 min)
                  </label>
                  <input
                    id="inc-res30"
                    required
                    value={incRes30}
                    onChange={(e) => setIncRes30(e.target.value)}
                    className="w-full rounded-lg border border-[#CBD5E1] px-2.5 py-1.5 text-[#0B0C0D]"
                  />
                </div>
                <div>
                  <label htmlFor="inc-res60" className="mb-1 block font-medium text-[#1E293B]">
                    Result (+60 min)
                  </label>
                  <input
                    id="inc-res60"
                    required
                    value={incRes60}
                    onChange={(e) => setIncRes60(e.target.value)}
                    className="w-full rounded-lg border border-[#CBD5E1] px-2.5 py-1.5 text-[#0B0C0D]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="inc-tags" className="mb-1 block font-medium text-[#1E293B]">
                  Tags (comma-separated)
                </label>
                <input
                  id="inc-tags"
                  value={incTags}
                  onChange={(e) => setIncTags(e.target.value)}
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-1.5 text-[#0B0C0D]"
                />
              </div>
              {ingestError && (
                <p role="alert" className="text-xs font-medium text-[#DC2626]">
                  {ingestError}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIncModalOpen(false)}
                  className="rounded-md border border-[#CBD5E1] px-4 py-2 text-xs text-[#475569] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingIngest}
                  className="rounded-md bg-[#1D64D8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B4EA2] disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingIngest ? 'Indexing...' : 'Save & Index'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
