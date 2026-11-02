import { describe, expect, it } from 'vitest'

import {
  MAX_RENDER_FPS,
  TAU,
  advanceClock,
  createMotionDriver,
  grainSeed,
  initialClock,
  needsAnimation,
  type FrameSource,
  type MotionSettings,
} from './motion-clock'
import { CRT_GLASS_PRESET } from './preset'

const CURRENT: MotionSettings = CRT_GLASS_PRESET

/** A manual frame source: time only moves when the test says so. */
function fakeFrames(intervalMs = 1000 / 60) {
  let now = 1_000
  let next = 1
  const pending = new Map<number, (now: number) => void>()
  const source: FrameSource = {
    requestAnimationFrame(callback) {
      const handle = next++
      pending.set(handle, callback)
      return handle
    },
    cancelAnimationFrame(handle) {
      pending.delete(handle)
    },
  }
  return {
    source,
    get pending() {
      return pending.size
    },
    /** Run frames for `ms`, firing every scheduled callback once per interval. */
    run(ms: number) {
      const end = now + ms
      while (now + intervalMs <= end + 1e-9) {
        now += intervalMs
        const due = [...pending.values()]
        pending.clear()
        for (const callback of due) callback(now)
      }
      now = end
    },
    /** Time passes with no frames delivered (paused, hidden). */
    skip(ms: number) {
      now += ms
    },
  }
}

describe('CRT Glass motion clock (motion-clock.mjs port)', () => {
  it('starts at phase 0.5 and grain seed 0.57', () => {
    const clock = initialClock()
    expect(clock.phase).toBe(0.5)
    expect(clock.grainIndex).toBe(0)
    expect(grainSeed(clock)).toBeCloseTo(0.57, 12)
  })

  it('advances line phase by 2π × elapsed ÷ cycleSeconds, modulo 2π', () => {
    const quarter = advanceClock(initialClock(), 0.15, CURRENT)
    expect(quarter.phase).toBeCloseTo(0.5 + TAU / 4, 12)
    const wrapped = advanceClock(initialClock(), 0.6, CURRENT)
    expect(wrapped.phase).toBeCloseTo(0.5, 9)
  })

  it('depends on elapsed time, not on how it was divided into frames', () => {
    const once = advanceClock(initialClock(), 1.7, CURRENT)
    let many = initialClock()
    for (let i = 0; i < 170; i += 1) many = advanceClock(many, 0.01, CURRENT)
    expect(many.phase).toBeCloseTo(once.phase, 9)
    expect(many.grainIndex).toBe(once.grainIndex)
  })

  it('advances grainIndex at grainRate and steps the seed by the fixed increment', () => {
    // 0.5 Hz: one refresh every two seconds.
    expect(advanceClock(initialClock(), 1.99, CURRENT).grainIndex).toBe(0)
    const one = advanceClock(initialClock(), 2, CURRENT)
    expect(one.grainIndex).toBe(1)
    expect(grainSeed(one)).toBeCloseTo((0.57 + 0.1732050808) % 1, 12)
    const five = advanceClock(initialClock(), 10, CURRENT)
    expect(five.grainIndex).toBe(5)
    expect(grainSeed(five)).toBeCloseTo((0.57 + 5 * 0.1732050808) % 1, 12)
  })

  it('keeps line phase and grain refresh independent', () => {
    const still = advanceClock(initialClock(), 4, { ...CURRENT, animate: false })
    expect(still.phase).toBe(0.5)
    expect(still.grainIndex).toBe(2)

    const staticGrain = advanceClock(initialClock(), 4, { ...CURRENT, grainAnimate: false })
    expect(staticGrain.grainIndex).toBe(0)
    expect(staticGrain.phase).not.toBe(0.5)

    const noLines = advanceClock(initialClock(), 4, { ...CURRENT, lineContrast: 0 })
    expect(noLines.phase).toBe(0.5)
    expect(noLines.grainIndex).toBe(2)
  })

  it('reports whether there is anything to animate', () => {
    expect(needsAnimation(CURRENT)).toBe(true)
    expect(needsAnimation({ ...CURRENT, animate: false, grainAnimate: false })).toBe(false)
    expect(needsAnimation({ ...CURRENT, animate: false, noise: 0 })).toBe(false)
  })
})

describe('CRT Glass motion scheduler', () => {
  it('renders at most 30 updates per second whatever the display rate', () => {
    for (const hz of [60, 120, 144]) {
      const frames = fakeFrames(1000 / hz)
      const renders: number[] = []
      const driver = createMotionDriver({ settings: CURRENT, render: (phase) => renders.push(phase), frames: frames.source })
      driver.sync(true)
      frames.run(1000)
      expect(renders.length).toBeLessThanOrEqual(MAX_RENDER_FPS + 1)
      expect(renders.length).toBeGreaterThan(10)
      driver.dispose()
    }
  })

  it('advances by elapsed time independent of the display rate', () => {
    const phases = [30, 60, 120].map((hz) => {
      const frames = fakeFrames(1000 / hz)
      const driver = createMotionDriver({ settings: CURRENT, render: () => {}, frames: frames.source })
      driver.sync(true)
      frames.run(1500)
      const { phase } = driver.clock
      driver.dispose()
      return phase
    })
    // The first frame supplies no time; after that every rate covers the same span.
    for (const phase of phases) expect(Math.abs(phase - phases[0])).toBeLessThan(TAU * (1000 / 30 / 1000 / 0.6) + 1e-9)
  })

  it('schedules nothing while motion is not allowed', () => {
    const frames = fakeFrames()
    const driver = createMotionDriver({ settings: CURRENT, render: () => {}, frames: frames.source })
    driver.sync(false)
    expect(frames.pending).toBe(0)
    expect(driver.running).toBe(false)
  })

  it('schedules nothing when there is nothing to animate', () => {
    const frames = fakeFrames()
    const driver = createMotionDriver({
      settings: { ...CURRENT, animate: false, grainAnimate: false },
      render: () => {},
      frames: frames.source,
    })
    driver.sync(true)
    expect(frames.pending).toBe(0)
  })

  it('cancels the scheduled frame when motion stops, and resumes with no catch-up jump', () => {
    const frames = fakeFrames()
    const renders: Array<[number, number]> = []
    const driver = createMotionDriver({
      settings: CURRENT,
      render: (phase, seed) => renders.push([phase, seed]),
      frames: frames.source,
    })
    driver.sync(true)
    frames.run(400)
    driver.sync(false)
    expect(frames.pending).toBe(0)
    const paused = driver.clock

    frames.skip(30_000)
    renders.length = 0
    driver.sync(true)
    frames.run(1000 / 60)
    expect(renders[0]).toEqual([paused.phase, grainSeed(paused)])
    expect(driver.clock.grainIndex).toBe(paused.grainIndex)
    driver.dispose()
  })

  it('stops when settings change to Still with static grain', () => {
    const frames = fakeFrames()
    const driver = createMotionDriver({ settings: CURRENT, render: () => {}, frames: frames.source })
    driver.sync(true)
    expect(frames.pending).toBe(1)
    driver.sync(true, { ...CURRENT, animate: false, grainAnimate: false })
    expect(frames.pending).toBe(0)
  })

  it('cancels on dispose and schedules nothing afterwards', () => {
    const frames = fakeFrames()
    const driver = createMotionDriver({ settings: CURRENT, render: () => {}, frames: frames.source })
    driver.sync(true)
    driver.dispose()
    expect(frames.pending).toBe(0)
    driver.sync(true)
    expect(frames.pending).toBe(0)
  })
})
