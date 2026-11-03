/**
 * Effects TASK-005 — the CRT Glass field's lifecycle, policy reading and
 * pipeline shape, without a GPU. The real pixels are proven in a browser by
 * `e2e/effects/crt-glass-fidelity.spec.ts`; here the renderer chunk is a
 * double, so what is checked is when it is loaded, driven and released.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setVisualEffects, VisualEffectsProvider } from '../../state/visual-effects'
import {
  CRT_GLASS_PRESET,
  CRT_GLASS_REFERENCE,
  GRAIN_FEATHERING_REFERENCE_RANGE,
  WORKBENCH_EXPLORATORY_RANGES,
} from './preset'
import { CrtGlassField } from './scanline-field'
import { CRT_FRAGMENT, GLASS_FRAGMENT, PASS_ORDER } from './shaders'

const chunk = vi.hoisted(() => ({
  loads: 0,
  fail: false,
  renderers: [] as {
    options: { values: unknown; width: number; height: number }
    render: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
  }[],
}))

vi.mock('./renderer', () => {
  chunk.loads += 1
  return {
    CrtGlassUnsupportedError: class extends Error {},
    createCrtGlassRenderer: (options: { values: unknown; width: number; height: number }) => {
      if (chunk.fail) throw new Error('WebGL2 is not available')
      const renderer = { options, render: vi.fn(), update: vi.fn(), destroy: vi.fn(), glRenderer: 'double' }
      chunk.renderers.push(renderer)
      return renderer
    },
  }
})

const dir = import.meta.dirname
const read = (name: string) => readFileSync(resolve(dir, name), 'utf8')
const SOURCE = { width: 390, height: 844 } as unknown as TexImageSource

let frames: { request: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; live: Set<number> }
let reducedMotion = false
const realMatchMedia = window.matchMedia

beforeEach(() => {
  localStorage.clear()
  chunk.fail = false
  chunk.renderers.length = 0
  reducedMotion = false
  let next = 0
  const live = new Set<number>()
  frames = {
    live,
    request: vi.fn(() => {
      next += 1
      live.add(next)
      return next
    }),
    cancel: vi.fn((handle: number) => live.delete(handle)),
  }
  vi.stubGlobal('requestAnimationFrame', frames.request)
  vi.stubGlobal('cancelAnimationFrame', frames.cancel)
  window.matchMedia = (query: string) =>
    ({ ...realMatchMedia(query), matches: query.includes('reduce') && reducedMotion }) as MediaQueryList
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.matchMedia = realMatchMedia
})

/** Let the idle wait, the lazy import and the decode settle. */
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolveWait) => setTimeout(resolveWait, 5))
})

function mount() {
  return render(
    <VisualEffectsProvider>
      <button type="button">Generate</button>
      <CrtGlassField source={SOURCE} />
    </VisualEffectsProvider>,
  )
}

describe('loading', () => {
  it('requests and allocates nothing when Visual effects is off at startup', async () => {
    const loadsBefore = chunk.loads
    setVisualEffects(false)
    const { container } = mount()
    await settle()
    expect(chunk.loads).toBe(loadsBefore)
    expect(chunk.renderers).toHaveLength(0)
    expect(container.querySelector('canvas')).toBeNull()
    expect(frames.request).not.toHaveBeenCalled()
  })

  it('loads the renderer only after the app has rendered, then draws one frame at phase 0.5 and seed 0.57', async () => {
    const { container } = mount()
    // The app's own markup is already there before anything CRT-related starts.
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument()
    expect(chunk.renderers).toHaveLength(0)
    await settle()
    expect(chunk.renderers).toHaveLength(1)
    const [renderer] = chunk.renderers
    expect(renderer!.options.values).toBe(CRT_GLASS_PRESET)
    expect(renderer!.options).toMatchObject({ width: 390, height: 844 })
    expect(renderer!.render).toHaveBeenCalledWith(0.5, 0.57)
    const canvas = container.querySelector('canvas')!
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    expect(canvas).toHaveAttribute('data-state', 'ready')
  })

  it('leaves the ordinary UI rendered and usable when the renderer is unsupported', async () => {
    chunk.fail = true
    const onClick = vi.fn()
    const { container } = render(
      <VisualEffectsProvider>
        <button type="button" onClick={onClick}>Generate</button>
        <CrtGlassField source={SOURCE} />
      </VisualEffectsProvider>,
    )
    await settle()
    expect(container.querySelector('canvas')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(frames.request).not.toHaveBeenCalled()
  })
})

describe('policy and scheduling', () => {
  it('schedules motion only while the policy allows it', async () => {
    mount()
    await settle()
    expect(frames.live.size).toBe(1)
  })

  it('schedules no animation callback under reduced motion, and keeps the still frame', async () => {
    reducedMotion = true
    mount()
    await settle()
    expect(chunk.renderers[0]!.render).toHaveBeenCalledWith(0.5, 0.57)
    expect(frames.request).not.toHaveBeenCalled()
  })

  it('schedules no animation callback while the tab is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    try {
      mount()
      await settle()
      expect(chunk.renderers).toHaveLength(1)
      expect(frames.request).not.toHaveBeenCalled()
    } finally {
      delete (document as { visibilityState?: string }).visibilityState
    }
  })

  it('schedules nothing for Still with static grain', async () => {
    render(
      <VisualEffectsProvider>
        <CrtGlassField source={SOURCE} values={{ ...CRT_GLASS_PRESET, animate: false, grainAnimate: false }} />
      </VisualEffectsProvider>,
    )
    await settle()
    expect(chunk.renderers).toHaveLength(1)
    expect(frames.request).not.toHaveBeenCalled()
  })

  it('turning effects off cancels the frame, releases graphics and removes the canvas', async () => {
    const { container } = mount()
    await settle()
    const [renderer] = chunk.renderers
    expect(frames.live.size).toBe(1)
    act(() => setVisualEffects(false))
    expect(frames.live.size).toBe(0)
    expect(renderer!.destroy).toHaveBeenCalledTimes(1)
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('unmounting cancels the frame and releases graphics', async () => {
    const { unmount } = mount()
    await settle()
    unmount()
    expect(frames.live.size).toBe(0)
    expect(chunk.renderers[0]!.destroy).toHaveBeenCalledTimes(1)
  })

  it('unmounting before the load finishes allocates nothing', async () => {
    const { unmount } = mount()
    unmount()
    await settle()
    expect(chunk.renderers).toHaveLength(0)
    expect(frames.request).not.toHaveBeenCalled()
  })
})

describe('the render pipeline (glass-effect.mjs order)', () => {
  const renderer = read('renderer.ts')

  it('runs the source, then the CRTFilter vignette, then the one custom final pass', () => {
    expect(PASS_ORDER).toEqual(['source', 'crt-vignette', 'edge-protect-line-grain'])
    const at = (text: string) => renderer.indexOf(text)
    expect(at('pass(sourceProgram')).toBeGreaterThan(0)
    expect(at('pass(sourceProgram')).toBeLessThan(at('pass(crtProgram'))
    expect(at('pass(crtProgram')).toBeLessThan(at('pass(glassProgram'))
  })

  it('disables the CRTFilter lines and grain so it supplies only the vignette', () => {
    expect(renderer).toMatch(/uniform4f\(crtProgram\.uniform\('uLine'\), values\.curvature, 0, 0,/)
    expect(renderer).toMatch(/uniform2f\(crtProgram\.uniform\('uNoise'\), 0,/)
    expect(renderer).toMatch(/uniform3f\(crtProgram\.uniform\('uVignette'\), values\.vignetting, values\.vignettingAlpha, values\.vignettingBlur\)/)
    expect(CRT_FRAGMENT).toContain('if (uLine[1] > 0.0)')
    expect(CRT_FRAGMENT).toContain('if (uNoise[0] > 0.0 && uNoise[1] > 0.0)')
  })

  it('applies edge softness, then colour protection, then one line field and grain in one RGB scaling', () => {
    const main = GLASS_FRAGMENT.slice(GLASS_FRAGMENT.indexOf('void main(){'))
    const blur = main.indexOf('c*=.28;')
    const protect = main.indexOf('if(uProtectColors>.5)')
    const grain = main.indexOf('grainAt(coord*uSize)')
    const line = main.indexOf('float wave=cos(v*1.2-uPhase);')
    const scaling = main.indexOf('c.rgb*=target/max(peak,.0001);')
    expect([blur, protect, grain, line, scaling].every((index) => index > 0)).toBe(true)
    expect(blur).toBeLessThan(protect)
    expect(protect).toBeLessThan(grain)
    expect(grain).toBeLessThan(line)
    expect(line).toBeLessThan(scaling)
    // Exactly one line signal, one grain sample and one final scaling.
    expect(main.match(/cos\(/g)).toHaveLength(1)
    expect(main.match(/grainAt\(/g)).toHaveLength(1)
    expect(main.match(/c\.rgb\*=/g)).toHaveLength(1)
    expect(main).toContain('float lightFloor=.65;')
  })

  it('lets grain feathering touch only the grain field, and only while grain is on', () => {
    const main = GLASS_FRAGMENT.slice(GLASS_FRAGMENT.indexOf('void main(){'))
    const grainFn = GLASS_FRAGMENT.slice(GLASS_FRAGMENT.indexOf('float grainAt('), GLASS_FRAGMENT.indexOf('void main(){'))
    // Sharp cells blended with four-neighbour smooth interpolation.
    expect(grainFn).toContain('return mix(sharp,smoothGrain,uGrainSoftness);')
    expect(grainFn.match(/grainRandom\(cell\+vec2/g)).toHaveLength(3)
    expect(main).not.toContain('uGrainSoftness')
    expect(main).toContain('if(uGrain.x>0.0){\n  float random=grainAt(coord*uSize);')
  })

  it('is a shader field, not a box shadow, and captures no DOM', () => {
    const sources = readdirSync(dir)
      .filter((name) => /\.(ts|tsx|css)$/.test(name) && !name.includes('.test.'))
      .map(read)
      .join('\n')
    expect(sources).not.toMatch(/box-shadow/)
    expect(sources).not.toMatch(/html2canvas|toDataURL|foreignObject|drawImage\(document|getDisplayMedia/)
    expect(sources).not.toMatch(/type="range"|type='range'/)
  })
})

describe('the preset owner', () => {
  it('holds exactly the crt-iab-current-settings.json reference values with their identity', () => {
    expect(CRT_GLASS_REFERENCE.sha256).toBe('3169d4608c8babe17a20670bd59f53e3110c7ce917641786d33c2713943ca033')
    expect(CRT_GLASS_REFERENCE.file).toBe('crt-iab-current-settings.json')
    expect({ ...CRT_GLASS_PRESET }).toEqual({
      curvature: 0.2, lineWidth: 2, lineContrast: 0.02, edgeBlur: 3.4, edgeWidth: 0.14,
      vignetting: 0.21, vignettingAlpha: 0.08, vignettingBlur: 0.18, noise: 0.01, noiseSize: 1,
      grainSoftness: 0.4, animate: true, grainAnimate: true, cycleSeconds: 0.6, grainRate: 0.5,
      echo: true, colorProtect: true, verticalLine: false,
    })
    expect(CRT_GLASS_REFERENCE.mode).toBe('glass')
  })

  it('keeps the numbers out of the masking, compositing and lifecycle code', () => {
    for (const name of ['scanline-field.tsx', 'renderer.ts', 'motion-clock.ts']) {
      expect(read(name)).not.toMatch(/\b(?:3\.4|0\.21|0\.08|0\.18|0\.14)\b/)
    }
  })

  it('documents the feathering range and the workbench ranges without shipping them as defaults', () => {
    expect(GRAIN_FEATHERING_REFERENCE_RANGE).toEqual({ min: 0.01, max: 0.99, step: 0.01, decimals: 2 })
    expect(WORKBENCH_EXPLORATORY_RANGES.cycleSeconds).toEqual({ min: 0.1, max: 180 })
    expect(WORKBENCH_EXPLORATORY_RANGES.grainRate).toEqual({ min: 0.5, max: 6 })
    expect(CRT_GLASS_PRESET.cycleSeconds).not.toBe(WORKBENCH_EXPLORATORY_RANGES.cycleSeconds.max)
  })
})
