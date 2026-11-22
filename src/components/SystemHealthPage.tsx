import { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import {
  SYSTEM_HEALTH_SENSORS,
  type DiagnosticFaultClass,
  type SensorDiagnosticItem,
} from '../data/industrialAnalytics';
import { ParameterRegistryPanel } from './ParameterRegistryPanel';

function faultClassBadge(faultClass: DiagnosticFaultClass): {
  label: string;
  classes: string;
} {
  if (faultClass === 'SENSOR_FAULT') {
    return {
      label: 'FAULTY SENSOR / DRIFT',
      classes: 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]',
    };
  }
  if (faultClass === 'PROCESS_ANOMALY') {
    return {
      label: 'PROCESS ANOMALY',
      classes: 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]',
    };
  }
  return {
    label: 'NOMINAL',
    classes: 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]',
  };
}

export function SystemHealthPage() {
  const [selectedSensorId, setSelectedSensorId] = useState<string>('SNS-O206');

  const selectedSensor: SensorDiagnosticItem =
    SYSTEM_HEALTH_SENSORS.find((s) => s.id === selectedSensorId) ?? SYSTEM_HEALTH_SENSORS[0];

  const nominalCount = SYSTEM_HEALTH_SENSORS.filter((s) => s.state === 'Nominal').length;
  const flaggedCount = SYSTEM_HEALTH_SENSORS.length - nominalCount;
  const processAnomalies = SYSTEM_HEALTH_SENSORS.filter(
    (s) => s.faultClass === 'PROCESS_ANOMALY'
  ).length;
  const sensorFaults = SYSTEM_HEALTH_SENSORS.filter((s) => s.faultClass === 'SENSOR_FAULT').length;
  const avgAvailability = (
    SYSTEM_HEALTH_SENSORS.reduce((acc, s) => acc + s.availabilityPct, 0) /
    SYSTEM_HEALTH_SENSORS.length
  ).toFixed(1);

  const selectedBadge = faultClassBadge(selectedSensor.faultClass);

  return (
    <div
      data-testid="system-health-page"
      className="min-h-screen bg-[#F1F5F9] pt-16 text-[#0B0C0D]"
    >
      <main className="mx-auto max-w-[1600px] space-y-3.5 p-3.5">
        {/* Top 4-card strip matching exact original Supervisor KPI strip style */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center justify-between rounded-lg border border-[#0B0C0D] bg-[#0B0C0D] px-4 py-2.5 text-white">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#93C5FD]">
                System Health · Demo Data
              </p>
              <p className="mt-0.5 font-display text-base font-semibold">
                {nominalCount} / {SYSTEM_HEALTH_SENSORS.length} Nominal
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-[#FCD34D]">
              {flaggedCount} Flagged
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-2.5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#991B1B]">
                Process Anomalies
              </p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[#DC2626]">
                {processAnomalies} Channels
              </p>
            </div>
            <AlertOctagon className="h-4 w-4 text-[#DC2626]" aria-hidden="true" />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-2.5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#92400E]">
                Faulty / Drifting Sensors
              </p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[#B45309]">
                {sensorFaults} Channel
              </p>
            </div>
            <Wrench className="h-4 w-4 text-[#D97706]" aria-hidden="true" />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[#D4DCE7] bg-white px-4 py-2.5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                Fleet Availability (24h)
              </p>
              <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[#0B0C0D]">
                {avgAvailability}%
              </p>
            </div>
            <Activity className="h-4 w-4 text-[#1D64D8]" aria-hidden="true" />
          </div>
        </div>

        {/* Main 8 / 4 Split: Sensor Diagnostics Table + Channel Inspector */}
        <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-12">
          <section
            aria-label="Monitored sensor health channels"
            className="overflow-hidden rounded-lg border border-[#D4DCE7] bg-white xl:col-span-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0B0C0D]">
                Sensor Reliability vs Process Anomalies (Click Row to Inspect)
              </p>
              <span className="font-mono text-[10px] text-[#64748B]">
                3 Nominal · 2 Process Anomalies · 1 Faulty Sensor
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-white font-mono text-[10px] uppercase tracking-[0.06em] text-[#64748B]">
                    <th className="px-4 py-2 font-medium">Channel &amp; Tag</th>
                    <th className="px-3 py-2 font-medium">Reading / Limit</th>
                    <th className="px-3 py-2 font-medium">Classification</th>
                    <th className="px-3 py-2 text-right font-medium">Avail / Miss</th>
                    <th className="px-3 py-2 text-right font-medium">Freshness</th>
                    <th className="px-3 py-2 text-right font-medium">Reliability</th>
                    <th className="px-4 py-2 font-medium">Comm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {SYSTEM_HEALTH_SENSORS.map((sensor) => {
                    const selected = sensor.id === selectedSensor.id;
                    const badge = faultClassBadge(sensor.faultClass);
                    return (
                      <tr
                        key={sensor.id}
                        onClick={() => setSelectedSensorId(sensor.id)}
                        className={`cursor-pointer transition-colors ${
                          selected ? 'bg-[#EFF6FF]/80' : 'hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-[#0B0C0D]">{sensor.name}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-[#64748B]">
                            {sensor.id} · {sensor.tag}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums">
                          <div
                            className={`font-semibold ${
                              sensor.id === 'SNS-IR04' ? 'text-[#DC2626]' : 'text-[#0B0C0D]'
                            }`}
                          >
                            {sensor.valueDisplay}
                          </div>
                          <div className="text-[10px] text-[#64748B]">{sensor.configuredLimit}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[9.5px] font-semibold ${badge.classes}`}
                          >
                            {sensor.faultClass === 'PROCESS_ANOMALY' && (
                              <AlertOctagon className="h-3 w-3 shrink-0" aria-hidden="true" />
                            )}
                            {sensor.faultClass === 'SENSOR_FAULT' && (
                              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                            )}
                            {sensor.faultClass === 'NOMINAL' && (
                              <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                            )}
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          <div className="text-[#0B0C0D]">{sensor.availabilityPct}%</div>
                          <div
                            className={`text-[10px] ${
                              sensor.missingDataPct > 2 ? 'font-semibold text-[#B45309]' : 'text-[#64748B]'
                            }`}
                          >
                            -{sensor.missingDataPct}% miss
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          <span
                            className={
                              sensor.freshnessSeconds > 15
                                ? 'font-semibold text-[#B45309]'
                                : 'text-[#334155]'
                            }
                          >
                            {sensor.freshnessSeconds}s
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          <span
                            className={
                              sensor.analyzerReliabilityPct < 85
                                ? 'font-semibold text-[#B45309]'
                                : 'text-[#059669]'
                            }
                          >
                            {sensor.analyzerReliabilityPct}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[10px] text-[#475569]">
                          {sensor.commStatus}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Right 4 cols: White Sensor Diagnostic Inspector */}
          <aside
            data-testid="sensor-diagnostic-inspector"
            aria-label="Selected sensor diagnostic inspector"
            className="flex flex-col justify-between rounded-lg border border-[#D4DCE7] bg-white p-4 xl:col-span-4"
          >
            <div>
              <div className="flex items-start justify-between gap-2 border-b border-[#E2E8F0] pb-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#64748B]">
                    Channel Inspector · {selectedSensor.tag}
                  </p>
                  <h2 className="mt-0.5 font-display text-base font-semibold text-[#0B0C0D]">
                    {selectedSensor.name}
                  </h2>
                </div>
                <span
                  className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[9.5px] font-semibold ${selectedBadge.classes}`}
                >
                  {selectedBadge.label}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="rounded border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
                  <p className="text-[9.5px] uppercase text-[#64748B]">Reading</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-[#0B0C0D]">
                    {selectedSensor.valueDisplay}
                  </p>
                </div>
                <div className="rounded border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
                  <p className="text-[9.5px] uppercase text-[#64748B]">24h Drift</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-[#0B0C0D]">
                    {selectedSensor.driftPer24h}
                  </p>
                </div>
                <div className="rounded border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
                  <p className="text-[9.5px] uppercase text-[#64748B]">Sync Offset</p>
                  <p className="mt-0.5 font-semibold tabular-nums text-[#0B0C0D]">
                    {selectedSensor.syncOffsetMs} ms
                  </p>
                </div>
                <div className="rounded border border-[#E2E8F0] bg-[#F8FAFC] p-2.5">
                  <p className="text-[9.5px] uppercase text-[#64748B]">Freshness</p>
                  <p className="mt-0.5 flex items-center gap-1 font-semibold tabular-nums text-[#0B0C0D]">
                    <Clock className="h-3 w-3 text-[#1D64D8]" aria-hidden="true" />
                    {selectedSensor.freshnessSeconds} s
                  </p>
                </div>
              </div>

              <div
                className={`mt-3 rounded-lg border p-3 text-xs leading-relaxed ${
                  selectedSensor.faultClass === 'SENSOR_FAULT'
                    ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'
                    : selectedSensor.faultClass === 'PROCESS_ANOMALY'
                      ? 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
                      : 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]'
                }`}
              >
                <p className="font-mono text-[10px] font-semibold uppercase">
                  Process Anomaly vs Faulty Sensor
                </p>
                <p className="mt-1">{selectedSensor.diagnosticExplanation}</p>
              </div>

              <div className="mt-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs">
                <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase text-[#1D64D8]">
                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  Recommended Action
                </p>
                <p className="mt-1 leading-relaxed text-[#334155]">
                  {selectedSensor.operatorGuidance}
                </p>
              </div>
            </div>

            <p className="mt-3 border-t border-[#E2E8F0] pt-2.5 font-mono text-[9.5px] text-[#64748B]">
              Advisor-only diagnostics — does not override plant DCS interlocks.
            </p>
          </aside>
        </div>

        <ParameterRegistryPanel />
      </main>
    </div>
  );
}
