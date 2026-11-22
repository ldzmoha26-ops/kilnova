import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCameraPose,
  computeCameraPoseInto,
  hasCameraProjectionChanged,
  mulberry32,
  type MutableCameraPose,
} from './dissolutionMath';
import { splatPitsToField, type VolcanicPit } from './proceduralTextures';
import {
  buildCompositeRockParts,
  createRockSurfaceSampler,
  glslFbm3,
  sampleRockSurfaceParticlesFromSampler,
} from './rockGeometry';

test('splatPitsToField matches brute-force toroidal pit scan pixel-for-pixel', () => {
  const size = 64;
  const rng = mulberry32(9021);
  const pits: VolcanicPit[] = [
    // Explicit edge-wrapping pits across u=0/1 and v=0/1 seams
    { u: 0.01, v: 0.02, r: 0.04, depth: 0.75 },
    { u: 0.99, v: 0.98, r: 0.035, depth: 0.62 },
  ];
  for (let i = 0; i < 24; i++) {
    pits.push({
      u: rng(),
      v: rng(),
      r: 0.008 + Math.pow(rng(), 1.6) * 0.038,
      depth: 0.32 + rng() * 0.68,
    });
  }

  const fastDep = new Float32Array(size * size);
  const fastRim = new Float32Array(size * size);
  splatPitsToField(size, pits, fastDep, fastRim);

  // Reference brute-force per-pixel scan
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let refDep = 0;
      let refRim = 0;
      for (let p = 0; p < pits.length; p++) {
        const pit = pits[p];
        let du = Math.abs(u - pit.u);
        let dv = Math.abs(v - pit.v);
        if (du > 0.5) du = 1 - du;
        if (dv > 0.5) dv = 1 - dv;
        const dist = Math.sqrt(du * du + dv * dv);
        if (dist < pit.r * 1.25) {
          const nd = dist / pit.r;
          if (nd < 1.0) {
            const t = 1 - nd;
            refDep = Math.max(refDep, t * t * pit.depth);
          } else {
            const rimT = 1 - Math.abs(nd - 1.1) / 0.18;
            if (rimT > 0) refRim = Math.max(refRim, rimT * 0.14 * pit.depth);
          }
        }
      }
      const idx = y * size + x;
      assert.ok(
        Math.abs(fastDep[idx] - refDep) < 1e-6,
        `Depression mismatch at (${x},${y}): ${fastDep[idx]} vs ${refDep}`,
      );
      assert.ok(
        Math.abs(fastRim[idx] - refRim) < 1e-6,
        `Rim mismatch at (${x},${y}): ${fastRim[idx]} vs ${refRim}`,
      );
    }
  }
});

test('computeCameraPoseInto matches computeCameraPose identically with zero allocation', () => {
  const scratch: MutableCameraPose = {
    posX: 0,
    posY: 0,
    posZ: 0,
    lookX: 0,
    lookY: 0,
    lookZ: 0,
    fov: 38,
  };

  for (const isMobile of [false, true]) {
    for (const p of [0, 0.25, 0.58, 0.88, 1.0]) {
      const ref = computeCameraPose(p, 0.42, -0.31, isMobile);
      computeCameraPoseInto(p, 0.42, -0.31, isMobile, scratch);
      assert.equal(scratch.posX, ref.position[0]);
      assert.equal(scratch.posY, ref.position[1]);
      assert.equal(scratch.posZ, ref.position[2]);
      assert.equal(scratch.lookX, ref.lookAt[0]);
      assert.equal(scratch.lookY, ref.lookAt[1]);
      assert.equal(scratch.lookZ, ref.lookAt[2]);
      assert.equal(scratch.fov, ref.fov);
    }
  }
});

test('hasCameraProjectionChanged suppresses idle updates and triggers on orbit or resize', () => {
  assert.equal(hasCameraProjectionChanged(Number.NaN, Number.NaN, 0, 0, -0.32, 0.28, 720, 400), true);
  assert.equal(hasCameraProjectionChanged(-0.32, 0.28, 720, 400, -0.32, 0.28, 720, 400), false);
  assert.equal(hasCameraProjectionChanged(-0.32, 0.28, 720, 400, -0.32005, 0.28, 720, 400), false);
  assert.equal(hasCameraProjectionChanged(-0.32, 0.28, 720, 400, -0.319, 0.28, 720, 400), true);
  assert.equal(hasCameraProjectionChanged(-0.32, 0.28, 720, 400, -0.32, 0.28, 800, 400), true);
});

test('buildCompositeRockParts bakes dissolution vertex attributes and sampler is deterministic', () => {
  const parts = buildCompositeRockParts(5);
  assert.equal(parts.length, 5);

  for (const part of parts) {
    const dissolveAttr = part.geometry.attributes.aDissolveVert;
    const organicAttr = part.geometry.attributes.aOrganicNoise;
    assert.ok(dissolveAttr && dissolveAttr.itemSize === 4, `Missing aDissolveVert on ${part.name}`);
    assert.ok(organicAttr && organicAttr.itemSize === 1, `Missing aOrganicNoise on ${part.name}`);
    assert.equal(dissolveAttr.count, part.geometry.attributes.position.count);
    assert.ok(Number.isFinite(dissolveAttr.getX(0)));
    assert.ok(organicAttr.getX(0) >= 0 && organicAttr.getX(0) <= 1);
  }

  const sampler = createRockSurfaceSampler(parts);
  assert.ok(sampler.triCount > 1000);
  assert.equal(sampler.cdf[sampler.triCount - 1], 1);

  const sampleA = sampleRockSurfaceParticlesFromSampler(sampler, 128, 3001, 0.24);
  const sampleB = sampleRockSurfaceParticlesFromSampler(sampler, 128, 3001, 0.24);
  assert.deepEqual(sampleA.origins, sampleB.origins);
  assert.deepEqual(sampleA.thresholds, sampleB.thresholds);
  assert.deepEqual(sampleA.targets, sampleB.targets);

  const n = glslFbm3(0.4, -0.7, 1.2);
  assert.ok(Number.isFinite(n) && n >= 0 && n <= 1);

  for (const part of parts) part.geometry.dispose();
});
