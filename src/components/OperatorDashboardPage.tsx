import { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  FileText,
  Lock,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { KilnVisualizer3D } from './KilnVisualizer3D';
import { IndustrialKpiPanel } from './IndustrialKpiPanel';
import { PredictiveChartsPanel } from './PredictiveChartsPanel';
import {
  computeElectricalKpis,
  computeThermalKpis,
  type OperatingRegime,
} from '../data/industrialAnalytics';
import {
  AUTO_PILOT_PRESETS,
  SHELL_SAFETY_LIMIT_C,
  evaluateKilnState,
  type KilnCondition,
  type KilnInputParams,
  type OperatingMode,
} from '../utils/kilnSimulation';
import { useKilnovaAssistant } from '../context/KilnovaAssistantContext';

interface OperatorDashboardPageProps {
  manualFallbackActive?: boolean;
  onOpenManualFallback?: () => void;
}

const NOMINAL_PARAMS: KilnInputParams = AUTO_PILOT_PRESETS[0].params;

function statusVisuals(status: KilnCondition, shellExceeded: boolean): {
  headerBg: string;
  headerSub: string;
  badgeClass: string;
  gaugeStroke: string;
  priorityLabel: string;
} {
  if (shellExceeded || status === 'ANOMALY') {
    return {
      headerBg: 'bg-[#991B1B] text-white border-[#DC2626]',
      headerSub: 'text-[#FECACA]',
      badgeClass: 'bg-white text-[#991B1B]',
      gaugeStroke: '#DC2626',
      priorityLabel: 'Critical Safety Alarm · Immediate Review',
    };
  }
  if (status === 'WARNING') {
    return {
      headerBg: 'bg-[#0B4EA2] text-white border-[#0B4EA2]',
      headerSub: 'text-[#DBEAFE]',
      badgeClass: 'bg-white text-[#0B4EA2]',
      gaugeStroke: '#D97706',
      priorityLabel: 'Warning · Approaching 370 °C Limit',
    };
  }
  return {
    headerBg: 'bg-white text-[#0B0C0D] border-[#CBD5E1]',
    headerSub: 'text-[#475569]',
    badgeClass: 'bg-[#EFF6FF] text-[#0B4EA2]',
    gaugeStroke: '#2563EB',
    priorityLabel: 'Nominal · Within Configured Limits',
  };
}

export function OperatorDashboardPage({
  manualFallbackActive = false,
  onOpenManualFallback,
}: OperatorDashboardPageProps) {
  // === CONTEXT A: REAL OPERATIONAL DASHBOARD DATA (STRICTLY ISOLATED FROM 3D TEST SANDBOX) ===
  const [mode, setMode] = useState<OperatingMode>('AUTO_PILOT');
  const [presetId, setPresetId] = useState<'nominal' | 'warning' | 'anomaly'>('anomaly');
  const [regime, setRegime] = useState<OperatingRegime>('NORMAL');
  const [reportModalOpen, setReportModalOpen] = useState<boolean>(false);

  // Extended operational inputs for Manual Simulation (including grate speed & alternative fuel)
  const [draftInputs, setDraftInputs] = useState<KilnInputParams>({
    ...AUTO_PILOT_PRESETS[2].params,
  });
  const [activeSimInputs, setActiveSimInputs] = useState<KilnInputParams>({
    ...AUTO_PILOT_PRESETS[2].params,
  });
  const [draftGrateSpeed, setDraftGrateSpeed] = useState<number>(14.2);
  const [activeGrateSpeed, setActiveGrateSpeed] = useState<number>(14.2);
  const [draftAltFuelPct, setDraftAltFuelPct] = useState<number>(4.5);
  const [activeAltFuelPct, setActiveAltFuelPct] = useState<number>(4.5);

  const hasPendingSimChanges =
    draftInputs.shellMaxTemp !== activeSimInputs.shellMaxTemp ||
    draftInputs.burningZoneTemp !== activeSimInputs.burningZoneTemp ||
    draftInputs.fuelFlowPct !== activeSimInputs.fuelFlowPct ||
    draftInputs.rotationRpm !== activeSimInputs.rotationRpm ||
    draftInputs.feedRateTph !== activeSimInputs.feedRateTph ||
    draftInputs.draftPressureMbar !== activeSimInputs.draftPressureMbar ||
    draftInputs.coolerAirflowPct !== activeSimInputs.coolerAirflowPct ||
    draftGrateSpeed !== activeGrateSpeed ||
    draftAltFuelPct !== activeAltFuelPct;

  useEffect(() => {
    if (!reportModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReportModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reportModalOpen]);

  const activePreset =
    AUTO_PILOT_PRESETS.find((p) => p.id === presetId) ?? AUTO_PILOT_PRESETS[2];
  const activeParams: KilnInputParams =
    mode === 'AUTO_PILOT' ? activePreset.params : activeSimInputs;

  const evaluation = useMemo(
    () => evaluateKilnState(activeParams, mode),
    [activeParams, mode]
  );

  const { condition, sensors, report } = evaluation;
  const shellAssessment = report.shellAssessment;
  const { setOperationalContext } = useKilnovaAssistant();

  useEffect(() => {
    const flagged = sensors.filter((s) => s.status !== 'NORMAL').length;
    setOperationalContext({
      shellMaxTemp: Math.round(activeParams.shellMaxTemp),
      burningZoneTemp: Math.round(activeParams.burningZoneTemp),
      affectedZone: 'Shell Ring B-04 · Meter 39–43',
      condition,
      flaggedSensors: flagged,
    });
  }, [activeParams.burningZoneTemp, activeParams.shellMaxTemp, condition, sensors, setOperationalContext]);

  const visuals = statusVisuals(condition, shellAssessment.isExceeded);
  const thermalKpis = useMemo(() => computeThermalKpis(activeParams, regime), [activeParams, regime]);
  const electricalKpis = useMemo(
    () => computeElectricalKpis(activeParams, regime),
    [activeParams, regime]
  );

  // Original 5-zone temperature profile derived cleanly from Context A sensors
  const zoneProfileRows = useMemo(
    () => [
      {
        id: 'preheater',
        label: 'Preheater C4',
        tempC: sensors.find((s) => s.id === 'SNS-PR02')?.value ?? 825,
        maxScale: 1600,
        status: sensors.find((s) => s.id === 'SNS-PR02')?.status ?? 'NORMAL',
      },
      {
        id: 'transition',
        label: 'Transition Zone',
        tempC: sensors.find((s) => s.id === 'SNS-TR05')?.value ?? 1190,
        maxScale: 1600,
        status: sensors.find((s) => s.id === 'SNS-TR05')?.status ?? 'NORMAL',
      },
      {
        id: 'burning',
        label: 'Burning Zone',
        tempC: Math.round(activeParams.burningZoneTemp),
        maxScale: 1600,
        status: sensors.find((s) => s.id === 'SNS-BZ01')?.status ?? 'NORMAL',
      },
      {
        id: 'shell',
        label: `Shell Ring B-04 (< ${SHELL_SAFETY_LIMIT_C} °C)`,
        tempC: Math.round(activeParams.shellMaxTemp),
        maxScale: 450,
        status: shellAssessment.isExceeded
          ? 'ANOMALY'
          : shellAssessment.level === 'APPROACHING_LIMIT' ||
              shellAssessment.level === 'AT_THRESHOLD'
            ? 'WARNING'
            : 'NORMAL',
      },
      {
        id: 'cooler',
        label: 'Grate Cooler',
        tempC: sensors.find((s) => s.id === 'SNS-CL03')?.value ?? 138,
        maxScale: 450,
        status: sensors.find((s) => s.id === 'SNS-CL03')?.status ?? 'NORMAL',
      },
    ],
    [sensors, activeParams.burningZoneTemp, activeParams.shellMaxTemp, shellAssessment]
  );

  const handleRunSimulation = () => {
    setActiveSimInputs({ ...draftInputs });
    setActiveGrateSpeed(draftGrateSpeed);
    setActiveAltFuelPct(draftAltFuelPct);
  };

  const handleResetSimulation = () => {
    setDraftInputs({ ...NOMINAL_PARAMS });
    setActiveSimInputs({ ...NOMINAL_PARAMS });
    setDraftGrateSpeed(14.2);
    setActiveGrateSpeed(14.2);
    setDraftAltFuelPct(4.5);
    setActiveAltFuelPct(4.5);
  };

  // Original radial stability gauge arc math
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const totalArc = circumference * 0.75;
  const filledArc = totalArc * (report.thermalStabilityPct / 100);

  return (
    <div
      data-testid="operator-dashboard-page"
      className="min-h-screen bg-[#F1F5F9] pt-16 text-[#0B0C0D]"
    >
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 p-3.5">
        {/* Manual Fallback Notice (if activated on Manual Fallback page) */}
        {manualFallbackActive && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#DC2626] bg-[#FEF2F2] px-4 py-2 text-xs text-[#991B1B]"
          >
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 shrink-0 text-[#DC2626]" aria-hidden="true" />
              <span>
                <strong>Manual Fallback Active:</strong> AI advisory suggestions are suspended —
                direct manual operator authority only.
              </span>
            </div>
            {onOpenManualFallback && (
              <button
                type="button"
                onClick={onOpenManualFallback}
                className="rounded border border-[#DC2626] bg-white px-2.5 py-1 font-mono text-[10px] font-semibold text-[#991B1B] hover:bg-[#FEE2E2] cursor-pointer"
              >
                Manage Manual Fallback
              </button>
            )}
          </div>
        )}

        {/* Original Compact Operational Mode Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[#D4DCE7] bg-white px-3.5 py-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-[#0B0C0D]">
              Rotary Kiln · Line 01
            </span>
            <span aria-hidden="true" className="text-[#CBD5E1]">
              ·
            </span>
            <span className="text-xs text-[#475569]">
              {mode === 'AUTO_PILOT'
                ? 'Auto Pilot Continuous Monitoring'
                : 'Manual Simulation Sandbox'}
            </span>
            {shellAssessment.isExceeded && (
              <span className="inline-flex items-center gap-1 rounded border border-[#FECACA] bg-[#FEF2F2] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#DC2626]">
                <AlertOctagon className="h-3 w-3" aria-hidden="true" />
                CRITICAL &gt; {SHELL_SAFETY_LIMIT_C} °C (+{shellAssessment.deviationC} °C)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Operator operating mode"
              className="inline-flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-[#F1F5F9] p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'AUTO_PILOT'}
                onClick={() => setMode('AUTO_PILOT')}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  mode === 'AUTO_PILOT'
                    ? 'bg-[#0B0C0D] text-white font-semibold'
                    : 'text-[#475569] hover:text-[#0B0C0D]'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Auto Pilot</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'MANUAL_SIMULATION'}
                onClick={() => setMode('MANUAL_SIMULATION')}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  mode === 'MANUAL_SIMULATION'
                    ? 'bg-[#0B0C0D] text-white font-semibold'
                    : 'text-[#475569] hover:text-[#0B0C0D]'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Manual Simulation</span>
              </button>
            </div>
          </div>
        </div>

        {/* ORIGINAL UPPER PRIMARY ROW: 8 Cols 3D Rotary Kiln + 4 Cols Status & Mode Controls */}
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          {/* Left 8 cols: Supplied 3D Rotary Kiln Model (Strictly Isolated Context B Testing Data) */}
          <div
            data-testid="digital-twin-context-b"
            className="flex flex-col overflow-hidden rounded-lg border border-[#D4DCE7] bg-white lg:col-span-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#0B0C0D]">
                Interactive 3D Rotary Kiln Digital Twin
              </span>
              <span className="rounded border border-[#FDE68A] bg-[#FFFBEB] px-2 py-0.5 font-mono text-[9px] font-semibold text-[#92400E]">
                3D TESTING DATA (ISOLATED FROM OPERATIONAL DASHBOARD)
              </span>
            </div>
            <div className="h-[500px] w-full bg-[#0B0F17] lg:h-[540px]">
              <KilnVisualizer3D embedded />
            </div>
          </div>

          {/* Right 4 cols: Original Equipment Status Block + Mode Control Card (Context A) */}
          <div className="flex flex-col gap-3 lg:col-span-4">
            {/* Equipment Status Block (Original Top-Right Highlight Area — Red Alert > 370 °C) */}
            <div
              data-testid="operational-safety-banner"
              className={`shrink-0 rounded-lg border px-4 py-3 ${visuals.headerBg}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono text-[10px] font-medium tracking-[0.12em] uppercase ${visuals.headerSub}`}
                >
                  ROTARY KILN · LINE 01 · {mode === 'AUTO_PILOT' ? 'AUTO PILOT' : 'SIMULATION'}
                </span>
                <span
                  data-testid="operator-assessment-state"
                  className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.06em] ${visuals.badgeClass}`}
                >
                  {condition}
                </span>
              </div>
              <p className="mt-1.5 font-display text-[15px] font-semibold leading-snug">
                {report.headline}
              </p>
              <p className={`mt-1 font-mono text-[10px] ${visuals.headerSub}`}>
                Shell: {shellAssessment.temperatureC} °C · Limit &lt; {SHELL_SAFETY_LIMIT_C} °C (
                {shellAssessment.deviationC > 0
                  ? `+${shellAssessment.deviationC} °C OVER`
                  : `${shellAssessment.deviationC} °C margin`}
                )
              </p>
            </div>

            {/* Original White Mode Control Card */}
            <div className="flex flex-1 flex-col justify-between rounded-lg border border-[#D4DCE7] bg-white p-3.5">
              {mode === 'AUTO_PILOT' ? (
                <div className="flex h-full flex-col justify-between gap-2.5">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-[#0B0C0D]">
                        Auto Pilot Monitoring
                      </p>
                      <span className="font-mono text-[10px] text-[#64748B]">Advisor only</span>
                    </div>

                    <div
                      className="space-y-1.5"
                      role="radiogroup"
                      aria-label="Auto Pilot kiln condition scenario"
                    >
                      {AUTO_PILOT_PRESETS.map((preset, idx) => {
                        const selected = preset.id === activePreset.id;
                        const presetCode = `0${idx + 1}`;
                        const statusLabel =
                          preset.id === 'anomaly'
                            ? 'ANOMALY'
                            : preset.id === 'warning'
                              ? 'WARNING'
                              : 'NORMAL';
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setPresetId(preset.id)}
                            className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors cursor-pointer ${
                              selected
                                ? preset.id === 'anomaly'
                                  ? 'border-[#DC2626] bg-[#FEF2F2] text-[#0B0C0D]'
                                  : 'border-[#1D64D8] bg-[#EFF6FF] text-[#0B0C0D]'
                                : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155] hover:border-[#94A3B8]'
                            }`}
                          >
                            <div className="min-w-0 truncate">
                              <span className="font-mono text-[11px] text-[#64748B]">
                                {presetCode} ·{' '}
                              </span>
                              <span className="text-xs font-medium">{preset.label}</span>
                            </div>
                            <span
                              className={`shrink-0 font-mono text-[10px] font-semibold ${
                                statusLabel === 'ANOMALY'
                                  ? 'text-[#DC2626]'
                                  : statusLabel === 'WARNING'
                                    ? 'text-[#D97706]'
                                    : 'text-[#64748B]'
                              }`}
                            >
                              {preset.params.shellMaxTemp} °C · {statusLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Original Structured Active Condition Signals Box */}
                    <div className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                      <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] pb-2">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1D64D8]">
                          Active Assessment
                        </span>
                        <span className="font-mono text-[10px] text-[#475569]">
                          {visuals.priorityLabel.split(' · ')[0]}
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <p className="font-mono text-[9px] uppercase text-[#64748B]">
                            Affected Zone
                          </p>
                          <p className="mt-0.5 truncate text-[11px] font-semibold text-[#0B0C0D]">
                            {report.affectedZone.split(' · ')[0]}
                          </p>
                        </div>
                        <div>
                          <p className="font-mono text-[9px] uppercase text-[#64748B]">
                            Primary Cause
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-[#1E293B]">
                            {report.probableCauses[0]}
                          </p>
                        </div>
                      </div>

                      <p className="mt-2 text-[11px] leading-[1.5] text-[#334155] line-clamp-3">
                        {manualFallbackActive
                          ? 'AI advisory guidance paused while Manual Fallback is active.'
                          : report.summary}
                      </p>
                    </div>
                  </div>

                  {/* Original Compact 3-Step Auto Pilot Pipeline */}
                  <div className="grid grid-cols-3 gap-1.5 border-t border-[#E2E8F0] pt-2">
                    <div className="rounded bg-[#F8FAFC] px-2 py-1.5">
                      <p className="font-mono text-[9px] font-semibold text-[#1D64D8]">01 COLLECT</p>
                      <p className="text-[10px] text-[#475569]">Demo sensors</p>
                    </div>
                    <div className="rounded bg-[#F8FAFC] px-2 py-1.5">
                      <p className="font-mono text-[9px] font-semibold text-[#1D64D8]">02 COMPARE</p>
                      <p className="text-[10px] text-[#475569]">&lt; 370 °C limit</p>
                    </div>
                    <div className="rounded bg-[#F8FAFC] px-2 py-1.5">
                      <p className="font-mono text-[9px] font-semibold text-[#1D64D8]">03 ASSESS</p>
                      <p className="text-[10px] text-[#475569]">State &amp; report</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col justify-between gap-2.5">
                  <div className="space-y-2 overflow-y-auto pr-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-[#0B0C0D]">
                        Manual Simulation Variables
                      </p>
                      <button
                        type="button"
                        onClick={handleResetSimulation}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#475569] transition-colors hover:text-[#1D64D8] cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>Reset</span>
                      </button>
                    </div>

                    {[
                      {
                        id: 'sim-shell',
                        label: 'Shell Peak (B-04)',
                        min: 300,
                        max: 430,
                        step: 1,
                        val: draftInputs.shellMaxTemp,
                        disp: `${draftInputs.shellMaxTemp} °C`,
                        base: '< 370 °C',
                        onChange: (v: number) => setDraftInputs((p) => ({ ...p, shellMaxTemp: v })),
                      },
                      {
                        id: 'sim-fuel',
                        label: 'Main Burner Fuel Flow',
                        min: 70,
                        max: 105,
                        step: 1,
                        val: draftInputs.fuelFlowPct,
                        disp: `${draftInputs.fuelFlowPct}%`,
                        base: '82%',
                        onChange: (v: number) => setDraftInputs((p) => ({ ...p, fuelFlowPct: v })),
                      },
                      {
                        id: 'sim-rpm',
                        label: 'Kiln Rotation Speed',
                        min: 2.0,
                        max: 4.2,
                        step: 0.1,
                        val: draftInputs.rotationRpm,
                        disp: `${draftInputs.rotationRpm.toFixed(1)} rpm`,
                        base: '3.6',
                        onChange: (v: number) => setDraftInputs((p) => ({ ...p, rotationRpm: v })),
                      },
                      {
                        id: 'sim-feed',
                        label: 'Raw Meal Feed Rate',
                        min: 200,
                        max: 270,
                        step: 2,
                        val: draftInputs.feedRateTph,
                        disp: `${draftInputs.feedRateTph} t/h`,
                        base: '245',
                        onChange: (v: number) => setDraftInputs((p) => ({ ...p, feedRateTph: v })),
                      },
                      {
                        id: 'sim-cooler-air',
                        label: 'Cooler Fan Airflow',
                        min: 60,
                        max: 100,
                        step: 1,
                        val: draftInputs.coolerAirflowPct,
                        disp: `${draftInputs.coolerAirflowPct}%`,
                        base: '85%',
                        onChange: (v: number) =>
                          setDraftInputs((p) => ({ ...p, coolerAirflowPct: v })),
                      },
                      {
                        id: 'sim-grate-speed',
                        label: 'Cooler Grate Speed',
                        min: 8,
                        max: 22,
                        step: 0.2,
                        val: draftGrateSpeed,
                        disp: `${draftGrateSpeed.toFixed(1)} spm`,
                        base: '14.2',
                        onChange: (v: number) => setDraftGrateSpeed(v),
                      },
                      {
                        id: 'sim-af-ratio',
                        label: 'Alternative Fuel Ratio',
                        min: 0,
                        max: 20,
                        step: 0.5,
                        val: draftAltFuelPct,
                        disp: `${draftAltFuelPct.toFixed(1)}%`,
                        base: '4.5%',
                        onChange: (v: number) => setDraftAltFuelPct(v),
                      },
                    ].map((item) => (
                      <div key={item.id}>
                        <div className="flex items-center justify-between text-[11px]">
                          <label htmlFor={item.id} className="font-medium text-[#1E293B]">
                            {item.label}
                          </label>
                          <span className="font-mono tabular-nums text-[#0B0C0D]">
                            <span className="text-[#64748B]">{item.base} → </span>
                            <strong
                              className={
                                item.id === 'sim-shell' && item.val > SHELL_SAFETY_LIMIT_C
                                  ? 'text-[#DC2626]'
                                  : 'text-[#1D64D8]'
                              }
                            >
                              {item.disp}
                            </strong>
                          </span>
                        </div>
                        <input
                          id={item.id}
                          type="range"
                          min={item.min}
                          max={item.max}
                          step={item.step}
                          value={item.val}
                          onChange={(e) => item.onChange(Number(e.target.value))}
                          className="mt-0.5 h-1.5 w-full cursor-pointer accent-[#1D64D8]"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-[#E2E8F0] pt-2.5">
                    <button
                      type="button"
                      onClick={handleRunSimulation}
                      className="inline-flex min-h-[38px] w-full items-center justify-center gap-2 rounded-md bg-[#1D64D8] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#0B4EA2] cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {hasPendingSimChanges ? 'Run Simulation (Apply Changes)' : 'Run Simulation'}
                      </span>
                    </button>
                    <p className="mt-1.5 text-[10px] leading-snug text-[#64748B]">
                      Predicted simulation result only — does not actuate live DCS equipment.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ORIGINAL BOTTOM COMPACT ROW (3-Column Metrics, Indicators & Report Band) */}
        <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-12">
          {/* Left 4 cols: Original Zone Temperature Profile */}
          <div className="flex flex-col justify-between rounded-lg border border-[#D4DCE7] bg-white p-3.5 lg:col-span-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-[#0B0C0D]">
                Zone Temperature Profile
              </p>
              <span className="font-mono text-[10px] text-[#64748B]">5 Monitored Zones</span>
            </div>

            <div className="mt-2 space-y-2">
              {zoneProfileRows.map((zone) => {
                const pct = Math.min(100, Math.round((zone.tempC / zone.maxScale) * 100));
                const barClass =
                  zone.status === 'ANOMALY'
                    ? 'bg-[#DC2626]'
                    : zone.status === 'WARNING'
                      ? 'bg-[#D97706]'
                      : 'bg-[#94A3B8]';
                return (
                  <div key={zone.id}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate font-medium text-[#1E293B]">{zone.label}</span>
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          zone.status === 'ANOMALY' ? 'text-[#DC2626]' : 'text-[#0B0C0D]'
                        }`}
                      >
                        {zone.tempC} °C
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barClass}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Center 4 cols: Original 2x2 Key Operating Measurements (Updated to Limit < 370 °C) */}
          <div className="grid grid-cols-2 gap-2.5 lg:col-span-4">
            <div
              className={`flex flex-col justify-between rounded-lg border p-3 ${
                shellAssessment.isExceeded
                  ? 'border-[#DC2626] bg-[#FEF2F2]'
                  : shellAssessment.level === 'APPROACHING_LIMIT' ||
                      shellAssessment.level === 'AT_THRESHOLD'
                    ? 'border-[#D97706] bg-[#FFFBEB]'
                    : 'border-[#D4DCE7] bg-white'
              }`}
            >
              <span className="text-[11px] font-medium text-[#475569]">Shell Peak (B-04)</span>
              <div>
                <p
                  data-testid="context-a-shell-temp"
                  className={`font-mono text-xl font-semibold tabular-nums ${
                    shellAssessment.isExceeded ? 'text-[#DC2626]' : 'text-[#0B0C0D]'
                  }`}
                >
                  {Math.round(activeParams.shellMaxTemp)} °C
                </p>
                <p
                  className={`font-mono text-[10px] font-semibold ${
                    shellAssessment.isExceeded ? 'text-[#991B1B]' : 'text-[#64748B]'
                  }`}
                >
                  Limit &lt; {SHELL_SAFETY_LIMIT_C} °C
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-[#D4DCE7] bg-white p-3">
              <span className="text-[11px] font-medium text-[#475569]">Burning Zone</span>
              <div>
                <p className="font-mono text-xl font-semibold tabular-nums text-[#0B0C0D]">
                  {Math.round(activeParams.burningZoneTemp).toLocaleString()} °C
                </p>
                <p className="font-mono text-[10px] text-[#64748B]">Target 1,445 °C</p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-[#D4DCE7] bg-white p-3">
              <span className="text-[11px] font-medium text-[#475569]">Kiln Drive &amp; Speed</span>
              <div>
                <p className="font-mono text-xl font-semibold tabular-nums text-[#0B0C0D]">
                  {electricalKpis.kilnMainDriveCurrentA} A
                </p>
                <p className="font-mono text-[10px] text-[#64748B]">
                  Speed {activeParams.rotationRpm.toFixed(1)} rpm
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-lg border border-[#CBD5E1] bg-[#0B0C0D] p-3 text-white">
              <span className="text-[11px] font-medium text-[#93C5FD]">Energy Intensity</span>
              <div>
                <p className="font-mono text-sm font-semibold tabular-nums">
                  {thermalKpis.specificThermalEnergyKcalKg} kcal/kg
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-[#93C5FD]">
                  Elec {electricalKpis.specificElectricalKwhT} kWh/t · Draft{' '}
                  {activeParams.draftPressureMbar.toFixed(2)} mbar
                </p>
              </div>
            </div>
          </div>

          {/* Right 4 cols: Original Compact Analysis Report & Radial Stability Gauge */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#D4DCE7] bg-white p-3.5 lg:col-span-4">
            <div className="flex h-full min-w-0 flex-1 flex-col justify-between">
              <div>
                <p className="font-mono text-[11px] font-semibold tracking-[0.08em] uppercase text-[#0B0C0D]">
                  Analysis &amp; Report
                </p>
                <p className="mt-1 text-xs font-medium text-[#1E293B] line-clamp-2">
                  {report.affectedZone}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-[#475569] line-clamp-2">
                  {manualFallbackActive
                    ? 'Advisor recommendations paused during Manual Fallback.'
                    : report.recommendedActions[0]}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReportModalOpen(true)}
                className="mt-2 inline-flex min-h-[34px] w-fit items-center gap-1.5 rounded-md bg-[#0B0C0D] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#1D64D8] cursor-pointer"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Inspect Full Report</span>
              </button>
            </div>

            {/* Original Radial Stability Margin Gauge */}
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
              <svg
                viewBox="0 0 100 100"
                className="h-full w-full -rotate-[225deg]"
                aria-hidden="true"
              >
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="8"
                  strokeDasharray={`${totalArc} ${circumference}`}
                  strokeLinecap="round"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={visuals.gaugeStroke}
                  strokeWidth="8"
                  strokeDasharray={`${filledArc} ${circumference}`}
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-mono text-xl font-semibold tabular-nums text-[#0B0C0D]">
                  {report.thermalStabilityPct}%
                </span>
                <span className="font-mono text-[9px] text-[#64748B]">STABILITY</span>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Process KPIs & Monitored Parameters (Original Light White-Card Styling) */}
        <IndustrialKpiPanel
          params={activeParams}
          regime={regime}
          onChangeRegime={setRegime}
          coolerGrateSpeedSpm={activeGrateSpeed}
          alternativeFuelOverridePct={mode === 'MANUAL_SIMULATION' ? activeAltFuelPct : undefined}
        />

        {/* 30-60 Min Predictive Trajectories (Original Light White-Card Styling) */}
        <PredictiveChartsPanel params={activeParams} regime={regime} />
      </main>

      {/* Original White Full Report Detail Modal */}
      {reportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="operator-report-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        >
          <div
            aria-hidden="true"
            onClick={() => setReportModalOpen(false)}
            className="absolute inset-0 bg-[#0B0C0D]/68 backdrop-blur-sm"
          />

          <div
            data-testid="operator-report-modal"
            className="relative z-10 max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#CBD5E1] bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] pb-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1D64D8]">
                  {mode === 'AUTO_PILOT'
                    ? 'Auto Pilot Analysis Report'
                    : 'Manual Simulation Report · Predicted Output'}
                </p>
                <h2
                  id="operator-report-modal-title"
                  className="mt-1 font-display text-xl font-semibold text-[#0B0C0D]"
                >
                  {report.headline}
                </h2>
                <p className="mt-1 font-mono text-xs text-[#475569]">
                  {condition} · {visuals.priorityLabel}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                aria-label="Close operator analysis report"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#CBD5E1] text-[#475569] hover:border-[#0B0C0D] hover:text-[#0B0C0D] cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <p className="font-mono text-[10px] uppercase text-[#64748B]">Affected Location</p>
                <p className="mt-1 text-xs font-semibold text-[#0B0C0D]">{report.affectedZone}</p>
              </div>
              <div
                className={`rounded-lg border p-3 ${
                  shellAssessment.isExceeded
                    ? 'border-[#FECACA] bg-[#FEF2F2]'
                    : 'border-[#E2E8F0] bg-[#F8FAFC]'
                }`}
              >
                <p className="font-mono text-[10px] uppercase text-[#64748B]">
                  Shell Peak (Limit &lt; {SHELL_SAFETY_LIMIT_C} °C)
                </p>
                <p
                  className={`mt-1 font-mono text-sm font-semibold tabular-nums ${
                    shellAssessment.isExceeded ? 'text-[#DC2626]' : 'text-[#0B0C0D]'
                  }`}
                >
                  {shellAssessment.temperatureC} °C
                </p>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <p className="font-mono text-[10px] uppercase text-[#64748B]">Burning / Feed</p>
                <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-[#0B0C0D]">
                  {Math.round(activeParams.burningZoneTemp)} °C · {activeParams.feedRateTph} t/h
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-[1.65] text-[#334155]">{report.summary}</p>
            <p className="mt-1 font-mono text-[10px] text-[#64748B]">
              {shellAssessment.disclaimer}
            </p>

            <div className="mt-5 grid grid-cols-1 gap-5 border-t border-[#E2E8F0] pt-4 sm:grid-cols-2">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase text-[#0B0C0D]">
                  Possible Contributing Causes
                </p>
                <ul className="mt-2 space-y-2 text-xs leading-[1.6] text-[#334155]">
                  {report.probableCauses.map((cause) => (
                    <li key={cause} className="flex gap-2">
                      <span className="font-mono text-[#1D64D8]" aria-hidden="true">
                        —
                      </span>
                      <span>{cause}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="font-mono text-[11px] font-semibold uppercase text-[#0B0C0D]">
                  Suggested Recommendations (Advisor Only)
                </p>
                <ul className="mt-2 space-y-2 text-xs leading-[1.6] text-[#334155]">
                  {report.recommendedActions.map((rec) => (
                    <li key={rec} className="flex gap-2">
                      <span className="font-mono text-[#1D64D8]" aria-hidden="true">
                        →
                      </span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-[#E2E8F0] pt-4">
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="rounded-md bg-[#0B0C0D] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1D64D8] cursor-pointer"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
