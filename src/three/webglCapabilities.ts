let cachedWebGLAvailable: boolean | null = null;
let cachedSoftwareGl: boolean | null = null;

function probeWebGLCapabilities(): void {
  if (cachedWebGLAvailable !== null && cachedSoftwareGl !== null) return;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      cachedWebGLAvailable = false;
      cachedSoftwareGl = true;
      return;
    }
    cachedWebGLAvailable = true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    cachedWebGLAvailable = false;
    cachedSoftwareGl = true;
  }
}

export function isWebGLAvailable(): boolean {
  probeWebGLCapabilities();
  return cachedWebGLAvailable === true;
}

export function detectSoftwareWebGL(): boolean {
  probeWebGLCapabilities();
  return cachedSoftwareGl === true;
}
