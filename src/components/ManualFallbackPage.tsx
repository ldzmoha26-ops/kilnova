import { useState, type FormEvent } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Lock,
  Power,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';

interface ManualFallbackPageProps {
  manualFallbackActive: boolean;
  onToggleManualFallback: (active: boolean) => void;
}

interface HandoverLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  note: string;
}

const CHECKLIST_ITEMS = [
  {
    id: 'verify-dcs',
    label:
      'Confirm plant DCS control desk is in direct human operator authority (no external advisory writes).',
  },
  {
    id: 'verify-shell',
    label:
      'Cross-check Ring B-04 hotspot (412 °C vs 370 °C configured prototype limit) with local IR scanner and field pyrometer.',
  },
  {
    id: 'verify-o2',
    label:
      'Account for flagged O₂ / Hood Draft analyzer drift (SNS-O206) before adjusting main ID exhaust fans.',
  },
  {
    id: 'verify-cooler',
    label:
      'Verify grate cooler fans V1–V10 under-grate pressure and secondary/tertiary air stability manually.',
  },
] as const;

export function ManualFallbackPage({
  manualFallbackActive,
  onToggleManualFallback,
}: ManualFallbackPageProps) {
  const [checkedIds, setCheckedIds] = useState<string[]>(['verify-dcs']);
  const [reasonNote, setReasonNote] = useState('');
  const [logs, setLogs] = useState<HandoverLogEntry[]>([
    {
      id: 'FBK-1001',
      timestamp: 'Demonstration Shift · 14:20 UTC',
      actor: 'Control Room Operator (Demo)',
      action: 'STANDBY VERIFIED',
      note: 'KILNOVA operating strictly in Advisor-Only read mode. Hardwired DCS interlocks active.',
    },
  ]);

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleTransition = (activate: boolean) => {
    onToggleManualFallback(activate);
    setLogs((prev) => [
      {
        id: `FBK-${String(1002 + prev.length)}`,
        timestamp: new Date().toISOString().slice(11, 19) + ' UTC',
        actor: 'Control Room Operator',
        action: activate ? 'REPLI MANUEL ACTIVATED' : 'AI ADVISORY RESUMED',
        note:
          reasonNote.trim() ||
          (activate
            ? 'Operator paused AI recommendations and transitioned console to Manual Fallback (Repli Manuel).'
            : 'Operator restored KILNOVA AI Advisory recommendations after verifying sensor stability.'),
      },
      ...prev,
    ]);
    setReasonNote('');
  };

  const handleLogSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!reasonNote.trim()) return;
    setLogs((prev) => [
      {
        id: `FBK-${String(1002 + prev.length)}`,
        timestamp: new Date().toISOString().slice(11, 19) + ' UTC',
        actor: 'Control Room Operator',
        action: manualFallbackActive ? 'MANUAL SHIFT NOTE' : 'ADVISORY SHIFT NOTE',
        note: reasonNote.trim(),
      },
      ...prev,
    ]);
    setReasonNote('');
  };

  return (
    <div
      data-testid="manual-fallback-page"
      className="min-h-screen bg-[#F1F5F9] pt-16 text-[#0B0C0D]"
    >
      <main className="mx-auto max-w-[1440px] space-y-3.5 p-3.5">
        {/* Prototype Safety Boundary Notice */}
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-3.5 text-xs leading-relaxed text-[#92400E]"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#D97706]" aria-hidden="true" />
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#92400E]">
              Prototype Safety Boundary — No Live DCS Actuation
            </p>
            <p className="mt-0.5">
              KILNOVA is a read-only industrial intelligence prototype. This Manual Fallback / Repli
              Manuel workspace demonstrates operator-controlled suspension of AI advisories and{' '}
              <strong>does NOT control live plant PLCs, burners, fans, or DCS interlocks.</strong>
            </p>
          </div>
        </div>

        {/* Transition Control Card */}
        <section
          className={`rounded-lg border p-5 ${
            manualFallbackActive
              ? 'border-[#DC2626] bg-[#FEF2F2]'
              : 'border-[#D4DCE7] bg-white'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                {manualFallbackActive ? (
                  <AlertOctagon className="h-4 w-4 text-[#DC2626]" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-[#059669]" aria-hidden="true" />
                )}
                <span
                  data-testid="manual-fallback-status-badge"
                  className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                    manualFallbackActive
                      ? 'border-[#DC2626] bg-[#DC2626] text-white'
                      : 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]'
                  }`}
                >
                  {manualFallbackActive
                    ? 'REPLI MANUEL ACTIVE — AI ADVISORY SUSPENDED'
                    : 'AI ADVISORY ACTIVE — HUMAN-IN-THE-LOOP STANDBY'}
                </span>
              </div>
              <h1 className="mt-1.5 font-display text-xl font-semibold text-[#0B0C0D]">
                Manual Fallback / Repli Manuel Governance
              </h1>
              <p className="mt-1 max-w-2xl text-xs text-[#475569]">
                Enables control-room operators to pause KILNOVA AI advisory recommendations during
                startup, shutdown, analyzer faults, or refractory hotspot inspections.
              </p>
            </div>

            {!manualFallbackActive ? (
              <button
                type="button"
                data-testid="activate-manual-fallback-btn"
                onClick={() => handleTransition(true)}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-lg bg-[#DC2626] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#B91C1C] cursor-pointer"
              >
                <Power className="h-4 w-4" aria-hidden="true" />
                <span>Activate Manual Fallback (Repli Manuel)</span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="resume-ai-advisory-btn"
                onClick={() => handleTransition(false)}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-lg bg-[#0B0C0D] px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#1D64D8] cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>Restore AI Advisory Mode</span>
              </button>
            )}
          </div>
        </section>

        {/* Checklist & Audit Log */}
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          <section className="rounded-lg border border-[#D4DCE7] bg-white p-4 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-[#1D64D8]" aria-hidden="true" />
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0B0C0D]">
                  Operator Handover Checklist
                </h2>
              </div>
              <span className="font-mono text-[10px] text-[#64748B]">
                {checkedIds.length} / {CHECKLIST_ITEMS.length} Verified
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {CHECKLIST_ITEMS.map((item) => {
                const checked = checkedIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-3 text-xs leading-relaxed ${
                      checked
                        ? 'border-[#BFDBFE] bg-[#EFF6FF]/60 text-[#0B0C0D]'
                        : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCheck(item.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#1D64D8]"
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </div>

            <form onSubmit={handleLogSubmit} className="mt-4 border-t border-[#E2E8F0] pt-3">
              <label
                htmlFor="fallback-reason-input"
                className="block font-mono text-[10px] uppercase text-[#64748B]"
              >
                Shift Handover Note
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="fallback-reason-input"
                  type="text"
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder="Enter operator justification or shift observation..."
                  className="min-h-[38px] flex-1 rounded-md border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs text-[#0B0C0D] focus:border-[#1D64D8] focus:outline-none"
                />
                <button
                  type="submit"
                  className="min-h-[38px] rounded-md bg-[#0B0C0D] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1D64D8] cursor-pointer"
                >
                  Log Note
                </button>
              </div>
            </form>
          </section>

          <section className="flex flex-col justify-between rounded-lg border border-[#D4DCE7] bg-white p-4 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
                <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0B0C0D]">
                  Control Authority &amp; Transition Log
                </h2>
                <span className="font-mono text-[10px] text-[#64748B]">READ-ONLY DCS</span>
              </div>

              <div className="mt-3 space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="font-semibold text-[#1D64D8]">
                        {log.id} · {log.action}
                      </span>
                      <span className="text-[#64748B]">{log.timestamp}</span>
                    </div>
                    <p className="mt-1 leading-relaxed text-[#334155]">{log.note}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-[#E2E8F0] pt-3 text-[11px] text-[#64748B]">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#059669]" aria-hidden="true" />
              <span>AI guidance is always non-binding and human-verified.</span>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
