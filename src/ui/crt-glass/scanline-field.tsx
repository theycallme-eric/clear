/**
 * Effects TASK-005 — `CrtGlassField`, the CRT Glass field's lifecycle owner.
 *
 * The parts are kept apart so each can change alone:
 *
 *   - Preset: `preset.ts`, the only owner of the numbers.
 *   - Clock and scheduling: `motion-clock.ts`.
 *   - Graphics: `renderer.ts` with `shaders.ts`, loaded lazily as one chunk.
 *   - Policy: the shared Visual effects policy (`src/state/visual-effects.ts`).
 *     This component keeps no toggle of its own.
 *   - Where the field is mounted, and which app-owned texture feeds it, are
 *     the texture surface's decisions (TASK-006). Nothing here mounts it.
 *
 * Lifecycle:
 *
 *   - Visual effects off: renders nothing, imports nothing, allocates nothing.
 *   - On: after the app has rendered (an idle callback, not a frame callback),
 *     the renderer chunk is imported and the field draws one frame. Motion is
 *     scheduled only while the policy allows motion and the values animate
 *     something. Still, reduced motion and a hidden tab keep the last frame
 *     and schedule nothing. Resuming continues the phase with no catch-up.
 *   - Turning effects off, or unmounting, cancels the scheduled frame and the
 *     pending load, and releases the renderer's graphics resources and the
 *     decoded source.
 *   - A failed import, decode or unsupported browser leaves nothing behind:
 *     the field is decorative and the UI around it is unaffected.
 *
 * The field draws from a texture the app owns. It never captures the DOM.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useVisualEffects } from '../../state/visual-effects'
import { createMotionDriver, grainSeed, type MotionDriver } from './motion-clock'
import { CRT_GLASS_PRESET, CRT_GLASS_REFERENCE, type CrtGlassValues } from './preset'
import type { CrtGlassRenderer } from './renderer'

import './scanline-field.css'

export interface CrtGlassFieldProps {
  /**
   * The app-owned, Echo-composed source: an image URL the app ships, or an
   * already decoded image the caller keeps ownership of.
   */
  source: string | TexImageSource
  /** Logical size; the canvas has one pixel per unit. */
  width?: number
  height?: number
  /** Defaults to the preset owner. */
  values?: Readonly<CrtGlassValues>
  className?: string
}

interface LoadedSource {
  image: TexImageSource
  release: () => void
}

async function decodeSource(source: string | TexImageSource, signal: AbortSignal): Promise<LoadedSource> {
  if (typeof source !== 'string') return { image: source, release: () => {} }
  const response = await fetch(source, { signal })
  if (!response.ok) throw new Error(`CRT Glass source ${response.status}`)
  const bitmap = await createImageBitmap(await response.blob())
  return { image: bitmap, release: () => bitmap.close() }
}

/** After the app's own render: idle time where the browser offers it. */
function afterRender(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout: 1000 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = window.setTimeout(callback, 0)
  return () => window.clearTimeout(handle)
}

export function CrtGlassField({
  source,
  width = CRT_GLASS_REFERENCE.specimen.width,
  height = CRT_GLASS_REFERENCE.specimen.height,
  values = CRT_GLASS_PRESET,
  className,
}: CrtGlassFieldProps) {
  const { effectsEnabled, motionAllowed } = useVisualEffects()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const driverRef = useRef<MotionDriver | null>(null)
  const rendererRef = useRef<CrtGlassRenderer | null>(null)
  const motionRef = useRef(motionAllowed)
  const valuesRef = useRef(values)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useLayoutEffect(() => {
    motionRef.current = motionAllowed
    valuesRef.current = values
  }, [motionAllowed, values])

  useEffect(() => {
    if (!effectsEnabled) return
    let cancelled = false
    let loaded: LoadedSource | null = null
    const abort = new AbortController()

    const cleanup = () => {
      cancelled = true
      abort.abort()
      driverRef.current?.dispose()
      driverRef.current = null
      rendererRef.current?.destroy()
      rendererRef.current = null
      loaded?.release()
      loaded = null
      setReady(false)
    }

    const fail = () => {
      if (cancelled) return
      cleanup()
      setFailed(true)
    }

    const cancelWait = afterRender(() => {
      void (async () => {
        try {
          const module = await import('./renderer')
          const decoded = await decodeSource(source, abort.signal)
          if (cancelled) {
            decoded.release()
            return
          }
          loaded = decoded
          const canvas = canvasRef.current
          if (!canvas) throw new Error('CRT Glass canvas missing')
          const renderer = module.createCrtGlassRenderer({
            canvas,
            source: decoded.image,
            width,
            height,
            values: valuesRef.current,
            onContextLost: fail,
          })
          rendererRef.current = renderer
          const driver = createMotionDriver({
            settings: valuesRef.current,
            render: (phase, seed) => renderer.render(phase, seed),
          })
          driverRef.current = driver
          renderer.render(driver.clock.phase, grainSeed(driver.clock))
          driver.sync(motionRef.current)
          setReady(true)
        } catch {
          fail()
        }
      })()
    })

    return () => {
      cancelWait()
      cleanup()
    }
  }, [effectsEnabled, source, width, height])

  // Policy and value changes: redraw the held frame, then schedule or cancel.
  useEffect(() => {
    const renderer = rendererRef.current
    const driver = driverRef.current
    if (!ready || !renderer || !driver) return
    renderer.update(values)
    renderer.render(driver.clock.phase, grainSeed(driver.clock))
    driver.sync(motionAllowed, values)
  }, [ready, motionAllowed, values])

  if (!effectsEnabled || failed) return null

  return (
    <canvas
      ref={canvasRef}
      className={['clr-crt-glass', className].filter(Boolean).join(' ')}
      data-state={ready ? 'ready' : 'loading'}
      aria-hidden="true"
      hidden={!ready}
    />
  )
}
