/**
 * Effects TASK-005 — the CRT Glass renderer: graphics only.
 *
 * Loaded lazily by `CrtGlassField` (`scanline-field.tsx`) after the app has
 * rendered and only while Visual effects is on, so this file and its shaders
 * form their own chunk. It owns no policy, scheduling, masking or
 * compositing. It is handed a source texture the app already owns (the
 * Echo-composed image) and draws the CRT Glass field from it into one canvas.
 * It never captures the DOM.
 *
 * The pipeline reproduces what the preserved motion host does in PixiJS 8.22.0
 * with pixi-filters 6.1.5, without shipping either library. That is the same
 * three passes in the same order (`shaders.ts`), with the same quad, the same
 * filter-input geometry (the filter frame's own size, half-texel input clamp),
 * the same uniform values rounded to 32-bit floats as Pixi rounds them, and the
 * same linear, clamped sampling. The result is pixel-comparable with the host.
 * Pixi resolution 1: one canvas pixel per specimen pixel.
 */
import type { CrtGlassValues } from './preset'
import { CRT_FRAGMENT, FILTER_VERTEX, GLASS_FRAGMENT, SOURCE_FRAGMENT } from './shaders'

/** WebGL2 is unavailable or a program failed; the caller keeps the plain UI. */
export class CrtGlassUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CrtGlassUnsupportedError'
  }
}

export interface CrtGlassRendererOptions {
  canvas: HTMLCanvasElement
  /** The app-owned source image, already Echo-composed. Never a DOM capture. */
  source: TexImageSource
  /** Logical size; the canvas is this many pixels (resolution 1). */
  width: number
  height: number
  values: Readonly<CrtGlassValues>
  /** Keep the drawn frame readable after compositing. For proofs only. */
  preserveDrawingBuffer?: boolean
  /** Called once if the browser takes the graphics context away. */
  onContextLost?: () => void
}

export interface CrtGlassRenderer {
  /** Draw one frame at this line phase and grain seed. */
  render(phase: number, seed: number): void
  /** Replace the values the next frame uses. */
  update(values: Readonly<CrtGlassValues>): void
  /** Release every graphics resource this renderer allocated. */
  destroy(): void
  /** The GL renderer string, for proof records. */
  readonly glRenderer: string
}

type GL = WebGL2RenderingContext

function compile(gl: GL, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new CrtGlassUnsupportedError('Could not create a shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new CrtGlassUnsupportedError(`Shader did not compile: ${log ?? ''}`)
  }
  return shader
}

interface Program {
  program: WebGLProgram
  uniform: (name: string) => WebGLUniformLocation | null
}

function link(gl: GL, fragment: string): Program {
  const vertexShader = compile(gl, gl.VERTEX_SHADER, FILTER_VERTEX)
  const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, fragment)
  const program = gl.createProgram()
  if (!program) throw new CrtGlassUnsupportedError('Could not create a program')
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.bindAttribLocation(program, 0, 'aPosition')
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new CrtGlassUnsupportedError(`Program did not link: ${log ?? ''}`)
  }
  const locations = new Map<string, WebGLUniformLocation | null>()
  return {
    program,
    uniform(name) {
      if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name))
      return locations.get(name) ?? null
    },
  }
}

function texture(gl: GL, width: number, height: number, source?: TexImageSource): WebGLTexture {
  const created = gl.createTexture()
  if (!created) throw new CrtGlassUnsupportedError('Could not create a texture')
  gl.bindTexture(gl.TEXTURE_2D, created)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  if (source) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source)
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  }
  return created
}

/**
 * Create the renderer. Throws `CrtGlassUnsupportedError` when the browser
 * cannot run it, having released anything it had already allocated.
 */
export function createCrtGlassRenderer(options: CrtGlassRendererOptions): CrtGlassRenderer {
  const { canvas, source, width, height } = options
  canvas.width = width
  canvas.height = height
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
  })
  if (!gl) throw new CrtGlassUnsupportedError('WebGL2 is not available')

  const programs: Program[] = []
  const textures: WebGLTexture[] = []
  const framebuffers: WebGLFramebuffer[] = []
  const buffers: WebGLBuffer[] = []
  let vertexArray: WebGLVertexArrayObject | null = null
  let destroyed = false

  const onLost = (event: Event) => {
    event.preventDefault()
    options.onContextLost?.()
  }

  function release() {
    if (destroyed) return
    destroyed = true
    canvas.removeEventListener('webglcontextlost', onLost)
    if (gl!.isContextLost()) return
    for (const { program } of programs) gl!.deleteProgram(program)
    for (const item of textures) gl!.deleteTexture(item)
    for (const item of framebuffers) gl!.deleteFramebuffer(item)
    for (const item of buffers) gl!.deleteBuffer(item)
    if (vertexArray) gl!.deleteVertexArray(vertexArray)
  }

  try {
    canvas.addEventListener('webglcontextlost', onLost)
    const sourceProgram = link(gl, SOURCE_FRAGMENT)
    const crtProgram = link(gl, CRT_FRAGMENT)
    const glassProgram = link(gl, GLASS_FRAGMENT)
    programs.push(sourceProgram, crtProgram, glassProgram)

    // Pixi's filter quad: (0,0) (1,0) (1,1) (0,1), two triangles.
    vertexArray = gl.createVertexArray()
    gl.bindVertexArray(vertexArray)
    const positions = gl.createBuffer()
    const indices = gl.createBuffer()
    if (!positions || !indices) throw new CrtGlassUnsupportedError('Could not create buffers')
    buffers.push(positions, indices)
    gl.bindBuffer(gl.ARRAY_BUFFER, positions)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)

    const sourceTexture = texture(gl, width, height, source)
    const inputs = [texture(gl, width, height), texture(gl, width, height)] as const
    textures.push(sourceTexture, ...inputs)
    const targets = inputs.map((target) => {
      const framebuffer = gl.createFramebuffer()
      if (!framebuffer) throw new CrtGlassUnsupportedError('Could not create a framebuffer')
      framebuffers.push(framebuffer)
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0)
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new CrtGlassUnsupportedError('Framebuffer incomplete')
      }
      return framebuffer
    })
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    // Pixi's global filter uniforms for a frame of this size, rounded as its
    // Float32Array storage rounds them: input size, half-texel clamp, frame.
    const inverseWidth = Math.fround(1 / width)
    const inverseHeight = Math.fround(1 / height)
    const inputSize = [width, height, inverseWidth, inverseHeight] as const
    const inputClamp = [
      0.5 * inverseWidth,
      0.5 * inverseHeight,
      width * inverseWidth - 0.5 * inverseWidth,
      height * inverseHeight - 0.5 * inverseHeight,
    ] as const

    let values = options.values

    function pass(program: Program, target: WebGLFramebuffer | null, input: WebGLTexture, toCanvas: boolean) {
      const g = gl!
      g.bindFramebuffer(g.FRAMEBUFFER, target)
      g.viewport(0, 0, width, height)
      g.clearColor(0, 0, 0, 0)
      g.clear(g.COLOR_BUFFER_BIT)
      g.useProgram(program.program)
      g.uniform4f(program.uniform('uInputSize'), ...inputSize)
      g.uniform4f(program.uniform('uOutputFrame'), 0, 0, width, height)
      // Pixi flips the root target (z = -1) and not its filter textures (z = 1).
      g.uniform4f(program.uniform('uOutputTexture'), width, height, toCanvas ? -1 : 1, 0)
      g.activeTexture(g.TEXTURE0)
      g.bindTexture(g.TEXTURE_2D, input)
      g.uniform1i(program.uniform('uTexture'), 0)
    }

    function render(phase: number, seed: number) {
      if (destroyed || gl!.isContextLost()) return
      const g = gl!
      g.disable(g.DEPTH_TEST)
      g.disable(g.SCISSOR_TEST)
      g.enable(g.BLEND)
      g.blendFuncSeparate(g.ONE, g.ONE_MINUS_SRC_ALPHA, g.ONE, g.ONE_MINUS_SRC_ALPHA)
      g.bindVertexArray(vertexArray)

      // 0 — the source into the first filter input.
      pass(sourceProgram, targets[0]!, sourceTexture, false)
      g.drawElements(g.TRIANGLES, 6, g.UNSIGNED_SHORT, 0)

      // 1 — CRTFilter: its own lines and grain off; the vignette only.
      pass(crtProgram, targets[1]!, inputs[0], false)
      g.uniform4f(crtProgram.uniform('uLine'), values.curvature, 0, 0, values.verticalLine ? 1 : 0)
      g.uniform2f(crtProgram.uniform('uNoise'), 0, values.noiseSize)
      g.uniform3f(crtProgram.uniform('uVignette'), values.vignetting, values.vignettingAlpha, values.vignettingBlur)
      g.uniform1f(crtProgram.uniform('uSeed'), seed)
      g.uniform1f(crtProgram.uniform('uTime'), phase)
      g.uniform2f(crtProgram.uniform('uDimensions'), width, height)
      g.drawElements(g.TRIANGLES, 6, g.UNSIGNED_SHORT, 0)

      // 2 — edge softness, colour protection, then one line field and grain.
      pass(glassProgram, null, inputs[1], true)
      g.uniform4f(glassProgram.uniform('uInputClamp'), ...inputClamp)
      g.activeTexture(g.TEXTURE1)
      g.bindTexture(g.TEXTURE_2D, sourceTexture)
      g.uniform1i(glassProgram.uniform('uOriginal'), 1)
      g.uniform1f(glassProgram.uniform('uSoftness'), values.edgeBlur)
      g.uniform1f(glassProgram.uniform('uReach'), values.edgeWidth)
      g.uniform1f(glassProgram.uniform('uProtectColors'), values.colorProtect ? 1 : 0)
      g.uniform2f(glassProgram.uniform('uSize'), width, height)
      g.uniform4f(glassProgram.uniform('uLine'), values.curvature, values.lineWidth, values.lineContrast, values.verticalLine ? 1 : 0)
      g.uniform1f(glassProgram.uniform('uPhase'), phase)
      g.uniform3f(glassProgram.uniform('uGrain'), values.noise, values.noiseSize, seed)
      g.uniform1f(glassProgram.uniform('uGrainSoftness'), Math.max(0, Math.min(1, values.grainSoftness)))
      g.drawElements(g.TRIANGLES, 6, g.UNSIGNED_SHORT, 0)
      g.bindVertexArray(null)
    }

    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    const glRenderer = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER))

    return {
      render,
      update(next) {
        values = next
      },
      destroy: release,
      glRenderer,
    }
  } catch (error) {
    release()
    throw error instanceof CrtGlassUnsupportedError ? error : new CrtGlassUnsupportedError(String(error))
  }
}
