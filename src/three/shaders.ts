import * as THREE from 'three';

export interface RockDissolutionUniforms {
  uProgress: { value: number };
  uTime: { value: number };
  uRockBoundsMin: { value: THREE.Vector3 };
  uRockBoundsSize: { value: THREE.Vector3 };
  uWarmOreTint: { value: number };
  uFissureMap: { value: THREE.Texture };
  uFissureDeep: { value: THREE.Color };
  uFissureMid: { value: THREE.Color };
  uFissureHot: { value: THREE.Color };
}

const GLSL_NOISE_3D_SINGLE = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3d(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);

  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);

  return mix(nxy0, nxy1, f.z);
}
`;

/**
 * Extends Three.js MeshStandardMaterial via `onBeforeCompile` to retain full PBR
 * lighting, normal maps, roughness variation, and RoomEnvironment reflections while
 * adding organic right-to-left noise dissolution and molten fissure veins.
 *
 * Optimizations (appearance-identical):
 * - Single shared WebGL program across all 5 rock parts (`customProgramCacheKey` independent of uniform value)
 * - Uses pre-baked vertex attributes `aDissolveVert` and `aOrganicNoise`, eliminating 3-octave FBM
 *   from both vertex and fragment shaders (75% less per-pixel noise ALU) while retaining crisp
 *   per-fragment `noise3d(vLocalPos * 7.5)` dissolution edges.
 */
export function applyRockDissolutionShader(
  material: THREE.MeshStandardMaterial,
  uniforms: RockDissolutionUniforms,
): void {
  material.customProgramCacheKey = () => 'kilnova-rock-dissolve-v3';

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uProgress = uniforms.uProgress;
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uRockBoundsMin = uniforms.uRockBoundsMin;
    shader.uniforms.uRockBoundsSize = uniforms.uRockBoundsSize;
    shader.uniforms.uWarmOreTint = uniforms.uWarmOreTint;
    shader.uniforms.uFissureMap = uniforms.uFissureMap;
    shader.uniforms.uFissureDeep = uniforms.uFissureDeep;
    shader.uniforms.uFissureMid = uniforms.uFissureMid;
    shader.uniforms.uFissureHot = uniforms.uFissureHot;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uProgress;
        attribute vec4 aDissolveVert; // x: normX, y: normY, z: nDisp, w: thresh
        attribute float aOrganicNoise;
        varying vec3 vLocalPos;
        varying vec2 vFissureUv;
        varying vec2 vNormXY;
        varying float vOrganic;
        `,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vLocalPos = position;
        vFissureUv = uv * 2.4;
        vNormXY = aDissolveVert.xy;
        vOrganic = aOrganicNoise;

        // Subtle outward thermal fracture expansion right before the surface erodes away
        float edgeProximity = smoothstep(aDissolveVert.w - 0.14, aDissolveVert.w, uProgress * 1.08);
        transformed += normal * edgeProximity * 0.065 * (0.6 + aDissolveVert.z * 0.8);
        `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uProgress;
        uniform float uTime;
        uniform float uWarmOreTint;
        uniform sampler2D uFissureMap;
        uniform vec3 uFissureDeep;
        uniform vec3 uFissureMid;
        uniform vec3 uFissureHot;
        varying vec3 vLocalPos;
        varying vec2 vFissureUv;
        varying vec2 vNormXY;
        varying float vOrganic;
        ${GLSL_NOISE_3D_SINGLE}
        `,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        /* glsl */ `
        #include <clipping_planes_fragment>
        float fNormX = clamp(vNormXY.x, -1.0, 1.0);
        float fNormY = clamp(vNormXY.y, -1.0, 1.0);
        float fineCrumb = noise3d(vLocalPos * 7.5);
        float dissolveThreshold = clamp(
          0.05 + (1.0 - fNormX) * 0.30 + (fNormY + 1.0) * 0.06 + (vOrganic - 0.5) * 0.20 + (fineCrumb - 0.5) * 0.05,
          0.03,
          0.76
        );

        // Sweep dissolution cleanly past 0.78 so the raw rock completely disappears entering Stage 4
        float sweepProgress = uProgress * 1.08;
        if (sweepProgress > dissolveThreshold) {
          discard;
        }
        `,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
        #include <emissivemap_fragment>
        vec3 fissureSample = texture2D(uFissureMap, vFissureUv).rgb;
        float fissureSignal = fissureSample.r;

        float edgeDist = dissolveThreshold - sweepProgress;
        float hotEdge = 1.0 - smoothstep(0.0, 0.048, edgeDist);
        float warmZone = 1.0 - smoothstep(0.0, 0.16, edgeDist);

        float ambientBreath = 0.90 + 0.10 * sin(uTime * 1.3 + vLocalPos.x * 2.2);
        float stageHeat = 0.22 + smoothstep(0.08, 0.58, uProgress) * 1.25;

        // Concentrate natural ochre-amber veins along lower-right fractured underside
        float rightLowerBias = smoothstep(-0.22, 0.85, fNormX) * smoothstep(0.55, -0.75, fNormY);
        float veinGlow = fissureSignal * (0.24 + rightLowerBias * 1.05 + warmZone * 1.55) * stageHeat * ambientBreath;

        vec3 crackEmission = mix(uFissureDeep, uFissureMid, clamp(fissureSignal + uWarmOreTint * 0.38, 0.0, 1.0)) * veinGlow;
        vec3 edgeEmission = mix(uFissureMid, uFissureHot, hotEdge * hotEdge) * hotEdge * (0.85 + fineCrumb * 0.65) * smoothstep(0.03, 0.16, uProgress);

        totalEmissiveRadiance += crackEmission + edgeEmission;
        `,
      );
  };
}

/**
 * GPU-accelerated dark obsidian & rim-lit mineral grit/pebble shader (NormalBlending).
 * Early-culls inactive particles off-clip-space before matrix projection to save GPU vertex & rasterizer work.
 */
export function createMineralFragmentMaterial(
  pixelRatio: number,
  isMobile: boolean,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uPointScale: { value: isMobile ? 7.5 : 9.5 },
      uFadeOut: { value: 1.0 },
      uWarmSandColor: { value: new THREE.Color(0.56, 0.42, 0.24) },
      uEmberColor: { value: new THREE.Color(0.95, 0.46, 0.11) },
    },
    vertexShader: /* glsl */ `
      uniform float uProgress;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uPointScale;

      attribute vec3 aNormal;
      attribute float aThreshold;
      attribute vec4 aRandom; // x: sizeRand, y: gravityScale, z: spreadX, w: swirlPhase
      attribute vec4 aExtra;  // x: spreadZ, y: coalesceWeight, z: colorVariant, w: ambientFloat
      attribute vec3 aTarget;

      varying float vAlpha;
      varying float vHeat;
      varying float vColorVariant;
      varying float vAngle;
      varying float vAspect;

      void main() {
        float p = clamp(uProgress, 0.0, 1.0);
        float denom = max(0.18, 1.0 - aThreshold);
        float detachedAge = max(0.0, (p - aThreshold) / denom);

        float ambientSeed = aExtra.w;
        float ambientActive = step(0.01, ambientSeed) * (1.0 - smoothstep(0.22, 0.45, p));

        // Fast clip-space discard for inactive particles (~85% of buffer in Stage 1)
        if (detachedAge <= 0.0 && ambientActive <= 0.01) {
          vAlpha = 0.0;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          return;
        }

        vec3 pos = position;
        float alpha = 0.0;
        float heat = 0.0;
        float coalesce = 0.0;

        if (detachedAge > 0.0) {
          float t = detachedAge;
          vec3 burst = aNormal * smoothstep(0.0, 0.14, t) * (0.16 + aRandom.x * 0.24);

          float gravityDrop = (1.75 * t + 5.6 * t * t) * aRandom.y;
          float lateralDrift = (0.28 * t + 0.52 * t * t) * aRandom.z
            + sin(t * 4.8 + aRandom.w) * 0.18 * t;
          float depthDrift = 0.72 * t * aExtra.x
            + cos(t * 4.1 + aRandom.w * 1.3) * 0.18 * t;

          vec3 fallenPos = position + burst + vec3(lateralDrift, -gravityDrop, depthDrift);

          coalesce = smoothstep(0.72, 0.96, p) * aExtra.y;
          vec3 refinedPos = aTarget + vec3(
            sin(uTime * 0.35 + aRandom.w) * 0.012,
            cos(uTime * 0.3 + aRandom.w) * 0.012,
            0.0
          );
          pos = mix(fallenPos, refinedPos, coalesce);

          float appear = smoothstep(0.0, 0.035, t);
          float fallFade = (1.0 - smoothstep(0.58, 0.88, t)) * (1.0 - smoothstep(0.76, 0.94, p));
          alpha = appear * mix(fallFade, 0.88, coalesce);

          float flash = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.14, 0.48, t));
          heat = max(flash * 0.72, coalesce * 0.22);
        } else {
          float ambCycle = fract(uTime * (0.042 + aRandom.y * 0.026) + aRandom.w * 0.15915);
          float drop = (0.35 * ambCycle + 4.4 * ambCycle * ambCycle) * aRandom.y;
          float driftX = ambCycle * (0.12 + aRandom.z * 0.38) + sin(ambCycle * 4.2 + aRandom.w) * 0.09;
          float driftZ = ambCycle * aExtra.x * 0.32;
          pos = position + vec3(driftX, -drop, driftZ);
          alpha = ambientActive * smoothstep(0.0, 0.12, ambCycle) * (1.0 - smoothstep(0.76, 1.0, ambCycle)) * 0.92;
          heat = (1.0 - ambCycle) * 0.18;
        }

        if (alpha <= 0.005) {
          vAlpha = 0.0;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          return;
        }

        vAlpha = alpha;
        vHeat = heat;
        vColorVariant = aExtra.z;
        vAngle = aRandom.w + detachedAge * (3.6 + aRandom.y * 2.2);
        vAspect = 0.62 + fract(aRandom.w * 7.13) * 0.38;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float baseSize = mix(1.5, 9.2, aRandom.x);
        float refinedShrink = mix(1.0, 0.42, coalesce);
        float sizeScale = baseSize * refinedShrink * uPointScale * uPixelRatio / max(1.5, -mvPosition.z);
        gl_PointSize = clamp(sizeScale, 0.0, 12.0 * uPixelRatio);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFadeOut;
      uniform vec3 uWarmSandColor;
      uniform vec3 uEmberColor;
      varying float vAlpha;
      varying float vHeat;
      varying float vColorVariant;
      varying float vAngle;
      varying float vAspect;

      void main() {
        if (vAlpha <= 0.01) discard;

        vec2 p = gl_PointCoord - 0.5;
        float ca = cos(vAngle);
        float sa = sin(vAngle);
        vec2 rp = mat2(ca, -sa, sa, ca) * p;
        rp.y /= vAspect;

        float dCircle = length(rp);
        float dDiamond = (abs(rp.x) + abs(rp.y)) * 0.78;
        float d = mix(dCircle, dDiamond, 0.42);

        if (d > 0.46) discard;
        float edgeMask = 1.0 - smoothstep(0.32, 0.46, d);

        float lightFace = clamp(0.52 - rp.x * 1.55 - rp.y * 1.35, 0.16, 1.0);

        vec3 darkObsidian = vec3(0.08, 0.09, 0.10);
        vec3 charcoalSlate = vec3(0.28, 0.30, 0.33);
        vec3 paleQuartz = vec3(0.84, 0.82, 0.78);

        vec3 baseRock = mix(darkObsidian, charcoalSlate, smoothstep(0.12, 0.58, vColorVariant));
        baseRock = mix(baseRock, uWarmSandColor, smoothstep(0.50, 0.84, vColorVariant) * 0.72);
        baseRock = mix(baseRock, paleQuartz, smoothstep(0.86, 0.98, vColorVariant));

        vec3 shaded = baseRock * (0.48 + lightFace * 0.92);

        vec3 finalCol = mix(shaded, uEmberColor, vHeat * (0.32 + (1.0 - lightFace) * 0.45));

        gl_FragColor = vec4(finalCol, vAlpha * edgeMask * uFadeOut);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}

/**
 * GPU-accelerated glowing amber dust & molten spark shader (AdditiveBlending).
 * Early-culls inactive particles off-clip-space before matrix projection.
 */
export function createAmberDustMaterial(
  pixelRatio: number,
  isMobile: boolean,
  isSparkLayer: boolean,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uPointScale: { value: isSparkLayer ? (isMobile ? 7.5 : 9.5) : (isMobile ? 6.0 : 7.8) },
      uIsSpark: { value: isSparkLayer ? 1.0 : 0.0 },
      uFadeOut: { value: 1.0 },
      uDustLow: { value: new THREE.Color(0.68, 0.35, 0.1) },
      uDustMid: { value: new THREE.Color(0.96, 0.58, 0.16) },
      uDustHot: { value: new THREE.Color(1.18, 0.86, 0.44) },
    },
    vertexShader: /* glsl */ `
      uniform float uProgress;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uPointScale;
      uniform float uIsSpark;

      attribute vec3 aNormal;
      attribute float aThreshold;
      attribute vec4 aRandom; // x: sizeRand, y: gravityScale, z: spreadX, w: swirlPhase
      attribute vec4 aExtra;  // x: spreadZ, y: coalesceWeight, z: colorVariant, w: ambientFloat
      attribute vec3 aTarget;

      varying float vAlpha;
      varying float vHeat;
      varying float vSpark;

      void main() {
        float p = clamp(uProgress, 0.0, 1.0);
        float denom = max(0.18, 1.0 - aThreshold);
        float detachedAge = max(0.0, (p - aThreshold) / denom);

        float ambientSeed = aExtra.w;
        float ambientActive = step(0.01, ambientSeed) * (1.0 - smoothstep(0.20, 0.44, p));

        if (detachedAge <= 0.0 && ambientActive <= 0.01) {
          vAlpha = 0.0;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          return;
        }

        vec3 pos = position;
        float alpha = 0.0;
        float heat = 0.0;
        float coalesce = 0.0;

        if (detachedAge > 0.0) {
          float t = detachedAge;
          vec3 burst = aNormal * smoothstep(0.0, 0.12, t) * (0.14 + uIsSpark * 0.24);

          float gMult = mix(0.86, 0.68, uIsSpark);
          float gravityDrop = (1.55 * t + 4.8 * t * t) * aRandom.y * gMult;
          float curlX = sin(t * 5.8 + aRandom.w) * (0.24 + uIsSpark * 0.18) * t;
          float curlZ = cos(t * 4.7 + aRandom.w * 1.4) * (0.24 + uIsSpark * 0.16) * t;
          float lateralDrift = (0.34 * t + 0.56 * t * t) * aRandom.z + curlX;
          float depthDrift = 0.82 * t * aExtra.x + curlZ;

          float shimmerX = sin(uTime * 0.9 + aRandom.w) * 0.03 * min(1.0, t * 2.0);
          float shimmerY = cos(uTime * 0.75 + aRandom.w * 1.7) * 0.025 * min(1.0, t * 2.0);

          vec3 fallenPos = position + burst + vec3(lateralDrift + shimmerX, -gravityDrop + shimmerY, depthDrift);

          coalesce = smoothstep(0.70, 0.96, p) * aExtra.y;
          float refinedPulse = sin(uTime * 0.7 + aRandom.w) * 0.014;
          vec3 refinedPos = aTarget + vec3(refinedPulse, cos(uTime * 0.55 + aRandom.w) * 0.014, 0.0);
          pos = mix(fallenPos, refinedPos, coalesce);

          float appear = smoothstep(0.0, 0.04, t);
          float fallFade = (1.0 - smoothstep(0.55, 0.88, t)) * (1.0 - smoothstep(0.78, 0.95, p));
          alpha = appear * mix(fallFade, 0.68, coalesce);

          float releasePeak = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.22, 0.82, t));
          heat = max(releasePeak, coalesce * 0.62);
        } else {
          float ambCycle = fract(uTime * (0.048 + aRandom.y * 0.03) + aRandom.w * 0.15915);
          float drop = (0.3 * ambCycle + 4.0 * ambCycle * ambCycle) * aRandom.y;
          float driftX = ambCycle * (0.1 + aRandom.z * 0.34) + sin(ambCycle * 5.2 + aRandom.w) * 0.1;
          float driftZ = ambCycle * aExtra.x * 0.35;
          pos = position + vec3(driftX, -drop, driftZ);
          alpha = ambientActive * smoothstep(0.0, 0.12, ambCycle) * (1.0 - smoothstep(0.74, 1.0, ambCycle)) * mix(0.56, 0.86, uIsSpark);
          heat = 0.45 + 0.55 * (1.0 - ambCycle);
        }

        if (alpha <= 0.005) {
          vAlpha = 0.0;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          return;
        }

        vAlpha = alpha;
        vHeat = heat;
        vSpark = uIsSpark;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float baseSize = mix(1.3, 4.6, aRandom.x) * mix(1.0, 1.25, uIsSpark);
        float refinedShrink = mix(1.0, 0.65, coalesce);
        float sparkFlicker = mix(1.0, 0.78 + 0.32 * sin(uTime * 4.0 + aRandom.w * 7.0), uIsSpark);
        float sizeScale = baseSize * refinedShrink * sparkFlicker * uPointScale * uPixelRatio / max(1.5, -mvPosition.z);
        gl_PointSize = clamp(sizeScale, 0.0, 9.5 * uPixelRatio);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFadeOut;
      uniform vec3 uDustLow;
      uniform vec3 uDustMid;
      uniform vec3 uDustHot;
      varying float vAlpha;
      varying float vHeat;
      varying float vSpark;

      void main() {
        if (vAlpha <= 0.01) discard;

        vec2 p = gl_PointCoord - 0.5;
        float dist = length(p);
        if (dist > 0.5) discard;

        float core = exp(-dist * dist * mix(20.0, 34.0, vSpark));
        float halo = smoothstep(0.5, 0.0, dist) * mix(0.32, 0.48, vSpark);
        float intensity = core + halo * 0.38;

        vec3 col = mix(uDustLow, uDustMid, clamp(vHeat + 0.18, 0.0, 1.0));
        col = mix(col, uDustHot, core * (0.45 + vSpark * 0.45));

        float finalAlpha = vAlpha * intensity * mix(0.55, 0.88, vSpark) * uFadeOut;
        gl_FragColor = vec4(col * finalAlpha, finalAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * GPU-driven InstancedMesh shader for large 3D angular rock chunks detaching
 * from the monolith during Stages 2–3, tumbling under gravity and fracturing away.
 */
export function createInstancedShardMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uFadeOut: { value: 1.0 },
      uRimColor: { value: new THREE.Color(0.88, 0.44, 0.12) },
      uEmberColor: { value: new THREE.Color(1.08, 0.48, 0.1) },
    },
    vertexShader: /* glsl */ `
      uniform float uProgress;
      uniform float uTime;

      attribute vec3 aOrigin;
      attribute vec3 aSurfNormal;
      attribute float aThreshold;
      attribute vec4 aParams; // x: scale, y: gravityScale, z: spreadX, w: spinSeed

      varying vec3 vWorldNormal;
      varying float vHeat;
      varying float vAlpha;

      mat3 rotAxis(vec3 axis, float angle) {
        vec3 a = normalize(axis);
        float s = sin(angle);
        float c = cos(angle);
        float oc = 1.0 - c;
        return mat3(
          oc * a.x * a.x + c,           oc * a.x * a.y - a.z * s,  oc * a.z * a.x + a.y * s,
          oc * a.x * a.y + a.z * s,     oc * a.y * a.y + c,        oc * a.y * a.z - a.x * s,
          oc * a.z * a.x - a.y * s,     oc * a.y * a.z + a.x * s,  oc * a.z * a.z + c
        );
      }

      void main() {
        float p = clamp(uProgress, 0.0, 1.0);
        float denom = max(0.22, 1.0 - aThreshold);
        float age = max(0.0, (p - aThreshold) / denom);

        float shardVis = smoothstep(0.0, 0.04, age)
          * (1.0 - smoothstep(0.45, 0.82, age))
          * (1.0 - smoothstep(0.76, 0.90, p));

        if (shardVis <= 0.02) {
          vAlpha = 0.0;
          vHeat = 0.0;
          vWorldNormal = vec3(0.0, 1.0, 0.0);
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }

        float scale = aParams.x * shardVis * mix(1.0, 0.22, smoothstep(0.15, 0.80, age));

        vec3 spinAxis = normalize(vec3(
          sin(aParams.w * 3.1) + 0.001,
          cos(aParams.w * 2.3),
          sin(aParams.w * 5.7)
        ));
        float spinAngle = age * (4.5 + aParams.y * 4.0) + aParams.w;
        mat3 rot = rotAxis(spinAxis, spinAngle);

        vec3 localV = (rot * position) * scale;
        vec3 localN = normalize(rot * normal);

        float gravityDrop = (1.6 * age + 5.6 * age * age) * aParams.y;
        float driftX = (0.34 * age + 0.65 * age * age) * aParams.z;
        float driftZ = sin(aParams.w * 7.0) * 0.75 * age;
        vec3 offset = aSurfNormal * smoothstep(0.0, 0.16, age) * 0.34 + vec3(driftX, -gravityDrop, driftZ);

        vec3 worldPos = aOrigin + offset + localV;
        vWorldNormal = normalize(mat3(modelMatrix) * localN);
        vHeat = smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.12, 0.45, age));
        vAlpha = shardVis;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFadeOut;
      uniform vec3 uRimColor;
      uniform vec3 uEmberColor;
      varying vec3 vWorldNormal;
      varying float vHeat;
      varying float vAlpha;

      void main() {
        if (vAlpha <= 0.02) discard;

        vec3 n = normalize(vWorldNormal);
        vec3 keyDir = normalize(vec3(-0.65, 0.72, 0.55));
        vec3 rimDir = normalize(vec3(0.82, -0.35, 0.25));

        float ndlKey = max(0.0, dot(n, keyDir));
        float ndlRim = max(0.0, dot(n, rimDir));

        vec3 darkBasalt = vec3(0.09, 0.10, 0.11);
        vec3 coolSpec = vec3(0.45, 0.48, 0.52) * pow(ndlKey, 3.0);
        vec3 warmRim = uRimColor * pow(ndlRim, 2.0) * 0.65;
        vec3 fractureEmber = uEmberColor * vHeat * 0.85;

        vec3 col = darkBasalt * (0.45 + ndlKey * 0.85) + coolSpec * 0.45 + warmRim + fractureEmber;
        gl_FragColor = vec4(col, vAlpha * uFadeOut);
      }
    `,
    transparent: true,
    depthWrite: true,
  });
}
