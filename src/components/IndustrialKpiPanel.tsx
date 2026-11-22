import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Flame,
  Gauge,
  Zap,
} from 'lucide-react';
import {
  computeElectricalKpis,
  computeProcessStabilityBoard,
  computeThermalKpis,
  type OperatingRegime,
} from '../data/industrialAnalytics';
import type { KilnInputParams } from '../utils/kilnSimulation';

interface IndustrialKpiPanelProps {
  params: KilnInputParams;
  regime: OperatingRegime;
  onChangeRegime: (regime: OperatingRegime) => void;
  coolerGrateSpeedSpm?: number;
  alternativeFuelOverridePct?: number;
}

const REGIMES: readonly { id: OperatingRegime; label: string }[] = [
  { id: 'NORMAL', label: 'Normal' },
  { id: 'STARTUP', label: 'Startup' },
  { id: 'SHUTDOWN', label: 'Shutdown' },
  { id: 'TRANSITIONAL', label: 'Transitional' },
];

export function IndustrialKpiPanel({
  params,
  regime,
  onChangeRegime,
  coolerGrateSpeedSpm = 14.2,
  alternativeFuelOverridePct,
}: IndustrialKpiPanelProps) {
  const thermal = computeThermalKpis(params, regime);
  const electrical = computeElectricalKpis(params, regime);
  const stabilityRows = computeProcessStabilityBoard(params, regime);

  const afRatioPct =
    alternativeFuelOverridePct !== undefined
      ? alternativeFuelOverridePct
      : thermal.alternativeFuelRatioPct;
  const ngRatioPct = Number((100 - afRatioPct).toFixed(1));

  // Average daily clinker production derived transparently from raw feed × ~0.58 × 24h (demo model)
  const avgDailyClinkerTpd = Math.round(params.feedRateTph * 0.58 * 24);
  const avgVariance = Number(
    (
      stabilityRows.reduce((acc, r) => acc + r.variance, 0) / Math.max(1, stabilityRows.length)
    ).toFixed(2)
  );
  const avgStabilityIdx = Math.round(
    stabilityRows.reduce((acc, r) => acc + r.stabilityIndex, 0) / Math.max(1, stabilityRows.length)
  );

  const primaryAirPct = Number((11.5 + (params.fuelFlowPct - 82) * 0.12).toFixed(1));

  return (
    <section
      aria-labelledby="industrial-kpi-heading"
      className="overflow-hidden rounded-lg border border-[#D4DCE7] bg-white"
    >
      {/* Header matching original KILNOVA light toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-[#1D64D8]" aria-hidden="true" />
          <h3
            id="industrial-kpi-heading"
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0B0C0D]"
          >
            Additional Process KPIs &amp; Monitored Operating Parameters
          </h3>
          <span className="rounded border border-[#CBD5E1] bg-white px-2 py-0.5 font-mono text-[9px] font-semibold text-[#475569]">
            DEMONSTRATION MODEL
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Operating regime filter"
          className="flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-white p-0.5"
        >
          {REGIMES.map((item) => {
            const active = regime === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChangeRegime(item.id)}
                className={`rounded px-2.5 py-1 font-mono text-[10px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#0B0C0D] text-white font-semibold'
                    : 'text-[#475569] hover:text-[#0B0C0D]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {regime !== 'NORMAL' && (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-[#FDE68A] bg-[#FFFBEB] px-4 py-2 text-xs text-[#92400E]"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#D97706]" aria-hidden="true" />
          <span>
            <strong>Regime Isolation ({regime}):</strong> Transient periods are separated from
            steady-state baseline KPI comparisons.
          </span>
        </div>
      )}

      {/* Required 5 Additional KPIs Strip */}
      <div className="grid grid-cols-1 gap-px border-b border-[#E2E8F0] bg-[#E2E8F0] sm:grid-cols-2 lg:grid-cols-5">
        <div className="bg-white p-3.5">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[#64748B]">
            <span>Specific Electrical</span>
            <Zap className="h-3.5 w-3.5 text-[#1D64D8]" aria-hidden="true" />
          </div>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#0B0C0D]">
            {electrical.specificElectricalKwhT}{' '}
            <span className="text-xs font-normal text-[#64748B]">kWh/t</span>
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-[#475569]">
            Workshop {electrical.workshopTotalPowerKw.toLocaleString()} kW
          </p>
        </div>

        <div className="bg-white p-3.5">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[#64748B]">
            <span>Specific Thermal</span>
            <Flame className="h-3.5 w-3.5 text-[#1D64D8]" aria-hidden="true" />
          </div>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#0B0C0D]">
            {thermal.specificThermalEnergyKcalKg}{' '}
            <span className="text-xs font-normal text-[#64748B]">kcal/kg</span>
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-[#475569]">
            {thermal.specificThermalEnergyMjT.toLocaleString()} MJ/t clinker
          </p>
        </div>

        <div className="bg-white p-3.5">
          <p className="font-mono text-[10px] uppercase text-[#64748B]">Avg Daily Clinker</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#0B0C0D]">
            {avgDailyClinkerTpd.toLocaleString()}{' '}
            <span className="text-xs font-normal text-[#64748B]">t/day</span>
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-[#475569]">
            Derived from {params.feedRateTph} t/h feed
          </p>
        </div>

        <div className="bg-white p-3.5">
          <p className="font-mono text-[10px] uppercase text-[#64748B]">Alternative Fuel Mix</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#1D64D8]">
            {afRatioPct}%{' '}
            <span className="text-xs font-normal text-[#64748B]">AF / {ngRatioPct}% CH₄</span>
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-[#475569]">
            Combustion index {thermal.combustionStabilityIndex}/100
          </p>
        </div>

        <div className="bg-white p-3.5">
          <p className="font-mono text-[10px] uppercase text-[#64748B]">Parameter Variance</p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#0B0C0D]">
            {avgVariance}{' '}
            <span className="text-xs font-normal text-[#64748B]">σ² avg</span>
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-[#475569]">
            Stability Index {avgStabilityIdx}%
          </p>
        </div>
      </div>

      {/* Required 9 Monitored Process Parameters Grid */}
      <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#475569]">
          Monitored Process Parameters (9 Channels · Pending Plant Validation)
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9">
          {[
            { label: 'Main Burner Fuel', val: `${thermal.mainBurnerFuelNm3h} Nm³/h` },
            { label: 'Precalciner Fuel', val: `${thermal.precalcinerFuelNm3h} Nm³/h` },
            { label: 'Primary Air', val: `${primaryAirPct} %` },
            { label: 'Tertiary Air', val: `${thermal.tertiaryAirTempC} °C` },
            { label: 'ID Exhaust Draft', val: `${params.draftPressureMbar.toFixed(2)} mbar` },
            { label: 'Kiln Speed', val: `${params.rotationRpm.toFixed(1)} rpm` },
            { label: 'Cooler Airflow', val: `${params.coolerAirflowPct} %` },
            { label: 'Cooler Grate Speed', val: `${coolerGrateSpeedSpm.toFixed(1)} spm` },
            { label: 'Alt. Fuel Ratio', val: `${afRatioPct} %` },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded border border-[#D4DCE7] bg-white px-2.5 py-2"
            >
              <p className="truncate text-[10px] text-[#64748B]">{item.label}</p>
              <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-[#0B0C0D]">
                {item.val}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Statistical Variance & Stability Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[740px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-white font-mono text-[10px] uppercase tracking-[0.06em] text-[#64748B]">
              <th className="px-4 py-2 font-medium">Critical Operating Parameter</th>
              <th className="px-3 py-2 text-right font-medium">Current</th>
              <th className="px-3 py-2 text-right font-medium">Mean</th>
              <th className="px-3 py-2 text-right font-medium">Std Dev</th>
              <th className="px-3 py-2 text-right font-medium">Variance (σ²)</th>
              <th className="px-3 py-2 text-center font-medium">Trend</th>
              <th className="px-4 py-2 text-right font-medium">Stability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {stabilityRows.map((row) => (
              <tr key={row.id} className="hover:bg-[#F8FAFC]">
                <td className="px-4 py-2 font-medium text-[#0B0C0D]">{row.variable}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-[#0B0C0D]">
                  {row.currentValue} {row.unit}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#475569]">
                  {row.mean}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#475569]">
                  ±{row.stdDev}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#475569]">
                  {row.variance}
                </td>
                <td className="px-3 py-2 text-center font-mono text-[10px] uppercase text-[#475569]">
                  <span className="inline-flex items-center gap-1">
                    {row.trend === 'rising' && (
                      <ArrowUpRight className="h-3 w-3 text-[#DC2626]" aria-hidden="true" />
                    )}
                    {row.trend === 'falling' && (
                      <ArrowDownRight className="h-3 w-3 text-[#1D64D8]" aria-hidden="true" />
                    )}
                    {row.trend === 'stable' && (
                      <ArrowRight className="h-3 w-3 text-[#059669]" aria-hidden="true" />
                    )}
                    {row.trend}
                  </span>
                </td>
                <td
                  className={`px-4 py-2 text-right font-mono font-semibold tabular-nums ${
                    row.stabilityIndex < 65
                      ? 'text-[#DC2626]'
                      : row.stabilityIndex < 82
                        ? 'text-[#1D64D8]'
                        : 'text-[#059669]'
                  }`}
                >
                  {row.stabilityIndex}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
