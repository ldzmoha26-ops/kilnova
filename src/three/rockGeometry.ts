import * as THREE from 'three';
import { computeDissolutionThreshold, mulberry32 } from './dissolutionMath';

function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let n =
    Math.imul(ix, 374761393) +
    Math.imul(iy, 668265263) +
    Math.imul(iz, 2147483647) +
    Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise3D(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash3(ix, iy, iz, seed);
  const n100 = hash3(ix + 1, iy, iz, seed);
  const n010 = hash3(ix, iy + 1, iz, seed);
  const n110 = hash3(ix + 1, iy + 1, iz, seed);
  const n001 = hash3(ix, iy, iz + 1, seed);
  const n101 = hash3(ix + 1, iy, iz + 1, seed);
  const n011 = hash3(ix, iy + 1, iz + 1, seed);
  const n111 = hash3(ix + 1, iy + 1, iz + 1, seed);

  const nx00 = n000 + (n100 - n000) * ux;
  const nx10 = n010 + (n110 - n010) * ux;
  const nx01 = n001 + (n101 - n001) * ux;
  const nx11 = n011 + (n111 - n011) * ux;

  const nxy0 = nx00 + (nx10 - nx00) * uy;
  const nxy1 = nx01 + (nx11 - nx01) * uy;

  return nxy0 + (nxy1 - nxy0) * uz;
}

export function fbm3D(x: number, y: number, z: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise3D(x * freq, y * freq, z * freq, seed + i * 29) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.04;
  }
  return sum / norm;
}

function ridged3D(x: number, y: number, z: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 0.55;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = noise3D(x * freq, y * freq, z * freq, seed + i * 43);
    const r = 1 - Math.abs(n * 2 - 1);
    sum += r * r * amp;
    norm += amp;
    amp *= 0.48;
    freq *= 2.15;
  }
  return sum / norm;
}

/**
 * Exact CPU port of the GLSL hash31 / noise3d / fbm3 functions used by the rock
 * dissolution shader so low-frequency organic noise and dissolution thresholds can
 * be baked once per vertex instead of recomputed per vertex & per fragment every frame.
 */
function glslFract(x: number): number {
  return x - Math.floor(x);
}

function glslHash31(px: number, py: number, pz: number): number {
  let x = glslFract(px * 0.1031);
  let y = glslFract(py * 0.1031);
  let z = glslFract(pz * 0.1031);
  const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
  x += d;
  y += d;
  z += d;
  return glslFract((x + y) * z);
}

function glslNoise3d(px: number, py: number, pz: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const iz = Math.floor(pz);
  let fx = px - ix;
  let fy = py - iy;
  let fz = pz - iz;
  fx = fx * fx * (3.0 - 2.0 * fx);
  fy = fy * fy * (3.0 - 2.0 * fy);
  fz = fz * fz * (3.0 - 2.0 * fz);

  const n000 = glslHash31(ix, iy, iz);
  const n100 = glslHash31(ix + 1, iy, iz);
  const n010 = glslHash31(ix, iy + 1, iz);
  const n110 = glslHash31(ix + 1, iy + 1, iz);
  const n001 = glslHash31(ix, iy, iz + 1);
  const n101 = glslHash31(ix + 1, iy, iz + 1);
  const n011 = glslHash31(ix, iy + 1, iz + 1);
  const n111 = glslHash31(ix + 1, iy + 1, iz + 1);

  const nx00 = n000 + (n100 - n000) * fx;
  const nx10 = n010 + (n110 - n010) * fx;
  const nx01 = n001 + (n101 - n001) * fx;
  const nx11 = n011 + (n111 - n011) * fx;

  const nxy0 = nx00 + (nx10 - nx00) * fy;
  const nxy1 = nx01 + (nx11 - nx01) * fy;

  return nxy0 + (nxy1 - nxy0) * fz;
}

export function glslFbm3(px: number, py: number, pz: number): number {
  let value = 0.0;
  let amp = 0.5;
  let x = px;
  let y = py;
  let z = pz;
  for (let i = 0; i < 3; i++) {
    value += glslNoise3d(x, y, z) * amp;
    x *= 2.06;
    y *= 2.06;
    z *= 2.06;
    amp *= 0.5;
  }
  return value;
}

export interface RockLobeSpec {
  name: string;
  scale: [number, number, number];
  offset: [number, number, number];
  rotation: [number, number, number];
  seed: number;
  cragStrength: number;
  facetStrength: number;
  widthSegments: number;
  heightSegments: number;
  warmOreTint: number;
  roughness: number;
  metalness: number;
}

const CLEAVAGE_PLANES = [
  new THREE.Vector3(0.45, 0.78, 0.42).normalize(),
  new THREE.Vector3(-0.62, 0.35, 0.7).normalize(),
  new THREE.Vector3(0.82, -0.44, -0.35).normalize(),
  new THREE.Vector3(-0.32, -0.86, 0.38).normalize(),
  new THREE.Vector3(0.22, -0.58, 0.78).normalize(),
] as const;

const _axisY = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);

const OCTAHEDRON_VERTS: readonly [number, number, number][] = [
  [1.28, 0, 0],
  [-1.28, 0, 0],
  [0, 1.82, 0],
  [0, -1.82, 0],
  [0, 0, 1.18],
  [0, 0, -1.18],
];

const OCTAHEDRON_EDGE_PAIRS: readonly [number, number][] = [
  [0, 2], [0, 3], [0, 4], [0, 5],
  [1, 2], [1, 3], [1, 4], [1, 5],
  [2, 4], [2, 5], [3, 4], [3, 5],
];

/**
 * Sculpted indexed smooth-normal geological crag geometry.
 * Uses an indexed high-resolution base mesh (so adjacent triangles share vertices
 * and compute smooth, photorealistic normals with zero flat low-poly faceting),
 * sculpted with ridged fractures, terraced cleavage planes, and concave volcanic craters.
 */
function buildSculptedCragGeometry(spec: RockLobeSpec): THREE.BufferGeometry {
  const geom = new THREE.SphereGeometry(1, spec.widthSegments, spec.heightSegments);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const posArr = pos.array as Float32Array;
  const count = pos.count;

  // Deterministic volcanic crater indentations matching pitted stone
  const rng = mulberry32(spec.seed + 503);
  const craterX = new Float32Array(18);
  const craterY = new Float32Array(18);
  const craterZ = new Float32Array(18);
  const craterR = new Float32Array(18);
  const craterRSq = new Float32Array(18);
  const craterDepth = new Float32Array(18);

  for (let i = 0; i < 18; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const sinPhi = Math.sin(phi);
    craterX[i] = sinPhi * Math.cos(theta);
    craterY[i] = Math.cos(phi);
    craterZ[i] = sinPhi * Math.sin(theta);
    const r = 0.14 + rng() * 0.24;
    craterR[i] = r;
    craterRSq[i] = r * r;
    craterDepth[i] = 0.06 + rng() * 0.12;
  }

  const sx = spec.scale[0];
  const sy = spec.scale[1];
  const sz = spec.scale[2];

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const vx = posArr[i3];
    const vy = posArr[i3 + 1];
    const vz = posArr[i3 + 2];
    const invLen = 1 / (Math.sqrt(vx * vx + vy * vy + vz * vz) || 1);
    const dx = vx * invLen;
    const dy = vy * invLen;
    const dz = vz * invLen;

    const macro = fbm3D(dx * 1.45, dy * 1.45, dz * 1.45, spec.seed, 4);
    const ridge = ridged3D(dx * 2.25, dy * 2.25, dz * 2.25, spec.seed + 77, 3);
    const fine = fbm3D(dx * 5.8, dy * 5.8, dz * 5.8, spec.seed + 181, 3);

    const bedding = Math.sin((dy * 4.5 + dx * 2.1 + macro * 1.5) * Math.PI) * 0.048;

    let facetCut = 0;
    for (let c = 0; c < CLEAVAGE_PLANES.length; c++) {
      const cp = CLEAVAGE_PLANES[c];
      const d = dx * cp.x + dy * cp.y + dz * cp.z;
      if (d > 0.54) {
        const excess = d - 0.54;
        facetCut += excess * excess * 1.65 * spec.facetStrength;
      }
    }

    let craterIndent = 0;
    for (let k = 0; k < 18; k++) {
      const ex = dx - craterX[k];
      const ey = dy - craterY[k];
      const ez = dz - craterZ[k];
      const distSq = ex * ex + ey * ey + ez * ez;
      if (distSq < craterRSq[k]) {
        const t = 1 - Math.sqrt(distSq) / craterR[k];
        const indent = t * t * craterDepth[k];
        if (indent > craterIndent) craterIndent = indent;
      }
    }

    const radius = Math.max(
      0.46,
      0.88 +
        (macro - 0.5) * 0.44 * spec.cragStrength +
        (ridge - 0.44) * 0.28 * spec.cragStrength +
        (fine - 0.5) * 0.085 +
        bedding -
        facetCut -
        craterIndent,
    );

    let ox = dx * radius * sx;
    let oy = dy * radius * sy;
    let oz = dz * radius * sz;

    if (oy < -0.18 && ox > 0.05) {
      oy += Math.sin(ox * 2.2) * 0.1;
      oz *= 0.88;
    }

    posArr[i3] = ox;
    posArr[i3 + 1] = oy;
    posArr[i3 + 2] = oz;
  }

  pos.needsUpdate = true;

  const euler = new THREE.Euler(spec.rotation[0], spec.rotation[1], spec.rotation[2]);
  const mat = new THREE.Matrix4().compose(
    new THREE.Vector3(spec.offset[0], spec.offset[1], spec.offset[2]),
    new THREE.Quaternion().setFromEuler(euler),
    new THREE.Vector3(1, 1, 1),
  );
  geom.applyMatrix4(mat);
  geom.computeVertexNormals();
  return geom;
}

export interface BuiltRockPart {
  name: string;
  geometry: THREE.BufferGeometry;
  warmOreTint: number;
  roughness: number;
  metalness: number;
  isCore?: boolean;
}

interface CachedRockPartBuffers {
  name: string;
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  index: Uint16Array | Uint32Array | null;
  dissolveVert: Float32Array;
  organicNoise: Float32Array;
  warmOreTint: number;
  roughness: number;
  metalness: number;
  isCore: boolean;
}

const cachedRockPartsByDetail = new Map<boolean, CachedRockPartBuffers[]>();

function instantiateGeometryFromCache(cached: CachedRockPartBuffers): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(cached.position, 3));
  geom.setAttribute('normal', new THREE.BufferAttribute(cached.normal, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(cached.uv, 2));
  geom.setAttribute('aDissolveVert', new THREE.BufferAttribute(cached.dissolveVert, 4));
  geom.setAttribute('aOrganicNoise', new THREE.BufferAttribute(cached.organicNoise, 1));
  if (cached.index) {
    geom.setIndex(new THREE.BufferAttribute(cached.index, 1));
  }
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Constructs a 5-part interlocking volcanic obsidian & amber-veined geological monolith
 * matching the overhanging, pitted dark boulder silhouette.
 * Bakes static dissolution metadata (`aDissolveVert` and `aOrganicNoise`) onto vertices
 * and caches CPU typed arrays for near-instant remounts.
 */
export function buildCompositeRockParts(detailSubdivisions: number): BuiltRockPart[] {
  const highRes = detailSubdivisions >= 5;
  const cachedList = cachedRockPartsByDetail.get(highRes);
  if (cachedList) {
    return cachedList.map((entry) => ({
      name: entry.name,
      geometry: instantiateGeometryFromCache(entry),
      warmOreTint: entry.warmOreTint,
      roughness: entry.roughness,
      metalness: entry.metalness,
      isCore: entry.isCore,
    }));
  }

  const wMain = highRes ? 64 : 48;
  const hMain = highRes ? 48 : 36;
  const wSub = highRes ? 48 : 36;
  const hSub = highRes ? 36 : 28;

  const specs: RockLobeSpec[] = [
    {
      name: 'primary-basalt-monolith',
      scale: [2.15, 1.38, 1.48],
      offset: [-0.22, 0.28, 0.0],
      rotation: [0.18, -0.24, 0.24],
      seed: 101,
      cragStrength: 1.12,
      facetStrength: 0.65,
      widthSegments: wMain,
      heightSegments: hMain,
      warmOreTint: 0.08,
      roughness: 0.56,
      metalness: 0.18,
    },
    {
      name: 'upper-obsidian-ridge',
      scale: [1.52, 0.98, 1.24],
      offset: [-0.95, 0.65, 0.34],
      rotation: [0.32, 0.14, 0.34],
      seed: 207,
      cragStrength: 1.18,
      facetStrength: 0.72,
      widthSegments: wSub,
      heightSegments: hSub,
      warmOreTint: 0.02,
      roughness: 0.34,
      metalness: 0.28,
    },
    {
      name: 'fractured-right-flank',
      scale: [1.48, 1.06, 1.18],
      offset: [1.14, 0.34, -0.06],
      rotation: [-0.14, 0.38, -0.2],
      seed: 313,
      cragStrength: 1.14,
      facetStrength: 0.68,
      widthSegments: wSub,
      heightSegments: hSub,
      warmOreTint: 0.76,
      roughness: 0.74,
      metalness: 0.14,
    },
    {
      name: 'lower-amber-strata-lobe',
      scale: [1.4, 0.82, 1.08],
      offset: [0.64, -0.54, 0.24],
      rotation: [0.12, -0.32, 0.16],
      seed: 419,
      cragStrength: 1.05,
      facetStrength: 0.62,
      widthSegments: wSub,
      heightSegments: hSub,
      warmOreTint: 0.92,
      roughness: 0.68,
      metalness: 0.22,
    },
    {
      name: 'molten-fissure-core',
      scale: [1.28, 0.76, 0.88],
      offset: [0.18, -0.08, -0.04],
      rotation: [0.08, 0.1, 0.14],
      seed: 523,
      cragStrength: 0.92,
      facetStrength: 0.48,
      widthSegments: 32,
      heightSegments: 24,
      warmOreTint: 1.0,
      roughness: 0.46,
      metalness: 0.34,
    },
  ];

  const rawGeoms = specs.map((spec) => buildSculptedCragGeometry(spec));

  // Global rock bounds across all 5 interlocking lobes for coherent right-to-left sweep
  const globalBox = new THREE.Box3();
  for (const geom of rawGeoms) {
    geom.computeBoundingBox();
    if (geom.boundingBox) globalBox.union(geom.boundingBox);
  }
  const minX = globalBox.min.x;
  const minY = globalBox.min.y;
  const invSizeX = 1 / Math.max(0.001, globalBox.max.x - globalBox.min.x);
  const invSizeY = 1 / Math.max(0.001, globalBox.max.y - globalBox.min.y);

  const builtCache: CachedRockPartBuffers[] = specs.map((spec, idx) => {
    const geom = rawGeoms[idx];
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const posArr = pos.array as Float32Array;
    const vCount = pos.count;

    const dissolveVert = new Float32Array(vCount * 4);
    const organicNoise = new Float32Array(vCount);

    for (let i = 0; i < vCount; i++) {
      const i3 = i * 3;
      const x = posArr[i3];
      const y = posArr[i3 + 1];
      const z = posArr[i3 + 2];

      const normX = Math.max(-1, Math.min(1, (x - minX) * invSizeX * 2.0 - 1.0));
      const normY = Math.max(-1, Math.min(1, (y - minY) * invSizeY * 2.0 - 1.0));
      const nDisp = glslFbm3(x * 1.15, y * 1.15, z * 1.15);
      const thresh = Math.max(
        0.03,
        Math.min(0.76, 0.05 + (1.0 - normX) * 0.3 + (normY + 1.0) * 0.06 + (nDisp - 0.5) * 0.2),
      );

      const i4 = i * 4;
      dissolveVert[i4] = normX;
      dissolveVert[i4 + 1] = normY;
      dissolveVert[i4 + 2] = nDisp;
      dissolveVert[i4 + 3] = thresh;
      organicNoise[i] = glslFbm3(x * 1.3, y * 1.3, z * 1.3);
    }

    const entry: CachedRockPartBuffers = {
      name: spec.name,
      position: posArr,
      normal: (geom.attributes.normal as THREE.BufferAttribute).array as Float32Array,
      uv: (geom.attributes.uv as THREE.BufferAttribute).array as Float32Array,
      index: geom.index ? (geom.index.array as Uint16Array | Uint32Array) : null,
      dissolveVert,
      organicNoise,
      warmOreTint: spec.warmOreTint,
      roughness: spec.roughness,
      metalness: spec.metalness,
      isCore: idx === 4,
    };

    geom.dispose();
    return entry;
  });

  cachedRockPartsByDetail.set(highRes, builtCache);

  return builtCache.map((entry) => ({
    name: entry.name,
    geometry: instantiateGeometryFromCache(entry),
    warmOreTint: entry.warmOreTint,
    roughness: entry.roughness,
    metalness: entry.metalness,
    isCore: entry.isCore,
  }));
}

export interface SampledSurfaceParticles {
  origins: Float32Array;
  normals: Float32Array;
  thresholds: Float32Array;
  randoms: Float32Array; // vec4: size, gravityScale, spreadX, swirlPhase
  extras: Float32Array; // vec4: spreadZ, coalesceWeight, colorVariant, ambientFloat
  targets: Float32Array;
}

/**
 * Flat typed-array triangle area CDF built once across all rock lobes
 * and reused across all 4 particle/shard layers with zero Vector3 allocations.
 */
export interface RockSurfaceSampler {
  triCount: number;
  triA: Float32Array;
  triB: Float32Array;
  triC: Float32Array;
  triNormal: Float32Array;
  triWarmth: Float32Array;
  cdf: Float32Array;
  centerX: number;
  centerY: number;
  invHalfSizeX: number;
  invHalfSizeY: number;
}

export function createRockSurfaceSampler(parts: readonly BuiltRockPart[]): RockSurfaceSampler {
  let maxTris = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let p = 0; p < parts.length; p++) {
    const geom = parts[p].geometry;
    const pos = geom.attributes.position as THREE.BufferAttribute;
    const posArr = pos.array as Float32Array;
    const index = geom.index;
    maxTris += index ? (index.count / 3) | 0 : (pos.count / 3) | 0;

    for (let i = 0; i < posArr.length; i += 3) {
      const x = posArr[i];
      const y = posArr[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const triA = new Float32Array(maxTris * 3);
  const triB = new Float32Array(maxTris * 3);
  const triC = new Float32Array(maxTris * 3);
  const triNormal = new Float32Array(maxTris * 3);
  const triWarmth = new Float32Array(maxTris);
  const areas = new Float32Array(maxTris);

  let validCount = 0;
  let totalArea = 0;

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    const geom = part.geometry;
    const posArr = (geom.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const indexArr = geom.index ? geom.index.array : null;
    const partTriCount = indexArr ? (indexArr.length / 3) | 0 : (posArr.length / 9) | 0;

    for (let t = 0; t < partTriCount; t++) {
      const t3 = t * 3;
      const i0 = (indexArr ? indexArr[t3] : t3) * 3;
      const i1 = (indexArr ? indexArr[t3 + 1] : t3 + 1) * 3;
      const i2 = (indexArr ? indexArr[t3 + 2] : t3 + 2) * 3;

      const ax = posArr[i0];
      const ay = posArr[i0 + 1];
      const az = posArr[i0 + 2];
      const bx = posArr[i1];
      const by = posArr[i1 + 1];
      const bz = posArr[i1 + 2];
      const cx = posArr[i2];
      const cy = posArr[i2 + 1];
      const cz = posArr[i2 + 2];

      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;

      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const area = len * 0.5;
      if (area < 1e-6) continue;

      const out3 = validCount * 3;
      triA[out3] = ax;
      triA[out3 + 1] = ay;
      triA[out3 + 2] = az;
      triB[out3] = bx;
      triB[out3 + 1] = by;
      triB[out3 + 2] = bz;
      triC[out3] = cx;
      triC[out3 + 1] = cy;
      triC[out3 + 2] = cz;

      const invLen = 1 / len;
      triNormal[out3] = nx * invLen;
      triNormal[out3 + 1] = ny * invLen;
      triNormal[out3 + 2] = nz * invLen;

      triWarmth[validCount] = part.warmOreTint;
      areas[validCount] = area;
      totalArea += area;
      validCount++;
    }
  }

  const cdf = new Float32Array(validCount);
  const invTotalArea = totalArea > 0 ? 1 / totalArea : 0;
  let accum = 0;
  for (let i = 0; i < validCount; i++) {
    accum += areas[i] * invTotalArea;
    cdf[i] = accum;
  }
  if (validCount > 0) {
    cdf[validCount - 1] = 1;
  }

  const halfX = (maxX - minX) * 0.5;
  const halfY = (maxY - minY) * 0.5;

  return {
    triCount: validCount,
    triA: triA.subarray(0, validCount * 3),
    triB: triB.subarray(0, validCount * 3),
    triC: triC.subarray(0, validCount * 3),
    triNormal: triNormal.subarray(0, validCount * 3),
    triWarmth: triWarmth.subarray(0, validCount),
    cdf,
    centerX: (minX + maxX) * 0.5,
    centerY: (minY + maxY) * 0.5,
    invHalfSizeX: halfX > 1e-6 ? 1 / halfX : 0,
    invHalfSizeY: halfY > 1e-6 ? 1 / halfY : 0,
  };
}

/**
 * Generates deterministic Stage 4 refined sintered mineral crystal architecture
 * target points: a crisp, poised, faceted crystalline mineral monolith with
 * architectural edge ridges and a quiet orbital mineral halo.
 */
function sampleRefinedMineralPoint(rng: () => number, out: THREE.Vector3): void {
  const mode = rng();
  if (mode < 0.56) {
    const u = rng();
    const v = rng();
    const s = u + v > 1 ? 1 - u : u;
    const t = u + v > 1 ? 1 - v : v;
    const w = 1 - s - t;

    const sx = rng() < 0.5 ? -1 : 1;
    const sy = rng() < 0.5 ? -1 : 1;
    const sz = rng() < 0.5 ? -1 : 1;

    const px = sx * s * 1.28;
    const py = sy * t * 1.82;
    const pz = sz * w * 1.18;

    const quantizedY = Math.round(py * 12) / 12 + (rng() - 0.5) * 0.018;
    out.set(px, quantizedY, pz);
  } else if (mode < 0.88) {
    const edgeIdx = Math.floor(rng() * 12);
    const frac = rng();
    const [aIdx, bIdx] = OCTAHEDRON_EDGE_PAIRS[edgeIdx];
    const a = OCTAHEDRON_VERTS[aIdx];
    const b = OCTAHEDRON_VERTS[bIdx];
    out.set(
      a[0] + (b[0] - a[0]) * frac + (rng() - 0.5) * 0.025,
      a[1] + (b[1] - a[1]) * frac + (rng() - 0.5) * 0.025,
      a[2] + (b[2] - a[2]) * frac + (rng() - 0.5) * 0.025,
    );
  } else {
    const angle = rng() * Math.PI * 2;
    const radius = 1.62 + rng() * 0.42;
    const tilt = 0.24;
    const rx = Math.cos(angle) * radius;
    const rz = Math.sin(angle) * radius;
    const ry = Math.sin(angle * 2.0) * 0.08 + rx * tilt + (rng() - 0.5) * 0.05;
    out.set(rx, ry, rz);
  }

  out.applyAxisAngle(_axisY, 0.38);
  out.applyAxisAngle(_axisZ, -0.1);
  out.x -= 0.15;
  out.y -= 0.25;
}

/**
 * Samples particle origin points from a pre-built RockSurfaceSampler
 * with zero per-triangle object allocations.
 */
export function sampleRockSurfaceParticlesFromSampler(
  sampler: RockSurfaceSampler,
  count: number,
  seed: number,
  coalesceRatio: number,
): SampledSurfaceParticles {
  const rng = mulberry32(seed);
  const { triCount, triA, triB, triC, triNormal, triWarmth, cdf, centerX, centerY, invHalfSizeX, invHalfSizeY } =
    sampler;

  const origins = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const thresholds = new Float32Array(count);
  const randoms = new Float32Array(count * 4);
  const extras = new Float32Array(count * 4);
  const targets = new Float32Array(count * 3);

  const targetVec = new THREE.Vector3();
  const maxTriIdx = Math.max(0, triCount - 1);

  for (let i = 0; i < count; i++) {
    const rPick = rng();
    let lo = 0;
    let hi = maxTriIdx;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cdf[mid] < rPick) lo = mid + 1;
      else hi = mid;
    }

    const t3 = lo * 3;
    let r1 = rng();
    let r2 = rng();
    if (r1 + r2 > 1) {
      r1 = 1 - r1;
      r2 = 1 - r2;
    }
    const r0 = 1 - r1 - r2;

    const nx = triNormal[t3];
    const ny = triNormal[t3 + 1];
    const nz = triNormal[t3 + 2];

    const depthOffset = (rng() - 0.35) * 0.1;
    const px = triA[t3] * r0 + triB[t3] * r1 + triC[t3] * r2 + nx * depthOffset;
    const py = triA[t3 + 1] * r0 + triB[t3 + 1] * r1 + triC[t3 + 1] * r2 + ny * depthOffset;
    const pz = triA[t3 + 2] * r0 + triB[t3 + 2] * r1 + triC[t3 + 2] * r2 + nz * depthOffset;

    const i3 = i * 3;
    origins[i3] = px;
    origins[i3 + 1] = py;
    origins[i3 + 2] = pz;

    normals[i3] = nx;
    normals[i3 + 1] = ny;
    normals[i3 + 2] = nz;

    const normX = Math.max(-1, Math.min(1, (px - centerX) * invHalfSizeX));
    const normY = Math.max(-1, Math.min(1, (py - centerY) * invHalfSizeY));
    const organicNoise = fbm3D(px * 1.15, py * 1.15, pz * 1.15, 777, 3);

    thresholds[i] = computeDissolutionThreshold(normX, normY, organicNoise) * 0.88;

    const sizeRand = Math.pow(rng(), 2.8);
    const gravityScale = 0.72 + rng() * 1.15;
    const spreadX = (rng() - 0.42) * 0.82 + Math.max(0, normX) * 0.18;
    const swirlPhase = rng() * Math.PI * 2;

    const i4 = i * 4;
    randoms[i4] = sizeRand;
    randoms[i4 + 1] = gravityScale;
    randoms[i4 + 2] = spreadX;
    randoms[i4 + 3] = swirlPhase;

    const spreadZ = (rng() - 0.5) * 1.75;
    const coalesces = rng() < coalesceRatio ? 1.0 : 0.0;
    const colorVariant = Math.min(1, rng() * 0.72 + triWarmth[lo] * 0.38);

    const isUndersideCascade = normX > -0.15 && normY < 0.05;
    const ambientFloat = isUndersideCascade && rng() < 0.28 ? 0.45 + rng() * 0.55 : 0.0;

    extras[i4] = spreadZ;
    extras[i4 + 1] = coalesces;
    extras[i4 + 2] = colorVariant;
    extras[i4 + 3] = ambientFloat;

    sampleRefinedMineralPoint(rng, targetVec);
    targets[i3] = targetVec.x;
    targets[i3 + 1] = targetVec.y;
    targets[i3 + 2] = targetVec.z;
  }

  return {
    origins,
    normals,
    thresholds,
    randoms,
    extras,
    targets,
  };
}

/**
 * Convenience wrapper building a sampler on the fly for single-shot callers.
 */
export function sampleRockSurfaceParticles(
  parts: BuiltRockPart[],
  count: number,
  seed: number,
  coalesceRatio: number,
): SampledSurfaceParticles {
  const sampler = createRockSurfaceSampler(parts);
  return sampleRockSurfaceParticlesFromSampler(sampler, count, seed, coalesceRatio);
}

/**
 * Builds an irregular angular fractured volcanic rock shard for 3D InstancedMesh debris.
 */
export function createIrregularShardGeometry(seed = 811): THREE.BufferGeometry {
  const geom = new THREE.DodecahedronGeometry(0.085, 0);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const rng = mulberry32(seed);
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const scaleX = 0.72 + rng() * 0.65;
    const scaleY = 0.55 + rng() * 0.72;
    const scaleZ = 0.68 + rng() * 0.58;
    v.set(v.x * scaleX, v.y * scaleY, v.z * scaleZ);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geom.computeVertexNormals();
  return geom;
}
