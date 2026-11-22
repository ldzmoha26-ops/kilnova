import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCameraPose,
  computeDissolutionThreshold,
  computeHeroOverlayState,
  evaluateParticleKinematics,
  getAdaptiveBudgets,
  getStageForProgress,
  mulberry32,
} from './dissolutionMath';

test('getStageForProgress classifies all four required scroll stages accurately', () => {
  assert.equal(getStageForProgress(0).stage.id, 'raw-matter');
  assert.equal(getStageForProgress(0.19).stage.id, 'raw-matter');
  assert.equal(getStageForProgress(0.2).stage.id, 'initial-dissolution');
  assert.equal(getStageForProgress(0.44).stage.id, 'initial-dissolution');
  assert.equal(getStageForProgress(0.45).stage.id, 'energy-release');
  assert.equal(getStageForProgress(0.74).stage.id, 'energy-release');
  assert.equal(getStageForProgress(0.75).stage.id, 'transformation');
  assert.equal(getStageForProgress(1.0).stage.id, 'transformation');
});

test('dissolution threshold progresses organically from right edge to left edge', () => {
  const rightEdge = computeDissolutionThreshold(0.9, -0.4, 0.5);
  const center = computeDissolutionThreshold(0.0, 0.0, 0.5);
  const leftEdge = computeDissolutionThreshold(-0.9, 0.4, 0.5);

  assert.ok(rightEdge < center, `Expected right (${rightEdge}) < center (${center})`);
  assert.ok(center < leftEdge, `Expected center (${center}) < left (${leftEdge})`);
  assert.ok(rightEdge >= 0.03 && leftEdge <= 0.84);
});

test('particle kinematics are strictly deterministic and reversible on backward scroll', () => {
  const baseParams = {
    origin: [1.8, 0.6, 0.2] as [number, number, number],
    target: [0.9, 0.1, 0.0] as [number, number, number],
    threshold: 0.22,
    gravityScale: 1.0,
    spreadX: 0.6,
    spreadZ: -0.4,
    swirlPhase: 1.7,
    coalesceWeight: 0.0,
  };

  const forwardAt60 = evaluateParticleKinematics({ ...baseParams, progress: 0.6 });
  const scrolledBackAt15 = evaluateParticleKinematics({ ...baseParams, progress: 0.15 });
  const returnedTo60 = evaluateParticleKinematics({ ...baseParams, progress: 0.6 });

  assert.deepEqual(forwardAt60, returnedTo60);
  assert.equal(scrolledBackAt15.detached, 0);
  assert.deepEqual(scrolledBackAt15.position, baseParams.origin);
});

test('detached particles fall downward under gravity as scroll progress increases', () => {
  const baseParams = {
    origin: [2.0, 1.0, 0.0] as [number, number, number],
    target: [0.5, 0.0, 0.0] as [number, number, number],
    threshold: 0.15,
    gravityScale: 1.2,
    spreadX: 0.3,
    spreadZ: 0.2,
    swirlPhase: 0.4,
    coalesceWeight: 0.0,
  };

  const early = evaluateParticleKinematics({ ...baseParams, progress: 0.25 });
  const mid = evaluateParticleKinematics({ ...baseParams, progress: 0.55 });
  const late = evaluateParticleKinematics({ ...baseParams, progress: 0.85 });

  assert.ok(early.position[1] < baseParams.origin[1], 'Particles must fall below origin');
  assert.ok(mid.position[1] < early.position[1], 'Mid scroll must fall further than early');
  assert.ok(late.position[1] < mid.position[1], 'Late scroll must fall further than mid');
});

test('coalescing particles converge into Stage 4 refined structure at progress = 1', () => {
  const target: [number, number, number] = [0.75, 0.25, -0.15];
  const result = evaluateParticleKinematics({
    origin: [2.1, 0.9, 0.4],
    target,
    threshold: 0.2,
    progress: 1.0,
    gravityScale: 1.0,
    spreadX: 0.5,
    spreadZ: 0.2,
    swirlPhase: 2.1,
    coalesceWeight: 1.0,
  });

  assert.ok(Math.abs(result.position[0] - target[0]) < 1e-5);
  assert.ok(Math.abs(result.position[1] - target[1]) < 1e-5);
  assert.ok(Math.abs(result.position[2] - target[2]) < 1e-5);
  assert.ok(result.opacity > 0.5);
});

test('camera choreography zooms closer during dissolution and respects bounds', () => {
  const start = computeCameraPose(0, 0, 0, false);
  const peak = computeCameraPose(0.6, 0, 0, false);
  const mobile = computeCameraPose(0, 0, 0, true);

  assert.ok(peak.position[2] < start.position[2], 'Camera should glide closer during dissolution');
  assert.ok(mobile.position[2] > start.position[2], 'Mobile camera should pull back for vertical framing');
});

test('hero headline stays fully visible in Stage 1 and fades smoothly in Stage 2', () => {
  const stage1 = computeHeroOverlayState(0.12);
  const midStage2 = computeHeroOverlayState(0.32);
  const stage3 = computeHeroOverlayState(0.55);

  assert.equal(stage1.headlineOpacity, 1);
  assert.ok(midStage2.headlineOpacity > 0 && midStage2.headlineOpacity < 1);
  assert.equal(stage3.headlineOpacity, 0);
  assert.ok(stage3.stageCaptionOpacity > 0.8);
});

test('adaptive budgets reduce mobile load while keeping software-GL particle counts identical to GPU', () => {
  const desktopGpu = getAdaptiveBudgets({
    isMobile: false,
    isSoftwareGl: false,
    reducedMotion: false,
    hardwareConcurrency: 8,
  });
  const desktopSw = getAdaptiveBudgets({
    isMobile: false,
    isSoftwareGl: true,
    reducedMotion: false,
    hardwareConcurrency: 8,
  });
  const mobile = getAdaptiveBudgets({
    isMobile: true,
    isSoftwareGl: false,
    reducedMotion: false,
    hardwareConcurrency: 4,
  });

  assert.equal(desktopGpu.amberDustCount, desktopSw.amberDustCount);
  assert.equal(desktopGpu.mineralParticleCount, desktopSw.mineralParticleCount);
  assert.equal(desktopGpu.enableBloom, true);
  assert.equal(desktopSw.enableBloom, false);
  assert.ok(mobile.amberDustCount < desktopGpu.amberDustCount);
  assert.ok(mobile.scrollDistanceVh < desktopGpu.scrollDistanceVh);
});

test('mulberry32 deterministic PRNG produces repeatable sequences', () => {
  const a = mulberry32(4219);
  const b = mulberry32(4219);
  for (let i = 0; i < 10; i++) {
    assert.equal(a(), b());
  }
});
