import * as THREE from 'three';
import { mulberry32 } from './dissolutionMath';

export interface ProceduralRockTextures {
  albedoMap: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  fissureMap: THREE.Texture;
  dispose: () => void;
}

export interface VolcanicPit {
  u: number;
  v: number;
  r: number;
  depth: number;
}

interface SharedBaseNoise {
  size: number;
  macro: Float32Array;
  strata: Float32Array;
  micro: Float32Array;
  grit: Float32Array;
  sharpFissure: Float32Array;
}

interface CachedTextureBytes {
  size: number;
  albedo: Uint8Array;
  normal: Uint8Array;
  roughness: Uint8Array;
  fissure: Uint8Array;
}

let cachedBaseNoise: SharedBaseNoise | null = null;
const cachedPixelBuffers = new Map<number, CachedTextureBytes>();

function hash2D(ix: number, iy: number, period: number, seed: number): number {
  let x = ix % period;
  if (x < 0) x += period;
  let y = iy % period;
  if (y < 0) y += period;
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function tileableValueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const a = hash2D(xi, yi, period, seed);
  const b = hash2D(xi + 1, yi, period, seed);
  const c = hash2D(xi, yi + 1, period, seed);
  const d = hash2D(xi + 1, yi + 1, period, seed);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function tileableFbm(u: number, v: number, basePeriod: number, octaves: number, seed: number): number {
  let value = 0;
  let amp = 0.5;
  let period = basePeriod;
  let norm = 0;

  for (let o = 0; o < octaves; o++) {
    value += tileableValueNoise(u * period, v * period, period, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return value / norm;
}

function tileableRidged(u: number, v: number, basePeriod: number, octaves: number, seed: number): number {
  let value = 0;
  let amp = 0.55;
  let period = basePeriod;
  let norm = 0;

  for (let o = 0; o < octaves; o++) {
    const n = tileableValueNoise(u * period, v * period, period, seed + o * 31);
    const ridge = 1 - Math.abs(n * 2 - 1);
    value += ridge * ridge * amp;
    norm += amp;
    amp *= 0.48;
    period *= 2;
  }
  return value / norm;
}

/**
 * Computes the tint-independent base geological noise fields once per texture resolution
 * so dark obsidian and warm ore texture sets share the exact same noise pass.
 */
function getSharedBaseNoise(size: number): SharedBaseNoise {
  if (cachedBaseNoise && cachedBaseNoise.size === size) {
    return cachedBaseNoise;
  }

  const total = size * size;
  const macro = new Float32Array(total);
  const strata = new Float32Array(total);
  const micro = new Float32Array(total);
  const grit = new Float32Array(total);
  const sharpFissure = new Float32Array(total);
  const invSize = 1 / size;

  for (let y = 0; y < size; y++) {
    const v = y * invSize;
    const rowOffset = y * size;
    for (let x = 0; x < size; x++) {
      const u = x * invSize;
      const pIdx = rowOffset + x;

      const m = tileableFbm(u, v, 4, 4, 11);
      const mi = tileableFbm(u, v, 18, 3, 73);
      const g = tileableValueNoise(u * 64, v * 64, 64, 307);
      const st = tileableFbm(u * 0.75 + m * 0.16, v * 2.6 + m * 0.24, 6, 3, 149);
      const crackField = tileableRidged(u + m * 0.08, v + mi * 0.05, 5, 4, 211);
      const sf = Math.pow(Math.max(0, (crackField - 0.7) / 0.3), 2.8);

      macro[pIdx] = m;
      micro[pIdx] = mi;
      grit[pIdx] = g;
      strata[pIdx] = st;
      sharpFissure[pIdx] = sf;
    }
  }

  cachedBaseNoise = { size, macro, strata, micro, grit, sharpFissure };
  return cachedBaseNoise;
}

/**
 * Lossless spatial bounding-box pit splatting with toroidal UV wrap-around.
 * Produces pixel-identical depression & rim fields to a brute-force per-pixel scan
 * while reducing inner loop iterations by ~100x.
 */
export function splatPitsToField(
  size: number,
  pits: readonly VolcanicPit[],
  outDepression: Float32Array,
  outRim: Float32Array,
): void {
  outDepression.fill(0);
  outRim.fill(0);

  const invSize = 1 / size;
  const halfSize = Math.floor(size * 0.5);

  for (let p = 0; p < pits.length; p++) {
    const pit = pits[p];
    const maxDist = pit.r * 1.25;
    const maxDistSq = maxDist * maxDist;
    const invR = 1 / pit.r;
    const pxRad = Math.min(halfSize, Math.ceil(maxDist * size) + 1);
    const cx = Math.round(pit.u * size);
    const cy = Math.round(pit.v * size);

    for (let dy = -pxRad; dy <= pxRad; dy++) {
      let y = (cy + dy) % size;
      if (y < 0) y += size;
      const v = y * invSize;
      let dv = Math.abs(v - pit.v);
      if (dv > 0.5) dv = 1 - dv;
      const dvSq = dv * dv;
      if (dvSq >= maxDistSq) continue;

      const rowOffset = y * size;
      for (let dx = -pxRad; dx <= pxRad; dx++) {
        let x = (cx + dx) % size;
        if (x < 0) x += size;
        const u = x * invSize;
        let du = Math.abs(u - pit.u);
        if (du > 0.5) du = 1 - du;
        const distSq = du * du + dvSq;
        if (distSq >= maxDistSq) continue;

        const dist = Math.sqrt(distSq);
        const nd = dist * invR;
        const idx = rowOffset + x;
        if (nd < 1.0) {
          const t = 1 - nd;
          const dep = t * t * pit.depth;
          if (dep > outDepression[idx]) outDepression[idx] = dep;
        } else {
          const rimT = 1 - Math.abs(nd - 1.1) / 0.18;
          if (rimT > 0) {
            const rim = rimT * 0.14 * pit.depth;
            if (rim > outRim[idx]) outRim[idx] = rim;
          }
        }
      }
    }
  }
}

function buildRockPixelBuffers(warmOreTint: number): CachedTextureBytes {
  const tintKey = Math.round(warmOreTint * 100);
  const existing = cachedPixelBuffers.get(tintKey);
  if (existing) return existing;

  const size = 512;
  const total = size * size;
  const base = getSharedBaseNoise(size);

  const albedo = new Uint8Array(total * 4);
  const normal = new Uint8Array(total * 4);
  const roughness = new Uint8Array(total * 4);
  const fissure = new Uint8Array(total * 4);
  const heights = new Float32Array(total);
  const pitDepressionField = new Float32Array(total);
  const pitRimField = new Float32Array(total);

  // Seed realistic volcanic micro-craters & pits matching the obsidian surface
  const rng = mulberry32(9021 + tintKey);
  const pitCount = 96;
  const pits: VolcanicPit[] = new Array(pitCount);
  for (let i = 0; i < pitCount; i++) {
    pits[i] = {
      u: rng(),
      v: rng(),
      r: 0.008 + Math.pow(rng(), 1.6) * 0.038,
      depth: 0.32 + rng() * 0.68,
    };
  }

  splatPitsToField(size, pits, pitDepressionField, pitRimField);

  const { macro, strata, micro, grit, sharpFissure } = base;

  for (let pIdx = 0; pIdx < total; pIdx++) {
    const idx = pIdx * 4;
    const m = macro[pIdx];
    const st = strata[pIdx];
    const mi = micro[pIdx];
    const g = grit[pIdx];
    const sf = sharpFissure[pIdx];
    const pitDepression = pitDepressionField[pIdx];
    const pitRim = pitRimField[pIdx];

    const heightVal = Math.max(
      0,
      Math.min(
        1,
        m * 0.44 +
          st * 0.24 +
          mi * 0.24 +
          g * 0.08 +
          pitRim -
          pitDepression * 0.48 -
          sf * 0.55,
      ),
    );
    heights[pIdx] = heightVal;

    // Dark volcanic obsidian / carbon-slate stone with cool cobalt-blue & silver mineral strata
    const baseLuma = 18 + heightVal * 44 + pitRim * 36 + (g - 0.5) * 14 - pitDepression * 18;
    const mineralVein =
      Math.max(0, (st - 0.48) * 1.9) * warmOreTint + sf * (0.25 + warmOreTint * 0.55);

    albedo[idx] = Math.min(255, Math.max(8, baseLuma * 0.92 + mineralVein * 28));
    albedo[idx + 1] = Math.min(255, Math.max(10, baseLuma * 0.99 + mineralVein * 72));
    albedo[idx + 2] = Math.min(255, Math.max(14, baseLuma * 1.12 + mineralVein * 148));
    albedo[idx + 3] = 255;

    // Roughness: polished vitreous obsidian ridges (0.24) vs rough matte volcanic cavities (0.94)
    const glossyRidge = Math.max(0, (heightVal - 0.5) * 2.0);
    const roughVal = Math.min(
      0.96,
      Math.max(0.22, 0.82 - glossyRidge * 0.52 + pitDepression * 0.28 + sf * 0.22),
    );
    const rByte = Math.round(roughVal * 255);
    roughness[idx] = rByte;
    roughness[idx + 1] = rByte;
    roughness[idx + 2] = rByte;
    roughness[idx + 3] = 255;

    // Crisp hairline emissive fissure mask
    const fissureMask = Math.min(
      1,
      sf * 1.45 + warmOreTint * Math.pow(Math.max(0, st - 0.68) * 2.2, 2.0),
    );
    const fByte = Math.round(fissureMask * 255);
    fissure[idx] = fByte;
    fissure[idx + 1] = Math.round(fByte * 0.5);
    fissure[idx + 2] = Math.round(fByte * 0.14);
    fissure[idx + 3] = 255;
  }

  // Convert heightfield to sharp tangent-space normal map via Sobel filter
  const normalStrength = 4.6;
  const mask = size - 1; // size is 512 (power of 2)

  for (let y = 0; y < size; y++) {
    const ym1 = ((y - 1) & mask) * size;
    const y0 = y * size;
    const yp1 = ((y + 1) & mask) * size;

    for (let x = 0; x < size; x++) {
      const xm1 = (x - 1) & mask;
      const xp1 = (x + 1) & mask;

      const tl = heights[ym1 + xm1];
      const t = heights[ym1 + x];
      const tr = heights[ym1 + xp1];
      const l = heights[y0 + xm1];
      const r = heights[y0 + xp1];
      const bl = heights[yp1 + xm1];
      const b = heights[yp1 + x];
      const br = heights[yp1 + xp1];

      const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);

      let nx = -dX * normalStrength;
      let ny = -dY * normalStrength;
      let nz = 1.0;
      const invLen = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y0 + x) * 4;
      normal[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[idx + 3] = 255;
    }
  }

  const buffers: CachedTextureBytes = { size, albedo, normal, roughness, fissure };
  cachedPixelBuffers.set(tintKey, buffers);
  return buffers;
}

/**
 * Generates high-detail 512x512 volcanic obsidian & basalt procedural PBR textures
 * backed by cached direct-upload DataTextures (zero 2D canvas readbacks, instant remounts):
 * - SRGB albedoMap (dark obsidian, vitreous slate highlights, mineral strata)
 * - Linear tangent-space normalMap computed via Sobel gradient from pitted basalt heightfield
 * - Linear roughnessMap (glossy obsidian cleavage vs matte volcanic craters)
 * - Linear fissureMap (deep hairline fracture network for molten internal glow)
 */
export function createRockTextures(maxAnisotropy: number, warmOreTint = 0): ProceduralRockTextures {
  const buffers = buildRockPixelBuffers(warmOreTint);
  const { size } = buffers;
  const anisotropy = Math.min(8, maxAnisotropy);

  const configureDataTex = (data: Uint8Array, isColor: boolean): THREE.DataTexture => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.4, 2.4);
    tex.flipY = true;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = anisotropy;
    tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  const albedoMap = configureDataTex(buffers.albedo, true);
  const normalMap = configureDataTex(buffers.normal, false);
  const roughnessMap = configureDataTex(buffers.roughness, false);
  const fissureMap = configureDataTex(buffers.fissure, false);

  return {
    albedoMap,
    normalMap,
    roughnessMap,
    fissureMap,
    dispose: () => {
      albedoMap.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
      fissureMap.dispose();
    },
  };
}
