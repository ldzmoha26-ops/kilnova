import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import {
  validateContactForm,
  type ContactFormErrors,
} from '../utils/contactValidation';

interface HomeSectionsProps {
  onOpenOperator: () => void;
  onOpenSupervisor: () => void;
  onOpenAuth: () => void;
  onScrollTop: () => void;
}

const CAPABILITIES = [
  {
    index: '01',
    title: 'Intelligent Monitoring',
    detail:
      'Continuous structured visibility across burning, transition, calcination, and cooler telemetry.',
  },
  {
    index: '02',
    title: 'Early Incident Detection',
    detail:
      'Flags persistent localized shell overheating and drifting sensor patterns before equipment damage.',
  },
  {
    index: '03',
    title: 'Predictive Analysis',
    detail:
      'Evaluates operating trajectories and scenario adjustments against configured rotary kiln tolerances.',
  },
  {
    index: '04',
    title: 'AI-Powered Recommendations',
    detail:
      'Translates raw measurements into structured causes, affected locations, and actionable checks.',
  },
  {
    index: '05',
    title: 'Operational Decision Support',
    detail:
      'Aligns control-room operators and shift supervisors around shared thermal records and reports.',
  },
] as const;

const OPERATOR_HIGHLIGHTS = [
  'Interactive 3D rotary cement kiln visualization',
  'Real-time sensor monitoring anchored to kiln zones',
  'Auto Pilot automated condition assessment',
  'Manual Simulation for safe scenario evaluation',
  'Thermal anomaly detection and structured analysis reports',
] as const;

const SUPERVISOR_HIGHLIGHTS = [
  'Filterable process history and inspection reports',
  'Centralized sensor condition and link overview',
  'Abnormality tracking across shift timelines',
  'Integrated AI Supervisor Agent for operational queries',
] as const;

export function HomeSections({
  onOpenOperator,
  onOpenSupervisor,
  onOpenAuth,
  onScrollTop,
}: HomeSectionsProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const handleContactSubmit = (e: FormEvent) => {
    e.preventDefault();
    const validation = validateContactForm({ fullName, email, subject, message });
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    const referenceId = `KNV-${String(Date.now()).slice(-4)}`;
    setSubmittedRef(referenceId);
    setErrors({});
    setFullName('');
    setEmail('');
    setSubject('');
    setMessage('');
  };

  return (
    <div className="bg-white text-[#0B0C0D]">
      {/* B. PLATFORM INTRODUCTION & FEATURES */}
      <section
        id="features"
        aria-labelledby="platform-intro-heading"
        className="scroll-mt-16 border-b border-[#E2E8F0] bg-white px-6 py-20 lg:px-12 lg:py-24"
      >
        <div className="mx-auto max-w-[1440px]">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <h2
                id="platform-intro-heading"
                className="font-display text-[clamp(2rem,3.4vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-[#0B0C0D] [text-wrap:balance]"
              >
                Industrial intelligence built exclusively for rotary cement kilns.
              </h2>
            </div>
            <p className="text-[15px] leading-[1.7] text-[#475569] lg:col-span-5">
              KILNOVA turns live thermal behaviour, 370 °C shell safety monitoring, 30–60 minute
              predictive trajectories, and RAG-grounded supervisory reports into clear, advisor-only
              control-room intelligence for dry-process cement kilns.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 divide-y divide-[#E2E8F0] border-y border-[#E2E8F0] md:grid-cols-5 md:divide-x md:divide-y-0">
            {CAPABILITIES.map((cap) => (
              <div key={cap.index} className="py-6 md:px-5 md:first:pl-0 md:last:pr-0">
                <p className="font-mono text-xs font-semibold text-[#1D64D8]">{cap.index}</p>
                <h3 className="mt-3 font-display text-base font-semibold text-[#0B0C0D]">
                  {cap.title}
                </h3>
                <p className="mt-2 text-xs leading-[1.65] text-[#475569]">{cap.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* C. OPERATOR DASHBOARD INTRODUCTION (Compact preview + dedicated page CTA) */}
      <section
        id="operator-intro"
        aria-labelledby="operator-intro-heading"
        className="border-b border-[#E2E8F0] bg-[#F7F9FC] px-6 py-20 lg:px-12 lg:py-24"
      >
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <h2
              id="operator-intro-heading"
              className="font-display text-[clamp(1.9rem,3vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-[#0B0C0D]"
            >
              BUILT FOR THE OPERATOR.
            </h2>
            <p className="mt-4 text-[15px] leading-[1.7] text-[#475569]">
              Monitor kiln conditions, explore an interactive 3D model and evaluate operating
              scenarios through real-time analysis and intelligent simulation.
            </p>

            <ul className="mt-6 space-y-2.5 border-t border-[#D4DCE7] pt-5 text-sm text-[#1E293B]">
              {OPERATOR_HIGHLIGHTS.map((item) => (
                <li key={item} className="flex items-baseline gap-3">
                  <span className="font-mono text-xs font-semibold text-[#1D64D8]" aria-hidden="true">
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <button
                type="button"
                onClick={onOpenOperator}
                className="group inline-flex min-h-[48px] items-center gap-3 rounded-lg bg-[#0B0C0D] px-6 py-3 text-xs font-semibold tracking-[0.06em] text-white transition-colors hover:bg-[#1D64D8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D64D8] cursor-pointer"
              >
                <span>EXPLORE OPERATOR DASHBOARD</span>
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          {/* Compact Composed Preview of Operator Dashboard Structure */}
          <div className="lg:col-span-7">
            <div
              aria-label="Preview of the Operator Dashboard layout"
              className="overflow-hidden rounded-xl border border-[#CBD5E1] bg-white shadow-sm"
            >
              {/* Miniature Top Console Strip */}
              <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#0B0C0D] px-4 py-2.5 text-[11px] text-white">
                <div className="flex items-center gap-3">
                  <span className="font-display font-semibold tracking-[0.18em]">KILNOVA</span>
                  <span className="rounded bg-[#1D64D8] px-2 py-0.5 font-mono text-[10px]">
                    Auto Pilot
                  </span>
                  <span className="font-mono text-[10px] text-[#94A3B8]">Manual Simulation</span>
                </div>
                <span className="font-mono text-[10px] text-[#93C5FD]">Thermal Scan Active</span>
              </div>

              {/* Miniature Upper Split: 3D Kiln Schematic + Status/Modes */}
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-12">
                <div className="rounded-lg border border-[#D4DCE7] bg-[#EEF3F9] p-3 sm:col-span-8">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#475569]">
                    <span>3D ROTARY KILN · LINE 01</span>
                    <span className="font-semibold text-[#1D64D8]">Ring B-04 · 412 °C</span>
                  </div>
                  <svg
                    viewBox="0 0 420 140"
                    className="mt-2 h-32 w-full"
                    role="img"
                    aria-label="Schematic preview of 3D rotary cement kiln with thermal zone sensors"
                  >
                    <line x1="20" y1="116" x2="400" y2="116" stroke="#CBD5E1" strokeWidth="1" />
                    <rect x="28" y="42" width="38" height="74" fill="#1E293B" />
                    <rect x="352" y="54" width="42" height="62" fill="#1E293B" />
                    <polygon points="66,52 352,64 352,92 66,80" fill="#1E3A8A" />
                    <rect x="260" y="60" width="44" height="30" fill="#3B82F6" opacity="0.9" />
                    <rect x="260" y="57" width="44" height="36" fill="none" stroke="#0B0C0D" strokeWidth="1.5" />
                    {/* Riding tyres */}
                    <rect x="115" y="50" width="14" height="35" fill="#94A3B8" />
                    <rect x="208" y="54" width="14" height="35" fill="#94A3B8" />
                    <rect x="306" y="58" width="14" height="35" fill="#94A3B8" />
                    {/* Piers */}
                    <rect x="112" y="85" width="20" height="31" fill="#475569" />
                    <rect x="205" y="89" width="20" height="27" fill="#475569" />
                    <rect x="303" y="93" width="20" height="23" fill="#475569" />
                    {/* Sensor pins */}
                    <rect x="82" y="20" width="66" height="20" rx="4" fill="#FFFFFF" stroke="#CBD5E1" />
                    <text x="90" y="33" fontSize="8.5" fill="#0B0C0D" fontFamily="monospace">
                      Calc 279°C
                    </text>
                    <rect x="246" y="18" width="76" height="22" rx="4" fill="#0B0C0D" />
                    <text x="253" y="32" fontSize="8.5" fill="#FFFFFF" fontFamily="monospace">
                      B-04 412°C
                    </text>
                  </svg>
                </div>

                <div className="flex flex-col gap-2 sm:col-span-4">
                  <div className="rounded-lg bg-[#0B4EA2] p-3 text-white">
                    <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-[#BFDBFE]">
                      Assessment
                    </p>
                    <p className="mt-1 font-display text-sm font-semibold">ANOMALY · Ring B-04</p>
                  </div>
                  <div className="flex-1 space-y-1.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 text-[10px]">
                    <div className="flex justify-between rounded bg-white px-2 py-1.5 text-[#475569]">
                      <span>01 Steady</span>
                      <span className="font-mono">NORMAL</span>
                    </div>
                    <div className="flex justify-between rounded bg-white px-2 py-1.5 text-[#1D64D8]">
                      <span>02 Drift</span>
                      <span className="font-mono">WARNING</span>
                    </div>
                    <div className="flex justify-between rounded border border-[#1D64D8] bg-[#EFF6FF] px-2 py-1.5 font-semibold text-[#0B0C0D]">
                      <span>03 Hotspot</span>
                      <span className="font-mono text-[#0B4EA2]">ANOMALY</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Miniature Bottom Metrics Row */}
              <div className="grid grid-cols-3 gap-3 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[11px]">
                <div>
                  <p className="text-[10px] text-[#64748B]">Shell Peak (B-04)</p>
                  <p className="font-mono font-semibold tabular-nums text-[#0B0C0D]">412 °C</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#64748B]">Burning Zone</p>
                  <p className="font-mono font-semibold tabular-nums text-[#0B0C0D]">1,486 °C</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#64748B]">Stability Margin</p>
                  <p className="font-mono font-semibold tabular-nums text-[#1D64D8]">52 %</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* D. SUPERVISOR DASHBOARD INTRODUCTION (Compact preview + dedicated page CTA) */}
      <section
        id="supervisor-intro"
        aria-labelledby="supervisor-intro-heading"
        className="border-b border-[#E2E8F0] bg-white px-6 py-20 lg:px-12 lg:py-24"
      >
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
          {/* Compact Composed Preview of Supervisor Dashboard Structure */}
          <div className="order-2 lg:order-1 lg:col-span-7">
            <div
              aria-label="Preview of the Supervisor Dashboard layout"
              className="overflow-hidden rounded-xl border border-[#CBD5E1] bg-white shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-[#0B0C0D] px-4 py-2.5 text-[11px] text-white">
                <span className="font-display font-semibold tracking-[0.18em]">
                  SUPERVISOR CONSOLE
                </span>
                <span className="font-mono text-[10px] text-[#93C5FD]">
                  5 Logged Runs · 3 Flagged Sensors
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-12">
                {/* Left Mini History + Sensor Rows */}
                <div className="space-y-3 sm:col-span-7">
                  <div className="rounded-lg border border-[#E2E8F0] p-3">
                    <p className="font-mono text-[10px] font-medium uppercase text-[#64748B]">
                      Process History
                    </p>
                    <div className="mt-2 divide-y divide-[#F1F5F9] text-[11px]">
                      <div className="flex items-center justify-between py-1.5">
                        <span className="font-mono font-semibold text-[#0B0C0D]">PRC-2048</span>
                        <span className="text-[#475569]">Ring B-04 · 412 °C</span>
                        <span className="font-mono text-[10px] font-semibold text-[#0B0C0D]">
                          ANOMALY
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="font-mono font-medium text-[#0B0C0D]">PRC-2047</span>
                        <span className="text-[#475569]">Simulation · 366 °C</span>
                        <span className="font-mono text-[10px] font-semibold text-[#1D64D8]">
                          WARNING
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1.5">
                        <span className="font-mono font-medium text-[#0B0C0D]">PRC-2046</span>
                        <span className="text-[#475569]">Auto Pilot · 316 °C</span>
                        <span className="font-mono text-[10px] text-[#64748B]">NORMAL</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-2.5">
                      <p className="font-medium text-[#0B0C0D]">Shell IR Scanner B-04</p>
                      <p className="mt-1 font-mono font-semibold text-[#0B0C0D]">412 °C · ANOMALY</p>
                    </div>
                    <div className="rounded-lg border border-[#CBD5E1] bg-[#EFF6FF] p-2.5">
                      <p className="font-medium text-[#0B0C0D]">Burning Pyrometer</p>
                      <p className="mt-1 font-mono font-semibold text-[#1D64D8]">
                        1,486 °C · WARNING
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Mini AI Supervisor Agent */}
                <div className="flex flex-col justify-between rounded-lg border border-[#1D64D8]/35 bg-[#F8FAFC] p-3 sm:col-span-5">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase text-[#1D64D8]">
                      AI Supervisor Agent
                    </p>
                    <div className="mt-2.5 space-y-2 text-[10px] leading-relaxed">
                      <div className="ml-4 rounded-md bg-[#0B0C0D] px-2.5 py-1.5 text-white">
                        Summarize the latest detected abnormalities.
                      </div>
                      <div className="mr-2 rounded-md border border-[#BFDBFE] bg-white px-2.5 py-2 text-[#1E293B]">
                        Two monitored areas showed unusual temperature behaviour. Review thermal
                        report PRC-2048.
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[10px] text-[#94A3B8]">
                    Ask about reports or sensors...
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2 lg:col-span-5">
            <h2
              id="supervisor-intro-heading"
              className="font-display text-[clamp(1.9rem,3vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-[#0B0C0D]"
            >
              BUILT FOR THE BIGGER PICTURE.
            </h2>
            <p className="mt-4 text-[15px] leading-[1.7] text-[#475569]">
              Review operational history, monitor sensor conditions and use an integrated AI
              assistant to understand kiln performance.
            </p>

            <ul className="mt-6 space-y-2.5 border-t border-[#E2E8F0] pt-5 text-sm text-[#1E293B]">
              {SUPERVISOR_HIGHLIGHTS.map((item) => (
                <li key={item} className="flex items-baseline gap-3">
                  <span className="font-mono text-xs font-semibold text-[#1D64D8]" aria-hidden="true">
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <button
                type="button"
                onClick={onOpenSupervisor}
                className="group inline-flex min-h-[48px] items-center gap-3 rounded-lg bg-[#1D64D8] px-6 py-3 text-xs font-semibold tracking-[0.06em] text-white transition-colors hover:bg-[#0B4EA2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D64D8] cursor-pointer"
              >
                <span>EXPLORE SUPERVISOR DASHBOARD</span>
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* E. CONTACT US — BOTTOM OF HOMEPAGE ONLY */}
      <section
        id="contact"
        aria-labelledby="contact-heading"
        className="bg-[#F7F9FC] px-6 py-20 lg:px-12 lg:py-24"
      >
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="font-mono text-xs font-medium tracking-[0.16em] uppercase text-[#1D64D8]">
              Contact Us
            </p>
            <h2
              id="contact-heading"
              className="mt-3 font-display text-[clamp(1.9rem,3vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-[#0B0C0D] [text-wrap:balance]"
            >
              LET&apos;S TALK INDUSTRIAL INTELLIGENCE.
            </h2>
            <p className="mt-4 max-w-[44ch] text-[15px] leading-[1.7] text-[#475569]">
              Have questions about KILNOVA or interested in exploring its capabilities? Get in touch
              with our team.
            </p>

            {/* Explicit Placeholders — No Invented Contact Details */}
            <dl className="mt-8 space-y-4 border-t border-[#D4DCE7] pt-6 text-sm">
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#64748B]">
                  General &amp; Technical Inquiries
                </dt>
                <dd className="mt-1 font-medium text-[#0B0C0D]">
                  [Contact email placeholder]
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#64748B]">
                  Direct Line
                </dt>
                <dd className="mt-1 font-medium text-[#0B0C0D]">
                  [Contact phone placeholder]
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#64748B]">
                  Office &amp; Plant Support
                </dt>
                <dd className="mt-1 font-medium text-[#0B0C0D]">
                  [Company location placeholder]
                </dd>
              </div>
            </dl>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-xl border border-[#CBD5E1] bg-white p-6 sm:p-8">
              {submittedRef ? (
                <div
                  data-testid="contact-confirmation"
                  className="py-6"
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#1D64D8]">
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 font-display text-xl font-semibold text-[#0B0C0D]">
                    Inquiry received.
                  </h3>
                  <p className="mt-2 text-sm leading-[1.65] text-[#475569]">
                    Thank you for reaching out to the KILNOVA team. Your message has been logged
                    under reference <span className="font-mono font-semibold text-[#0B0C0D]">{submittedRef}</span>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmittedRef(null)}
                    className="mt-6 inline-flex min-h-[42px] items-center justify-center rounded-lg border border-[#CBD5E1] bg-white px-5 py-2 text-xs font-semibold text-[#0B0C0D] transition-colors hover:border-[#1D64D8] hover:text-[#1D64D8] cursor-pointer"
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} noValidate className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="contact-fullname"
                        className="mb-1.5 block text-xs font-medium text-[#1E293B]"
                      >
                        Full Name
                      </label>
                      <input
                        id="contact-fullname"
                        type="text"
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value);
                          if (errors.fullName) setErrors((p) => ({ ...p, fullName: undefined }));
                        }}
                        placeholder="Enter your full name"
                        className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm text-[#0B0C0D] placeholder:text-[#94A3B8] focus:border-[#1D64D8] focus:outline-none"
                      />
                      {errors.fullName && (
                        <p role="alert" className="mt-1 text-xs font-medium text-[#0B4EA2]">
                          {errors.fullName}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="contact-email"
                        className="mb-1.5 block text-xs font-medium text-[#1E293B]"
                      >
                        Email Address
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                        }}
                        placeholder="Enter your email address"
                        className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm text-[#0B0C0D] placeholder:text-[#94A3B8] focus:border-[#1D64D8] focus:outline-none"
                      />
                      {errors.email && (
                        <p role="alert" className="mt-1 text-xs font-medium text-[#0B4EA2]">
                          {errors.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="contact-subject"
                      className="mb-1.5 block text-xs font-medium text-[#1E293B]"
                    >
                      Subject
                    </label>
                    <input
                      id="contact-subject"
                      type="text"
                      value={subject}
                      onChange={(e) => {
                        setSubject(e.target.value);
                        if (errors.subject) setErrors((p) => ({ ...p, subject: undefined }));
                      }}
                      placeholder="Topic or rotary kiln inquiry"
                      className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm text-[#0B0C0D] placeholder:text-[#94A3B8] focus:border-[#1D64D8] focus:outline-none"
                    />
                    {errors.subject && (
                      <p role="alert" className="mt-1 text-xs font-medium text-[#0B4EA2]">
                        {errors.subject}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="contact-message"
                      className="mb-1.5 block text-xs font-medium text-[#1E293B]"
                    >
                      Message
                    </label>
                    <textarea
                      id="contact-message"
                      rows={4}
                      value={message}
                      onChange={(e) => {
                        setMessage(e.target.value);
                        if (errors.message) setErrors((p) => ({ ...p, message: undefined }));
                      }}
                      placeholder="Share your questions regarding KILNOVA monitoring, simulation, or supervisory tools..."
                      className="w-full rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm text-[#0B0C0D] placeholder:text-[#94A3B8] focus:border-[#1D64D8] focus:outline-none"
                    />
                    {errors.message && (
                      <p role="alert" className="mt-1 text-xs font-medium text-[#0B4EA2]">
                        {errors.message}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="inline-flex min-h-[46px] items-center justify-center rounded-lg bg-[#0B0C0D] px-6 py-3 text-xs font-semibold tracking-[0.06em] uppercase text-white transition-colors hover:bg-[#1D64D8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D64D8] cursor-pointer"
                  >
                    Submit Message
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Architectural Footer */}
      <footer className="border-t border-[#1E293B] bg-[#0B0C0D] px-6 py-10 text-white lg:px-12">
        <div className="mx-auto flex max-w-[1440px] flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <img
                src="/assets/kilnova-logo-dark.png"
                alt="KILNOVA rotary kiln mark"
                className="h-6 w-auto object-contain"
              />
              <p className="font-display text-sm font-semibold tracking-[0.22em] text-white">
                KILNOVA
              </p>
            </div>
            <p className="mt-1.5 text-xs text-[#94A3B8]">
              Industrial Intelligence for Dry-Process Rotary Cement Kiln Operations (SCAEK · ByteCraft GEW 2026).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-[#CBD5E1]">
            <button
              type="button"
              onClick={onScrollTop}
              className="transition-colors hover:text-white cursor-pointer"
            >
              Home
            </button>
            <button
              type="button"
              onClick={onOpenOperator}
              className="transition-colors hover:text-white cursor-pointer"
            >
              Operator
            </button>
            <button
              type="button"
              onClick={onOpenSupervisor}
              className="transition-colors hover:text-white cursor-pointer"
            >
              Supervisor
            </button>
            <button
              type="button"
              onClick={onOpenAuth}
              className="rounded-md border border-[#3B82F6]/60 bg-[#1D64D8]/25 px-4 py-1.5 font-medium text-white transition-colors hover:bg-[#1D64D8] cursor-pointer"
            >
              Login / Register
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
