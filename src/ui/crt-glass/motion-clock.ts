/**
 * Effects TASK-005 — the CRT Glass motion clock and its frame scheduler.
 *
 * The clock is a port of the preserved `crt-glass-motion/motion-clock.mjs`:
 * line phase starts at 0.5 and advances by 2π × elapsed ÷ cycleSeconds; the
 * grain seed starts at 0.57 and steps by a fixed irrational increment each
 * time grainIndex advances at grainRate. Both run from elapsed time, never
 * from frame count, and neither depends on the other.
 *
 * The scheduler is the host loop from the preserved `study.mjs`: actual
 * renders are capped at 30 per second, a single frame never supplies more
 * than 0.1 s, and while motion is not allowed nothing is scheduled. Resuming
 * starts from a zero delta, so the phase continues with no catch-up jump.
 */
import type { CrtGlassValues } from './preset'

export const TAU = Math.PI * 2

export const INITIAL_PHASE = 0.5
export const INITIAL_GRAIN_SEED = 0.57
export const GRAIN_SEED_STEP = 0.1732050808

/** Actual render updates per second, at most. */
export const MAX_RENDER_FPS = 30
/** The most elapsed time one frame may supply, so a stall cannot jump ahead. */
export const MAX_FRAME_SECONDS = 0.1

export interface MotionClock {
  phase: number
  grainElapsed: number
  grainIndex: number
}

export type MotionSettings = Pick<
  CrtGlassValues,
  'animate' | 'grainAnimate' | 'cycleSeconds' | 'grainRate' | 'lineWidth' | 'lineContrast' | 'noise'
>

export const initialClock = (): MotionClock => ({ phase: INITIAL_PHASE, grainElapsed: 0, grainIndex: 0 })

/** Advance by elapsed seconds, independent of rendering rate. Pauses supply no time. */
export function advanceClock(clock: MotionClock, seconds: number, settings: MotionSettings): MotionClock {
  const next = { ...clock }
  if (settings.animate && settings.lineWidth > 0 && settings.lineContrast > 0) {
    next.phase = (next.phase + (seconds * TAU) / settings.cycleSeconds) % TAU
  }
  if (settings.grainAnimate && settings.noise > 0) {
    next.grainElapsed += seconds
    const steps = Math.floor(next.grainElapsed * settings.grainRate + 1e-8)
    next.grainIndex += steps
    next.grainElapsed -= steps / settings.grainRate
  } else {
    next.grainElapsed = 0
  }
  return next
}

export function grainSeed(clock: MotionClock): number {
  return (INITIAL_GRAIN_SEED + clock.grainIndex * GRAIN_SEED_STEP) % 1
}

/** Whether these settings have anything to animate at all. */
export function needsAnimation(settings: MotionSettings): boolean {
  return (
    (settings.animate && settings.lineWidth > 0 && settings.lineContrast > 0) ||
    (settings.grainAnimate && settings.noise > 0)
  )
}

export interface FrameSource {
  requestAnimationFrame(callback: (now: number) => void): number
  cancelAnimationFrame(handle: number): void
}

export interface MotionDriver {
  /** Re-evaluate after the policy or settings change; schedules or cancels. */
  sync(motionAllowed: boolean, settings?: MotionSettings): void
  /** The current clock state. */
  readonly clock: MotionClock
  /** Whether a frame callback is currently scheduled. */
  readonly running: boolean
  /** Cancel any scheduled frame. The driver schedules nothing afterwards. */
  dispose(): void
}

/**
 * Drives `render(phase, seed)` from the clock. The caller supplies whether
 * motion is allowed — the shared Visual effects policy — and the settings.
 */
export function createMotionDriver(options: {
  settings: MotionSettings
  render: (phase: number, seed: number) => void
  frames?: FrameSource
}): MotionDriver {
  const frames = options.frames ?? window
  let settings = options.settings
  let clock = initialClock()
  let handle = 0
  let lastTime = 0
  let lastRender = 0
  let allowed = false
  let disposed = false

  const canMove = () => !disposed && allowed && needsAnimation(settings)

  function tick(now: number) {
    handle = 0
    if (!canMove()) return
    const seconds = lastTime ? Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS) : 0
    lastTime = now
    clock = advanceClock(clock, seconds, settings)
    if (now - lastRender >= 1000 / MAX_RENDER_FPS) {
      options.render(clock.phase, grainSeed(clock))
      lastRender = now
    }
    handle = frames.requestAnimationFrame(tick)
  }

  function stop() {
    if (handle) frames.cancelAnimationFrame(handle)
    handle = 0
    lastTime = 0
  }

  return {
    sync(motionAllowed, next) {
      allowed = motionAllowed
      if (next) settings = next
      if (canMove() && !handle) {
        lastTime = 0
        lastRender = 0
        handle = frames.requestAnimationFrame(tick)
      } else if (!canMove()) {
        stop()
      }
    },
    get clock() {
      return clock
    },
    get running() {
      return handle !== 0
    },
    dispose() {
      disposed = true
      stop()
    },
  }
}
