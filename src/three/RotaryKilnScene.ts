import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hasCameraProjectionChanged } from './dissolutionMath';
import { detectSoftwareWebGL } from './webglCapabilities';
import type { KilnZoneId } from '../utils/kilnSimulation';

export interface ProjectedAnchor {
  id: KilnZoneId;
  xPct: number;
  yPct: number;
  visible: boolean;
}

export interface RotaryKilnSceneOptions {
  container: HTMLElement;
  reducedMotion: boolean;
  onAnchorsProjected?: (anchors: ProjectedAnchor[]) => void;
}

const ZONE_LOCAL_ANCHORS: readonly { id: KilnZoneId; local: THREE.Vector3 }[] = [
  { id: 'feed', local: new THREE.Vector3(-3.35, 0.88, 0.15) },
  { id: 'calcination', local: new THREE.Vector3(-1.55, 0.78, 0.15) },
  { id: 'transition', local: new THREE.Vector3(0.2, 0.7, 0.15) },
  { id: 'burning', local: new THREE.Vector3(1.85, 0.62, 0.15) },
  { id: 'cooler', local: new THREE.Vector3(3.4, 0.56, 0.15) },
];

const _projVec = new THREE.Vector3();

function createBrushedSteelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#333840';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 2) {
      const shade = 44 + ((y * 17) % 18);
      ctx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 7})`;
      ctx.fillRect(0, y, 256, 1);
    }
    ctx.fillStyle = 'rgba(18, 20, 23, 0.65)';
    for (let y = 32; y < 256; y += 44) {
      ctx.fillRect(0, y, 256, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 64, 14, 128, 64, 120);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Redraws the shell thermal gradient in-place onto a single reusable 512x128 canvas
 * to eliminate per-update canvas & WebGL texture reallocations.
 */
function paintThermalGradientCanvas(
  ctx: CanvasRenderingContext2D | null,
  thermalMode: boolean,
  hotspotIntensity: number,
): void {
  if (!ctx) return;
  if (!thermalMode) {
    const base = ctx.createLinearGradient(0, 0, 512, 0);
    base.addColorStop(0, '#2a313b');
    base.addColorStop(0.45, '#343d49');
    base.addColorStop(0.74, '#293446');
    base.addColorStop(0.84, hotspotIntensity > 0.65 ? '#1c428a' : '#2c3747');
    base.addColorStop(1, '#262d37');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 128);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0.0, '#131820');
    grad.addColorStop(0.28, '#1b2b44');
    grad.addColorStop(0.52, '#16418a');
    grad.addColorStop(0.72, '#1d64d8');
    grad.addColorStop(0.84, hotspotIntensity > 0.65 ? '#3b82f6' : '#2563eb');
    grad.addColorStop(0.95, '#193563');
    grad.addColorStop(1.0, '#161e2a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 128);
  }

  // Weld seams and shell bands
  ctx.fillStyle = 'rgba(11, 12, 13, 0.42)';
  for (let x = 24; x < 512; x += 48) {
    ctx.fillRect(x, 0, 2, 128);
  }

  // Localized refractory hotspot band on Ring B-04 (u ≈ 0.76)
  if (hotspotIntensity > 0.25) {
    const spotX = 392;
    const spotY = 64;
    const radius = thermalMode ? 56 : 36;
    const alpha = thermalMode
      ? Math.min(0.96, 0.3 + hotspotIntensity * 0.68)
      : Math.min(0.72, (hotspotIntensity - 0.2) * 0.8);
    const spot = ctx.createRadialGradient(spotX, spotY, 4, spotX, spotY, radius);
    spot.addColorStop(0, `rgba(239, 246, 255, ${alpha})`);
    spot.addColorStop(0.32, `rgba(96, 165, 250, ${alpha * 0.92})`);
    spot.addColorStop(0.68, `rgba(29, 100, 216, ${alpha * 0.52})`);
    spot.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = spot;
    ctx.fillRect(spotX - radius, 0, radius * 2, 128);
  }
}

/**
 * Merges an array of transformed BufferGeometries into a single draw-call geometry
 * and disposes all temporary part geometries immediately.
 */
function mergeAndDisposeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i++) {
    parts[i].dispose();
  }
  if (!merged) {
    throw new Error('Failed to merge static kiln sub-geometries.');
  }
  return merged;
}

export class RotaryKilnScene {
  private readonly container: HTMLElement;
  private readonly isSoftwareGl: boolean;
  private readonly reducedMotion: boolean;
  private readonly onAnchorsProjected?: (anchors: ProjectedAnchor[]) => void;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly envTarget: THREE.WebGLRenderTarget;

  private readonly kilnRoot: THREE.Group;
  private readonly rotatingDrumGroup: THREE.Group;
  private readonly shellMaterial: THREE.MeshStandardMaterial;
  private readonly hotspotRingMesh: THREE.Mesh;
  private readonly hotspotRingMat: THREE.MeshBasicMaterial;
  private readonly selectedRingMesh: THREE.Mesh;
  private readonly hotspotLight: THREE.PointLight;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly thermalCanvas: HTMLCanvasElement;
  private readonly thermalCtx: CanvasRenderingContext2D | null;
  private readonly shellThermalTex: THREE.CanvasTexture;

  private thermalMode = false;
  private hotspotIntensity = 0.96;
  private selectedZone: KilnZoneId = 'burning';

  private orbitYaw = -0.32;
  private orbitPitch = 0.28;
  private targetYaw = -0.32;
  private targetPitch = 0.28;
  private lastProjYaw = Number.NaN;
  private lastProjPitch = Number.NaN;
  private lastProjWidth = 0;
  private lastProjHeight = 0;
  private viewportWidth = 720;
  private viewportHeight = 400;

  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private drumAngle = 0;
  private frameId = 0;
  private gpuLoopRunning = false;
  private renderBusy = false;
  private renderDirty = false;
  private disposed = false;
  private inViewport = true;
  private pageVisible = typeof document !== 'undefined' ? !document.hidden : true;

  private readonly resizeObserver: ResizeObserver | null;
  private readonly intersectionObserver: IntersectionObserver | null;

  constructor(options: RotaryKilnSceneOptions) {
    this.container = options.container;
    this.reducedMotion = options.reducedMotion;
    this.onAnchorsProjected = options.onAnchorsProjected;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.viewportWidth = Math.max(1, this.container.clientWidth || 720);
    this.viewportHeight = Math.max(1, this.container.clientHeight || 400);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0xeef3f9, 1);

    const canvas = this.renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.cursor = 'grab';
    this.container.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef3f9);
    this.scene.fog = new THREE.FogExp2(0xeef3f9, 0.022);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(
      32,
      this.viewportWidth / this.viewportHeight,
      0.1,
      60,
    );
    this.updateCameraFromOrbit();

    // Clean daylight-studio lighting for high-contrast White / Blue / Black legibility
    const hemi = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.15);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(5.5, 8.2, 6.4);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -6;
      keyLight.shadow.camera.right = 6;
      keyLight.shadow.camera.top = 5;
      keyLight.shadow.camera.bottom = -5;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x2563eb, 1.35);
    rimLight.position.set(-6.0, 3.2, -5.2);
    this.scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.95);
    fillLight.position.set(-4.5, 2.0, 5.5);
    this.scene.add(fillLight);

    // Subtle CAD floor datum grid + soft contact shadow plane
    const shadowTex = createContactShadowTexture();
    this.textures.push(shadowTex);
    const shadowGeo = new THREE.PlaneGeometry(10.8, 4.2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.34,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.set(0, -1.18, 0);
    this.scene.add(shadowPlane);
    this.geometries.push(shadowGeo);
    this.materials.push(shadowMat);

    const grid = new THREE.GridHelper(15, 22, 0xc3d0e0, 0xdce4ef);
    grid.position.y = -1.2;
    this.scene.add(grid);

    // Root kiln assembly group
    this.kilnRoot = new THREE.Group();
    this.scene.add(this.kilnRoot);

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const steelTex = createBrushedSteelTexture();
    steelTex.anisotropy = maxAnisotropy;
    this.textures.push(steelTex);

    // Reusable thermal gradient canvas + single GPU texture (in-place updates, zero reallocations)
    this.thermalCanvas = document.createElement('canvas');
    this.thermalCanvas.width = 512;
    this.thermalCanvas.height = 128;
    this.thermalCtx = this.thermalCanvas.getContext('2d');
    paintThermalGradientCanvas(this.thermalCtx, false, this.hotspotIntensity);
    this.shellThermalTex = new THREE.CanvasTexture(this.thermalCanvas);
    this.shellThermalTex.colorSpace = THREE.SRGBColorSpace;
    this.shellThermalTex.anisotropy = maxAnisotropy;
    this.textures.push(this.shellThermalTex);

    const darkStructuralMat = new THREE.MeshStandardMaterial({
      color: 0x161b24,
      roughness: 0.62,
      metalness: 0.45,
    });
    const concretePierMat = new THREE.MeshStandardMaterial({
      color: 0x333c4a,
      roughness: 0.84,
      metalness: 0.1,
    });
    const machinedSteelMat = new THREE.MeshStandardMaterial({
      color: 0x9aa6b8,
      roughness: 0.26,
      metalness: 0.85,
      envMapIntensity: 1.25,
    });
    const copperAccentMat = new THREE.MeshStandardMaterial({
      color: 0x1d64d8,
      roughness: 0.34,
      metalness: 0.62,
      envMapIntensity: 1.15,
    });
    const ductMat = new THREE.MeshStandardMaterial({
      color: 0x242c38,
      map: steelTex,
      roughness: 0.54,
      metalness: 0.52,
    });
    this.materials.push(
      darkStructuralMat,
      concretePierMat,
      machinedSteelMat,
      copperAccentMat,
      ductMat,
    );

    // 1. Inclined Rotary Drum Assembly (~3.5° downward pitch from feed end to discharge end)
    const kilnSlope = -0.055;
    const drumAxisGroup = new THREE.Group();
    drumAxisGroup.position.set(0, 0.25, 0);
    drumAxisGroup.rotation.z = kilnSlope;
    this.kilnRoot.add(drumAxisGroup);

    this.rotatingDrumGroup = new THREE.Group();
    drumAxisGroup.add(this.rotatingDrumGroup);

    // Main Cylindrical Steel Shell (heightSegments = 1: mathematically identical linear UVs with 86% fewer triangles)
    const shellGeo = new THREE.CylinderGeometry(0.56, 0.56, 6.4, 36, 1, false);
    shellGeo.rotateZ(-Math.PI / 2);
    const posAttr = shellGeo.attributes.position;
    const uvAttr = shellGeo.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const u = THREE.MathUtils.clamp((x + 3.2) / 6.4, 0, 1);
      const v = (Math.atan2(z, y) + Math.PI) / (Math.PI * 2);
      uvAttr.setXY(i, u, v);
    }
    uvAttr.needsUpdate = true;

    this.shellMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.shellThermalTex,
      roughness: 0.52,
      metalness: 0.55,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
      envMapIntensity: 1.15,
    });
    const shellMesh = new THREE.Mesh(shellGeo, this.shellMaterial);
    shellMesh.castShadow = !this.isSoftwareGl;
    shellMesh.receiveShadow = !this.isSoftwareGl;
    this.rotatingDrumGroup.add(shellMesh);
    this.geometries.push(shellGeo);
    this.materials.push(this.shellMaterial);

    // 2. Three Heavy Machined Riding Rings (Tyres) + Six Retaining Flanges — merged into 2 draw calls
    const tyreXs = [-2.25, -0.1, 2.05];
    const tyreBaseGeo = new THREE.CylinderGeometry(0.68, 0.68, 0.34, 32);
    tyreBaseGeo.rotateZ(Math.PI / 2);
    const flangeBaseGeo = new THREE.TorusGeometry(0.61, 0.032, 8, 32);
    flangeBaseGeo.rotateY(Math.PI / 2);

    const tyreParts: THREE.BufferGeometry[] = [];
    const flangeParts: THREE.BufferGeometry[] = [];
    for (const tx of tyreXs) {
      const tGeo = tyreBaseGeo.clone();
      tGeo.translate(tx, 0, 0);
      tyreParts.push(tGeo);

      const leftF = flangeBaseGeo.clone();
      leftF.translate(tx - 0.19, 0, 0);
      flangeParts.push(leftF);

      const rightF = flangeBaseGeo.clone();
      rightF.translate(tx + 0.19, 0, 0);
      flangeParts.push(rightF);
    }
    tyreBaseGeo.dispose();
    flangeBaseGeo.dispose();

    const mergedTyresGeo = mergeAndDisposeParts(tyreParts);
    const mergedTyresMesh = new THREE.Mesh(mergedTyresGeo, machinedSteelMat);
    mergedTyresMesh.castShadow = !this.isSoftwareGl;
    this.rotatingDrumGroup.add(mergedTyresMesh);

    const mergedFlangesGeo = mergeAndDisposeParts(flangeParts);
    const mergedFlangesMesh = new THREE.Mesh(mergedFlangesGeo, darkStructuralMat);
    this.rotatingDrumGroup.add(mergedFlangesMesh);
    this.geometries.push(mergedTyresGeo, mergedFlangesGeo);

    // 3. Girth Gear (Main Toothed Ring Gear around center-left shell)
    const girthGeo = new THREE.CylinderGeometry(0.84, 0.84, 0.24, 32);
    girthGeo.rotateZ(Math.PI / 2);
    const girthMesh = new THREE.Mesh(girthGeo, copperAccentMat);
    girthMesh.position.x = -0.82;
    this.rotatingDrumGroup.add(girthMesh);
    this.geometries.push(girthGeo);

    // Gear teeth ring accents via InstancedMesh (32 teeth in 1 draw call)
    const toothGeo = new THREE.BoxGeometry(0.24, 0.06, 0.05);
    const teethInst = new THREE.InstancedMesh(toothGeo, machinedSteelMat, 32);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * Math.PI * 2;
      dummy.position.set(-0.82, Math.cos(angle) * 0.85, Math.sin(angle) * 0.85);
      dummy.rotation.set(angle, 0, 0);
      dummy.updateMatrix();
      teethInst.setMatrixAt(i, dummy.matrix);
    }
    teethInst.instanceMatrix.needsUpdate = true;
    teethInst.computeBoundingSphere();
    this.rotatingDrumGroup.add(teethInst);
    this.geometries.push(toothGeo);

    // 4. Localized Thermal Hotspot Highlight Band (Ring B-04 at Burning Zone x ≈ 1.45)
    const hotspotRingGeo = new THREE.CylinderGeometry(0.585, 0.585, 0.72, 32, 1, true);
    hotspotRingGeo.rotateZ(Math.PI / 2);
    this.hotspotRingMat = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.hotspotRingMesh = new THREE.Mesh(hotspotRingGeo, this.hotspotRingMat);
    this.hotspotRingMesh.position.x = 1.45;
    drumAxisGroup.add(this.hotspotRingMesh);
    this.geometries.push(hotspotRingGeo);
    this.materials.push(this.hotspotRingMat);

    // Selected Section Thin Precision Reticle Ring
    const selectRingGeo = new THREE.TorusGeometry(0.76, 0.018, 8, 40);
    selectRingGeo.rotateY(Math.PI / 2);
    const selectRingMat = new THREE.MeshBasicMaterial({
      color: 0x0b0c0d,
      transparent: true,
      opacity: 0.88,
    });
    this.selectedRingMesh = new THREE.Mesh(selectRingGeo, selectRingMat);
    this.selectedRingMesh.position.x = 1.45;
    drumAxisGroup.add(this.selectedRingMesh);
    this.geometries.push(selectRingGeo);
    this.materials.push(selectRingMat);

    // Subtle localized blue thermal highlight light near Ring B-04
    this.hotspotLight = new THREE.PointLight(0x3b82f6, 1.5, 4.0, 2);
    this.hotspotLight.position.set(1.45, 0.55, 0.95);
    this.kilnRoot.add(this.hotspotLight);

    // 5–8. Static Support Piers, Trunnion Rollers, Drive Unit, Feed Hood & Firing Hood
    // Grouped and merged by material (24 individual meshes -> 4 batched static draw calls)
    const concreteParts: THREE.BufferGeometry[] = [];
    const rollerParts: THREE.BufferGeometry[] = [];
    const darkStructuralParts: THREE.BufferGeometry[] = [];
    const ductParts: THREE.BufferGeometry[] = [];

    const rollerBaseGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 20);
    rollerBaseGeo.rotateZ(Math.PI / 2);
    const pierBaseGeo = new THREE.BoxGeometry(0.76, 0.88, 1.68);
    const bearingBaseGeo = new THREE.BoxGeometry(0.46, 0.22, 0.34);

    for (const tx of tyreXs) {
      const slopeY = 0.25 + tx * Math.sin(kilnSlope);
      const pierHeight = slopeY - 0.68 + 1.18;

      const baseGeo = pierBaseGeo.clone();
      baseGeo.scale(1, Math.max(0.55, pierHeight / 0.88), 1);
      baseGeo.translate(tx, -1.18 + pierHeight * 0.5, 0);
      concreteParts.push(baseGeo);

      for (const zSign of [-1, 1]) {
        const rGeo = rollerBaseGeo.clone();
        rGeo.translate(tx, slopeY - 0.66, zSign * 0.58);
        rollerParts.push(rGeo);

        const hGeo = bearingBaseGeo.clone();
        hGeo.translate(tx, slopeY - 0.86, zSign * 0.58);
        darkStructuralParts.push(hGeo);
      }
    }
    rollerBaseGeo.dispose();
    pierBaseGeo.dispose();
    bearingBaseGeo.dispose();

    // Main Drive Motor & Gearbox Unit alongside Girth Gear
    const driveBaseGeo = new THREE.BoxGeometry(0.82, 0.54, 0.64);
    driveBaseGeo.translate(-0.82, -0.91, 1.18);
    concreteParts.push(driveBaseGeo);

    const motorGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.62, 18);
    motorGeo.rotateZ(Math.PI / 2);
    motorGeo.translate(-0.82 + 0.05, -0.91 + 0.36, 1.18);
    darkStructuralParts.push(motorGeo);

    // Feed End Preheater Inlet Hood, Vertical Riser Duct & Cyclone
    const feedHoodGeo = new THREE.BoxGeometry(0.88, 1.65, 1.38);
    feedHoodGeo.translate(-3.55, 0.35 - 0.35, 0);
    ductParts.push(feedHoodGeo);

    const riserGeo = new THREE.CylinderGeometry(0.36, 0.42, 1.25, 20);
    riserGeo.translate(-3.55 - 0.1, 0.35 + 0.95, 0);
    ductParts.push(riserGeo);

    const cycloneConeGeo = new THREE.ConeGeometry(0.46, 0.68, 20);
    cycloneConeGeo.rotateX(Math.PI);
    cycloneConeGeo.translate(-3.55 - 0.1, 0.35 + 0.22, -0.68);
    darkStructuralParts.push(cycloneConeGeo);

    const feedSupportGeo = new THREE.BoxGeometry(0.82, 0.4, 1.32);
    feedSupportGeo.translate(-3.55, 0.35 - 1.33, 0);
    concreteParts.push(feedSupportGeo);

    // Discharge Firing Hood, Grate Cooler Chute & Burner Stand
    const hoodGeo = new THREE.BoxGeometry(0.92, 1.52, 1.44);
    hoodGeo.translate(3.52, -0.05 - 0.05, 0);
    ductParts.push(hoodGeo);

    const coolerGeo = new THREE.BoxGeometry(1.42, 0.62, 1.24);
    coolerGeo.translate(3.52 + 0.28, -0.05 - 0.82, 0);
    darkStructuralParts.push(coolerGeo);

    const burnerStandGeo = new THREE.BoxGeometry(0.14, 1.22, 0.26);
    burnerStandGeo.translate(3.52 + 1.16, -0.05 - 0.52, 0);
    darkStructuralParts.push(burnerStandGeo);

    const mergedConcreteGeo = mergeAndDisposeParts(concreteParts);
    const mergedConcreteMesh = new THREE.Mesh(mergedConcreteGeo, concretePierMat);
    mergedConcreteMesh.receiveShadow = !this.isSoftwareGl;
    this.kilnRoot.add(mergedConcreteMesh);

    const mergedRollersGeo = mergeAndDisposeParts(rollerParts);
    const mergedRollersMesh = new THREE.Mesh(mergedRollersGeo, machinedSteelMat);
    this.kilnRoot.add(mergedRollersMesh);

    const mergedDarkGeo = mergeAndDisposeParts(darkStructuralParts);
    const mergedDarkMesh = new THREE.Mesh(mergedDarkGeo, darkStructuralMat);
    this.kilnRoot.add(mergedDarkMesh);

    const mergedDuctGeo = mergeAndDisposeParts(ductParts);
    const mergedDuctMesh = new THREE.Mesh(mergedDuctGeo, ductMat);
    mergedDuctMesh.castShadow = !this.isSoftwareGl;
    this.kilnRoot.add(mergedDuctMesh);

    this.geometries.push(mergedConcreteGeo, mergedRollersGeo, mergedDarkGeo, mergedDuctGeo);

    // Multi-channel main burner lance entering center of firing hood
    const lanceGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.1, 16);
    lanceGeo.rotateZ(Math.PI / 2);
    const lanceMesh = new THREE.Mesh(lanceGeo, copperAccentMat);
    lanceMesh.position.set(3.52 + 0.82, -0.05 + 0.12, 0);
    this.kilnRoot.add(lanceMesh);
    this.geometries.push(lanceGeo);

    // Pointer drag orbit & visibility listeners
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

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
          this.syncGpuLoopState();
        },
        { threshold: 0 },
      );
      this.intersectionObserver.observe(this.container);
    } else {
      this.intersectionObserver = null;
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.updateVisualState();
    this.requestRender();
    this.syncGpuLoopState();
  }

  private readonly onVisibilityChange = () => {
    this.pageVisible = !document.hidden;
    this.syncGpuLoopState();
  };

  private readonly onPointerDown = (e: PointerEvent) => {
    this.isDragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.renderer.domElement.style.cursor = 'grabbing';
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging || this.disposed) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    this.targetYaw = THREE.MathUtils.clamp(this.targetYaw - dx * 0.006, -1.05, 0.72);
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * 0.005, 0.08, 0.68);
    if (this.isSoftwareGl) {
      this.orbitYaw = this.targetYaw;
      this.orbitPitch = this.targetPitch;
    }
    this.requestRender();
  };

  private readonly onPointerUp = () => {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.renderer.domElement.style.cursor = 'grab';
  };

  public setState(params: {
    thermalMode: boolean;
    hotspotIntensity: number;
    selectedZone: KilnZoneId;
  }): void {
    if (this.disposed) return;
    const clampedHotspot = THREE.MathUtils.clamp(params.hotspotIntensity, 0, 1);
    const texChanged =
      this.thermalMode !== params.thermalMode ||
      Math.abs(this.hotspotIntensity - clampedHotspot) > 0.05;

    this.thermalMode = params.thermalMode;
    this.hotspotIntensity = clampedHotspot;
    this.selectedZone = params.selectedZone;

    if (texChanged) {
      paintThermalGradientCanvas(this.thermalCtx, this.thermalMode, this.hotspotIntensity);
      this.shellThermalTex.needsUpdate = true;
    }

    this.updateVisualState();
    this.requestRender();
  }

  public resetCamera(): void {
    this.targetYaw = -0.32;
    this.targetPitch = 0.28;
    if (this.isSoftwareGl) {
      this.orbitYaw = this.targetYaw;
      this.orbitPitch = this.targetPitch;
    }
    this.requestRender();
  }

  private updateVisualState(): void {
    if (this.thermalMode) {
      this.shellMaterial.emissive.setHex(0x13387a);
      this.shellMaterial.emissiveIntensity = 0.28 + this.hotspotIntensity * 0.32;
    } else {
      this.shellMaterial.emissive.setHex(0x0b224d);
      this.shellMaterial.emissiveIntensity = this.hotspotIntensity > 0.6 ? 0.14 : 0.02;
    }

    this.hotspotRingMat.opacity = this.thermalMode
      ? Math.max(0.12, this.hotspotIntensity * 0.55)
      : Math.max(0, (this.hotspotIntensity - 0.35) * 0.44);
    this.hotspotRingMesh.visible = this.hotspotRingMat.opacity > 0.03;

    this.hotspotLight.intensity = this.thermalMode
      ? 0.5 + this.hotspotIntensity * 1.9
      : this.hotspotIntensity * 0.9;

    const xByZone: Record<KilnZoneId, number> = {
      feed: -2.85,
      calcination: -1.45,
      transition: 0.15,
      burning: 1.55,
      cooler: 2.95,
    };
    this.selectedRingMesh.position.x = xByZone[this.selectedZone] ?? 1.55;
  }

  private updateCameraFromOrbit(): void {
    const radius = 9.4;
    const cosPitch = Math.cos(this.orbitPitch);
    const x = Math.sin(this.orbitYaw) * cosPitch * radius;
    const y = Math.sin(this.orbitPitch) * radius + 0.15;
    const z = Math.cos(this.orbitYaw) * cosPitch * radius;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, -0.05, 0);
  }

  private projectAnchorsIfNeeded(): void {
    if (!this.onAnchorsProjected) return;
    if (
      !hasCameraProjectionChanged(
        this.lastProjYaw,
        this.lastProjPitch,
        this.lastProjWidth,
        this.lastProjHeight,
        this.orbitYaw,
        this.orbitPitch,
        this.viewportWidth,
        this.viewportHeight,
      )
    ) {
      return;
    }

    this.lastProjYaw = this.orbitYaw;
    this.lastProjPitch = this.orbitPitch;
    this.lastProjWidth = this.viewportWidth;
    this.lastProjHeight = this.viewportHeight;

    this.camera.updateMatrixWorld();
    const projected: ProjectedAnchor[] = ZONE_LOCAL_ANCHORS.map((anchor) => {
      _projVec.copy(anchor.local).project(this.camera);
      const xPct = (_projVec.x * 0.5 + 0.5) * 100;
      const yPct = (-_projVec.y * 0.5 + 0.5) * 100;
      return {
        id: anchor.id,
        xPct: THREE.MathUtils.clamp(xPct, 8, 92),
        yPct: THREE.MathUtils.clamp(yPct, 12, 86),
        visible: _projVec.z < 1,
      };
    });
    this.onAnchorsProjected(projected);
  }

  public resize(): void {
    if (this.disposed) return;
    this.viewportWidth = Math.max(1, this.container.clientWidth || 720);
    this.viewportHeight = Math.max(1, this.container.clientHeight || 400);
    this.camera.aspect = this.viewportWidth / this.viewportHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false);
    this.requestRender();
  }

  private afterDraw(cb: () => void): void {
    if (this.disposed) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
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
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private requestRender(): void {
    if (this.disposed || this.gpuLoopRunning) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame(() => {
      if (this.disposed) return;
      this.renderDirty = false;
      this.updateCameraFromOrbit();
      this.renderer.render(this.scene, this.camera);
      this.projectAnchorsIfNeeded();
      const done = () => {
        this.renderBusy = false;
        if (this.renderDirty) {
          this.requestRender();
        }
      };
      if (this.isSoftwareGl) {
        this.afterDraw(done);
      } else {
        done();
      }
    });
  }

  private syncGpuLoopState(): void {
    if (this.disposed || this.isSoftwareGl || this.reducedMotion) return;
    if (this.inViewport && this.pageVisible) {
      if (!this.gpuLoopRunning) {
        this.startGpuLoop();
      }
    } else if (this.gpuLoopRunning) {
      this.stopGpuLoop();
    }
  }

  private stopGpuLoop(): void {
    this.gpuLoopRunning = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
      this.frameId = 0;
    }
  }

  private startGpuLoop(): void {
    this.stopGpuLoop();
    this.gpuLoopRunning = true;
    let last = performance.now();

    const tick = () => {
      if (this.disposed || !this.gpuLoopRunning || !this.inViewport || !this.pageVisible) {
        this.gpuLoopRunning = false;
        this.frameId = 0;
        return;
      }
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;

      this.drumAngle += dt * 0.28;
      this.rotatingDrumGroup.rotation.x = this.drumAngle;

      const yawDiff = this.targetYaw - this.orbitYaw;
      const pitchDiff = this.targetPitch - this.orbitPitch;
      if (Math.abs(yawDiff) > 1e-5 || Math.abs(pitchDiff) > 1e-5) {
        const damp = 1 - Math.exp(-8 * dt);
        this.orbitYaw += yawDiff * damp;
        this.orbitPitch += pitchDiff * damp;
        this.updateCameraFromOrbit();
      }

      this.renderer.render(this.scene, this.camera);
      this.projectAnchorsIfNeeded();
      this.frameId = requestAnimationFrame(tick);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gpuLoopRunning = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      clearTimeout(this.frameId);
      this.frameId = 0;
    }
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    for (const tex of this.textures) tex.dispose();
    for (const geo of this.geometries) geo.dispose();
    for (const mat of this.materials) mat.dispose();
    this.envTarget.dispose();
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
