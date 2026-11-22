export type TransformationStageId =
  | 'raw-matter'
  | 'initial-dissolution'
  | 'energy-release'
  | 'transformation';

export interface StageDefinition {
  id: TransformationStageId;
  index: string;
  label: string;
  range: [number, number];
  scrollTarget: number;
  captionTitle: string;
  captionBody: string;
  thermalBand: string;
}

export const TRANSFORMATION_STAGES: readonly StageDefinition[] = [
  {
    id: 'raw-matter',
    index: '01',
    label: 'Raw Matter',
    range: [0.0, 0.2],
    scrollTarget: 0.0,
    captionTitle: 'Dense Geological Ore',
    captionBody:
      'Unrefined mineral mass suspended at ambient equilibrium prior to thermal loading.',
    thermalBand: '24 °C — 420 °C',
  },
  {
    id: 'initial-dissolution',
    index: '02',
    label: 'Initial Dissolution',
    range: [0.2, 0.45],
    scrollTarget: 0.34,
    captionTitle: 'Thermal Fracture & Fissure Ignition',
    captionBody:
      'Controlled radiant flux penetrates structural seams, detaching mineral strata from the leading edge.',
    thermalBand: '850 °C — 1,180 °C',
  },
  {
    id: 'energy-release',
    index: '03',
    label: 'Energy Release',
    range: [0.45, 0.75],
    scrollTarget: 0.62,
    captionTitle: 'Peak Calcination & Phase Liberation',
    captionBody:
      'Extreme heat breaks molecular bonds as incandescent particles cascade and disperse under gravity.',
    thermalBand: '1,450 °C — 1,680 °C',
  },
  {
    id: 'transformation',
    index: '04',
    label: 'Transformation',
    range: [0.75, 1.0],
    scrollTarget: 0.96,
    captionTitle: 'Refined Crystalline Architecture',
    captionBody:
      'Settling thermal energy coalesces into a pure, sintered industrial mineral structure.',
    thermalBand: 'Sintered Equilibrium',
  },
] as const;

export interface StageEvaluation {
  stage: StageDefinition;
  stageIndex: number;
  localProgress: number;
  clampedProgress: number;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Deterministic PRNG (Mulberry32) so geometry and particle seeds
 * produce identical formations across runs and scroll directions.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Classifies normalized scroll progress [0..1] into one of the four
 * required transformation stages along with normalized local stage progress.
 */
export function getStageForProgress(progress: number): StageEvaluation {
  const clamped = clamp01(progress);
  for (let i = 0; i < TRANSFORMATION_STAGES.length; i++) {
    const stage = TRANSFORMATION_STAGES[i];
    const [start, end] = stage.range;
    const isLast = i === TRANSFORMATION_STAGES.length - 1;
    if (clamped >= start && (isLast ? clamped <= end : clamped < end)) {
      const localProgress = end > start ? clamp01((clamped - start) / (end - start)) : 1;
      return {
        stage,
        stageIndex: i,
        localProgress,
        clampedProgress: clamped,
      };
    }
  }
  const fallback = TRANSFORMATION_STAGES[TRANSFORMATION_STAGES.length - 1];
  return {
    stage: fallback,
    stageIndex: TRANSFORMATION_STAGES.length - 1,
    localProgress: 1,
    clampedProgress: clamped,
  };
}

/**
 * Computes the deterministic scroll threshold at which a rock surface point
 * detaches into the particle stream.
 *
 * normalizedX: -1 (left edge of rock) to +1 (right edge of rock)
 * normalizedY: -1 (bottom of rock) to +1 (top of rock)
 * organicNoise: 0..1 stable seeded procedural noise
 *
 * Right-most and lower-right edges dissolve first (~0.06..0.24) and the
 * dissolution wave sweeps organically leftward across the rock until ~0.84.
 */
export function computeDissolutionThreshold(
  normalizedX: number,
  normalizedY: number,
  organicNoise: number,
): number {
  const xRightToLeft = clamp01((1 - normalizedX) * 0.5); // 0 on right, 1 on left
  const lowerBias = clamp01((normalizedY + 1) * 0.5) * 0.14; // bottom-right goes slightly earlier
  const organicOffset = (clamp01(organicNoise) - 0.5) * 0.22;
  const raw = 0.06 + xRightToLeft * 0.66 + lowerBias + organicOffset;
  return Math.max(0.03, Math.min(0.84, raw));
}

export interface ParticleKinematicsInput {
  origin: [number, number, number];
  target: [number, number, number];
  threshold: number;
  progress: number;
  gravityScale: number;
  spreadX: number;
  spreadZ: number;
  swirlPhase: number;
  coalesceWeight: number; // 0 = falls away under gravity, 1 = settles into Stage 4 refined mineral structure
}

export interface ParticleKinematicsResult {
  position: [number, number, number];
  detached: number; // 0 = attached to rock, >0 = detached age
  heatGlow: number; // 0..1 peak glow during active fracture/energy release
  opacity: number;
}

/**
 * Pure TypeScript reference implementation of the GPU particle vertex kinematics.
 * Guarantees 100% deterministic, reversible motion driven strictly by `progress`.
 */
export function evaluateParticleKinematics(
  input: ParticleKinematicsInput,
): ParticleKinematicsResult {
  const p = clamp01(input.progress);
  const detachedAge = Math.max(0, (p - input.threshold) / Math.max(0.18, 1 - input.threshold));

  if (detachedAge <= 0) {
    return {
      position: [input.origin[0], input.origin[1], input.origin[2]],
      detached: 0,
      heatGlow: smoothstep(input.threshold - 0.12, input.threshold, p) * 0.85,
      opacity: 0,
    };
  }

  // Gravity-driven parabolic downward acceleration + curved lateral drift & turbulence
  const t = detachedAge;
  const gravityDrop = (1.65 * t + 4.8 * t * t) * input.gravityScale;
  const lateralDrift =
    (0.45 * t + 0.9 * t * t) * input.spreadX +
    Math.sin(t * 5.2 + input.swirlPhase) * 0.28 * t;
  const depthSpread =
    0.85 * t * input.spreadZ + Math.cos(t * 4.4 + input.swirlPhase * 1.3) * 0.24 * t;

  const fallX = input.origin[0] + lateralDrift;
  const fallY = input.origin[1] - gravityDrop;
  const fallZ = input.origin[2] + depthSpread;

  // Stage 4 (75%..100%): selected luminous & fine particles coalesce smoothly
  // into the refined sintered crystalline mineral formation
  const coalesceFactor =
    smoothstep(0.7, 0.97, p) * clamp01(input.coalesceWeight);

  const finalX = lerp(fallX, input.target[0], coalesceFactor);
  const finalY = lerp(fallY, input.target[1], coalesceFactor);
  const finalZ = lerp(fallZ, input.target[2], coalesceFactor);

  // Peak thermal glow shortly after detachment, fading smoothly unless part of refined lattice
  const emissionFlash = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.28, 0.92, t));
  const refinedGlow = coalesceFactor * 0.72;
  const heatGlow = clamp01(Math.max(emissionFlash, refinedGlow));

  // Fade in crisply upon detachment; falling debris fades gently at far bottom,
  // while coalescing particles remain luminous and balanced in Stage 4
  const appear = smoothstep(0.0, 0.05, t);
  const fallFade = 1.0 - smoothstep(0.72, 1.0, t) * (1.0 - coalesceFactor);
  const opacity = clamp01(appear * fallFade);

  return {
    position: [finalX, finalY, finalZ],
    detached: t,
    heatGlow,
    opacity,
  };
}

export interface CameraPose {
  position: [number, number, number];
  lookAt: [number, number, number];
  fov: number;
}

/**
 * Computes restrained, cinematic camera choreography across scroll progress [0..1]
 * with subtle pointer parallax and responsive framing for desktop vs mobile.
 */
export function computeCameraPose(
  progress: number,
  pointerX: number,
  pointerY: number,
  isMobile: boolean,
): CameraPose {
  const p = clamp01(progress);
  const px = Math.max(-1, Math.min(1, pointerX));
  const py = Math.max(-1, Math.min(1, pointerY));

  const parallaxStrength = isMobile ? 0.08 : 0.24;

  // Gentle zoom in during Stage 1-3, then calm balanced framing in Stage 4
  const zoomCurve = Math.sin(p * Math.PI * 0.78);
  const baseZ = isMobile ? 9.4 : 7.6;
  const z = baseZ - zoomCurve * (isMobile ? 1.0 : 1.35) + smoothstep(0.78, 1.0, p) * 0.45;

  // Subtle lateral glide & slight viewing-angle shift without jarring rotation
  const baseX = isMobile ? 0.0 : -0.85;
  const x = baseX + Math.sin(p * Math.PI * 0.85) * 0.52 + px * parallaxStrength;
  const baseY = isMobile ? 0.35 : 0.15;
  const y = baseY - p * 0.45 + py * (parallaxStrength * 0.65);

  const lookX = isMobile ? 0.0 : 0.95 - smoothstep(0.72, 1.0, p) * 0.25;
  const lookY = isMobile ? -0.35 : -0.18 - p * 0.38 + smoothstep(0.75, 1.0, p) * 0.22;
  const lookZ = 0;

  const fov = isMobile ? 44 : 38;

  return {
    position: [x, y, z],
    lookAt: [lookX, lookY, lookZ],
    fov,
  };
}

export interface MutableCameraPose {
  posX: number;
  posY: number;
  posZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  fov: number;
}

/**
 * Zero-allocation variant of computeCameraPose for the per-frame render loop.
 */
export function computeCameraPoseInto(
  progress: number,
  pointerX: number,
  pointerY: number,
  isMobile: boolean,
  out: MutableCameraPose,
): MutableCameraPose {
  const p = clamp01(progress);
  const px = Math.max(-1, Math.min(1, pointerX));
  const py = Math.max(-1, Math.min(1, pointerY));

  const parallaxStrength = isMobile ? 0.08 : 0.24;
  const zoomCurve = Math.sin(p * Math.PI * 0.78);
  const baseZ = isMobile ? 9.4 : 7.6;

  out.posX = (isMobile ? 0.0 : -0.85) + Math.sin(p * Math.PI * 0.85) * 0.52 + px * parallaxStrength;
  out.posY = (isMobile ? 0.35 : 0.15) - p * 0.45 + py * (parallaxStrength * 0.65);
  out.posZ = baseZ - zoomCurve * (isMobile ? 1.0 : 1.35) + smoothstep(0.78, 1.0, p) * 0.45;

  out.lookX = isMobile ? 0.0 : 0.95 - smoothstep(0.72, 1.0, p) * 0.25;
  out.lookY = isMobile ? -0.35 : -0.18 - p * 0.38 + smoothstep(0.75, 1.0, p) * 0.22;
  out.lookZ = 0;
  out.fov = isMobile ? 44 : 38;
  return out;
}

/**
 * Pure dirty-check used by RotaryKilnScene to avoid re-projecting 3D anchors
 * and triggering React setState when camera orbit and viewport dimensions are unchanged.
 */
export function hasCameraProjectionChanged(
  prevYaw: number,
  prevPitch: number,
  prevWidth: number,
  prevHeight: number,
  nextYaw: number,
  nextPitch: number,
  nextWidth: number,
  nextHeight: number,
  epsilon = 1e-4,
): boolean {
  if (!Number.isFinite(prevYaw) || !Number.isFinite(prevPitch)) return true;
  if (prevWidth !== nextWidth || prevHeight !== nextHeight) return true;
  return (
    Math.abs(prevYaw - nextYaw) > epsilon ||
    Math.abs(prevPitch - nextPitch) > epsilon
  );
}

export interface AdaptiveSceneBudgets {
  mineralParticleCount: number;
  amberDustCount: number;
  sparkCount: number;
  shardCount: number;
  rockDetailSubdivisions: number;
  enableBloom: boolean;
  pixelRatioCap: number;
  scrollDistanceVh: number;
}

/**
 * Computes device-adaptive budgets.
 * Note: `isSoftwareGl` adjusts ONLY rendering cost (bloom, pixelRatio),
 * never scene composition or particle counts, so software-rendered verification
 * matches the GPU user experience.
 */
export function getAdaptiveBudgets(options: {
  isMobile: boolean;
  isSoftwareGl: boolean;
  reducedMotion: boolean;
  hardwareConcurrency?: number;
}): AdaptiveSceneBudgets {
  const cores = options.hardwareConcurrency ?? 8;
  const isLowEnd = !options.isMobile && cores <= 4;

  if (options.isMobile) {
    return {
      mineralParticleCount: 2800,
      amberDustCount: 3200,
      sparkCount: 650,
      shardCount: 72,
      rockDetailSubdivisions: 4,
      enableBloom: false,
      pixelRatioCap: options.isSoftwareGl ? 1 : 1.5,
      scrollDistanceVh: 185,
    };
  }

  if (isLowEnd) {
    return {
      mineralParticleCount: 4500,
      amberDustCount: 5500,
      sparkCount: 1100,
      shardCount: 110,
      rockDetailSubdivisions: 5,
      enableBloom: !options.isSoftwareGl,
      pixelRatioCap: options.isSoftwareGl ? 1 : 1.5,
      scrollDistanceVh: 250,
    };
  }

  return {
    mineralParticleCount: 7200,
    amberDustCount: 9500,
    sparkCount: 1800,
    shardCount: 150,
    rockDetailSubdivisions: 5,
    enableBloom: !options.isSoftwareGl,
    pixelRatioCap: options.isSoftwareGl ? 1 : 2,
    scrollDistanceVh: 250,
  };
}

/**
 * Computes hero editorial headline opacity & vertical lift across scroll progress.
 * Keeps the headline fully readable through Stage 1 (0..20%), then glides it
 * out smoothly during early Stage 2 (20%..36%) so the particle cascade takes focus.
 */
export function computeHeroOverlayState(progress: number): {
  headlineOpacity: number;
  headlineTranslateY: number;
  stageCaptionOpacity: number;
  scrollIndicatorOpacity: number;
  nextSectionHandOff: number;
} {
  const p = clamp01(progress);
  const headlineFade = 1 - smoothstep(0.18, 0.36, p);
  const headlineTranslateY = -smoothstep(0.16, 0.38, p) * 34;
  const stageCaptionIn = smoothstep(0.24, 0.36, p);
  const stageCaptionOut = 1 - smoothstep(0.95, 1.0, p) * 0.25;
  const scrollIndicatorOpacity = 1 - smoothstep(0.03, 0.16, p);
  const nextSectionHandOff = smoothstep(0.84, 1.0, p);

  return {
    headlineOpacity: headlineFade,
    headlineTranslateY,
    stageCaptionOpacity: stageCaptionIn * stageCaptionOut,
    scrollIndicatorOpacity,
    nextSectionHandOff,
  };
}
