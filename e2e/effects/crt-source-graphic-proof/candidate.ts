/**
 * TASK-201 — the SourceGraphic candidate, test-local, installed into a page by
 * `page.evaluate(installCandidate, config)`. It is serialised, so it is one
 * self-contained function.
 *
 * Public browser APIs only. The element's own rendered content reaches the
 * filter as `SourceGraphic`; every operation is an SVG filter primitive
 * (feColorMatrix, feComponentTransfer, feComposite arithmetic/in/over, feBlend
 * lighten, feDisplacementMap, feImage) composited by the browser. No page code
 * ever reads the element's pixels: there is no DOM-to-canvas capture, no
 * screenshot and no frozen atmosphere. The only images it makes are
 * content-independent fields (edge reach, vignette, line basis, grain), drawn
 * by a small WebGL2 program from the preserved fragment's own GLSL lines and
 * the settings, and handed to `feImage`.
 *
 * Every number it uses arrives in `config`, from the one fixture module.
 */
import type { CrtSettings, ShaderSource } from './fixture'

export type CandidateOp = 'vignette' | 'blur' | 'protect' | 'grain' | 'line'

export interface CandidateConfig {
  id: string
  width: number
  height: number
  targetSelector: string
  /** The app's effects host; null on the specimen page. */
  hostSelector: string | null
  /** Pin a filtered root to the viewport so fixed descendants keep their box. */
  pinTarget: boolean
  /** Test-local suppression of decorative app scans while the candidate renders. */
  suppressScans: boolean
  settings: CrtSettings
  shader: ShaderSource
  still: { phase: number; seed: number }
  hostLoop: { frameCapFps: number; maxStepSeconds: number }
  clockUrl: string
  /** The reference renderer's filter input geometry, in texels: size and clamp. */
  inputSize: [number, number]
  inputClamp: [number, number, number, number]
}

export interface CandidateState {
  mounted: boolean
  rendering: boolean
  destroyed: boolean
  rafPending: boolean
  scheduledTotal: number
  rendersTotal: number
  observers: number
  listeners: number
  blobUrls: number
  phase: number
  grainIndex: number
  shownGrainIndex: number
  ops: CandidateOp[]
}

export function installCandidate(config: CandidateConfig) {
  const { width: W, height: H, settings: s, shader } = config
  const k = shader.constants
  const NS = 'http://www.w3.org/2000/svg'
  const target = document.querySelector<HTMLElement>(config.targetSelector)
  if (!target) throw new Error(`candidate target ${config.targetSelector} is missing`)
  const host = config.hostSelector ? document.querySelector<HTMLElement>(config.hostSelector) : null
  if (config.hostSelector && !host) throw new Error(`effects host ${config.hostSelector} is missing`)

  // -------------------------------------------------------------------------
  // Fields: content-independent images from the preserved GLSL lines.
  // -------------------------------------------------------------------------
  const canvas = new OffscreenCanvas(W, H)
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false })
  if (!gl) throw new Error('WebGL2 is unavailable for the field generator')
  const declared = new Set([...shader.header.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1]))
  const crtLines = shader.crtDeclarations.split('\n').filter((line) => {
    const name = line.match(/uniform\s+\w+\s+(\w+)\s*;/)?.[1]
    return !name || !declared.has(name)
  })
  // The CRTFilter's own `float v = vignette(finalColor.rgb, coord)` line, on a white texel.
  const fragment = `#version 300 es
${shader.header}
${crtLines.join('\n')}
uniform int uMode;uniform float uAlpha;uniform float uLow;uniform float uHigh;uniform vec2 uTexels;
void main(){
 vec2 pixel=vec2(gl_FragCoord.x,uSize.y-gl_FragCoord.y);
 vec2 uv=pixel/uTexels;
 vec2 coord=uv*uInputSize.xy/uSize;
 float outv=0.0;
 if(uMode==0){${shader.amountSnippet} outv=amount;}
 else if(uMode==1){${shader.waveSnippet} outv=wave*.5+.5;}
 else if(uMode==2){outv=grainAt(coord*uSize);}
 else {finalColor=vec4(1.0);${shader.crtVignetteCall}
  if(uMode==3)outv=(vg-(1.0-uAlpha))/uAlpha;
  else outv=(clamp(vg,uLow,uHigh)-(1.0-uAlpha))/uAlpha;}
 finalColor=vec4(vec3(clamp(outv,0.0,1.0)),1.0);
}`
  const vertex = `#version 300 es
in vec2 aPosition;out vec2 vTextureCoord;void main(){vTextureCoord=aPosition*.5+.5;gl_Position=vec4(aPosition,0.0,1.0);}`
  const compile = (type: number, source: string) => {
    const shaderObject = gl.createShader(type)!
    gl.shaderSource(shaderObject, source)
    gl.compileShader(shaderObject)
    if (!gl.getShaderParameter(shaderObject, gl.COMPILE_STATUS)) throw new Error(`field shader: ${gl.getShaderInfoLog(shaderObject)}`)
    return shaderObject
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment))
  gl.bindAttribLocation(program, 0, 'aPosition')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`field program: ${gl.getProgramInfoLog(program)}`)
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.viewport(0, 0, W, H)
  const u = (name: string) => gl.getUniformLocation(program, name)
  const vig = new Float32Array(3)
  vig[shader.vignetteSlots.vignetting] = s.vignetting
  vig[shader.vignetteSlots.vignettingAlpha] = s.vignettingAlpha
  vig[shader.vignetteSlots.vignettingBlur] = s.vignettingBlur
  gl.uniform3fv(u('uVignette'), vig)
  gl.uniform2f(u('uDimensions'), W, H)
  gl.uniform2f(u('uSize'), W, H)
  gl.uniform2f(u('uTexels'), config.inputSize[0], config.inputSize[1])
  gl.uniform4f(u('uInputSize'), config.inputSize[0], config.inputSize[1], 1 / config.inputSize[0], 1 / config.inputSize[1])
  gl.uniform4fv(u('uInputClamp'), new Float32Array(config.inputClamp))
  gl.uniform1f(u('uReach'), s.edgeWidth)
  gl.uniform4f(u('uLine'), s.curvature, s.lineWidth, s.lineContrast, s.verticalLine ? 1 : 0)
  gl.uniform1f(u('uGrainSoftness'), Math.max(0, Math.min(1, s.grainSoftness)))
  gl.uniform1f(u('uAlpha'), s.vignettingAlpha)
  gl.uniform1f(u('uLow'), k.ratioLow)
  gl.uniform1f(u('uHigh'), k.ratioHigh)

  const fieldBytes = new Map<string, Uint8Array>()
  const blobUrls = new Set<string>()
  async function field(name: string, mode: number, extra: () => void): Promise<string> {
    gl!.uniform1i(u('uMode'), mode)
    extra()
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    const rgba = new Uint8Array(W * H * 4)
    gl!.readPixels(0, 0, W, H, gl!.RGBA, gl!.UNSIGNED_BYTE, rgba)
    const grey = new Uint8Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grey[y * W + x] = rgba[((H - 1 - y) * W + x) * 4]!
    fieldBytes.set(name, grey)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const url = URL.createObjectURL(blob)
    blobUrls.add(url)
    const image = new Image()
    image.src = url
    await image.decode()
    return url
  }
  const grainField = (seed: number) => field(`grain-${seed}`, 2, () => gl!.uniform3f(u('uGrain'), s.noise, s.noiseSize, seed))

  // -------------------------------------------------------------------------
  // The filter graph.
  // -------------------------------------------------------------------------
  const box = `x="0" y="0" width="${W}" height="${H}"`
  const table = (f: (x: number) => number) => Array.from({ length: 256 }, (_, i) => f(i / 255).toFixed(6)).join(' ')
  const smooth = (x: number) => {
    const t = Math.max(0, Math.min(1, (x - k.protectLow) / (k.protectHigh - k.protectLow)))
    return t * t * (3 - 2 * t)
  }
  const prims: string[] = []
  const cm = (input: string, values: number[], result: string) =>
    prims.push(`<feColorMatrix ${box} in="${input}" type="matrix" values="${values.join(' ')}" result="${result}"/>`)
  const ar = (a: string, b: string, k1: number, k2: number, k3: number, k4: number, result: string, id = '') =>
    prims.push(`<feComposite ${box} ${id ? `id="${id}"` : ''} in="${a}" in2="${b}" operator="arithmetic" k1="${k1}" k2="${k2}" k3="${k3}" k4="${k4}" result="${result}"/>`)
  const comp = (a: string, b: string, op: string, result: string) =>
    prims.push(`<feComposite ${box} in="${a}" in2="${b}" operator="${op}" result="${result}"/>`)
  const channel = (index: number) => {
    const row = [0, 0, 0, 0, 0]
    row[index] = 1
    return [...row, ...row, ...row, 0, 0, 0, 0, 1]
  }
  const peak = (input: string, name: string) => {
    cm(input, channel(0), `${name}-r`)
    cm(input, channel(1), `${name}-g`)
    cm(input, channel(2), `${name}-b`)
    prims.push(`<feBlend ${box} in="${name}-r" in2="${name}-g" mode="lighten" result="${name}-rg"/>`)
    prims.push(`<feBlend ${box} in="${name}-rg" in2="${name}-b" mode="lighten" result="${name}"/>`)
  }
  const alphaFrom = (input: string, invert: boolean, result: string) =>
    cm(input, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, invert ? -1 : 1, 0, 0, 0, invert ? 1 : 0], result)
  const opaque = (input: string, result: string) => cm(input, [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], result)
  // Signed light deltas are carried around 0.5, scaled up for 8-bit headroom.
  const deltaScale = 0.45 / Math.max(1e-6, 0.5 * s.lineContrast + 0.5 * s.noise)

  function build(ops: Set<CandidateOp>, urls: Record<string, string>): string {
    prims.length = 0
    const a = s.vignettingAlpha
    let c = 'SourceGraphic'
    for (const [name, url] of Object.entries(urls)) {
      prims.push(`<feImage ${box} id="${config.id}-${name}" href="${url}" preserveAspectRatio="none" result="${name}"/>`)
    }
    if (ops.has('vignette')) {
      ar('SourceGraphic', 'fD', a, 1 - a, 0, 0, 'c-vig')
      c = 'c-vig'
    }
    if (ops.has('blur') && s.edgeBlur > 0) {
      const dirs: [string, number, number][] = [
        ['ax0', 1, 0], ['ax1', -1, 0], ['ax2', 0, 1], ['ax3', 0, -1],
        ['dg0', k.tapDiagonalScale, k.tapDiagonalScale], ['dg1', -k.tapDiagonalScale, -k.tapDiagonalScale],
        ['dg2', k.tapDiagonalScale, -k.tapDiagonalScale], ['dg3', -k.tapDiagonalScale, k.tapDiagonalScale],
      ]
      for (const [name, dx, dy] of dirs) {
        cm('fA', [dx / 2, 0, 0, 0, 0.5, dy / 2, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], `map-${name}`)
        prims.push(`<feDisplacementMap ${box} in="${c}" in2="map-${name}" scale="${2 * s.edgeBlur}" xChannelSelector="R" yChannelSelector="G" result="tap-${name}"/>`)
      }
      ar('tap-ax0', 'tap-ax1', 0, 0.5, 0.5, 0, 'ax01')
      ar('tap-ax2', 'tap-ax3', 0, 0.5, 0.5, 0, 'ax23')
      ar('ax01', 'ax23', 0, 0.5, 0.5, 0, 'axis')
      ar('tap-dg0', 'tap-dg1', 0, 0.5, 0.5, 0, 'dg01')
      ar('tap-dg2', 'tap-dg3', 0, 0.5, 0.5, 0, 'dg23')
      ar('dg01', 'dg23', 0, 0.5, 0.5, 0, 'diag')
      const inner = k.tapCentre + 4 * k.tapAxis
      ar(c, 'axis', 0, k.tapCentre / inner, (4 * k.tapAxis) / inner, 0, 'blur-inner')
      ar('blur-inner', 'diag', 0, inner, 4 * k.tapDiagonal, 0, 'blur-sum')
      // Taps beyond the element are transparent; un-premultiplying renormalises.
      opaque('blur-sum', 'blur-norm')
      alphaFrom('fA', false, 'reach-a')
      const step = table((x) => (x * 255 >= 1 ? 1 : 0)).replace(/\.000000/g, '')
      prims.push(`<feComponentTransfer ${box} in="reach-a" result="reach"><feFuncA type="discrete" tableValues="${step}"/></feComponentTransfer>`)
      comp('blur-norm', 'reach', 'in', 'blur-band')
      comp('blur-band', c, 'over', 'c-blur')
      c = 'c-blur'
    }
    if (ops.has('protect') && s.colorProtect) {
      peak('SourceGraphic', 'po')
      prims.push(`<feComponentTransfer ${box} in="po" result="prot"><feFuncR type="table" tableValues="${table(smooth)}"/><feFuncG type="table" tableValues="${table(smooth)}"/><feFuncB type="table" tableValues="${table(smooth)}"/></feComponentTransfer>`)
      alphaFrom('prot', false, 'prot-a')
      if (ops.has('vignette')) ar('SourceGraphic', 'fE', a, 1 - a, 0, 0, 'restored')
      else cm('SourceGraphic', [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0], 'restored')
      comp('restored', 'prot-a', 'in', 'restored-p')
      comp('restored-p', c, 'over', 'c-prot')
      c = 'c-prot'
    }
    const line = ops.has('line') && s.lineWidth > 0 && s.lineContrast > 0
    const grain = ops.has('grain') && s.noise > 0
    if (line || grain) {
      peak(c, 'pc')
      alphaFrom('pc', true, 'pc-inv')
      ar(c, 'pc-inv', 0, 1, -1, 0, 'chroma-p')
      opaque('chroma-p', 'chroma')
      let delta = ''
      if (line) {
        ar('fC', 'fS', 0, 1, 0, 0, 'wave', `${config.id}-wave`)
        prims.push(`<feComponentTransfer ${box} in="pc" result="floor"><feFuncR type="table" tableValues="${table((x) => Math.max(x, k.lightFloor))}"/><feFuncG type="table" tableValues="${table((x) => Math.max(x, k.lightFloor))}"/><feFuncB type="table" tableValues="${table((x) => Math.max(x, k.lightFloor))}"/></feComponentTransfer>`)
        ar('wave', 'floor', s.lineContrast * deltaScale, 0, -0.5 * s.lineContrast * deltaScale, 0.5, 'delta-line')
        delta = 'delta-line'
      }
      if (grain) {
        if (delta) ar(delta, 'fG', 0, 1, s.noise * deltaScale, -0.5 * s.noise * deltaScale, 'delta-grain')
        else ar('fG', 'fG', 0, s.noise * deltaScale, 0, 0.5 - 0.5 * s.noise * deltaScale, 'delta-grain')
        delta = 'delta-grain'
      }
      ar('pc', delta, 0, 1, 1 / deltaScale, -0.5 / deltaScale, 'target')
      ar('chroma', 'target', 1, 0, 0, 0, 'c-light')
      c = 'c-light'
    }
    if (c === 'SourceGraphic') opaque('SourceGraphic', 'c-none')
    return `<filter id="${config.id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" ${box} color-interpolation-filters="sRGB">${prims.join('')}</filter>`
  }

  // -------------------------------------------------------------------------
  // Mount, motion, pauses and cleanup.
  // -------------------------------------------------------------------------
  const counters = { scheduledTotal: 0, rendersTotal: 0, observers: 0, listeners: 0 }
  const log: { t: number; phase: number; grainIndex: number; seed: number }[] = []
  const grainShown: { t: number; grainIndex: number }[] = []
  const errors: string[] = []
  let svg: SVGSVGElement | null = null
  let style: HTMLStyleElement | null = null
  let savedCss: string | null = null
  let ops = new Set<CandidateOp>()
  let rendering = false
  let destroyed = false
  let observer: MutationObserver | null = null
  let raf = 0
  let lastTime = 0
  let lastRender = 0
  let running = false
  let motion = { animate: s.animate, grainAnimate: s.grainAnimate }
  let clockModule: { initialClock: () => { phase: number; grainElapsed: number; grainIndex: number }; advanceClock: (c: object, dt: number, settings: object) => { phase: number; grainElapsed: number; grainIndex: number }; grainSeed: (c: object) => number } | null = null
  let clock = { phase: config.still.phase, grainElapsed: 0, grainIndex: 0 }
  let shownGrain = 0
  let requestedGrain = 0
  const grainUrls = new Map<number, Promise<string>>()

  // Read the host each time: the policy element is the app's, never cached.
  const liveHost = () => (config.hostSelector ? document.querySelector<HTMLElement>(config.hostSelector) : null)
  const effectsOn = () => !host || liveHost()?.dataset.effects === 'on'
  const motionAllowed = () => !host || liveHost()?.dataset.motion === 'allowed'

  function setPhase(phase: number) {
    const wave = svg?.querySelector(`#${config.id}-wave`)
    if (!wave) return
    // cos(t - phase) from the cos and sin bases, each stored as (x + 1) / 2.
    const cos = Math.cos(phase)
    const sin = Math.sin(phase)
    wave.setAttribute('k2', String(cos))
    wave.setAttribute('k3', String(sin))
    wave.setAttribute('k4', String((1 - cos - sin) / 2))
  }
  function grainUrl(index: number): Promise<string> {
    let url = grainUrls.get(index)
    if (!url) {
      url = grainField(clockModule ? clockModule.grainSeed({ grainIndex: index }) : config.still.seed)
      grainUrls.set(index, url)
    }
    return url
  }
  function showGrain(index: number) {
    void grainUrl(index).then((url) => {
      if (destroyed || clock.grainIndex !== index) return
      svg?.querySelector(`#${config.id}-fG`)?.setAttribute('href', url)
      shownGrain = index
      grainShown.push({ t: performance.now(), grainIndex: index })
      for (const [old, pending] of grainUrls) {
        if (old < index) {
          grainUrls.delete(old)
          void pending.then((stale) => { URL.revokeObjectURL(stale); blobUrls.delete(stale) })
        }
      }
      void grainUrl(index + 1)
    }).catch((error: unknown) => { errors.push(String(error)) })
  }
  function attach() {
    if (rendering || !svg) return
    savedCss = target!.style.cssText
    if (config.pinTarget) {
      target!.style.position = 'fixed'
      target!.style.inset = '0'
    }
    target!.style.filter = `url(#${config.id})`
    if (config.suppressScans) {
      style = document.createElement('style')
      style.dataset.crtSourceGraphicProof = 'scan-suppression'
      // Decorative scans only. Busy sweeps ([aria-busy]) and the loader's band stay.
      style.textContent = '.clr-atmosphere__scan{visibility:hidden !important}.clr-chamfer:not([aria-busy="true"])::before{background-image:none !important}'
      document.head.append(style)
    }
    rendering = true
  }
  function detach() {
    if (!rendering) return
    target!.style.cssText = savedCss ?? ''
    style?.remove()
    style = null
    rendering = false
  }
  function canMove() {
    return running && rendering && motionAllowed() &&
      ((motion.animate && s.lineWidth > 0 && s.lineContrast > 0) || (motion.grainAnimate && s.noise > 0))
  }
  function sync() {
    if (destroyed) return
    if (effectsOn()) attach()
    else detach()
    if (canMove() && !raf) {
      lastTime = 0
      lastRender = 0
      raf = requestAnimationFrame(tick)
      counters.scheduledTotal++
    } else if (!canMove() && raf) {
      cancelAnimationFrame(raf)
      raf = 0
      lastTime = 0
    }
  }
  function tick(now: number) {
    raf = 0
    if (!canMove()) { sync(); return }
    const dt = lastTime ? Math.min((now - lastTime) / 1000, config.hostLoop.maxStepSeconds) : 0
    lastTime = now
    clock = clockModule!.advanceClock(clock, dt, { ...s, ...motion })
    if (now - lastRender >= 1000 / config.hostLoop.frameCapFps) {
      setPhase(clock.phase)
      // A grain step can land on a skipped tick; compare with what was requested.
      if (clock.grainIndex !== requestedGrain) {
        requestedGrain = clock.grainIndex
        showGrain(clock.grainIndex)
      }
      counters.rendersTotal++
      log.push({ t: now, phase: clock.phase, grainIndex: clock.grainIndex, seed: clockModule!.grainSeed(clock) })
      lastRender = now
    }
    raf = requestAnimationFrame(tick)
    counters.scheduledTotal++
  }

  const api = {
    log,
    grainShown,
    errors,
    async mount(list: CandidateOp[]) {
      ops = new Set(list)
      clockModule = await import(/* @vite-ignore */ config.clockUrl)
      clock = { ...clockModule!.initialClock(), phase: config.still.phase }
      const urls: Record<string, string> = {}
      const needs = (op: CandidateOp) => ops.has(op)
      if (needs('blur')) urls.fA = await field('amount', 0, () => {})
      if (needs('vignette')) urls.fD = await field('vignette', 3, () => {})
      if (needs('vignette') && needs('protect')) urls.fE = await field('ratio', 4, () => {})
      if (needs('line')) {
        urls.fC = await field('cos', 1, () => gl!.uniform1f(u('uPhase'), 0))
        urls.fS = await field('sin', 1, () => gl!.uniform1f(u('uPhase'), Math.PI / 2))
      }
      if (needs('grain')) {
        const url = await grainUrl(0)
        if (clockModule!.grainSeed(clock) !== config.still.seed) throw new Error('initial grain seed differs from the still seed')
        urls.fG = url
      }
      svg = document.createElementNS(NS, 'svg')
      svg.setAttribute('width', '0')
      svg.setAttribute('height', '0')
      svg.setAttribute('aria-hidden', 'true')
      svg.dataset.crtSourceGraphicProof = 'defs'
      svg.style.position = 'absolute'
      svg.innerHTML = build(ops, urls)
      document.body.append(svg)
      setPhase(config.still.phase)
      if (host) {
        observer = new MutationObserver(sync)
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-effects', 'data-motion'], subtree: true, childList: true })
        counters.observers = 1
      }
      sync()
      return { primitives: svg.querySelectorAll('filter > *').length, fields: Object.keys(urls) }
    },
    start(overrides: Partial<typeof motion> = {}) {
      motion = { animate: s.animate, grainAnimate: s.grainAnimate, ...overrides }
      running = true
      sync()
    },
    stop() {
      running = false
      sync()
    },
    destroy() {
      running = false
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      observer?.disconnect()
      observer = null
      counters.observers = 0
      detach()
      svg?.remove()
      svg = null
      for (const url of blobUrls) URL.revokeObjectURL(url)
      blobUrls.clear()
      grainUrls.clear()
      destroyed = true
    },
    field(name: string): number[] | null {
      const bytes = fieldBytes.get(name)
      return bytes ? Array.from(bytes) : null
    },
    state(): CandidateState {
      return {
        mounted: svg !== null,
        rendering,
        destroyed,
        rafPending: raf !== 0,
        scheduledTotal: counters.scheduledTotal,
        rendersTotal: counters.rendersTotal,
        observers: counters.observers,
        listeners: counters.listeners,
        blobUrls: blobUrls.size,
        phase: clock.phase,
        grainIndex: clock.grainIndex,
        shownGrainIndex: shownGrain,
        ops: [...ops],
      }
    },
  }
  ;(window as unknown as { __crtSourceGraphic: typeof api }).__crtSourceGraphic = api
}

/** The page-side handle, typed for `page.evaluate` callers. */
export interface CandidateHandle {
  log: { t: number; phase: number; grainIndex: number; seed: number }[]
  grainShown: { t: number; grainIndex: number }[]
  errors: string[]
  mount(ops: CandidateOp[]): Promise<{ primitives: number; fields: string[] }>
  start(overrides?: { animate?: boolean; grainAnimate?: boolean }): void
  stop(): void
  destroy(): void
  field(name: string): number[] | null
  state(): CandidateState
}
