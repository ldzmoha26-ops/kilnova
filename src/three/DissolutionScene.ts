import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  clamp01,
  computeCameraPose,
  computeCameraPoseInto,
  getAdaptiveBudgets,
  smoothstep,
  type MutableCameraPose,
} from './dissolutionMath';
import { createRockTextures, type ProceduralRockTextures } from './proceduralTextures';
import {
  buildCompositeRockParts,
  createIrregularShardGeometry,
  createRockSurfaceSampler,
  sampleRockSurfaceParticlesFromSampler,
  type SampledSurfaceParticles,
} from './rockGeometry';
import {
  applyRockDissolutionShader,
  createAmberDustMaterial,
  createInstancedShardMaterial,
  createMineralFragmentMaterial,
  type RockDissolutionUniforms,
} from './shaders';
import { detectSoftwareWebGL, isWebGLAvailable } from './webglCapabilities';
import { THREE_THEME_PALETTES, type ThemeVersion } from '../theme/themeConfig';

export { isWebGLAvailable };

export interface DissolutionSceneOptions {
  container: HTMLElement;
  reducedMotion: boolean;
  initialTheme?: ThemeVersion;
  initialRtl?: boolean;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

const _camPosTarget = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _camLookCurrent = new THREE.Vector3();
const _cameraPoseScratch: MutableCameraPose = {
  posX: 0,
  posY: 0,
  posZ: 0,
  lookX: 0,
  lookY: 0,
  lookZ: 0,
  fov: 38,
};

interface CachedParticleLayers {
  mineralData: SampledSurfaceParticles;
  dustData: SampledSurfaceParticles;
  sparkData: SampledSurfaceParticles;
  shardSamples: SampledSurfaceParticles;
  shardParams: Float32Array;
}

const cachedParticleLayersByBudget = new Map<string, CachedParticleLayers>();

export class DissolutionScene {
  private readonly container: HTMLElement;
  private readonly isSoftwareGl: boolean;
  private readonly isMobile: boolean;
  private readonly reducedMotion: boolean;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly rockGroup: THREE.Group;

  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;

  private readonly textures: ProceduralRockTextures[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly rockUniformSets: RockDissolutionUniforms[] = [];
  private readonly rockMeshes: THREE.Mesh[] = [];
  private readonly shardMesh: THREE.Mesh;

  private readonly mineralMaterial: THREE.ShaderMaterial;
  private readonly amberDustMaterial: THREE.ShaderMaterial;
  private readonly sparkMaterial: THREE.ShaderMaterial;
  private readonly shardMaterial: THREE.ShaderMaterial;
  private readonly backdropMaterial: THREE.ShaderMaterial;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;
  private readonly backRim: THREE.DirectionalLight;
  private readonly coreLight: THREE.PointLight;
  private readonly refinedCoreMesh: THREE.Mesh;
  private readonly refinedEdges: THREE.LineSegments;

  private targetProgress = 0;
  private smoothProgress = 0;
  private targetPointerX = 0;
  private targetPointerY = 0;
  private smoothPointerX = 0;
  private smoothPointerY = 0;
  private fadeOut = 1;
  private isRtl = false;

  private elapsedTime = 0;
  private lastTimestamp = performance.now();
  private frameId = 0;
  private disposed = false;
  private contextLost = false;
  private inViewport = true;
  private pageVisible = typeof document !== 'undefined' ? !document.hidden : true;

  private readonly handleContextLost: (e: Event) => void;
  private readonly handleContextRestored: () => void;
  private readonly handleVisibilityChange: () => void;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly intersectionObserver: IntersectionObserver | null;

  constructor(options: DissolutionSceneOptions) {
    this.container = options.container;
    this.reducedMotion = options.reducedMotion;
    this.isMobile = window.innerWidth < 768;
    this.isSoftwareGl = detectSoftwareWebGL();

    const budgets = getAdaptiveBudgets({
      isMobile: this.isMobile,
      isSoftwareGl: this.isSoftwareGl,
      reducedMotion: this.reducedMotion,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });

    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, budgets.pixelRatioCap),
    );
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x0b0c0d, 1);

    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    this.container.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0c0d);
    this.scene.fog = new THREE.FogExp2(0x0b0c0d, 0.032);

    // Studio RoomEnvironment reflection map on every device
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRenderTarget = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    // Camera positioned for dramatic right-weighted editorial composition
    const initialPose = computeCameraPose(0, 0, 0, this.isMobile);
    this.camera = new THREE.PerspectiveCamera(initialPose.fov, width / height, 0.1, 140);
    this.camera.position.set(...initialPose.position);
    _camLookCurrent.set(...initialPose.lookAt);
    this.camera.lookAt(_camLookCurrent);

    // Subtle atmospheric studio backdrop matching the active theme
    this.backdropMaterial = this.buildStudioBackdrop();

    // 3-Point Dramatic Studio Lighting + Subtle Core Thermal Light
    this.hemiLight = new THREE.HemisphereLight(0x6c7c92, 0x16110e, 0.95);
    this.scene.add(this.hemiLight);

    // Cool-neutral directional key from upper-left highlighting pitted obsidian facets
    this.keyLight = new THREE.DirectionalLight(0xe2ebf5, 2.75);
    this.keyLight.position.set(-5.2, 6.4, 5.5);
    if (!this.isSoftwareGl) {
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.set(1024, 1024);
      this.keyLight.shadow.camera.near = 1;
      this.keyLight.shadow.camera.far = 22;
      this.keyLight.shadow.camera.left = -5;
      this.keyLight.shadow.camera.right = 5;
      this.keyLight.shadow.camera.top = 5;
      this.keyLight.shadow.camera.bottom = -5;
      this.keyLight.shadow.bias = -0.0005;
      this.keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.keyLight);

    // Strong rim light from right/lower-right
    this.rimLight = new THREE.DirectionalLight(0xe88332, 2.25);
    this.rimLight.position.set(6.4, -2.4, 2.2);
    this.scene.add(this.rimLight);

    // Soft cool silhouette backlight from behind-top to separate dark stone from deep backdrop
    this.backRim = new THREE.DirectionalLight(0x889bb5, 1.05);
    this.backRim.position.set(1.2, 4.5, -5.5);
    this.scene.add(this.backRim);

    // Build Composite 5-Part Geological Rock Group
    this.rockGroup = new THREE.Group();
    if (this.isMobile) {
      this.rockGroup.position.set(0.18, 0.55, 0);
      this.rockGroup.scale.setScalar(0.8);
    } else {
      this.rockGroup.position.set(2.15, 0.28, 0);
      this.rockGroup.scale.setScalar(0.94);
    }
    this.scene.add(this.rockGroup);

    // Internal thermal point light anchored inside the rock crevices
    this.coreLight = new THREE.PointLight(0xf27d24, 1.4, 9.5, 1.8);
    this.coreLight.position.set(0.65, -0.32, 0.85);
    this.rockGroup.add(this.coreLight);

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const darkRockTex = createRockTextures(maxAnisotropy, 0.08);
    const warmOreTex = createRockTextures(maxAnisotropy, 0.86);
    this.textures.push(darkRockTex, warmOreTex);

    const rockParts = buildCompositeRockParts(budgets.rockDetailSubdivisions);

    // Global rock bounds in rockGroup local space for coherent right-to-left shader sweep
    const rockBounds = new THREE.Box3();
    for (const part of rockParts) {
      if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
      if (part.geometry.boundingBox) {
        rockBounds.union(part.geometry.boundingBox);
      }
      this.geometries.push(part.geometry);
    }
    const boundsMin = rockBounds.min.clone();
    const boundsSize = new THREE.Vector3();
    rockBounds.getSize(boundsSize);

    for (const part of rockParts) {
      const texSet = part.warmOreTint > 0.4 ? warmOreTex : darkRockTex;
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: texSet.albedoMap,
        normalMap: texSet.normalMap,
        normalScale: new THREE.Vector2(part.isCore ? 0.85 : 1.45, part.isCore ? 0.85 : 1.45),
        roughnessMap: texSet.roughnessMap,
        roughness: part.roughness,
        metalness: part.metalness,
        envMapIntensity: part.warmOreTint > 0.4 ? 1.2 : 1.45,
        side: THREE.DoubleSide,
      });

      const uniforms: RockDissolutionUniforms = {
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uRockBoundsMin: { value: boundsMin },
        uRockBoundsSize: { value: boundsSize },
        uWarmOreTint: { value: part.warmOreTint },
        uFissureMap: { value: texSet.fissureMap },
        uFissureDeep: { value: new THREE.Color(0.68, 0.26, 0.04) },
        uFissureMid: { value: new THREE.Color(1.12, 0.5, 0.09) },
        uFissureHot: { value: new THREE.Color(1.48, 0.84, 0.32) },
      };

      applyRockDissolutionShader(mat, uniforms);
      this.rockUniformSets.push(uniforms);
      this.materials.push(mat);

      const mesh = new THREE.Mesh(part.geometry, mat);
      mesh.name = part.name;
      mesh.castShadow = !this.isSoftwareGl;
      mesh.receiveShadow = !this.isSoftwareGl;
      this.rockGroup.add(mesh);
      this.rockMeshes.push(mesh);
    }

    // Build or reuse cached GPU particle & shard buffers sampled once via RockSurfaceSampler
    const pr = this.renderer.getPixelRatio();
    const layers = this.getOrCreateParticleLayers(rockParts, budgets);

    // 1. Dark Obsidian & Lit Mineral Fragment Layer (NormalBlending)
    const mineralGeo = this.createParticleBufferGeometry(layers.mineralData);
    this.mineralMaterial = createMineralFragmentMaterial(pr, this.isMobile);
    const mineralPoints = new THREE.Points(mineralGeo, this.mineralMaterial);
    mineralPoints.frustumCulled = false;
    this.rockGroup.add(mineralPoints);
    this.geometries.push(mineralGeo);
    this.materials.push(this.mineralMaterial);

    // 2. Fine Glowing Amber & Copper Dust Cascade (AdditiveBlending)
    const dustGeo = this.createParticleBufferGeometry(layers.dustData);
    this.amberDustMaterial = createAmberDustMaterial(pr, this.isMobile, false);
    const dustPoints = new THREE.Points(dustGeo, this.amberDustMaterial);
    dustPoints.frustumCulled = false;
    this.rockGroup.add(dustPoints);
    this.geometries.push(dustGeo);
    this.materials.push(this.amberDustMaterial);

    // 3. Incandescent Hot Amber Sparks (AdditiveBlending)
    const sparkGeo = this.createParticleBufferGeometry(layers.sparkData);
    this.sparkMaterial = createAmberDustMaterial(pr, this.isMobile, true);
    const sparkPoints = new THREE.Points(sparkGeo, this.sparkMaterial);
    sparkPoints.frustumCulled = false;
    this.rockGroup.add(sparkPoints);
    this.geometries.push(sparkGeo);
    this.materials.push(this.sparkMaterial);

    // 4. Instanced 3D Large Fractured Rock Shards (Macro Debris Layer)
    const baseShardGeo = createIrregularShardGeometry(811);
    const instancedShardGeo = new THREE.InstancedBufferGeometry();
    instancedShardGeo.index = baseShardGeo.index;
    instancedShardGeo.attributes.position = baseShardGeo.attributes.position;
    instancedShardGeo.attributes.normal = baseShardGeo.attributes.normal;

    instancedShardGeo.setAttribute(
      'aOrigin',
      new THREE.InstancedBufferAttribute(layers.shardSamples.origins, 3),
    );
    instancedShardGeo.setAttribute(
      'aSurfNormal',
      new THREE.InstancedBufferAttribute(layers.shardSamples.normals, 3),
    );
    instancedShardGeo.setAttribute(
      'aThreshold',
      new THREE.InstancedBufferAttribute(layers.shardSamples.thresholds, 1),
    );
    instancedShardGeo.setAttribute(
      'aParams',
      new THREE.InstancedBufferAttribute(layers.shardParams, 4),
    );
    instancedShardGeo.instanceCount = budgets.shardCount;

    this.shardMaterial = createInstancedShardMaterial();
    this.shardMesh = new THREE.Mesh(instancedShardGeo, this.shardMaterial);
    this.shardMesh.frustumCulled = false;
    this.shardMesh.visible = false;
    this.rockGroup.add(this.shardMesh);
    this.geometries.push(baseShardGeo, instancedShardGeo);
    this.materials.push(this.shardMaterial);

    // 5. Stage 4 Refined Mineral Architectural Core (emerges serenely out of settling particles)
    const refinedGeo = new THREE.OctahedronGeometry(1.26, 0);
    refinedGeo.scale(1.0, 1.44, 0.92);
    const refinedCoreMat = new THREE.MeshStandardMaterial({
      color: 0x1e2228,
      roughness: 0.2,
      metalness: 0.88,
      emissive: new THREE.Color(0xb85614),
      emissiveIntensity: 0.32,
      envMapIntensity: 1.85,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.refinedCoreMesh = new THREE.Mesh(refinedGeo, refinedCoreMat);
    this.refinedCoreMesh.position.set(-0.15, -0.46, 0);
    this.refinedCoreMesh.rotation.set(0, 0.38, -0.1);
    this.rockGroup.add(this.refinedCoreMesh);

    const edgesGeo = new THREE.EdgesGeometry(refinedGeo);
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0xf4a852,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.refinedEdges = new THREE.LineSegments(edgesGeo, edgesMat);
    this.refinedEdges.position.copy(this.refinedCoreMesh.position);
    this.refinedEdges.rotation.copy(this.refinedCoreMesh.rotation);
    this.rockGroup.add(this.refinedEdges);

    this.geometries.push(refinedGeo, edgesGeo);
    this.materials.push(refinedCoreMat, edgesMat);

    // Restrained half-resolution GPU-only Bloom Post-Processing (4x lower fill-rate, skipped on software WebGL)
    if (budgets.enableBloom && !this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(Math.max(1, width >> 1), Math.max(1, height >> 1)),
        0.38,
        0.34,
        0.74,
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }

    // Pre-warm shaders on GPU (skip on software WebGL to avoid stall)
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // WebGL context loss/restore & page visibility handlers
    this.handleContextLost = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
      this.stopLoop();
      options.onContextLost?.();
    };
    this.handleContextRestored = () => {
      this.contextLost = false;
      options.onContextRestored?.();
      this.syncLoopState();
    };
    this.handleVisibilityChange = () => {
      this.pageVisible = !document.hidden;
      this.syncLoopState();
    };

    canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.container);
    } else {
      this.resizeObserver = null;
    }

    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          this.inViewport = entry.isIntersecting;
          this.syncLoopState();
        },
        { threshold: 0 },
      );
      this.intersectionObserver.observe(this.container);
    } else {
      this.intersectionObserver = null;
    }

    // Apply initial theme palette and reading direction cleanly before first draw
    this.setTheme(options.initialTheme ?? 'obsidian');
    this.setRtl(Boolean(options.initialRtl));

    // Initial render & loop start
    this.renderFrame(0.016);
    this.syncLoopState();
  }

  private getOrCreateParticleLayers(
    rockParts: ReturnType<typeof buildCompositeRockParts>,
    budgets: ReturnType<typeof getAdaptiveBudgets>,
  ): CachedParticleLayers {
    const key = `${budgets.rockDetailSubdivisions >= 5 ? 'hi' : 'lo'}:${budgets.mineralParticleCount}:${budgets.amberDustCount}:${budgets.sparkCount}:${budgets.shardCount}`;
    const existing = cachedParticleLayersByBudget.get(key);
    if (existing) return existing;

    // Build surface triangle CDF once and reuse across all 4 layers
    const sampler = createRockSurfaceSampler(rockParts);
    const mineralData = sampleRockSurfaceParticlesFromSampler(
      sampler,
      budgets.mineralParticleCount,
      3001,
      0.24,
    );
    const dustData = sampleRockSurfaceParticlesFromSampler(
      sampler,
      budgets.amberDustCount,
      6109,
      0.42,
    );
    const sparkData = sampleRockSurfaceParticlesFromSampler(
      sampler,
      budgets.sparkCount,
      9421,
      0.32,
    );
    const shardSamples = sampleRockSurfaceParticlesFromSampler(
      sampler,
      budgets.shardCount,
      1207,
      0,
    );

    const shardParams = new Float32Array(budgets.shardCount * 4);
    for (let i = 0; i < budgets.shardCount; i++) {
      const i4 = i * 4;
      shardParams[i4] = 0.65 + shardSamples.randoms[i4] * 1.65;
      shardParams[i4 + 1] = shardSamples.randoms[i4 + 1];
      shardParams[i4 + 2] = shardSamples.randoms[i4 + 2];
      shardParams[i4 + 3] = shardSamples.randoms[i4 + 3];
    }

    const built: CachedParticleLayers = {
      mineralData,
      dustData,
      sparkData,
      shardSamples,
      shardParams,
    };
    cachedParticleLayersByBudget.set(key, built);
    return built;
  }

  private syncLoopState(): void {
    if (this.disposed || this.contextLost || this.reducedMotion) {
      this.stopLoop();
      return;
    }
    if (this.inViewport && this.pageVisible) {
      if (!this.frameId) {
        this.startLoop();
      }
    } else {
      this.stopLoop();
    }
  }

  private buildStudioBackdrop(): THREE.ShaderMaterial {
    const bgGeo = new THREE.PlaneGeometry(160, 100);
    const bgMat = new THREE.ShaderMaterial({
      uniforms: {
        uCenter: { value: new THREE.Vector2(this.isMobile ? 0.52 : 0.68, this.isMobile ? 0.62 : 0.56) },
        uBgDeep: { value: new THREE.Color(0.043, 0.047, 0.051) },
        uBgHalo: { value: new THREE.Color(0.145, 0.165, 0.195) },
        uBgAccent: { value: new THREE.Color(0.11, 0.06, 0.025) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = vec2(position.x / 36.0 + 0.5, position.y / 22.0 + 0.5);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec2 uCenter;
        uniform vec3 uBgDeep;
        uniform vec3 uBgHalo;
        uniform vec3 uBgAccent;
        varying vec2 vUv;
        void main() {
          vec2 d = (vUv - uCenter) * vec2(1.15, 0.95);
          float radial = exp(-dot(d, d) * 3.1);
          vec2 accentDelta = vUv - vec2(uCenter.x + 0.04, uCenter.y - 0.18);
          vec3 accentGlow = uBgAccent * exp(-dot(accentDelta, accentDelta) * 8.0);
          vec3 col = mix(uBgDeep, uBgHalo, radial * 0.68) + accentGlow * 0.45;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthWrite: false,
      fog: false,
    });

    const backdrop = new THREE.Mesh(bgGeo, bgMat);
    backdrop.position.set(0, 0, -9.5);
    backdrop.renderOrder = -10;
    backdrop.frustumCulled = false;
    this.scene.add(backdrop);
    this.geometries.push(bgGeo);
    this.materials.push(bgMat);
    return bgMat;
  }

  public setTheme(version: ThemeVersion): void {
    if (this.disposed) return;
    const p = THREE_THEME_PALETTES[version];

    this.renderer.setClearColor(p.bgHex, 1);
    (this.scene.background as THREE.Color).setHex(p.bgHex);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(p.fogHex);
    }

    this.backdropMaterial.uniforms.uBgDeep.value.setRGB(...p.bgDeepRgb);
    this.backdropMaterial.uniforms.uBgHalo.value.setRGB(...p.bgHaloRgb);
    this.backdropMaterial.uniforms.uBgAccent.value.setRGB(...p.bgAccentRgb);

    this.hemiLight.color.setHex(p.hemiSkyHex);
    this.hemiLight.groundColor.setHex(p.hemiGroundHex);
    this.keyLight.color.setHex(p.keyLightHex);
    this.rimLight.color.setHex(p.rimLightHex);
    this.backRim.color.setHex(p.backRimHex);
    this.coreLight.color.setHex(p.coreLightHex);

    for (let i = 0; i < this.rockUniformSets.length; i++) {
      this.rockUniformSets[i].uFissureDeep.value.setRGB(...p.fissureDeepRgb);
      this.rockUniformSets[i].uFissureMid.value.setRGB(...p.fissureMidRgb);
      this.rockUniformSets[i].uFissureHot.value.setRGB(...p.fissureHotRgb);
    }

    this.mineralMaterial.uniforms.uWarmSandColor.value.setRGB(...p.mineralWarmSandRgb);
    this.mineralMaterial.uniforms.uEmberColor.value.setRGB(...p.mineralEmberRgb);

    this.amberDustMaterial.uniforms.uDustLow.value.setRGB(...p.dustLowRgb);
    this.amberDustMaterial.uniforms.uDustMid.value.setRGB(...p.dustMidRgb);
    this.amberDustMaterial.uniforms.uDustHot.value.setRGB(...p.dustHotRgb);

    this.sparkMaterial.uniforms.uDustLow.value.setRGB(...p.dustLowRgb);
    this.sparkMaterial.uniforms.uDustMid.value.setRGB(...p.dustMidRgb);
    this.sparkMaterial.uniforms.uDustHot.value.setRGB(...p.dustHotRgb);

    this.shardMaterial.uniforms.uRimColor.value.setRGB(...p.shardRimRgb);
    this.shardMaterial.uniforms.uEmberColor.value.setRGB(...p.shardEmberRgb);

    const coreMat = this.refinedCoreMesh.material as THREE.MeshStandardMaterial;
    coreMat.color.setHex(p.refinedCoreHex);
    coreMat.emissive.setHex(p.refinedEmissiveHex);

    const edgeMat = this.refinedEdges.material as THREE.LineBasicMaterial;
    edgeMat.color.setHex(p.refinedEdgeHex);

    if (this.reducedMotion) {
      this.renderFrame(0.016);
    }
  }

  public setRtl(rtl: boolean): void {
    if (this.disposed) return;
    this.isRtl = rtl;
    if (!this.isMobile) {
      this.rockGroup.position.x = rtl ? -2.15 : 2.15;
      this.backdropMaterial.uniforms.uCenter.value.set(rtl ? 0.30 : 0.70, 0.56);
    }
    if (this.reducedMotion) {
      this.renderFrame(0.016);
    }
  }

  private createParticleBufferGeometry(
    data: SampledSurfaceParticles,
  ): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.origins, 3));
    geo.setAttribute('aNormal', new THREE.BufferAttribute(data.normals, 3));
    geo.setAttribute('aThreshold', new THREE.BufferAttribute(data.thresholds, 1));
    geo.setAttribute('aRandom', new THREE.BufferAttribute(data.randoms, 4));
    geo.setAttribute('aExtra', new THREE.BufferAttribute(data.extras, 4));
    geo.setAttribute('aTarget', new THREE.BufferAttribute(data.targets, 3));
    return geo;
  }

  public setProgress(progress: number, immediate = false): void {
    this.targetProgress = clamp01(progress);
    if (immediate || this.reducedMotion) {
      this.smoothProgress = this.targetProgress;
      if (this.reducedMotion) {
        this.renderFrame(0.016);
      }
    }
  }

  public setPointer(normX: number, normY: number): void {
    this.targetPointerX = Math.max(-1, Math.min(1, normX));
    this.targetPointerY = Math.max(-1, Math.min(1, normY));
  }

  public setFadeOut(alpha: number): void {
    this.fadeOut = clamp01(alpha);
    if (this.reducedMotion) {
      this.renderFrame(0.016);
    }
  }

  public resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);

    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(Math.max(1, width >> 1), Math.max(1, height >> 1));
    }

    const pr = this.renderer.getPixelRatio();
    this.mineralMaterial.uniforms.uPixelRatio.value = pr;
    this.amberDustMaterial.uniforms.uPixelRatio.value = pr;
    this.sparkMaterial.uniforms.uPixelRatio.value = pr;

    if (this.reducedMotion) {
      this.renderFrame(0.016);
    }
  }

  private afterDraw(cb: () => void): void {
    if (this.disposed || this.contextLost) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed || this.contextLost) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 85);
    }
  }

  private startLoop(): void {
    this.stopLoop();
    this.lastTimestamp = performance.now();

    const tick = () => {
      if (this.disposed || this.contextLost || !this.inViewport || !this.pageVisible) {
        this.frameId = 0;
        return;
      }
      const now = performance.now();
      const dt = Math.min(0.08, Math.max(0.001, (now - this.lastTimestamp) / 1000));
      this.lastTimestamp = now;

      this.renderFrame(dt);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private stopLoop(): void {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
      this.frameId = 0;
    }
  }

  private renderFrame(dt: number): void {
    if (this.disposed || this.contextLost) return;

    this.elapsedTime += dt;

    // Frame-rate independent exponential damping for silky scroll & pointer response
    const scrollDamp = this.isSoftwareGl ? 1.0 : 1 - Math.exp(-11 * dt);
    const pointerDamp = this.isSoftwareGl ? 1.0 : 1 - Math.exp(-5.5 * dt);

    this.smoothProgress += (this.targetProgress - this.smoothProgress) * scrollDamp;
    if (Math.abs(this.targetProgress - this.smoothProgress) < 0.0004) {
      this.smoothProgress = this.targetProgress;
    }
    this.smoothPointerX += (this.targetPointerX - this.smoothPointerX) * pointerDamp;
    this.smoothPointerY += (this.targetPointerY - this.smoothPointerY) * pointerDamp;

    const p = this.smoothProgress;

    // Skip all 5 rock meshes & shadow passes once fully dissolved entering Stage 4
    const rockVisible = p * 1.08 <= 0.765;
    for (let i = 0; i < this.rockMeshes.length; i++) {
      this.rockMeshes[i].visible = rockVisible;
      if (rockVisible) {
        this.rockUniformSets[i].uProgress.value = p;
        this.rockUniformSets[i].uTime.value = this.elapsedTime;
      }
    }

    // Update GPU particle uniforms
    this.mineralMaterial.uniforms.uProgress.value = p;
    this.mineralMaterial.uniforms.uTime.value = this.elapsedTime;
    this.mineralMaterial.uniforms.uFadeOut.value = this.fadeOut;

    this.amberDustMaterial.uniforms.uProgress.value = p;
    this.amberDustMaterial.uniforms.uTime.value = this.elapsedTime;
    this.amberDustMaterial.uniforms.uFadeOut.value = this.fadeOut;

    this.sparkMaterial.uniforms.uProgress.value = p;
    this.sparkMaterial.uniforms.uTime.value = this.elapsedTime;
    this.sparkMaterial.uniforms.uFadeOut.value = this.fadeOut;

    // Cull instanced 3D shards completely outside their active dissolution window
    const shardsVisible = p > 0.02 && p < 0.905;
    this.shardMesh.visible = shardsVisible;
    if (shardsVisible) {
      this.shardMaterial.uniforms.uProgress.value = p;
      this.shardMaterial.uniforms.uTime.value = this.elapsedTime;
      this.shardMaterial.uniforms.uFadeOut.value = this.fadeOut;
    }

    // Subtle geological breathing & poised rotation
    const calmMotion = this.reducedMotion ? 0 : 1;
    this.rockGroup.rotation.y =
      -0.18 + p * 0.28 + Math.sin(this.elapsedTime * 0.22) * 0.025 * calmMotion;
    this.rockGroup.rotation.x =
      0.06 - p * 0.08 + Math.cos(this.elapsedTime * 0.18) * 0.015 * calmMotion;

    // Internal core thermal intensity peaks during Stage 3 Energy Release, calms in Stage 4
    const energyPeak = Math.sin(clamp01((p - 0.12) / 0.72) * Math.PI);
    this.coreLight.intensity = (1.1 + energyPeak * 3.2) * this.fadeOut;

    // Stage 4 refined mineral prism emerges delicately inside the coalescing luminous particle lattice
    const refinedReveal = smoothstep(0.74, 0.95, p) * this.fadeOut;
    const coreMat = this.refinedCoreMesh.material as THREE.MeshStandardMaterial;
    const edgeMat = this.refinedEdges.material as THREE.LineBasicMaterial;
    coreMat.opacity = refinedReveal * 0.84;
    edgeMat.opacity = refinedReveal * 0.62;
    this.refinedCoreMesh.visible = refinedReveal > 0.01;
    this.refinedEdges.visible = refinedReveal > 0.01;
    if (this.refinedCoreMesh.visible) {
      const slowSpin = 0.38 + this.elapsedTime * 0.09 * calmMotion;
      this.refinedCoreMesh.rotation.y = slowSpin;
      this.refinedEdges.rotation.y = slowSpin;
    }

    // Zero-allocation camera choreography & pointer parallax
    computeCameraPoseInto(
      p,
      this.smoothPointerX,
      this.smoothPointerY,
      this.isMobile,
      _cameraPoseScratch,
    );
    const mirrorX = this.isRtl && !this.isMobile ? -1 : 1;
    _camPosTarget.set(
      _cameraPoseScratch.posX * mirrorX,
      _cameraPoseScratch.posY,
      _cameraPoseScratch.posZ,
    );
    _camLookTarget.set(
      _cameraPoseScratch.lookX * mirrorX,
      _cameraPoseScratch.lookY,
      _cameraPoseScratch.lookZ,
    );

    const camDamp = this.isSoftwareGl ? 1.0 : 1 - Math.exp(-7 * dt);
    this.camera.position.lerp(_camPosTarget, camDamp);
    _camLookCurrent.lerp(_camLookTarget, camDamp);
    this.camera.lookAt(_camLookCurrent);

    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

    for (const tex of this.textures) {
      tex.dispose();
    }
    for (const geo of this.geometries) {
      geo.dispose();
    }
    for (const mat of this.materials) {
      mat.dispose();
    }
    if (this.envRenderTarget) {
      this.envRenderTarget.dispose();
    }
    if (this.composer) {
      this.composer.dispose();
    }
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
