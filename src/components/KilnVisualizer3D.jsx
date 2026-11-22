import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Flame,
  RotateCcw,
  Camera,
  Eye,
  Activity,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle,
  CheckCircle2,
  ScanEye,
  Play,
  Pause,
  Sliders,
  ShieldAlert,
  Maximize2,
  Minimize2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants, Real-Plant Geometry Proportions & Isolated Context B Telemetry
// ---------------------------------------------------------------------------

const KILN_TILT = Math.atan(0.035); // Real rotary kiln slope: 3.5% (~2.0 deg)
const KILN_CENTER = [-5, 6.8, 0];
const KILN_LENGTH = 30;
const KILN_SEGMENTS = 20;
const TYRE_XS = [-12, -2, 7];

export const DIGITAL_TWIN_SHELL_LIMIT_C = 370;

export const NOMINAL_TELEMETRY = {
  '341_01_TE': 865,
  '341_07_TE': 710,
  '341_05_TE': 540,
  '331_01_TE': 840,
  '331_07_TE': 685,
  '331_05_TE': 515,
  Debit_vent_Prech_F404: 78.5,
  Debit_vent_Prech_F403: 77.2,
  debit_gaz_Pyroclone: 4200,
  debit_gaz_Bruleur: 2950,
  T_air_Secondaire: 985,
  Vitesse_Four: 1.9,
  Puissance_totale: 485,
  debit_KK: 240,
  Debit_F414: 64.0,
  Debit_F413: 62.5,
  burning_zone_temp: 1425,
  calcination_zone_temp: 950,
  kiln_shell_temp: 275,
  bearing_vibration: 1.95,
  motor_current: 190,
  calcination_deg: 65.2,
  free_lime_pct: 1.48,
  nox_ppm: 198,
};

export const SCENARIOS = [
  { id: 'NORMAL', label: 'Normal', severity: 'normal', overrides: {} },
  {
    id: 'SHELL_HOTSPOT',
    label: 'Shell Hotspot',
    severity: 'crit',
    overrides: { kiln_shell_temp: 445, burning_zone_temp: 1475, T_air_Secondaire: 1030 },
  },
  {
    id: 'CLINKER_RING',
    label: 'Clinker Ring',
    severity: 'crit',
    overrides: { motor_current: 252, Vitesse_Four: 3.2, Puissance_totale: 645, debit_KK: 215 },
  },
  {
    id: 'KILN_OVERLOAD',
    label: 'Kiln Overload',
    severity: 'crit',
    overrides: {
      burning_zone_temp: 1260,
      debit_KK: 145,
      motor_current: 218,
      T_air_Secondaire: 880,
      debit_gaz_Bruleur: 2450,
    },
  },
  {
    id: 'BEARING_FAILURE',
    label: 'Bearing Failure',
    severity: 'crit',
    overrides: { bearing_vibration: 8.5, motor_current: 212 },
  },
  {
    id: 'THERMAL_RUNAWAY',
    label: 'Thermal Runaway',
    severity: 'crit',
    overrides: {
      burning_zone_temp: 1620,
      kiln_shell_temp: 375,
      calcination_zone_temp: 1055,
      T_air_Secondaire: 1140,
      '341_01_TE': 965,
      '331_01_TE': 935,
      debit_gaz_Bruleur: 3550,
    },
  },
  {
    id: 'DRIFT_REFRACTORY_WEAR',
    label: 'Refractory Wear',
    severity: 'warn',
    overrides: { kiln_shell_temp: 312 },
  },
  {
    id: 'DRIFT_BEARING_FATIGUE',
    label: 'Bearing Fatigue',
    severity: 'warn',
    overrides: { bearing_vibration: 2.8 },
  },
  {
    id: 'DRIFT_DRIVE_FRICTION',
    label: 'Drive Friction',
    severity: 'warn',
    overrides: { motor_current: 206, Puissance_totale: 535 },
  },
  {
    id: 'HIGH_FREE_LIME',
    label: 'High Free Lime',
    severity: 'warn',
    overrides: {
      burning_zone_temp: 1335,
      calcination_zone_temp: 895,
      debit_gaz_Pyroclone: 3650,
      _freeLimeBias: 1.35,
      _calcinationBias: -7.5,
    },
  },
  {
    id: 'HIGH_NOX',
    label: 'High NOx',
    severity: 'warn',
    overrides: {
      burning_zone_temp: 1495,
      debit_gaz_Bruleur: 3380,
      T_air_Secondaire: 1065,
      _noxBias: 72,
    },
  },
];

const SCENARIO_MAP = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

const CAMERA_PRESETS = {
  LINE: { label: 'LINE VIEW', position: [0, 35, 90], target: [-6, 10, 0] },
  BURNER: { label: 'BURNER', position: [21, 10.5, 19], target: [8, 6.4, 0] },
  PREHEATER: { label: 'PREHEATER', position: [-22, 26, 52], target: [-52, 19, 0] },
  COOLER: { label: 'COOLER', position: [25, 14, 28], target: [21, 4.5, 0] },
};

const NOISE_STD = {
  '341_01_TE': 2.5,
  '341_07_TE': 2.2,
  '341_05_TE': 1.8,
  '331_01_TE': 2.4,
  '331_07_TE': 2.0,
  '331_05_TE': 1.6,
  Debit_vent_Prech_F404: 0.4,
  Debit_vent_Prech_F403: 0.4,
  debit_gaz_Pyroclone: 22,
  debit_gaz_Bruleur: 18,
  T_air_Secondaire: 4.0,
  Vitesse_Four: 0.015,
  Puissance_totale: 3.5,
  debit_KK: 1.2,
  Debit_F414: 0.35,
  Debit_F413: 0.35,
  burning_zone_temp: 3.0,
  calcination_zone_temp: 2.5,
  kiln_shell_temp: 1.2,
  bearing_vibration: 0.03,
  motor_current: 0.9,
};

function gaussianRandom() {
  const u1 = Math.max(1e-7, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function computeSoftSensors(raw, scenarioId = 'NORMAL', rampAlpha = 1) {
  const ov = SCENARIO_MAP[scenarioId]?.overrides || {};
  const calcBias = (ov._calcinationBias || 0) * rampAlpha;
  const limeBias = (ov._freeLimeBias || 0) * rampAlpha;
  const noxBias = (ov._noxBias || 0) * rampAlpha;

  const calc =
    65.2 +
    (raw.calcination_zone_temp - 950) * 0.055 +
    (raw.debit_gaz_Pyroclone - 4200) * 0.002 +
    (240 - raw.debit_KK) * 0.02 +
    calcBias;

  const freeLime =
    1.48 +
    Math.max(0, 1425 - raw.burning_zone_temp) * 0.0065 +
    Math.max(0, 65 - calc) * 0.065 +
    limeBias;

  const nox =
    198 +
    (raw.burning_zone_temp - 1425) * 0.55 +
    (raw.debit_gaz_Bruleur - 2950) * 0.04 +
    (raw.T_air_Secondaire - 985) * 0.14 +
    noxBias;

  return {
    calcination_deg: Number(THREE.MathUtils.clamp(calc, 42, 85).toFixed(1)),
    free_lime_pct: Number(THREE.MathUtils.clamp(freeLime, 0.4, 5.0).toFixed(2)),
    nox_ppm: Number(THREE.MathUtils.clamp(nox, 110, 420).toFixed(0)),
  };
}

export function getScenarioTarget(scenarioId, elapsedSec = 0) {
  const ov = SCENARIO_MAP[scenarioId]?.overrides || {};
  const target = { ...NOMINAL_TELEMETRY };
  for (const k of Object.keys(ov)) {
    if (!k.startsWith('_')) target[k] = ov[k];
  }
  if (scenarioId === 'DRIFT_REFRACTORY_WEAR') {
    target.kiln_shell_temp = 312 + (elapsedSec / 60) * 0.8;
  } else if (scenarioId === 'DRIFT_BEARING_FATIGUE') {
    const drift = Math.min(0.6, (elapsedSec / 60) * 0.6);
    target.bearing_vibration = 2.8 + drift;
  } else if (scenarioId === 'DRIFT_DRIVE_FRICTION') {
    target.motor_current = 206 + Math.sin(elapsedSec * 1.4) * 8;
  }
  return target;
}

export function lerpTelemetrySnapshot(fromObj, toObj, alpha) {
  const t = THREE.MathUtils.clamp(alpha, 0, 1);
  const out = {};
  for (const key of Object.keys(NOMINAL_TELEMETRY)) {
    const a = fromObj[key] ?? NOMINAL_TELEMETRY[key];
    const b = toObj[key] ?? NOMINAL_TELEMETRY[key];
    out[key] = a + (b - a) * t;
  }
  return out;
}

export function computeAxialShellProfile(kilnShellTemp, scenarioId = 'NORMAL') {
  const hotspot = scenarioId === 'SHELL_HOTSPOT';
  const profile = [];
  for (let i = 0; i < KILN_SEGMENTS; i++) {
    const frac = i / (KILN_SEGMENTS - 1);
    const zoneWeight = Math.exp(-Math.pow((frac - 0.72) / 0.28, 2));
    let segTemp = 185 + (kilnShellTemp - 185) * (0.45 + 0.55 * zoneWeight);
    if (hotspot && i >= 13 && i <= 15) {
      const centerFactor = i === 14 ? 1.0 : 0.78;
      segTemp = Math.max(segTemp, 260 + (kilnShellTemp - 260) * centerFactor);
    }
    profile.push(Number(segTemp.toFixed(1)));
  }
  return profile;
}

export function computeForecast(history, current) {
  const recent = history.slice(-6);
  const first = recent[0] || current;
  const last = recent[recent.length - 1] || current;
  const slopeCalc = (last.calcination_deg - first.calcination_deg) * 1.6;
  const slopeLime = (last.free_lime_pct - first.free_lime_pct) * 1.6;
  const slopeNox = (last.nox_ppm - first.nox_ppm) * 1.6;

  const extraCalc = current.calcination_deg < 60 ? -4.5 : current.calcination_deg > 70 ? 3.5 : 0;
  const extraLime = current.free_lime_pct > 2.2 ? 0.85 : 0;
  const extraNox = current.nox_ppm > 240 ? 42 : 0;

  const doNothing = {
    calcination_deg: Number(THREE.MathUtils.clamp(current.calcination_deg + slopeCalc + extraCalc, 38, 86).toFixed(1)),
    free_lime_pct: Number(THREE.MathUtils.clamp(current.free_lime_pct + slopeLime + extraLime, 0.4, 5.5).toFixed(2)),
    nox_ppm: Number(THREE.MathUtils.clamp(current.nox_ppm + slopeNox + extraNox, 110, 460).toFixed(0)),
    shell_temp: Number(THREE.MathUtils.clamp(current.kiln_shell_temp + (current.kiln_shell_temp > 305 ? 38 : 4), 240, 510).toFixed(0)),
  };

  const followAdvice = {
    calcination_deg: Number((current.calcination_deg + (65.0 - current.calcination_deg) * 0.8).toFixed(1)),
    free_lime_pct: Number((current.free_lime_pct + (1.8 - current.free_lime_pct) * 0.8).toFixed(2)),
    nox_ppm: Number((current.nox_ppm + (220 - current.nox_ppm) * 0.8).toFixed(0)),
    shell_temp: Number((current.kiln_shell_temp + (278 - current.kiln_shell_temp) * 0.78).toFixed(0)),
  };

  return { doNothing, followAdvice };
}

const _cBlue = new THREE.Color('#2563EB');
const _cGreen = new THREE.Color('#10B981');
const _cYellow = new THREE.Color('#EAB308');
const _cOrange = new THREE.Color('#F59E0B');
const _cHotOrange = new THREE.Color('#F97316');
const _cRed = new THREE.Color('#DC2626');

export function tempToColor(value, minTemp, maxTemp, outColor = new THREE.Color()) {
  const norm = THREE.MathUtils.clamp((value - minTemp) / Math.max(1, maxTemp - minTemp), 0, 1);
  if (norm < 0.33) {
    outColor.copy(_cBlue).lerp(_cGreen, norm / 0.33);
  } else if (norm < 0.66) {
    outColor.copy(_cGreen).lerp(_cOrange, (norm - 0.33) / 0.33);
  } else {
    outColor.copy(_cOrange).lerp(_cRed, (norm - 0.66) / 0.34);
  }
  return outColor;
}

/**
 * Coherent 5-band kiln shell thermal gradient aligned with the configured 370 °C threshold:
 * Blue (normal/cooler) -> Green (moderate) -> Yellow (elevated) -> Orange (high) -> Red (critical > 370 °C)
 */
export function shellTempToColor(tempC, outColor = new THREE.Color()) {
  if (tempC < 245) {
    const t = THREE.MathUtils.clamp((tempC - 180) / 65, 0, 1);
    return outColor.copy(_cBlue).lerp(_cGreen, t * 0.55);
  }
  if (tempC < 295) {
    const t = THREE.MathUtils.clamp((tempC - 245) / 50, 0, 1);
    return outColor.copy(_cGreen).lerp(_cYellow, t * 0.65);
  }
  if (tempC < 340) {
    const t = THREE.MathUtils.clamp((tempC - 295) / 45, 0, 1);
    return outColor.copy(_cYellow).lerp(_cHotOrange, t);
  }
  if (tempC <= DIGITAL_TWIN_SHELL_LIMIT_C) {
    const t = THREE.MathUtils.clamp((tempC - 340) / 30, 0, 1);
    return outColor.copy(_cHotOrange).lerp(_cRed, t * 0.55);
  }
  return outColor.copy(_cRed);
}

export function classifyFlame(burningZoneTemp) {
  if (burningZoneTemp < 1320) return { state: 'COLD', color: '#00A3E0', scale: 0.65, intensity: 1.4 };
  if (burningZoneTemp > 1520) return { state: 'CRIT', color: '#FFFFFF', scale: 1.55, intensity: 4.5 };
  if (burningZoneTemp > 1460) return { state: 'WARN', color: '#FDE047', scale: 1.25, intensity: 3.1 };
  return { state: 'NOMINAL', color: '#F59E0B', scale: 1.0, intensity: 2.2 };
}

function getZoneLabel(idx) {
  const startMeter = idx * 3;
  const endMeter = startMeter + 3;
  if (idx >= 13 && idx <= 14) {
    return `Zone ${idx + 1}/20 · Ring B-04 (Meter ${startMeter}–${endMeter})`;
  }
  if (idx < 6) return `Zone ${idx + 1}/20 · Calcination (Meter ${startMeter}–${endMeter})`;
  if (idx < 12) return `Zone ${idx + 1}/20 · Transition (Meter ${startMeter}–${endMeter})`;
  return `Zone ${idx + 1}/20 · Burning Zone (Meter ${startMeter}–${endMeter})`;
}

function detectSoftwareWebGL() {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
  } catch {
    return false;
  }
}

const IS_SOFTWARE_GL = detectSoftwareWebGL();

// ---------------------------------------------------------------------------
// Isolated Context B Mock Telemetry Hook (supports Play / Pause & Temp Override)
// ---------------------------------------------------------------------------

function useIsolatedSimulationTelemetry(scenarioId, isRunning, manualShellOverrideC) {
  const [telemetry, setTelemetry] = useState(() => ({ ...NOMINAL_TELEMETRY }));
  const [history, setHistory] = useState(() =>
    Array.from({ length: 16 }, () => ({
      calcination_deg: NOMINAL_TELEMETRY.calcination_deg,
      free_lime_pct: NOMINAL_TELEMETRY.free_lime_pct,
      nox_ppm: NOMINAL_TELEMETRY.nox_ppm,
    }))
  );

  const rampRef = useRef({
    scenarioId,
    startTime: Date.now(),
    startSnapshot: { ...NOMINAL_TELEMETRY },
    lastClean: { ...NOMINAL_TELEMETRY },
  });

  useEffect(() => {
    rampRef.current = {
      scenarioId,
      startTime: Date.now(),
      startSnapshot: { ...rampRef.current.lastClean },
      lastClean: { ...rampRef.current.lastClean },
    };
  }, [scenarioId]);

  useEffect(() => {
    if (!isRunning) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - rampRef.current.startTime) / 1000;
      const alpha = Math.min(1, elapsedSec / 10);
      const target = getScenarioTarget(rampRef.current.scenarioId, elapsedSec);
      const clean = lerpTelemetrySnapshot(rampRef.current.startSnapshot, target, alpha);
      rampRef.current.lastClean = clean;

      const noisy = { ...clean };
      for (const [key, std] of Object.entries(NOISE_STD)) {
        noisy[key] = clean[key] + gaussianRandom() * std;
      }
      noisy.Vitesse_Four = Math.max(0.4, noisy.Vitesse_Four);
      noisy.bearing_vibration = Math.max(0.2, noisy.bearing_vibration);

      const soft = computeSoftSensors(noisy, rampRef.current.scenarioId, alpha);
      const next = { ...noisy, ...soft };

      setTelemetry(next);
      setHistory((prev) => [
        ...prev.slice(-23),
        {
          calcination_deg: soft.calcination_deg,
          free_lime_pct: soft.free_lime_pct,
          nox_ppm: soft.nox_ppm,
        },
      ]);
    }, 800);

    return () => window.clearInterval(timer);
  }, [isRunning]);

  const effectiveTelemetry = useMemo(() => {
    if (manualShellOverrideC == null) return telemetry;
    return {
      ...telemetry,
      kiln_shell_temp: manualShellOverrideC,
    };
  }, [telemetry, manualShellOverrideC]);

  return { telemetry: effectiveTelemetry, history };
}

// ---------------------------------------------------------------------------
// Procedural Industrial Textures (Welded Steel Plate + Architectural Concrete)
// ---------------------------------------------------------------------------

function createProceduralTextures() {
  if (typeof document === 'undefined') return { steelBump: null, concreteMap: null };

  const sCanvas = document.createElement('canvas');
  sCanvas.width = 256;
  sCanvas.height = 256;
  const sCtx = sCanvas.getContext('2d');
  let steelBump = null;
  if (sCtx) {
    sCtx.fillStyle = '#808080';
    sCtx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 2) {
      const v = 114 + ((y * 19) % 28);
      sCtx.fillStyle = `rgb(${v},${v},${v})`;
      sCtx.fillRect(0, y, 256, 1);
    }
    sCtx.fillStyle = '#383838';
    sCtx.fillRect(0, 62, 256, 3);
    sCtx.fillRect(0, 190, 256, 3);
    sCtx.fillStyle = '#B8B8B8';
    for (let x = 8; x < 256; x += 24) {
      sCtx.fillRect(x, 56, 3, 3);
      sCtx.fillRect(x, 184, 3, 3);
    }
    steelBump = new THREE.CanvasTexture(sCanvas);
    steelBump.wrapS = THREE.RepeatWrapping;
    steelBump.wrapT = THREE.RepeatWrapping;
    steelBump.repeat.set(3, 2);
  }

  const cCanvas = document.createElement('canvas');
  cCanvas.width = 256;
  cCanvas.height = 256;
  const cCtx = cCanvas.getContext('2d');
  let concreteMap = null;
  if (cCtx) {
    cCtx.fillStyle = '#141C2A';
    cCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 650; i++) {
      const x = (i * 73) % 256;
      const y = (i * 137) % 256;
      const shade = 18 + (i % 14);
      cCtx.fillStyle = `rgb(${shade},${shade + 6},${shade + 16})`;
      cCtx.fillRect(x, y, 2, 2);
    }
    cCtx.strokeStyle = '#0D131E';
    cCtx.lineWidth = 2;
    cCtx.strokeRect(1, 1, 254, 254);
    concreteMap = new THREE.CanvasTexture(cCanvas);
    concreteMap.colorSpace = THREE.SRGBColorSpace;
    concreteMap.wrapS = THREE.RepeatWrapping;
    concreteMap.wrapT = THREE.RepeatWrapping;
    concreteMap.repeat.set(22, 14);
  }

  return { steelBump, concreteMap };
}

// ---------------------------------------------------------------------------
// Inside-Canvas Helpers: Studio Environment, Software-WebGL Pacer & FPS
// ---------------------------------------------------------------------------

function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const envRT = pmrem.fromScene(room, 0.04);
    scene.environment = envRT.texture;
    room.dispose();
    pmrem.dispose();
    return () => {
      scene.environment = null;
      envRT.dispose();
    };
  }, [gl, scene]);
  return null;
}

function SoftwareGlPacer() {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    if (!IS_SOFTWARE_GL) return undefined;
    let alive = true;
    let timerId = 0;

    const afterDraw = (cb) => {
      const ctx = gl.getContext();
      if (ctx && typeof ctx.fenceSync === 'function') {
        const sync = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0);
        ctx.flush();
        const poll = () => {
          if (!alive) {
            if (sync) ctx.deleteSync(sync);
            return;
          }
          const status = sync && ctx.getSyncParameter(sync, ctx.SYNC_STATUS);
          if (status === ctx.UNSIGNALED) {
            timerId = window.setTimeout(poll, 8);
          } else {
            if (sync) ctx.deleteSync(sync);
            timerId = window.setTimeout(cb, 85);
          }
        };
        timerId = window.setTimeout(poll, 8);
      } else {
        timerId = window.setTimeout(cb, 100);
      }
    };

    const step = () => {
      if (!alive) return;
      invalidate();
      afterDraw(step);
    };
    timerId = window.setTimeout(step, 50);

    return () => {
      alive = false;
      window.clearTimeout(timerId);
    };
  }, [gl, invalidate]);
  return null;
}

function FpsTracker({ fpsElRef }) {
  const stats = useRef({ frames: 0, lastTime: performance.now() });
  useFrame(() => {
    stats.current.frames += 1;
    const now = performance.now();
    const dt = now - stats.current.lastTime;
    if (dt >= 500) {
      const fps = Math.round((stats.current.frames * 1000) / dt);
      if (fpsElRef.current) fpsElRef.current.textContent = `${fps} FPS`;
      stats.current.frames = 0;
      stats.current.lastTime = now;
    }
  });
  return null;
}

const _targetCamPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();

function CameraRig({ controlsRef, cameraPreset, presetNonce }) {
  const { camera } = useThree();
  const animatingRef = useRef(false);
  const firstMountRef = useRef(true);

  useEffect(() => {
    if (firstMountRef.current) {
      firstMountRef.current = false;
      return;
    }
    const p = CAMERA_PRESETS[cameraPreset];
    if (p) {
      _targetCamPos.set(...p.position);
      _targetLook.set(...p.target);
      animatingRef.current = true;
    }
  }, [cameraPreset, presetNonce]);

  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return undefined;
    const stop = () => {
      animatingRef.current = false;
    };
    ctrl.addEventListener('start', stop);
    return () => ctrl.removeEventListener('start', stop);
  }, [controlsRef]);

  useFrame((_, rawDelta) => {
    if (!animatingRef.current || !controlsRef.current) return;
    const dt = Math.min(rawDelta, 0.12);
    const k = 1 - Math.exp(-5.5 * dt);
    camera.position.lerp(_targetCamPos, k);
    controlsRef.current.target.lerp(_targetLook, k);
    controlsRef.current.update();
    if (camera.position.distanceTo(_targetCamPos) < 0.15) {
      animatingRef.current = false;
    }
  });

  return null;
}

// ---------------------------------------------------------------------------
// 3D Production Line Assemblies (Preserving Exact Supplied KilnVision Geometry)
// ---------------------------------------------------------------------------

const _scratchColor = new THREE.Color();
const _bedDark = new THREE.Color('#475569');
const _bedWhite = new THREE.Color('#F8FAFC');
const _plumeClean = new THREE.Color('#94A3B8');
const _plumeNox = new THREE.Color('#5C2D0C');

function PreheaterTowers({ telemetryRef, onInspect, bumpMap }) {
  const coneRefs = useRef([]);
  const precalcinerMatRef = useRef(null);
  const plumeMatRefs = useRef([]);
  const plumeGroupRef = useRef(null);

  const stages = useMemo(
    () => [
      { stage: 4, y: 32.5, r: 1.95, coneH: 3.3, cylH: 1.7, sensorA: '341_05_TE', sensorB: '331_05_TE', offset: -160 },
      { stage: 3, y: 24.5, r: 2.45, coneH: 4.1, cylH: 2.0, sensorA: '341_05_TE', sensorB: '331_05_TE', offset: 0 },
      { stage: 2, y: 16.5, r: 2.95, coneH: 4.9, cylH: 2.4, sensorA: '341_07_TE', sensorB: '331_07_TE', offset: 0 },
      { stage: 1, y: 8.2, r: 3.5, coneH: 5.7, cylH: 2.7, sensorA: '341_01_TE', sensorB: '331_01_TE', offset: 0 },
    ],
    []
  );

  const ductGeos = useMemo(() => {
    const feedA = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-55, 5.2, -14),
      new THREE.Vector3(-48, 5.6, -11),
      new THREE.Vector3(-39, 10.2, -4.5),
      new THREE.Vector3(-34.5, 11.4, -1.6),
    ]);
    const feedB = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-55, 5.2, 14),
      new THREE.Vector3(-48, 5.6, 11),
      new THREE.Vector3(-39, 10.2, 4.5),
      new THREE.Vector3(-34.5, 11.4, 1.6),
    ]);
    const calcinerToInlet = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-34, 7.6, 0),
      new THREE.Vector3(-28, 7.8, 0),
      new THREE.Vector3(-21.6, 7.6, 0),
    ]);
    const riserA = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-55, 35.8, -14),
      new THREE.Vector3(-55, 38.2, -8),
      new THREE.Vector3(-55, 38.6, 0),
    ]);
    const riserB = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-55, 35.8, 14),
      new THREE.Vector3(-55, 38.2, 8),
      new THREE.Vector3(-55, 38.6, 0),
    ]);
    const gasReturnA = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-34, 21.5, 0),
      new THREE.Vector3(-42, 23.2, -7.5),
      new THREE.Vector3(-51.8, 12.2, -14),
    ]);
    const gasReturnB = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-34, 21.5, 0),
      new THREE.Vector3(-42, 23.2, 7.5),
      new THREE.Vector3(-51.8, 12.2, 14),
    ]);
    return {
      feedA: new THREE.TubeGeometry(feedA, 24, 0.78, 12, false),
      feedB: new THREE.TubeGeometry(feedB, 24, 0.78, 12, false),
      calcinerToInlet: new THREE.TubeGeometry(calcinerToInlet, 18, 1.15, 14, false),
      riserA: new THREE.TubeGeometry(riserA, 16, 0.65, 10, false),
      riserB: new THREE.TubeGeometry(riserB, 16, 0.65, 10, false),
      gasReturnA: new THREE.TubeGeometry(gasReturnA, 22, 0.62, 10, false),
      gasReturnB: new THREE.TubeGeometry(gasReturnB, 22, 0.62, 10, false),
    };
  }, []);

  useEffect(() => {
    return () => Object.values(ductGeos).forEach((g) => g.dispose());
  }, [ductGeos]);

  useFrame(({ clock }) => {
    const tel = telemetryRef.current;
    const t = clock.getElapsedTime();
    let idx = 0;
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < stages.length; i++) {
        const st = stages[i];
        const key = s === 0 ? st.sensorA : st.sensorB;
        const temp = (tel[key] ?? 650) + st.offset;
        const mesh = coneRefs.current[idx];
        if (mesh && mesh.material) {
          tempToColor(temp, 340, 960, _scratchColor);
          mesh.material.color.lerp(_scratchColor, 0.15);
          mesh.material.emissive.copy(_scratchColor);
          mesh.material.emissiveIntensity = THREE.MathUtils.clamp((temp - 550) / 550, 0.04, 0.48);
        }
        idx += 1;
      }
    }

    if (precalcinerMatRef.current) {
      const cNorm = THREE.MathUtils.clamp((tel.calcination_zone_temp - 860) / 210, 0, 1);
      _scratchColor.set('#475569').lerp(_cOrange, 0.25 + cNorm * 0.55);
      precalcinerMatRef.current.color.lerp(_scratchColor, 0.14);
      precalcinerMatRef.current.emissive.set('#EA580C').lerp(_cRed, cNorm * 0.5);
      precalcinerMatRef.current.emissiveIntensity = 0.08 + cNorm * 0.65;
    }

    const noxFactor = THREE.MathUtils.clamp((tel.nox_ppm - 170) / 170, 0, 1);
    for (let p = 0; p < plumeMatRefs.current.length; p++) {
      const mat = plumeMatRefs.current[p];
      if (!mat) continue;
      mat.color.copy(_plumeClean).lerp(_plumeNox, noxFactor);
      const baseOp = p === 0 ? 0.24 : 0.14;
      mat.opacity = baseOp + noxFactor * (p === 0 ? 0.54 : 0.34) + Math.sin(t * 2.2 + p) * 0.03;
    }
    if (plumeGroupRef.current) {
      plumeGroupRef.current.position.x = Math.sin(t * 1.1) * 0.35;
    }
  });

  const renderString = (stringName, zPos, baseIdx) => (
    <group key={stringName} position={[-55, 0, zPos]}>
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <boxGeometry args={[11, 1.0, 11]} />
        <meshStandardMaterial color="#1E293B" roughness={0.92} metalness={0.05} />
      </mesh>
      {[
        [-4.5, -4.5],
        [4.5, -4.5],
        [-4.5, 4.5],
        [4.5, 4.5],
      ].map(([cx, cz], ci) => (
        <mesh key={ci} position={[cx, 19.2, cz]}>
          <boxGeometry args={[0.5, 37.8, 0.5]} />
          <meshStandardMaterial color="#334155" roughness={0.58} metalness={0.72} />
        </mesh>
      ))}
      {[9.5, 17.5, 25.5, 33.0].map((by, bi) => (
        <group key={bi} position={[0, by, 4.5]}>
          <mesh rotation={[0, 0, 0.68]}>
            <boxGeometry args={[0.14, 11.4, 0.14]} />
            <meshStandardMaterial color="#273449" roughness={0.65} metalness={0.65} />
          </mesh>
          <mesh rotation={[0, 0, -0.68]}>
            <boxGeometry args={[0.14, 11.4, 0.14]} />
            <meshStandardMaterial color="#273449" roughness={0.65} metalness={0.65} />
          </mesh>
        </group>
      ))}
      {[5.5, 13.5, 21.5, 29.5, 36.8].map((py, pi) => (
        <group key={pi} position={[0, py, 0]}>
          <mesh>
            <boxGeometry args={[9.6, 0.26, 9.6]} />
            <meshStandardMaterial color="#1E293B" roughness={0.75} metalness={0.45} />
          </mesh>
          <mesh position={[0, 0.95, 4.75]}>
            <boxGeometry args={[9.5, 0.08, 0.08]} />
            <meshStandardMaterial color="#CA8A04" roughness={0.45} metalness={0.4} />
          </mesh>
        </group>
      ))}

      {stages.map((st, i) => {
        const refIdx = baseIdx + i;
        const sensorKey = stringName === 'A' ? st.sensorA : st.sensorB;
        return (
          <group key={st.stage} position={[0, st.y, 0]}>
            <mesh
              ref={(el) => {
                coneRefs.current[refIdx] = el;
              }}
              rotation={[Math.PI, 0, 0]}
              castShadow
              onClick={(e) => {
                e.stopPropagation();
                onInspect({
                  title: `Preheater String ${stringName} — Stage ${st.stage}`,
                  sensor: sensorKey,
                  unit: '°C',
                  offset: st.offset,
                  target: st.stage === 1 ? '800–860 °C' : st.stage === 2 ? '660–740 °C' : '480–580 °C',
                  warn: st.stage === 1 ? 915 : 770,
                  position: [-55, st.y + 1.5, zPos],
                });
              }}
            >
              <coneGeometry args={[st.r, st.coneH, 24]} />
              <meshStandardMaterial
                color="#475569"
                roughness={0.42}
                metalness={0.62}
                bumpMap={bumpMap}
                bumpScale={0.04}
              />
            </mesh>
            <mesh position={[0, st.coneH / 2 + st.cylH / 2, 0]} castShadow>
              <cylinderGeometry args={[st.r, st.r, st.cylH, 24]} />
              <meshStandardMaterial color="#475569" roughness={0.46} metalness={0.68} />
            </mesh>
            <mesh position={[st.r * 0.85, st.coneH / 2 + st.cylH * 0.55, st.r * 0.32]}>
              <boxGeometry args={[st.r * 0.65, st.cylH * 0.72, st.r * 0.45]} />
              <meshStandardMaterial color="#64748B" roughness={0.44} metalness={0.76} />
            </mesh>
            <mesh position={[0, st.coneH / 2 + st.cylH + 0.14, 0]}>
              <cylinderGeometry args={[st.r * 1.07, st.r * 1.07, 0.26, 24]} />
              <meshStandardMaterial color="#64748B" roughness={0.34} metalness={0.82} />
            </mesh>
            <mesh position={[0, -st.coneH / 2 - 0.55, 0]}>
              <cylinderGeometry args={[0.38, 0.34, 1.1, 12]} />
              <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.72} />
            </mesh>
            <mesh position={[0.55, -st.coneH / 2 - 0.65, 0]}>
              <boxGeometry args={[0.5, 0.26, 0.26]} />
              <meshStandardMaterial color="#CA8A04" roughness={0.42} metalness={0.55} />
            </mesh>
            {i > 0 && (
              <mesh position={[st.r * 0.72, st.coneH / 2 + 2.5, 0]} rotation={[0, 0, -0.18]}>
                <cylinderGeometry args={[0.52, 0.58, 5.2, 14]} />
                <meshStandardMaterial color="#64748B" roughness={0.5} metalness={0.72} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );

  return (
    <group>
      {renderString('A', -14, 0)}
      {renderString('B', 14, 4)}

      <mesh position={[-55, 36.8, 0]}>
        <boxGeometry args={[4.5, 0.42, 24]} />
        <meshStandardMaterial color="#334155" roughness={0.68} metalness={0.55} />
      </mesh>
      <mesh position={[-55, 21.5, 0]}>
        <boxGeometry args={[3.4, 0.36, 22]} />
        <meshStandardMaterial color="#273449" roughness={0.7} metalness={0.55} />
      </mesh>
      <mesh position={[-59.8, 18.8, 0]}>
        <boxGeometry args={[2.2, 37.6, 2.8]} />
        <meshStandardMaterial color="#1E293B" roughness={0.78} metalness={0.42} />
      </mesh>

      <group
        position={[-34, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onInspect({
            title: 'Inline Precalciner Vessel (Pyroclone)',
            sensor: 'calcination_zone_temp',
            unit: '°C',
            target: '900–1030 °C',
            warn: 1030,
            position: [-34, 23, 0],
          });
        }}
      >
        <mesh position={[0, 0.5, 0]} receiveShadow>
          <boxGeometry args={[6.8, 1.0, 6.8]} />
          <meshStandardMaterial color="#1E293B" roughness={0.92} metalness={0.05} />
        </mesh>
        {[
          [-2.5, -2.5],
          [2.5, -2.5],
          [-2.5, 2.5],
          [2.5, 2.5],
        ].map(([lx, lz], i) => (
          <mesh key={i} position={[lx, 5.2, lz]}>
            <boxGeometry args={[0.42, 9.4, 0.42]} />
            <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.72} />
          </mesh>
        ))}
        <mesh position={[0, 8.2, 0]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[2.35, 3.2, 24]} />
          <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.66} />
        </mesh>
        <mesh position={[0, 14.8, 0]} castShadow>
          <cylinderGeometry args={[2.35, 2.35, 10.2, 24]} />
          <meshStandardMaterial
            ref={precalcinerMatRef}
            color="#475569"
            roughness={0.48}
            metalness={0.62}
            bumpMap={bumpMap}
            bumpScale={0.04}
          />
        </mesh>
        {[11.2, 14.8, 18.4].map((ry) => (
          <mesh key={ry} position={[0, ry, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[2.44, 0.11, 10, 32]} />
            <meshStandardMaterial color="#64748B" roughness={0.38} metalness={0.82} />
          </mesh>
        ))}
        <mesh position={[0, 21.1, 0]}>
          <coneGeometry args={[2.35, 2.6, 24]} />
          <meshStandardMaterial color="#475569" roughness={0.48} metalness={0.68} />
        </mesh>
      </group>

      {[-5.5, 5.5].map((fz, i) => (
        <group
          key={fz}
          position={[-55, 38.6, fz]}
          onClick={(e) => {
            e.stopPropagation();
            onInspect({
              title: i === 0 ? 'Preheater ID Fan F404 (String A)' : 'Preheater ID Fan F403 (String B)',
              sensor: i === 0 ? 'Debit_vent_Prech_F404' : 'Debit_vent_Prech_F403',
              unit: '%',
              target: '72–84 %',
              warn: 88,
              position: [-55, 41.5, fz],
            });
          }}
        >
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[1.45, 1.45, 1.1, 20]} />
            <meshStandardMaterial color="#334155" roughness={0.44} metalness={0.76} />
          </mesh>
          <mesh position={[0, 0, i === 0 ? -0.9 : 0.9]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.55, 0.55, 0.8, 14]} />
            <meshStandardMaterial color="#1D4ED8" roughness={0.4} metalness={0.68} />
          </mesh>
        </group>
      ))}

      {Object.entries(ductGeos).map(([k, geo]) => (
        <mesh key={k} geometry={geo}>
          <meshStandardMaterial color="#64748B" roughness={0.5} metalness={0.72} />
        </mesh>
      ))}

      <mesh position={[-21.2, 7.6, 0]} castShadow>
        <boxGeometry args={[2.8, 6.4, 5.8]} />
        <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.58} />
      </mesh>
      <mesh position={[-21.2, 2.2, 0]}>
        <boxGeometry args={[2.4, 4.4, 4.4]} />
        <meshStandardMaterial color="#1E293B" roughness={0.9} metalness={0.08} />
      </mesh>
      <mesh position={[-19.8, 7.35, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[2.55, 0.16, 12, 36]} />
        <meshStandardMaterial color="#94A3B8" roughness={0.35} metalness={0.86} />
      </mesh>

      <group position={[-55, 38.5, 0]}>
        <mesh position={[0, 2.0, 0]}>
          <cylinderGeometry args={[1.15, 1.38, 4.0, 20]} />
          <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.72} />
        </mesh>
        <mesh position={[0, 3.8, 0]}>
          <cylinderGeometry args={[1.3, 1.3, 0.35, 20]} />
          <meshStandardMaterial color="#DC2626" roughness={0.5} metalness={0.3} />
        </mesh>
        <group ref={plumeGroupRef}>
          <mesh
            position={[0, 8.8, 0]}
            rotation={[Math.PI, 0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onInspect({
                title: 'Preheater Exhaust Stack',
                sensor: 'nox_ppm',
                unit: 'ppm',
                target: '< 250 ppm',
                warn: 250,
                position: [-55, 45, 0],
              });
            }}
          >
            <coneGeometry args={[3.8, 10.2, 24, 1, true]} />
            <meshStandardMaterial
              ref={(el) => {
                plumeMatRefs.current[0] = el;
              }}
              color="#94A3B8"
              transparent
              opacity={0.26}
              roughness={1}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[0.4, 12.2, 0]} rotation={[Math.PI, 0, -0.08]}>
            <coneGeometry args={[5.2, 8.5, 24, 1, true]} />
            <meshStandardMaterial
              ref={(el) => {
                plumeMatRefs.current[1] = el;
              }}
              color="#94A3B8"
              transparent
              opacity={0.14}
              roughness={1}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function RotaryKilnAssembly({ telemetryRef, scenarioId, xrayShell, selectedZoneIdx, onInspect, onSelectZone, bumpMap, isRunning }) {
  const kilnSpinRef = useRef(null);
  const segMatRefs = useRef([]);
  const bedMeshRef = useRef(null);
  const bedGeoRef = useRef(null);
  const gearRimMatRef = useRef(null);
  const teethMeshRef = useRef(null);
  const teethMatRef = useRef(null);
  const tyreRefs = useRef([]);
  const rollerRefs = useRef([]);
  const scanBeamMatRef = useRef(null);

  const segLength = KILN_LENGTH / KILN_SEGMENTS;
  const segGeo = useMemo(() => new THREE.CylinderGeometry(2.4, 2.4, segLength + 0.02, 48, 1, true), [segLength]);
  const toothGeo = useMemo(() => new THREE.BoxGeometry(0.55, 0.34, 0.24), []);
  const bedGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(2.02, 2.02, KILN_LENGTH - 0.8, 24, 16, false, Math.PI, Math.PI);
    const count = g.attributes.position.count;
    const colors = new Float32Array(count * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);

  useEffect(() => {
    bedGeoRef.current = bedGeo;
    return () => {
      segGeo.dispose();
      toothGeo.dispose();
      bedGeo.dispose();
    };
  }, [segGeo, toothGeo, bedGeo]);

  useEffect(() => {
    const inst = teethMeshRef.current;
    if (!inst) return;
    const dummy = new THREE.Object3D();
    const count = 48;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      dummy.position.set(0, Math.cos(angle) * 3.46, Math.sin(angle) * 3.46);
      dummy.rotation.set(angle, 0, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
  }, []);

  useFrame(({ clock }, rawDelta) => {
    const dt = isRunning ? Math.min(rawDelta, 0.12) : 0;
    const t = clock.getElapsedTime();
    const tel = telemetryRef.current;

    const omega = (tel.Vitesse_Four / 60) * Math.PI * 2 * 3.6;
    if (kilnSpinRef.current && dt > 0) {
      kilnSpinRef.current.rotation.x += omega * dt;
    }

    const rollerOmega = -omega * (2.6 / 0.75);
    if (dt > 0) {
      for (let i = 0; i < rollerRefs.current.length; i++) {
        const r = rollerRefs.current[i];
        if (r) r.rotation.x += rollerOmega * dt;
      }
    }

    const profile = computeAxialShellProfile(tel.kiln_shell_temp, scenarioId);
    for (let i = 0; i < KILN_SEGMENTS; i++) {
      const mat = segMatRefs.current[i];
      if (!mat) continue;
      const segTemp = profile[i];
      const isSelected = selectedZoneIdx === i;
      mat.transparent = xrayShell;
      mat.opacity = xrayShell ? 0.32 : 1.0;
      mat.depthWrite = !xrayShell;

      shellTempToColor(segTemp, _scratchColor);
      mat.color.lerp(_scratchColor, 0.22);

      if (segTemp > DIGITAL_TWIN_SHELL_LIMIT_C) {
        const excess = THREE.MathUtils.clamp((segTemp - DIGITAL_TWIN_SHELL_LIMIT_C) / 60, 0, 1);
        mat.emissive.copy(_cRed);
        mat.emissiveIntensity = 0.85 + excess * 1.15 + Math.sin(t * 7) * 0.18;
      } else if (segTemp >= 340) {
        const w = THREE.MathUtils.clamp((segTemp - 340) / 30, 0, 1);
        mat.emissive.copy(_cHotOrange);
        mat.emissiveIntensity = 0.35 + w * 0.55;
      } else if (segTemp >= 295) {
        const w = THREE.MathUtils.clamp((segTemp - 295) / 45, 0, 1);
        mat.emissive.copy(_cYellow);
        mat.emissiveIntensity = 0.12 + w * 0.22;
      } else {
        mat.emissive.set(isSelected ? '#38BDF8' : '#000000');
        mat.emissiveIntensity = isSelected ? 0.35 : 0.04;
      }
    }

    if (scanBeamMatRef.current) {
      const alert = tel.kiln_shell_temp > DIGITAL_TWIN_SHELL_LIMIT_C;
      scanBeamMatRef.current.color.set(alert ? '#EF4444' : '#38BDF8');
      scanBeamMatRef.current.opacity = alert ? 0.15 + Math.sin(t * 8) * 0.04 : 0.055;
    }

    const currentFactor = THREE.MathUtils.clamp((tel.motor_current - 195) / 55, 0, 1);
    const gearEmissiveHex = tel.motor_current > 225 ? '#EF4444' : '#F59E0B';
    if (gearRimMatRef.current) {
      gearRimMatRef.current.emissive.set(gearEmissiveHex);
      gearRimMatRef.current.emissiveIntensity = currentFactor * 1.4;
    }
    if (teethMatRef.current) {
      teethMatRef.current.emissive.set(gearEmissiveHex);
      teethMatRef.current.emissiveIntensity = currentFactor * 1.25;
    }

    const vibAmp = isRunning ? Math.max(0, (tel.bearing_vibration - 1.5) * 0.022) : 0;
    for (let i = 0; i < tyreRefs.current.length; i++) {
      const grp = tyreRefs.current[i];
      if (!grp) continue;
      const weight = i === 1 ? 1.0 : i === 2 ? 0.65 : 0.35;
      grp.position.y = Math.sin(t * 50 + i * 1.7) * vibAmp * weight;
      grp.position.z = Math.cos(t * 47 + i * 2.1) * vibAmp * weight * 0.7;
    }

    if (bedMeshRef.current && bedGeoRef.current) {
      const fillScale = THREE.MathUtils.clamp(tel.debit_KK / 240, 0.55, 1.25);
      bedMeshRef.current.scale.set(fillScale, 1, 1);
      const posAttr = bedGeoRef.current.attributes.position;
      const colAttr = bedGeoRef.current.attributes.color;
      const calcRatio = THREE.MathUtils.clamp((tel.calcination_deg - 45) / 30, 0.15, 1.0);
      for (let i = 0; i < posAttr.count; i++) {
        const axial = THREE.MathUtils.clamp((14.6 - posAttr.getY(i)) / 29.2, 0, 1);
        const whiteMix = THREE.MathUtils.clamp(Math.pow(axial, 1.15) * calcRatio * 1.15, 0, 1);
        _scratchColor.copy(_bedDark).lerp(_bedWhite, whiteMix);
        colAttr.setXYZ(i, _scratchColor.r, _scratchColor.g, _scratchColor.b);
      }
      colAttr.needsUpdate = true;
    }
  });

  return (
    <group>
      <group position={KILN_CENTER} rotation={[0, 0, -KILN_TILT]}>
        <group ref={kilnSpinRef}>
          {Array.from({ length: KILN_SEGMENTS }, (_, i) => {
            const localX = -KILN_LENGTH / 2 + (i + 0.5) * segLength;
            return (
              <mesh
                key={i}
                position={[localX, 0, 0]}
                rotation={[0, 0, Math.PI / 2]}
                geometry={segGeo}
                castShadow
                receiveShadow
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectZone(i);
                  onInspect({
                    title: `Kiln Shell — ${getZoneLabel(i)}`,
                    sensor: 'kiln_shell_temp',
                    zoneIdx: i,
                    unit: '°C',
                    target: `Limit < ${DIGITAL_TWIN_SHELL_LIMIT_C} °C`,
                    warn: 355,
                    crit: DIGITAL_TWIN_SHELL_LIMIT_C,
                    position: [KILN_CENTER[0] + localX, KILN_CENTER[1] + 3.2, 0],
                  });
                }}
              >
                <meshStandardMaterial
                  ref={(el) => {
                    segMatRefs.current[i] = el;
                  }}
                  color="#3A4659"
                  roughness={0.48}
                  metalness={0.68}
                  side={THREE.DoubleSide}
                  bumpMap={bumpMap}
                  bumpScale={0.05}
                />
              </mesh>
            );
          })}

          {[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((ang, idx) => (
            <mesh
              key={idx}
              position={[0, Math.cos(ang) * 2.43, Math.sin(ang) * 2.43]}
              rotation={[ang, 0, 0]}
            >
              <boxGeometry args={[29.4, 0.08, 0.13]} />
              <meshStandardMaterial color="#64748B" roughness={0.38} metalness={0.85} />
            </mesh>
          ))}

          <group
            position={[3, 0, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onInspect({
                title: 'Main Drive Girth Gear',
                sensor: 'motor_current',
                unit: 'A',
                target: '175–205 A',
                warn: 205,
                crit: 225,
                position: [-2, 10.6, 0],
              });
            }}
          >
            <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
              <torusGeometry args={[3.1, 0.34, 16, 48]} />
              <meshStandardMaterial
                ref={gearRimMatRef}
                color="#475569"
                roughness={0.3}
                metalness={0.88}
              />
            </mesh>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((s) => {
              const a = (s * Math.PI) / 4;
              return (
                <mesh key={s} position={[0, Math.cos(a) * 2.68, Math.sin(a) * 2.68]} rotation={[a + 0.32, 0, 0]}>
                  <boxGeometry args={[0.42, 0.85, 0.14]} />
                  <meshStandardMaterial color="#64748B" roughness={0.4} metalness={0.84} />
                </mesh>
              );
            })}
            <instancedMesh ref={teethMeshRef} args={[toothGeo, undefined, 48]} frustumCulled={false}>
              <meshStandardMaterial
                ref={teethMatRef}
                color="#64748B"
                roughness={0.26}
                metalness={0.9}
              />
            </instancedMesh>
          </group>
        </group>

        <mesh
          ref={bedMeshRef}
          geometry={bedGeo}
          rotation={[0, 0, Math.PI / 2]}
          onClick={(e) => {
            e.stopPropagation();
            onInspect({
              title: 'Clinker Material Bed',
              sensor: 'calcination_deg',
              unit: '%',
              target: '60–70 %',
              warn: 71,
              position: [-5, 7.2, 0],
            });
          }}
        >
          <meshStandardMaterial vertexColors roughness={0.92} metalness={0.05} side={THREE.DoubleSide} />
        </mesh>
      </group>

      <group
        position={[-2, 0, 4.6]}
        onClick={(e) => {
          e.stopPropagation();
          onInspect({
            title: 'Main + Auxiliary Kiln Drive Station',
            sensor: 'Puissance_totale',
            unit: 'kW',
            target: '440–540 kW',
            warn: 560,
            crit: 620,
            position: [-2, 5.8, 5.2],
          });
        }}
      >
        <mesh position={[0, 1.3, 0]} receiveShadow>
          <boxGeometry args={[3.8, 2.6, 3.6]} />
          <meshStandardMaterial color="#1E293B" roughness={0.9} metalness={0.1} />
        </mesh>
        <mesh position={[0, 3.55, -0.5]} castShadow>
          <boxGeometry args={[2.2, 1.9, 2.2]} />
          <meshStandardMaterial color="#334155" roughness={0.44} metalness={0.74} />
        </mesh>
        <mesh position={[0, 4.2, -1.7]}>
          <boxGeometry args={[1.4, 1.5, 0.9]} />
          <meshStandardMaterial color="#CA8A04" roughness={0.48} metalness={0.45} />
        </mesh>
        <mesh position={[-0.45, 3.5, 1.45]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.74, 0.74, 1.9, 20]} />
          <meshStandardMaterial color="#1D4ED8" roughness={0.36} metalness={0.68} />
        </mesh>
        <mesh position={[1.1, 3.2, 1.25]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.42, 0.42, 1.3, 16]} />
          <meshStandardMaterial color="#0284C7" roughness={0.38} metalness={0.68} />
        </mesh>
      </group>

      <group position={[-4.5, 0, 10.5]}>
        <mesh position={[0, 0.35, 0]}>
          <boxGeometry args={[1.4, 0.7, 1.4]} />
          <meshStandardMaterial color="#1E293B" roughness={0.9} metalness={0.1} />
        </mesh>
        <mesh position={[0, 4.2, 0]}>
          <cylinderGeometry args={[0.16, 0.2, 7.2, 12]} />
          <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.78} />
        </mesh>
        <mesh position={[0, 7.9, -0.25]}>
          <boxGeometry args={[0.8, 0.55, 0.95]} />
          <meshStandardMaterial color="#CBD5E1" roughness={0.35} metalness={0.6} />
        </mesh>
        <mesh position={[0, 7.4, -5.2]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[6.8, 9.6, 4, 1, true]} />
          <meshBasicMaterial
            ref={scanBeamMatRef}
            color="#38BDF8"
            transparent
            opacity={0.055}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {TYRE_XS.map((tx, idx) => {
        const yKiln = KILN_CENTER[1] - (tx - KILN_CENTER[0]) * Math.sin(KILN_TILT);
        const pierH = Math.max(2.2, yKiln - 3.35);
        return (
          <group key={tx} position={[tx, 0, 0]}>
            <mesh position={[0, 0.35, 0]} receiveShadow>
              <boxGeometry args={[3.1, 0.7, 7.6]} />
              <meshStandardMaterial color="#172030" roughness={0.94} metalness={0.05} />
            </mesh>
            <mesh position={[0, pierH / 2 + 0.25, 0]} receiveShadow>
              <boxGeometry args={[2.45, pierH, 6.8]} />
              <meshStandardMaterial color="#1E293B" roughness={0.9} metalness={0.08} />
            </mesh>
            <group
              ref={(el) => {
                tyreRefs.current[idx] = el;
              }}
              onClick={(e) => {
                e.stopPropagation();
                onInspect({
                  title: `Tyre Station #${idx + 1} (x=${tx})`,
                  sensor: 'bearing_vibration',
                  unit: 'mm/s',
                  target: '< 2.8 mm/s',
                  warn: 2.8,
                  crit: 4.5,
                  position: [tx, yKiln + 3.2, 0],
                });
              }}
            >
              <mesh position={[0, yKiln, 0]} rotation={[0, Math.PI / 2, -KILN_TILT]} castShadow>
                <torusGeometry args={[2.6, 0.25, 16, 48]} />
                <meshStandardMaterial color="#94A3B8" roughness={0.26} metalness={0.9} />
              </mesh>
              <mesh position={[0.38, yKiln - 0.01, 0]} rotation={[0, Math.PI / 2, -KILN_TILT]}>
                <torusGeometry args={[2.45, 0.07, 8, 36]} />
                <meshStandardMaterial color="#64748B" roughness={0.4} metalness={0.84} />
              </mesh>
              {idx === 1 && (
                <mesh position={[-0.62, yKiln - 2.45, 0]} rotation={[0, 0, 0.14]} castShadow>
                  <cylinderGeometry args={[0.52, 0.52, 0.65, 18]} />
                  <meshStandardMaterial color="#CA8A04" roughness={0.36} metalness={0.75} />
                </mesh>
              )}
              {[-2.15, 2.15].map((rz, rIdx) => (
                <group key={rz} position={[0, yKiln - 2.35, rz]}>
                  <mesh
                    ref={(el) => {
                      rollerRefs.current[idx * 2 + rIdx] = el;
                    }}
                    rotation={[0, 0, Math.PI / 2]}
                    castShadow
                  >
                    <cylinderGeometry args={[0.75, 0.75, 1.15, 22]} />
                    <meshStandardMaterial color="#64748B" roughness={0.3} metalness={0.88} />
                  </mesh>
                  <mesh position={[0, -0.78, 0]}>
                    <boxGeometry args={[1.65, 0.72, 1.4]} />
                    <meshStandardMaterial color="#334155" roughness={0.52} metalness={0.7} />
                  </mesh>
                  <mesh position={[0, -0.35, rz > 0 ? 0.68 : -0.68]}>
                    <boxGeometry args={[0.85, 0.42, 0.22]} />
                    <meshStandardMaterial color="#475569" roughness={0.4} metalness={0.8} />
                  </mesh>
                </group>
              ))}
            </group>
          </group>
        );
      })}
    </group>
  );
}

function BurnerAndCooler({ telemetryRef, onInspect, isRunning }) {
  const outerFlameRef = useRef(null);
  const innerFlameRef = useRef(null);
  const burnerLightRef = useRef(null);
  const secDuctMatRef = useRef(null);
  const tadMatRef = useRef(null);
  const dustMatRef = useRef(null);
  const dustPointsRef = useRef(null);

  const secondaryDuctGeo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(18.5, 5.2, -2.5),
      new THREE.Vector3(16.2, 9.2, -3.2),
      new THREE.Vector3(13.2, 9.4, -1.8),
      new THREE.Vector3(11.3, 6.7, -0.4),
    ]);
    return new THREE.TubeGeometry(curve, 32, 0.72, 14, false);
  }, []);

  const tadGeo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(14.5, 5.4, -3.2),
      new THREE.Vector3(12.2, 12.6, -5.2),
      new THREE.Vector3(-4.0, 12.6, -5.2),
      new THREE.Vector3(-22.0, 12.6, -5.2),
      new THREE.Vector3(-32.2, 12.8, -1.8),
    ]);
    return new THREE.TubeGeometry(curve, 44, 0.88, 16, false);
  }, []);

  const dustGeo = useMemo(() => {
    const count = 80;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = 10.2 + Math.random() * 3.8;
      positions[i * 3 + 1] = 3.8 + Math.random() * 3.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 3.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);

  useEffect(() => {
    return () => {
      secondaryDuctGeo.dispose();
      tadGeo.dispose();
      dustGeo.dispose();
    };
  }, [secondaryDuctGeo, tadGeo, dustGeo]);

  useFrame(({ clock }, rawDelta) => {
    const dt = isRunning ? Math.min(rawDelta, 0.12) : 0;
    const t = clock.getElapsedTime();
    const tel = telemetryRef.current;

    const f = classifyFlame(tel.burning_zone_temp);
    const flicker = isRunning ? 1 + Math.sin(t * 17) * 0.05 + Math.cos(t * 29) * 0.03 : 1;
    if (outerFlameRef.current) {
      outerFlameRef.current.scale.set(f.scale * flicker, f.scale * flicker, f.scale * flicker);
      outerFlameRef.current.material.color.set(f.color);
      outerFlameRef.current.material.emissive.set(f.color);
      outerFlameRef.current.material.emissiveIntensity = f.intensity;
    }
    if (innerFlameRef.current) {
      innerFlameRef.current.scale.set(f.scale * 0.58 * flicker, f.scale * 0.72 * flicker, f.scale * 0.58 * flicker);
      innerFlameRef.current.material.emissive.set(f.state === 'COLD' ? '#7DD3FC' : '#FFFBEB');
      innerFlameRef.current.material.emissiveIntensity = f.intensity * 1.2;
    }
    if (burnerLightRef.current) {
      burnerLightRef.current.color.set(f.color);
      burnerLightRef.current.intensity = 18 * f.scale * flicker;
    }

    const airNorm = THREE.MathUtils.clamp((tel.T_air_Secondaire - 900) / 240, 0, 1);
    if (secDuctMatRef.current) {
      secDuctMatRef.current.emissive.set('#D97706').lerp(_cRed, airNorm * 0.7);
      secDuctMatRef.current.emissiveIntensity = 0.04 + airNorm * 0.95;
    }
    if (tadMatRef.current) {
      tadMatRef.current.emissive.set('#C2410C').lerp(_cRed, airNorm * 0.6);
      tadMatRef.current.emissiveIntensity = 0.03 + airNorm * 0.55;
    }

    if (dustMatRef.current && dustPointsRef.current && dt > 0) {
      const limeNorm = THREE.MathUtils.clamp((tel.free_lime_pct - 1.2) / 1.8, 0, 1);
      dustMatRef.current.color.set('#A8A29E').lerp(_bedWhite, limeNorm);
      dustMatRef.current.opacity = 0.45 + limeNorm * 0.5;
      const arr = dustGeo.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += dt * 0.9;
        arr[i + 1] -= dt * 1.15;
        if (arr[i + 1] < 3.6 || arr[i] > 14.2) {
          arr[i] = 10.1 + (i % 7) * 0.32;
          arr[i + 1] = 6.9 - (i % 5) * 0.18;
        }
      }
      dustGeo.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group>
      <pointLight ref={burnerLightRef} position={[9.2, 6.4, 0]} distance={34} decay={1.6} intensity={22} color="#F59E0B" />

      <group
        position={[12, 6.25, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onInspect({
            title: 'Main Rotary Kiln Burner',
            sensor: 'burning_zone_temp',
            unit: '°C',
            target: '1380–1460 °C',
            warn: 1460,
            crit: 1520,
            position: [10.5, 9.2, 0],
          });
        }}
      >
        <mesh position={[1.4, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.26, 0.34, 5.4, 20]} />
          <meshStandardMaterial color="#64748B" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[3.7, -0.75, 0]}>
          <boxGeometry args={[0.85, 1.5, 1.5]} />
          <meshStandardMaterial color="#334155" roughness={0.55} metalness={0.68} />
        </mesh>
        <mesh position={[4.1, 0.45, 0.45]} rotation={[0, 0, -0.35]}>
          <cylinderGeometry args={[0.14, 0.14, 1.2, 12]} />
          <meshStandardMaterial color="#CA8A04" roughness={0.45} metalness={0.5} />
        </mesh>

        <mesh ref={outerFlameRef} position={[-3.4, 0.08, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[1.2, 6, 16]} />
          <meshStandardMaterial
            color="#F59E0B"
            emissive="#F59E0B"
            emissiveIntensity={2.2}
            transparent
            opacity={0.78}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={innerFlameRef} position={[-2.7, 0.08, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[0.9, 5.2, 14]} />
          <meshStandardMaterial
            color="#FFFBEB"
            emissive="#FFFBEB"
            emissiveIntensity={3.2}
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      <mesh position={[10.0, 6.28, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[2.52, 0.16, 12, 36]} />
        <meshStandardMaterial color="#94A3B8" roughness={0.34} metalness={0.88} />
      </mesh>
      <mesh position={[11.2, 6.2, -2.9]}>
        <boxGeometry args={[2.6, 5.2, 0.48]} />
        <meshStandardMaterial color="#334155" roughness={0.58} metalness={0.62} />
      </mesh>
      <mesh position={[11.2, 8.6, 0]}>
        <boxGeometry args={[2.6, 0.48, 6.2]} />
        <meshStandardMaterial color="#334155" roughness={0.58} metalness={0.62} />
      </mesh>
      <mesh position={[12.5, 4.4, 0]}>
        <boxGeometry args={[2.6, 2.8, 5.2]} />
        <meshStandardMaterial color="#273449" roughness={0.7} metalness={0.5} />
      </mesh>

      <points ref={dustPointsRef} geometry={dustGeo}>
        <pointsMaterial
          ref={dustMatRef}
          size={0.34}
          color="#A8A29E"
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </points>

      <group
        position={[22, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onInspect({
            title: 'Grate Clinker Cooler (Fans V1–V10)',
            sensor: 'T_air_Secondaire',
            unit: '°C',
            target: '940–1040 °C',
            warn: 1080,
            position: [22, 7.6, 0],
          });
        }}
      >
        <mesh position={[0, 0.6, 0]} receiveShadow>
          <boxGeometry args={[18.8, 1.2, 8.6]} />
          <meshStandardMaterial color="#1E293B" roughness={0.92} metalness={0.06} />
        </mesh>
        <mesh position={[0, 3.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[18, 4, 8]} />
          <meshStandardMaterial color="#334155" roughness={0.54} metalness={0.66} />
        </mesh>
        {[-7, -3.5, 0, 3.5, 7].map((rx) => (
          <group key={rx} position={[rx, 3.2, 4.08]}>
            <mesh>
              <boxGeometry args={[0.3, 3.85, 0.16]} />
              <meshStandardMaterial color="#475569" roughness={0.4} metalness={0.82} />
            </mesh>
            <mesh position={[1.7, 0.1, 0.02]}>
              <boxGeometry args={[1.1, 1.1, 0.08]} />
              <meshStandardMaterial color="#1E293B" roughness={0.65} metalness={0.55} />
            </mesh>
          </group>
        ))}
        {Array.from({ length: 10 }, (_, i) => {
          const fx = -7.65 + i * 1.7;
          return (
            <group key={i} position={[fx, 5.75, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.46, 0.56, 1.15, 16]} />
                <meshStandardMaterial color="#64748B" roughness={0.38} metalness={0.82} />
              </mesh>
              <mesh position={[0, 0.62, 0]}>
                <cylinderGeometry args={[0.58, 0.58, 0.14, 16]} />
                <meshStandardMaterial color="#94A3B8" roughness={0.3} metalness={0.88} />
              </mesh>
            </group>
          );
        })}
        {[-6, -2, 2, 6].map((bx) => (
          <mesh key={bx} position={[bx, 1.55, 4.7]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.62, 0.62, 0.85, 16]} />
            <meshStandardMaterial color="#0284C7" roughness={0.42} metalness={0.7} />
          </mesh>
        ))}
        <mesh position={[10.3, 2.2, 0]}>
          <boxGeometry args={[2.8, 2.5, 3.8]} />
          <meshStandardMaterial color="#273449" roughness={0.62} metalness={0.6} />
        </mesh>
        <mesh position={[13.6, 2.7, 0]} rotation={[0, 0, 0.22]}>
          <boxGeometry args={[4.6, 0.7, 1.8]} />
          <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.74} />
        </mesh>
      </group>

      <mesh
        geometry={secondaryDuctGeo}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onInspect({
            title: 'Secondary Air Recuperation Duct',
            sensor: 'T_air_Secondaire',
            unit: '°C',
            target: '940–1040 °C',
            warn: 1080,
            position: [15.5, 10.8, -2.4],
          });
        }}
      >
        <meshStandardMaterial
          ref={secDuctMatRef}
          color="#334155"
          roughness={0.46}
          metalness={0.78}
          emissive="#D97706"
          emissiveIntensity={0.08}
        />
      </mesh>

      <group>
        <mesh
          geometry={tadGeo}
          castShadow
          onClick={(e) => {
            e.stopPropagation();
            onInspect({
              title: 'Tertiary Air Duct (TAD → Precalciner)',
              sensor: 'T_air_Secondaire',
              unit: '°C',
              target: '900–1020 °C',
              warn: 1060,
              position: [-6, 14.8, -5.2],
            });
          }}
        >
          <meshStandardMaterial
            ref={tadMatRef}
            color="#3B475C"
            roughness={0.48}
            metalness={0.74}
            emissive="#C2410C"
            emissiveIntensity={0.06}
          />
        </mesh>
        {[-22, -10, 2, 11].map((sx) => (
          <group key={sx} position={[sx, 0, -5.2]}>
            <mesh position={[0, 6.2, 0]}>
              <boxGeometry args={[0.42, 12.4, 0.42]} />
              <meshStandardMaterial color="#334155" roughness={0.62} metalness={0.72} />
            </mesh>
            <mesh position={[0, 12.6, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[1.02, 0.12, 10, 24]} />
              <meshStandardMaterial color="#64748B" roughness={0.36} metalness={0.86} />
            </mesh>
          </group>
        ))}
        <mesh position={[6.5, 13.7, -5.2]}>
          <boxGeometry args={[0.9, 1.5, 1.3]} />
          <meshStandardMaterial color="#CA8A04" roughness={0.44} metalness={0.55} />
        </mesh>
      </group>
    </group>
  );
}

function ForecastGhostKiln({ viewMode, forecast }) {
  if (viewMode === 'CURRENT') return null;

  const isAdvice = viewMode === 'FOLLOW_ADVICE';
  const data = isAdvice ? forecast.followAdvice : forecast.doNothing;

  const outOfTarget =
    data.calcination_deg < 60 ||
    data.calcination_deg > 70 ||
    data.free_lime_pct > 2.5 ||
    data.nox_ppm > 250 ||
    data.shell_temp > DIGITAL_TWIN_SHELL_LIMIT_C;

  const ghostHex = isAdvice ? '#10B981' : outOfTarget ? '#EF4444' : '#F59E0B';

  return (
    <group position={[KILN_CENTER[0], KILN_CENTER[1] + 5.8, KILN_CENTER[2]]} rotation={[0, 0, -KILN_TILT]}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[2.45, 2.45, KILN_LENGTH, 48, 1, true]} />
        <meshStandardMaterial
          color={ghostHex}
          emissive={ghostHex}
          emissiveIntensity={0.8}
          transparent
          opacity={0.18}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {[-14, 0, 14].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[2.48, 0.06, 8, 48]} />
          <meshBasicMaterial color={ghostHex} transparent opacity={0.55} />
        </mesh>
      ))}
      <Html position={[0, 3.2, 0]} center zIndexRange={[1, 5]}>
        <div
          className="px-2.5 py-1 rounded border text-[11px] font-mono whitespace-nowrap pointer-events-none shadow-lg"
          style={{
            backgroundColor: 'rgba(11, 15, 23, 0.94)',
            borderColor: ghostHex,
            color: ghostHex,
          }}
        >
          {isAdvice ? 'STABILIZED +30min' : 'DO NOTHING +30min'} · Shell {data.shell_temp}°C (Limit 370°C) · NOx {data.nox_ppm}
        </div>
      </Html>
    </group>
  );
}

function Sparkline({ values, color, min, max }) {
  const width = 92;
  const height = 22;
  if (!values || values.length < 2) return null;
  const span = Math.max(0.01, max - min);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - THREE.MathUtils.clamp((v - min) / span, 0, 1) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Component: KilnVisualizer3D (Strictly Isolated Context B Testing Twin)
// ---------------------------------------------------------------------------

export function KilnVisualizer3D({
  telemetry: externalTelemetry,
  activeScenario: externalScenario,
  embedded = true,
} = {}) {
  const [scenario, setScenario] = useState(externalScenario || 'NORMAL');
  const [viewMode, setViewMode] = useState('CURRENT');
  const [cameraPreset, setCameraPreset] = useState('LINE');
  const [presetNonce, setPresetNonce] = useState(0);
  const [xrayShell, setXrayShell] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedZoneIdx, setSelectedZoneIdx] = useState(14); // Ring B-04 default
  const [dockOpen, setDockOpen] = useState(true);
  const [isRunning, setIsRunning] = useState(true);
  const [manualShellOverrideC, setManualShellOverrideC] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const effectiveScenario = externalScenario || scenario;
  const scenarioObj = SCENARIO_MAP[effectiveScenario] || SCENARIOS[0];
  const mock = useIsolatedSimulationTelemetry(effectiveScenario, isRunning, manualShellOverrideC);
  const telemetry = externalTelemetry || mock.telemetry;
  const history = mock.history;

  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;

  const controlsRef = useRef(null);
  const fpsElRef = useRef(null);
  const { steelBump, concreteMap } = useMemo(() => createProceduralTextures(), []);

  useEffect(() => {
    return () => {
      steelBump?.dispose();
      concreteMap?.dispose();
    };
  }, [steelBump, concreteMap]);

  const handleSelectScenario = (id) => {
    setManualShellOverrideC(null);
    setScenario(id);
    if (!isRunning) setIsRunning(true);
  };

  const handleResetSimulation = () => {
    setManualShellOverrideC(null);
    setScenario('NORMAL');
    setViewMode('CURRENT');
    setSelectedPart(null);
    setSelectedZoneIdx(14);
    setIsRunning(true);
    handleCameraPreset('LINE');
  };

  const handleCameraPreset = (key) => {
    setCameraPreset(key);
    setPresetNonce((n) => n + 1);
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === '1') handleCameraPreset('LINE');
      else if (k === '2') handleCameraPreset('BURNER');
      else if (k === '3') handleCameraPreset('PREHEATER');
      else if (k === '4') handleCameraPreset('COOLER');
      else if (k === 'x') setXrayShell((v) => !v);
      else if (k === 'escape') {
        setSelectedPart(null);
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const forecast = useMemo(() => computeForecast(history, telemetry), [history, telemetry]);
  const axialProfile = useMemo(
    () => computeAxialShellProfile(telemetry.kiln_shell_temp, effectiveScenario),
    [telemetry.kiln_shell_temp, effectiveScenario]
  );

  // Contextual Zone Information Panel Data (for selected zone 0..19)
  const selectedZoneInfo = useMemo(() => {
    const temp = Math.round(axialProfile[selectedZoneIdx] ?? telemetry.kiln_shell_temp);
    const deviation = temp - DIGITAL_TWIN_SHELL_LIMIT_C;
    const status =
      temp > DIGITAL_TWIN_SHELL_LIMIT_C
        ? 'CRITICAL > 370 °C'
        : temp === DIGITAL_TWIN_SHELL_LIMIT_C
        ? 'AT LIMIT (370 °C)'
        : temp >= 355
        ? 'WARNING · APPROACHING'
        : 'NOMINAL';
    const color =
      temp > DIGITAL_TWIN_SHELL_LIMIT_C
        ? '#EF4444'
        : temp >= 355
        ? '#F97316'
        : temp >= 295
        ? '#EAB308'
        : '#10B981';

    return {
      zoneIndex: selectedZoneIdx + 1,
      zoneLabel: getZoneLabel(selectedZoneIdx),
      temp,
      threshold: DIGITAL_TWIN_SHELL_LIMIT_C,
      deviation,
      status,
      color,
      scenarioLabel: manualShellOverrideC != null ? `Manual Override (${manualShellOverrideC} °C)` : scenarioObj.label,
    };
  }, [axialProfile, selectedZoneIdx, telemetry.kiln_shell_temp, manualShellOverrideC, scenarioObj.label]);

  const softCards = [
    {
      label: 'Calcination',
      value: `${telemetry.calcination_deg.toFixed(1)}%`,
      target: '60–70%',
      inTarget: telemetry.calcination_deg >= 60 && telemetry.calcination_deg <= 70,
      crit: telemetry.calcination_deg < 56 || telemetry.calcination_deg > 75,
      series: history.map((h) => h.calcination_deg),
      min: 48,
      max: 78,
      projDoNothing: `${forecast.doNothing.calcination_deg}%`,
      projAdvice: `${forecast.followAdvice.calcination_deg}%`,
    },
    {
      label: 'Free Lime',
      value: `${telemetry.free_lime_pct.toFixed(2)}%`,
      target: '< 2.5%',
      inTarget: telemetry.free_lime_pct < 2.5,
      crit: telemetry.free_lime_pct >= 3.0,
      series: history.map((h) => h.free_lime_pct),
      min: 0.6,
      max: 4.0,
      projDoNothing: `${forecast.doNothing.free_lime_pct}%`,
      projAdvice: `${forecast.followAdvice.free_lime_pct}%`,
    },
    {
      label: 'NOx Emissions',
      value: `${Math.round(telemetry.nox_ppm)} ppm`,
      target: '< 250 ppm',
      inTarget: telemetry.nox_ppm < 250,
      crit: telemetry.nox_ppm >= 295,
      series: history.map((h) => h.nox_ppm),
      min: 140,
      max: 360,
      projDoNothing: `${forecast.doNothing.nox_ppm} ppm`,
      projAdvice: `${forecast.followAdvice.nox_ppm} ppm`,
    },
  ];

  const inspectedReading = useMemo(() => {
    if (!selectedPart) return null;
    const rawVal =
      selectedPart.zoneIdx != null
        ? axialProfile[selectedPart.zoneIdx]
        : (telemetry[selectedPart.sensor] ?? 0) + (selectedPart.offset || 0);
    const isCrit = selectedPart.crit != null && rawVal > selectedPart.crit;
    const isWarn = !isCrit && selectedPart.warn != null && rawVal >= selectedPart.warn;
    return {
      ...selectedPart,
      value: rawVal < 20 ? rawVal.toFixed(2) : rawVal.toFixed(0),
      deviation: selectedPart.zoneIdx != null ? Math.round(rawVal - DIGITAL_TWIN_SHELL_LIMIT_C) : null,
      status: isCrit ? 'CRITICAL' : isWarn ? 'WARNING' : 'NOMINAL',
      color: isCrit ? '#EF4444' : isWarn ? '#F59E0B' : '#10B981',
    };
  }, [selectedPart, telemetry, axialProfile]);

  const shellPeakC = Math.round(telemetry.kiln_shell_temp);
  const shellOverLimit = shellPeakC > DIGITAL_TWIN_SHELL_LIMIT_C;

  const containerClass = expanded
    ? 'fixed inset-0 z-50 w-screen h-screen overflow-hidden select-none bg-[#0B0F17] text-slate-100'
    : embedded
    ? 'relative w-full h-full min-h-[460px] overflow-hidden select-none bg-[#0B0F17] text-slate-100'
    : 'relative w-full h-screen overflow-hidden select-none bg-[#0B0F17] text-slate-100';

  return (
    <div
      className={containerClass}
      data-testid="kilnvision-root"
      data-context="context-b-simulation"
      data-scenario={effectiveScenario}
      data-view-mode={viewMode}
      data-xray={xrayShell ? 'on' : 'off'}
      data-running={isRunning ? 'true' : 'false'}
    >
      <div className="absolute inset-0" data-testid="kilnvision-canvas-container">
        <Canvas
          frameloop={IS_SOFTWARE_GL ? 'demand' : 'always'}
          dpr={IS_SOFTWARE_GL ? 1 : [1, 2]}
          shadows={!IS_SOFTWARE_GL}
          gl={{
            antialias: !IS_SOFTWARE_GL,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.12,
          }}
          onPointerMissed={() => setSelectedPart(null)}
        >
          <color attach="background" args={['#0B0F17']} />
          <fogExp2 attach="fog" args={['#0B0F17', 0.004]} />

          <PerspectiveCamera makeDefault position={[0, 35, 90]} fov={55} near={0.5} far={450} />
          <OrbitControls
            ref={controlsRef}
            target={[-6, 10, 0]}
            enableDamping={!IS_SOFTWARE_GL}
            dampingFactor={0.08}
            maxPolarAngle={Math.PI * 0.49}
            minDistance={10}
            maxDistance={185}
          />

          <StudioEnvironment />
          <SoftwareGlPacer />
          <FpsTracker fpsElRef={fpsElRef} />
          <CameraRig controlsRef={controlsRef} cameraPreset={cameraPreset} presetNonce={presetNonce} />

          <ambientLight intensity={0.26} color="#CBD5E1" />
          <hemisphereLight args={['#8EB8E5', '#1C1612', 0.72]} />
          <directionalLight
            position={[38, 65, 48]}
            intensity={1.7}
            color="#FFF2DE"
            castShadow={!IS_SOFTWARE_GL}
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-left={-72}
            shadow-camera-right={50}
            shadow-camera-top={50}
            shadow-camera-bottom={-30}
            shadow-bias={-0.0005}
            shadow-normalBias={0.02}
          />
          <directionalLight position={[-55, 34, -40]} intensity={0.6} color="#7DD3FC" />

          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
            <planeGeometry args={[280, 180]} />
            <meshStandardMaterial color="#FFFFFF" map={concreteMap} roughness={0.94} metalness={0.05} />
          </mesh>
          <gridHelper args={[220, 44, '#1B283C', '#111A29']} position={[0, 0.01, 0]} />

          <PreheaterTowers telemetryRef={telemetryRef} onInspect={setSelectedPart} bumpMap={steelBump} />
          <RotaryKilnAssembly
            telemetryRef={telemetryRef}
            scenarioId={effectiveScenario}
            xrayShell={xrayShell}
            selectedZoneIdx={selectedZoneIdx}
            onInspect={setSelectedPart}
            onSelectZone={setSelectedZoneIdx}
            bumpMap={steelBump}
            isRunning={isRunning}
          />
          <BurnerAndCooler telemetryRef={telemetryRef} onInspect={setSelectedPart} isRunning={isRunning} />
          <ForecastGhostKiln viewMode={viewMode} forecast={forecast} />

          {inspectedReading && (
            <Html position={inspectedReading.position} center zIndexRange={[2, 8]}>
              <div
                className="w-64 rounded-lg border border-slate-700 p-3 text-xs shadow-xl"
                style={{ backgroundColor: 'rgba(11, 15, 23, 0.96)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-amber-400">
                    SIMULATION MODE — TEST DATA
                  </span>
                  <button
                    type="button"
                    aria-label="Close sensor tooltip"
                    onClick={() => setSelectedPart(null)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="font-semibold text-slate-100 leading-tight">{inspectedReading.title}</div>
                <div className="text-[11px] font-mono text-slate-400 mt-0.5 mb-2">
                  Scenario: {selectedZoneInfo.scenarioLabel}
                </div>
                <div className="flex items-baseline justify-between border-t border-slate-800 pt-2">
                  <span className="text-lg font-mono font-bold tabular-nums" style={{ color: inspectedReading.color }}>
                    {inspectedReading.value} {inspectedReading.unit}
                  </span>
                  <span className="text-[11px] font-mono font-semibold" style={{ color: inspectedReading.color }}>
                    {inspectedReading.status}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>{inspectedReading.target}</span>
                  {inspectedReading.deviation != null && (
                    <span className={inspectedReading.deviation > 0 ? 'text-red-400 font-semibold' : 'text-emerald-400'}>
                      {inspectedReading.deviation > 0 ? `+${inspectedReading.deviation}°C` : `${inspectedReading.deviation}°C`}
                    </span>
                  )}
                </div>
              </div>
            </Html>
          )}
        </Canvas>
      </div>

      {/* A. Top-Left HUD: Prominent SIMULATION MODE — TEST DATA Banner + 20-Zone Clickable Strip */}
      <header
        className="absolute top-3 left-3 z-20 w-[min(430px,calc(100%-24px))] rounded-lg border border-slate-700/90 px-3.5 py-2.5"
        style={{ backgroundColor: 'rgba(11, 15, 23, 0.94)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Flame className="w-4 h-4 text-orange-400 shrink-0" />
            <h3 className="text-xs font-bold tracking-wider text-slate-100 truncate">
              KILNVISION 3D DIGITAL TWIN
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              data-testid="sim-mode-badge"
              className="rounded border border-amber-500/60 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-amber-300"
            >
              SIMULATION MODE — TEST DATA
            </span>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? 'Exit expanded 3D view' : 'Expand 3D digital twin'}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white cursor-pointer"
            >
              {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] font-mono tabular-nums text-slate-400">
          <span className={isRunning ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
            {isRunning ? '● SIM RUNNING' : '❚❚ SIM PAUSED'}
          </span>
          <span>• Context B Isolated</span>
          <span>•</span>
          <span ref={fpsElRef} className="text-slate-300">60 FPS</span>
          <span>•</span>
          <span className="text-slate-300">{telemetry.Vitesse_Four.toFixed(2)} RPM</span>
        </div>

        {shellOverLimit && (
          <div
            role="alert"
            className="mt-2 flex items-center gap-2 rounded border border-red-500/70 bg-red-950/80 px-2.5 py-1.5 text-[11px] font-mono text-red-200"
          >
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>
              SIMULATED CRITICAL ALARM: {shellPeakC} °C exceeds 370 °C limit (+{shellPeakC - DIGITAL_TWIN_SHELL_LIMIT_C} °C)
            </span>
          </div>
        )}

        <div className="mt-2 grid grid-cols-4 gap-2 border-t border-slate-800/90 pt-2 text-[11px] font-mono tabular-nums">
          <div>
            <div className="text-[10px] text-slate-400">Burn Zone</div>
            <div className={telemetry.burning_zone_temp > 1520 ? 'text-red-400 font-semibold' : telemetry.burning_zone_temp > 1460 || telemetry.burning_zone_temp < 1320 ? 'text-amber-400 font-semibold' : 'text-slate-100'}>
              {Math.round(telemetry.burning_zone_temp)}°C
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">Shell Max</div>
            <div
              data-testid="sim-shell-temp"
              className={shellPeakC > DIGITAL_TWIN_SHELL_LIMIT_C ? 'text-red-400 font-bold' : shellPeakC >= 355 ? 'text-amber-400 font-semibold' : 'text-emerald-400 font-semibold'}
            >
              {shellPeakC}°C
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">Limit</div>
            <div className="text-orange-300 font-semibold">&lt; 370°C</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400">Current</div>
            <div className={telemetry.motor_current > 225 ? 'text-red-400 font-semibold' : telemetry.motor_current > 205 ? 'text-amber-400 font-semibold' : 'text-slate-100'}>
              {Math.round(telemetry.motor_current)} A
            </div>
          </div>
        </div>

        {/* Clickable 20-Zone IR Shell Strip + Color Legend */}
        <div className="mt-2 border-t border-slate-800/90 pt-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
            <span>20-Zone Thermal Map (Click Zone)</span>
            <span>TAD {Math.round(telemetry.T_air_Secondaire)}°C</span>
          </div>
          <div className="grid grid-cols-20 gap-0.5 h-3" aria-label="Interactive 20-zone kiln shell thermal strip">
            {axialProfile.map((temp, idx) => {
              const bg =
                temp > DIGITAL_TWIN_SHELL_LIMIT_C
                  ? '#DC2626'
                  : temp >= 340
                  ? '#F97316'
                  : temp >= 295
                  ? '#EAB308'
                  : temp >= 245
                  ? '#10B981'
                  : '#2563EB';
              const isSelected = selectedZoneIdx === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedZoneIdx(idx)}
                  className={`h-full rounded-[1px] cursor-pointer transition-transform ${
                    isSelected ? 'ring-2 ring-white scale-y-125' : 'opacity-90 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: bg }}
                  title={`Zone ${idx + 1}: ${temp}°C (Limit < 370°C)`}
                  aria-label={`Inspect Zone ${idx + 1}, ${temp} degrees Celsius`}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-slate-400">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-xs bg-[#2563EB]" />Cool</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-xs bg-[#10B981]" />Mod</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-xs bg-[#EAB308]" />Elev</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-xs bg-[#F97316]" />High</span>
            <span className="flex items-center gap-1 text-red-400 font-semibold"><span className="inline-block h-2 w-2 rounded-xs bg-[#DC2626]" />&gt;370°C</span>
          </div>
        </div>
      </header>

      {/* B. Top-Right Contextual Zone Information Panel + Diagnostic Soft Sensors */}
      <aside
        className="absolute top-3 right-3 z-20 w-72 rounded-lg border border-slate-700/90 p-3 hidden md:block"
        style={{ backgroundColor: 'rgba(11, 15, 23, 0.94)' }}
        aria-label="Contextual Zone Inspection and Soft Sensors"
        data-testid="sim-zone-panel"
      >
        <div className="border-b border-slate-800 pb-2 mb-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-orange-400">
              Selected Zone · Context B
            </span>
            <span
              className="font-mono text-[10px] font-bold"
              style={{ color: selectedZoneInfo.color }}
            >
              {selectedZoneInfo.status}
            </span>
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-100">
            {selectedZoneInfo.zoneLabel}
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded border border-slate-800 bg-slate-900/80 p-1.5 font-mono text-[10px] tabular-nums">
            <div>
              <div className="text-slate-400">Sim Temp</div>
              <div className="text-xs font-bold" style={{ color: selectedZoneInfo.color }}>
                {selectedZoneInfo.temp} °C
              </div>
            </div>
            <div>
              <div className="text-slate-400">Threshold</div>
              <div className="text-xs font-semibold text-slate-200">&lt; {selectedZoneInfo.threshold} °C</div>
            </div>
            <div>
              <div className="text-slate-400">Deviation</div>
              <div className={`text-xs font-bold ${selectedZoneInfo.deviation > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {selectedZoneInfo.deviation > 0 ? `+${selectedZoneInfo.deviation}` : selectedZoneInfo.deviation} °C
              </div>
            </div>
          </div>
          <div className="mt-1 text-[10px] font-mono text-slate-400 truncate">
            Scenario: <span className="text-slate-200">{selectedZoneInfo.scenarioLabel}</span>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-[11px] font-bold tracking-wider text-slate-100">SOFT SENSORS (SIM)</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Feed {Math.round(telemetry.debit_KK)} t/h</span>
        </div>

        <div className="space-y-2">
          {softCards.map((item) => {
            const hex = item.crit ? '#EF4444' : item.inTarget ? '#10B981' : '#F59E0B';
            const statusText = item.crit ? 'ALERT' : item.inTarget ? 'OK' : 'WARN';
            return (
              <div key={item.label} className="border-b border-slate-800/70 pb-1.5 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-300 font-medium">{item.label}</span>
                  <span className="font-mono text-slate-500">{item.target}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-mono font-bold tabular-nums" style={{ color: hex }}>
                      {item.value}
                    </span>
                    <span className="text-[10px] font-mono font-semibold" style={{ color: hex }}>
                      {statusText}
                    </span>
                  </div>
                  <Sparkline values={item.series} color={hex} min={item.min} max={item.max} />
                </div>
                {viewMode !== 'CURRENT' && (
                  <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400">
                    <span>No Action: <strong className="text-amber-400">{item.projDoNothing}</strong></span>
                    <span>Stabilized: <strong className="text-emerald-400">{item.projAdvice}</strong></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* C. Collapsible Bottom Simulation Testing Dock (Strictly Context B) */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 w-[min(1180px,calc(100%-16px))] flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockOpen((v) => !v)}
          className="mb-1 flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-0.5 text-[10px] font-mono font-medium text-slate-300 hover:text-white cursor-pointer"
          style={{ backgroundColor: 'rgba(11, 15, 23, 0.94)' }}
        >
          {dockOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          <span>{dockOpen ? 'Hide Simulation Controls' : 'Show Simulation Controls'}</span>
        </button>

        {dockOpen && (
          <div
            className={`w-full rounded-lg border border-slate-700/90 ${
              embedded && !expanded ? 'px-2.5 py-2 space-y-1.5' : 'px-3 py-2.5 space-y-2'
            }`}
            style={{ backgroundColor: 'rgba(11, 15, 23, 0.96)' }}
          >
            {/* Row 1: Play/Pause, Reset, Manual Temp Override Slider, Forecast Modes, Camera Presets */}
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="sim-play-pause"
                  onClick={() => setIsRunning((v) => !v)}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded px-3 py-1 text-[11px] font-mono font-semibold border cursor-pointer ${
                    isRunning
                      ? 'border-emerald-500/60 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                      : 'border-amber-500/60 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                  }`}
                >
                  {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isRunning ? 'PAUSE' : 'START'}</span>
                </button>

                <button
                  type="button"
                  data-testid="sim-reset"
                  onClick={handleResetSimulation}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded border border-slate-600 bg-slate-900 px-2.5 py-1 text-[11px] font-mono font-semibold text-slate-200 hover:border-slate-400 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>RESET</span>
                </button>

                <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900/90 px-2.5 py-1">
                  <Sliders className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <label htmlFor="sim-temp-slider" className="font-mono text-[10px] text-slate-300 whitespace-nowrap">
                    Sim Shell: <strong className={shellPeakC > 370 ? 'text-red-400' : 'text-orange-300'}>{shellPeakC}°C</strong>
                  </label>
                  <input
                    id="sim-temp-slider"
                    data-testid="sim-temp-slider"
                    type="range"
                    min={220}
                    max={430}
                    step={1}
                    value={manualShellOverrideC ?? shellPeakC}
                    onChange={(e) => setManualShellOverrideC(Number(e.target.value))}
                    className="w-24 accent-orange-500 cursor-pointer"
                  />
                  {manualShellOverrideC != null && (
                    <button
                      type="button"
                      onClick={() => setManualShellOverrideC(null)}
                      className="font-mono text-[10px] text-sky-400 hover:underline cursor-pointer"
                    >
                      Auto
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  {[
                    { id: 'CURRENT', label: 'CURRENT' },
                    { id: 'DO_NOTHING', label: 'DRIFT +30m' },
                    { id: 'FOLLOW_ADVICE', label: 'STABILIZE +30m' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setViewMode(m.id)}
                      className={`min-h-[34px] rounded px-2 py-1 text-[10px] font-mono font-semibold border cursor-pointer ${
                        viewMode === m.id
                          ? m.id === 'FOLLOW_ADVICE'
                            ? 'bg-emerald-600 border-emerald-400 text-white'
                            : m.id === 'DO_NOTHING'
                            ? 'bg-orange-600 border-orange-400 text-white'
                            : 'bg-sky-600 border-sky-400 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setXrayShell((v) => !v)}
                    className={`inline-flex min-h-[34px] items-center gap-1 rounded px-2 py-1 text-[10px] font-mono font-semibold border cursor-pointer ${
                      xrayShell
                        ? 'bg-cyan-600 border-cyan-400 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <ScanEye className="w-3.5 h-3.5" />
                    <span>X-RAY</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Camera className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
                {Object.entries(CAMERA_PRESETS).map(([key, p]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleCameraPreset(key)}
                    className={`min-h-[34px] rounded px-2 py-1 text-[10px] font-mono font-semibold border cursor-pointer ${
                      cameraPreset === key
                        ? 'bg-slate-100 border-white text-slate-950'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: All 11 Isolated Simulation Scenarios */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-800/90 pt-2">
              {SCENARIOS.map((sc) => {
                const active = effectiveScenario === sc.id && manualShellOverrideC == null;
                const activeClass =
                  sc.severity === 'crit'
                    ? 'bg-red-600 border-red-400 text-white'
                    : sc.severity === 'warn'
                    ? 'bg-amber-600 border-amber-400 text-white'
                    : 'bg-emerald-600 border-emerald-400 text-white';
                return (
                  <button
                    key={sc.id}
                    type="button"
                    data-testid={`sim-scenario-${sc.id}`}
                    onClick={() => handleSelectScenario(sc.id)}
                    className={`min-h-[30px] rounded px-2.5 py-1 text-[11px] font-medium border transition-colors cursor-pointer ${
                      active
                        ? activeClass
                        : 'bg-slate-900/90 border-slate-700/80 text-slate-300 hover:border-slate-500 hover:text-white'
                    }`}
                  >
                    {sc.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default KilnVisualizer3D;
