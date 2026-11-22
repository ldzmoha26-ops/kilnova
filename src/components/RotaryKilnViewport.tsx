import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Flame, RotateCcw } from 'lucide-react';
import { RotaryKilnScene, type ProjectedAnchor } from '../three/RotaryKilnScene';
import { isWebGLAvailable } from '../three/DissolutionScene';
import type { AssessmentStatus, KilnZoneId, KilnZoneTelemetry } from '../utils/kilnSimulation';

interface RotaryKilnViewportProps {
  zones: readonly KilnZoneTelemetry[];
  selectedZoneId: KilnZoneId;
  thermalMode: boolean;
  hotspotIntensity: number;
  onSelectZone: (zoneId: KilnZoneId) => void;
  fillHeight?: boolean;
}

const DEFAULT_ANCHORS: readonly ProjectedAnchor[] = [
  { id: 'feed', xPct: 16, yPct: 30, visible: true },
  { id: 'calcination', xPct: 34, yPct: 24, visible: true },
  { id: 'transition', xPct: 52, yPct: 68, visible: true },
  { id: 'burning', xPct: 70, yPct: 26, visible: true },
  { id: 'cooler', xPct: 86, yPct: 64, visible: true },
];

const CALLOUT_Y_OFFSET: Record<KilnZoneId, number> = {
  feed: -28,
  calcination: -36,
  transition: 34,
  burning: -34,
  cooler: 28,
};

const CALLOUT_SHORT_LABEL: Record<KilnZoneId, string> = {
  feed: 'Preheater',
  calcination: 'Calcination',
  transition: 'Transition',
  burning: 'Ring B-04',
  cooler: 'Cooler',
};

function statusStyles(status: AssessmentStatus): {
  badgeBg: string;
  badgeText: string;
  border: string;
  textClass: string;
} {
  if (status === 'ANOMALY') {
    return {
      badgeBg: 'bg-[#0B0C0D]',
      badgeText: 'text-white',
      border: 'border-[#0B0C0D]',
      textClass: 'text-[#0B0C0D] font-semibold',
    };
  }
  if (status === 'WARNING') {
    return {
      badgeBg: 'bg-[#1D64D8]',
      badgeText: 'text-white',
      border: 'border-[#1D64D8]',
      textClass: 'text-[#1D64D8] font-semibold',
    };
  }
  return {
    badgeBg: 'bg-[#E2E8F0]',
    badgeText: 'text-[#0F172A]',
    border: 'border-[#CBD5E1]',
    textClass: 'text-[#475569] font-medium',
  };
}

export function RotaryKilnViewport({
  zones,
  selectedZoneId,
  thermalMode,
  hotspotIntensity,
  onSelectZone,
  fillHeight = false,
}: RotaryKilnViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<RotaryKilnScene | null>(null);
  const [anchors, setAnchors] = useState<readonly ProjectedAnchor[]>(DEFAULT_ANCHORS);
  const [webglFallback, setWebglFallback] = useState(false);

  const initialPropsRef = useRef({ thermalMode, hotspotIntensity, selectedZoneId });

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let instance: RotaryKilnScene | null = null;

    if (mountRef.current && isWebGLAvailable()) {
      try {
        instance = new RotaryKilnScene({
          container: mountRef.current,
          reducedMotion: prefersReduced,
          onAnchorsProjected: (projected) => {
            setAnchors(projected);
          },
        });
        instance.setState({
          thermalMode: initialPropsRef.current.thermalMode,
          hotspotIntensity: initialPropsRef.current.hotspotIntensity,
          selectedZone: initialPropsRef.current.selectedZoneId,
        });
        sceneRef.current = instance;
      } catch {
        setWebglFallback(true);
      }
    } else {
      setWebglFallback(true);
    }

    return () => {
      instance?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setState({
      thermalMode,
      hotspotIntensity,
      selectedZone: selectedZoneId,
    });
  }, [thermalMode, hotspotIntensity, selectedZoneId]);

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? zones[3];
  const selectedStyles = statusStyles(selectedZone.status);

  return (
    <div
      data-testid="rotary-kiln-viewport"
      data-thermal-mode={thermalMode ? 'on' : 'off'}
      className={`relative flex flex-col overflow-hidden rounded-lg border border-[#D4DCE7] bg-[#EEF3F9] ${
        fillHeight ? 'h-full min-h-[340px]' : ''
      }`}
    >
      {/* Compact Top Viewport Strip */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#D4DCE7] bg-white px-3.5 py-2">
        <div className="flex items-center gap-2.5 text-xs">
          <span className="font-mono text-[11px] font-medium tracking-[0.06em] text-[#0B0C0D]">
            3D ROTARY KILN MODEL
          </span>
          <span aria-hidden="true" className="text-[#CBD5E1]">
            ·
          </span>
          <span className="text-[#475569]">
            {thermalMode ? 'Thermal Shell Distribution' : 'Structural & Sensor View'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => sceneRef.current?.resetCamera()}
          aria-label="Reset 3D kiln camera angle"
          className="inline-flex items-center gap-1.5 rounded border border-[#CBD5E1] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1E293B] transition-colors hover:border-[#1D64D8] hover:text-[#1D64D8] cursor-pointer"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          <span>Reset Angle</span>
        </button>
      </div>

      {/* 3D Canvas + Anchored Sensor Callouts */}
      <div
        className={`relative w-full ${
          fillHeight ? 'min-h-[250px] flex-1' : 'h-[320px] sm:h-[360px] lg:h-[380px]'
        }`}
      >
        <div
          ref={mountRef}
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        />

        {webglFallback && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#EEF3F9] p-6">
            <svg
              viewBox="0 0 640 240"
              className="h-full w-full max-w-[540px]"
              role="img"
              aria-label="Rotary cement kiln technical schematic"
            >
              <line x1="60" y1="184" x2="580" y2="184" stroke="#CBD5E1" />
              <rect x="74" y="88" width="54" height="96" fill="#1E293B" />
              <rect x="506" y="102" width="60" height="82" fill="#1E293B" />
              <polygon
                points="126,102 508,116 508,154 126,142"
                fill={thermalMode ? '#1D64D8' : '#334155'}
              />
              {hotspotIntensity > 0.35 && (
                <rect x="382" y="112" width="52" height="38" fill="#60A5FA" opacity="0.85" />
              )}
              <rect x="195" y="142" width="24" height="42" fill="#475569" />
              <rect x="315" y="147" width="24" height="37" fill="#475569" />
              <rect x="432" y="151" width="24" height="33" fill="#475569" />
            </svg>
          </div>
        )}

        {/* Anchored Sensor Callout Markers */}
        <div className="pointer-events-none absolute inset-0 hidden sm:block">
          {zones.map((zone) => {
            const anchor = anchors.find((a) => a.id === zone.id);
            if (!anchor || !anchor.visible) return null;
            const selected = zone.id === selectedZoneId;
            const styles = statusStyles(zone.status);
            const yOffset = CALLOUT_Y_OFFSET[zone.id];

            return (
              <button
                key={zone.id}
                type="button"
                onClick={() => onSelectZone(zone.id)}
                aria-pressed={selected}
                style={{
                  left: `${anchor.xPct}%`,
                  top: `${anchor.yPct}%`,
                  transform: `translate(-50%, calc(-50% + ${yOffset}px))`,
                }}
                className={`pointer-events-auto absolute flex items-center gap-2 rounded-md border px-2 py-1 text-left transition-colors cursor-pointer ${
                  selected
                    ? 'border-[#1D64D8] bg-[#0B0C0D] text-white shadow-md z-20'
                    : `${styles.border} bg-white/95 text-[#0B0C0D] shadow-sm hover:border-[#1D64D8] z-10`
                }`}
              >
                <span className="flex flex-col leading-tight">
                  <span
                    className={`text-[10px] font-medium whitespace-nowrap ${
                      selected ? 'text-[#BFDBFE]' : 'text-[#475569]'
                    }`}
                  >
                    {CALLOUT_SHORT_LABEL[zone.id]}
                  </span>
                  <span className="font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap">
                    {thermalMode ? `${zone.shellTempC} °C` : `${zone.temperatureC} °C`}
                  </span>
                </span>
                <span
                  aria-label={`${zone.name} status ${zone.status}`}
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                    selected && zone.status === 'ANOMALY'
                      ? 'bg-[#2563EB] text-white'
                      : `${styles.badgeBg} ${styles.badgeText}`
                  }`}
                >
                  {zone.status === 'NORMAL' ? (
                    <Check className="h-3 w-3 stroke-[2.5]" aria-hidden="true" />
                  ) : zone.status === 'ANOMALY' ? (
                    <Flame className="h-3 w-3 stroke-[2.2]" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 stroke-[2.2]" aria-hidden="true" />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bottom-left drag hint & thermal scale */}
        <div className="pointer-events-none absolute inset-x-3 bottom-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="rounded border border-[#D4DCE7] bg-white/92 px-2 py-0.5 font-mono text-[10px] tracking-[0.04em] text-[#475569]">
            Drag model to orbit · Click marker to inspect section
          </span>

          {thermalMode && (
            <div className="flex items-center gap-2 rounded border border-[#D4DCE7] bg-white/92 px-2 py-0.5 font-mono text-[10px] tabular-nums text-[#0B0C0D]">
              <span>200 °C</span>
              <span
                aria-hidden="true"
                className="h-2 w-20 rounded-sm"
                style={{
                  background:
                    'linear-gradient(90deg, #131820 0%, #16418a 45%, #1d64d8 75%, #93c5fd 100%)',
                }}
              />
              <span>420 °C Shell</span>
            </div>
          )}
        </div>
      </div>

      {/* Compact Section Inspector Strip */}
      <div className="shrink-0 border-t border-[#D4DCE7] bg-white px-3.5 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-[#0B0C0D]">{selectedZone.name}</span>
              <span aria-hidden="true" className="text-[#CBD5E1]">
                ·
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[#475569]">
                {selectedZone.meterRange}
              </span>
              <span aria-hidden="true" className="text-[#CBD5E1]">
                ·
              </span>
              <span className={`font-mono text-[11px] ${selectedStyles.textClass}`}>
                {selectedZone.status}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-[#475569]">{selectedZone.summary}</p>
          </div>

          <div
            role="group"
            aria-label="Inspect kiln section"
            className="flex flex-wrap items-center gap-1"
          >
            {zones.map((zone) => {
              const active = zone.id === selectedZoneId;
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => onSelectZone(zone.id)}
                  aria-pressed={active}
                  className={`rounded border px-2 py-0.5 font-mono text-[10px] transition-colors cursor-pointer ${
                    active
                      ? 'border-[#1D64D8] bg-[#1D64D8] text-white'
                      : 'border-[#CBD5E1] bg-white text-[#475569] hover:border-[#0B0C0D] hover:text-[#0B0C0D]'
                  }`}
                >
                  {zone.id === 'burning'
                    ? 'B-04'
                    : zone.id.charAt(0).toUpperCase() + zone.id.slice(1, 4)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
