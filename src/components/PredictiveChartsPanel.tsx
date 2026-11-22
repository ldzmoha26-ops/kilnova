import { useState } from 'react';
import { AlertTriangle, Clock, Cpu, TrendingUp } from 'lucide-react';
import {
  generatePredictiveSeries,
  type OperatingRegime,
  type PredictiveMetricSeries,
} from '../data/industrialAnalytics';
import type { KilnInputParams } from '../utils/kilnSimulation';

interface PredictiveChartsPanelProps {
  params: KilnInputParams;
  regime: OperatingRegime;
  compact?: boolean;
}

function MetricTrajectoryChart({ series }: { series: PredictiveMetricSeries }) {
  const values: number[] = [];
  for (const pt of series.points) {
    if (pt.measured !== null) values.push(pt.measured);
    if (pt.predicted !== null) values.push(pt.predicted);
    if (pt.labSample !== null && pt.labSample !== undefined) values.push(pt.labSample);
  }
  if (series.limitValue !== undefined) values.push(series.limitValue);

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max((rawMax - rawMin) * 0.16, 0.5);
  const minY = rawMin - pad;
  const maxY = rawMax + pad;
  const spanY = Math.max(0.001, maxY - minY);

  const width = 520;
  const height = 176;
  const padL = 50;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xForIdx = (idx: number) => padL + (idx / Math.max(1, series.points.length - 1)) * plotW;
  const yForVal = (val: number) => padT + ((maxY - val) / spanY) * plotH;

  const nowIdx = series.points.findIndex((p) => p.minuteOffset === 0);
  const nowX = xForIdx(nowIdx >= 0 ? nowIdx : 4);

  const measuredPts = series.points
    .map((pt, idx) =>
      pt.measured !== null ? `${xForIdx(idx).toFixed(1)},${yForVal(pt.measured).toFixed(1)}` : null
    )
    .filter((v): v is string => v !== null)
    .join(' ');

  const predictedPts = series.points
    .map((pt, idx) =>
      pt.predicted !== null
        ? `${xForIdx(idx).toFixed(1)},${yForVal(pt.predicted).toFixed(1)}`
        : null
    )
    .filter((v): v is string => v !== null)
    .join(' ');

  const limitY = series.limitValue !== undefined ? yForVal(series.limitValue) : null;
  const nowVal = series.points.find((p) => p.minuteOffset === 0)?.measured ?? 0;
  const pred60Val = series.points[series.points.length - 1]?.predicted ?? nowVal;
  const delta60 = Number((pred60Val - nowVal).toFixed(2));

  const breachesLimit =
    series.limitValue !== undefined &&
    (series.id === 'inlet_o2'
      ? pred60Val < series.limitValue
      : series.id === 'draft_pressure'
        ? pred60Val > series.limitValue
        : pred60Val > series.limitValue);

  const yTicks = [maxY, (maxY + minY) / 2, minY];

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-display text-xs font-semibold text-[#0B0C0D]">{series.label}</h4>
            {series.softSensorUsed && (
              <span className="inline-flex items-center gap-1 rounded border border-[#BFDBFE] bg-[#EFF6FF] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#0B4EA2]">
                <Cpu className="h-2.5 w-2.5" aria-hidden="true" />
                SOFT SENSOR
              </span>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-[#64748B]">
            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{series.residenceLagNote}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 text-right font-mono">
          <div>
            <p className="text-[9px] uppercase text-[#64748B]">Measured NOW</p>
            <p className="text-xs font-semibold tabular-nums text-[#0B0C0D]">
              {nowVal} {series.unit}
            </p>
          </div>
          <div className="border-l border-[#CBD5E1] pl-3">
            <p className="text-[9px] uppercase text-[#64748B]">Predicted +60m</p>
            <p
              className={`text-xs font-semibold tabular-nums ${
                breachesLimit ? 'text-[#DC2626]' : 'text-[#1D64D8]'
              }`}
            >
              {pred60Val} {series.unit}{' '}
              <span className="text-[10px]">({delta60 >= 0 ? `+${delta60}` : delta60})</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-2.5 overflow-x-auto rounded border border-[#E2E8F0] bg-white p-1.5">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-40 w-full min-w-[340px]"
          role="img"
          aria-label={`${series.label} measured vs predicted trajectory`}
        >
          <rect
            x={nowX}
            y={padT}
            width={padL + plotW - nowX}
            height={plotH}
            fill="#EFF6FF"
            opacity="0.7"
          />

          {yTicks.map((tick, i) => {
            const y = yForVal(tick);
            return (
              <g key={i}>
                <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="#E2E8F0" strokeWidth="1" />
                <text
                  x={padL - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="#64748B"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {tick.toFixed(series.unit === '%' || series.unit === 'mbar' ? 1 : 0)}
                </text>
              </g>
            );
          })}

          {limitY !== null && (
            <g>
              <line
                x1={padL}
                y1={limitY}
                x2={padL + plotW}
                y2={limitY}
                stroke="#DC2626"
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />
              <text
                x={padL + 6}
                y={Math.max(padT + 10, limitY - 5)}
                fontSize="9.5"
                fill="#DC2626"
                fontFamily="IBM Plex Mono, monospace"
              >
                {series.limitLabel ?? `Limit ${series.limitValue} ${series.unit}`}
              </text>
            </g>
          )}

          <line
            x1={nowX}
            y1={padT}
            x2={nowX}
            y2={padT + plotH}
            stroke="#94A3B8"
            strokeWidth="1"
            strokeDasharray="2 3"
          />

          <polyline fill="none" stroke="#0B0C0D" strokeWidth="2.2" points={measuredPts} />
          <polyline
            fill="none"
            stroke="#1D64D8"
            strokeWidth="2.2"
            strokeDasharray="6 4"
            points={predictedPts}
          />

          {series.points.map((pt, idx) =>
            pt.labSample !== null && pt.labSample !== undefined ? (
              <circle
                key={`lab-${idx}`}
                cx={xForIdx(idx)}
                cy={yForVal(pt.labSample)}
                r="3.8"
                fill="#059669"
                stroke="#FFFFFF"
                strokeWidth="1.5"
              />
            ) : null
          )}

          {nowIdx >= 0 && series.points[nowIdx].measured !== null && (
            <circle
              cx={nowX}
              cy={yForVal(series.points[nowIdx].measured!)}
              r="4"
              fill="#FFFFFF"
              stroke="#0B0C0D"
              strokeWidth="2"
            />
          )}

          {series.points.map((pt, idx) => (
            <text
              key={pt.label}
              x={xForIdx(idx)}
              y={height - 8}
              textAnchor="middle"
              fontSize="9.5"
              fill={pt.minuteOffset === 0 ? '#0B0C0D' : '#64748B'}
              fontWeight={pt.minuteOffset === 0 ? 700 : 400}
              fontFamily="IBM Plex Mono, monospace"
            >
              {pt.label}
            </text>
          ))}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#475569]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-[#0B0C0D]" aria-hidden="true" />
            Solid: Measured
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 border-t-2 border-dashed border-[#1D64D8]"
              aria-hidden="true"
            />
            Dashed: Predicted (+60m)
          </span>
          {series.softSensorUsed && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[#059669]" aria-hidden="true" />
              Lab Sample
            </span>
          )}
        </div>
        {breachesLimit && (
          <span className="inline-flex items-center gap-1 font-mono font-semibold text-[#DC2626]">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            PROJECTED LIMIT CROSSING
          </span>
        )}
      </div>
    </div>
  );
}

export function PredictiveChartsPanel({
  params,
  regime,
  compact = false,
}: PredictiveChartsPanelProps) {
  const allSeries = generatePredictiveSeries(params, regime);
  const [selectedIds, setSelectedIds] = useState<string[]>(['shell_temp', 'free_lime']);

  const toggleMetric = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((item) => item !== id) : prev;
      }
      return [...prev, id];
    });
  };

  const visibleSeries = compact
    ? allSeries.slice(0, 2)
    : allSeries.filter((s) => selectedIds.includes(s.id));

  return (
    <section
      aria-labelledby="predictive-analytics-heading"
      className="overflow-hidden rounded-lg border border-[#D4DCE7] bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-[#1D64D8]" aria-hidden="true" />
          <h3
            id="predictive-analytics-heading"
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0B0C0D]"
          >
            30–60 Min Predictive Trajectories
          </h3>
          <span className="rounded border border-[#FDE68A] bg-[#FFFBEB] px-2 py-0.5 font-mono text-[9px] font-semibold text-[#92400E]">
            SIMULATED PREDICTION ARCHITECTURE — UNVALIDATED
          </span>
        </div>
        <span className="font-mono text-[10px] text-[#64748B]">Regime: {regime}</span>
      </div>

      {!compact && (
        <div className="flex flex-wrap gap-1.5 border-b border-[#E2E8F0] px-4 py-2" role="group" aria-label="Select predictive metrics">
          {allSeries.map((series) => {
            const active = selectedIds.includes(series.id);
            return (
              <button
                key={series.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleMetric(series.id)}
                className={`rounded border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'border-[#1D64D8] bg-[#EFF6FF] font-semibold text-[#0B4EA2]'
                    : 'border-[#CBD5E1] bg-white text-[#475569] hover:border-[#0B0C0D] hover:text-[#0B0C0D]'
                }`}
              >
                {series.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 p-3.5 lg:grid-cols-2">
        {visibleSeries.map((series) => (
          <MetricTrajectoryChart key={series.id} series={series} />
        ))}
      </div>
    </section>
  );
}
