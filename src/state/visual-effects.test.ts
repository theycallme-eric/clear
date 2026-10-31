/**
 * Effects TASK-001 — the one shared Visual effects comfort policy.
 *
 * The OS preference and document visibility are driven through controllable
 * doubles that really dispatch `change` and `visibilitychange`, so "updates
 * without a reload" is proved on a mounted subscriber rather than by calling
 * the resolver again.
 */
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyAppearance } from './appearance'
import {
  currentVisualEffects,
  DEFAULT_VISUAL_EFFECTS,
  resolveVisualEffectsPolicy,
  setVisualEffects,
  storedVisualEffects,
  useVisualEffects,
  VisualEffectsProvider,
} from './visual-effects'

const STORAGE_KEY = 'clear.visual-effects'

/** A reduced-motion media query whose value a test can flip mid-session. */
function controllableReducedMotion(initial: boolean) {
  let matches = initial
  const target = new EventTarget()

  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query.includes('prefers-reduced-motion') ? matches : false
        },
        media: query,
        onchange: null,
        addEventListener: (type: string, listener: EventListener) =>
          target.addEventListener(type, listener),
        removeEventListener: (type: string, listener: EventListener) =>
          target.removeEventListener(type, listener),
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )

  return (next: boolean) => {
    matches = next
    target.dispatchEvent(new Event('change'))
  }
}

/** Document visibility a test can flip; jsdom's own is fixed at visible. */
function controllableVisibility(initial: DocumentVisibilityState) {
  let state = initial
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state)

  return (next: DocumentVisibilityState) => {
    state = next
    document.dispatchEvent(new Event('visibilitychange'))
  }
}

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(VisualEffectsProvider, null, children)

const renderPolicy = () => renderHook(() => useVisualEffects(), { wrapper })

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('stored Visual effects choice', () => {
  it('defaults to on when nothing is stored', () => {
    expect(DEFAULT_VISUAL_EFFECTS).toBe(true)
    expect(storedVisualEffects()).toBeNull()
    expect(currentVisualEffects()).toBe(true)
  })

  it('reads an explicit choice', () => {
    localStorage.setItem(STORAGE_KEY, 'off')
    expect(currentVisualEffects()).toBe(false)
    localStorage.setItem(STORAGE_KEY, 'on')
    expect(currentVisualEffects()).toBe(true)
  })

  it.each(['', 'false', 'OFF', '0', 'disabled', 'toString', '__proto__'])(
    'ignores the unknown stored value %j and resolves to on, like clear.skin',
    (value) => {
      localStorage.setItem(STORAGE_KEY, value)
      expect(storedVisualEffects()).toBeNull()
      expect(currentVisualEffects()).toBe(true)
    },
  )

  it('falls back to the default when storage itself is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(currentVisualEffects()).toBe(true)
  })

  it('persists a choice under its own key, by the device-appearance convention', () => {
    setVisualEffects(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('off')
    setVisualEffects(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('on')
  })
})

describe('resolveVisualEffectsPolicy', () => {
  it('allows motion only when effects are on, the OS allows it and the tab is visible', () => {
    expect(
      resolveVisualEffectsPolicy({
        visualEffects: true,
        prefersReducedMotion: false,
        documentVisible: true,
      }),
    ).toEqual({ effectsEnabled: true, motionAllowed: true })
    expect(
      resolveVisualEffectsPolicy({
        visualEffects: true,
        prefersReducedMotion: true,
        documentVisible: true,
      }),
    ).toEqual({ effectsEnabled: true, motionAllowed: false })
    expect(
      resolveVisualEffectsPolicy({
        visualEffects: true,
        prefersReducedMotion: false,
        documentVisible: false,
      }),
    ).toEqual({ effectsEnabled: true, motionAllowed: false })
  })

  it.each([
    [false, true],
    [false, false],
    [true, true],
    [true, false],
  ])(
    'with Visual effects off, reports disabled and still (reduced %s, visible %s)',
    (prefersReducedMotion, documentVisible) => {
      expect(
        resolveVisualEffectsPolicy({
          visualEffects: false,
          prefersReducedMotion,
          documentVisible,
        }),
      ).toEqual({ effectsEnabled: false, motionAllowed: false })
    },
  )
})

describe('useVisualEffects', () => {
  it('resolves the default policy for a fresh device', () => {
    controllableReducedMotion(false)
    controllableVisibility('visible')

    expect(renderPolicy().result.current).toEqual({
      effectsEnabled: true,
      motionAllowed: true,
    })
  })

  it('stays off whatever the appearance preset or OS motion preference says', () => {
    const setReduced = controllableReducedMotion(true)
    controllableVisibility('visible')
    localStorage.setItem(STORAGE_KEY, 'off')
    const { result } = renderPolicy()

    for (const skin of ['clear', 'vapour', 'signal', 'mono']) {
      act(() => applyAppearance(skin))
      expect(result.current).toEqual({ effectsEnabled: false, motionAllowed: false })
    }
    act(() => setReduced(false))
    expect(result.current).toEqual({ effectsEnabled: false, motionAllowed: false })
  })

  it('follows the OS reduced-motion preference live, without a reload', () => {
    const setReduced = controllableReducedMotion(false)
    controllableVisibility('visible')
    const { result } = renderPolicy()
    expect(result.current.motionAllowed).toBe(true)

    act(() => setReduced(true))
    expect(result.current).toEqual({ effectsEnabled: true, motionAllowed: false })

    act(() => setReduced(false))
    expect(result.current).toEqual({ effectsEnabled: true, motionAllowed: true })
  })

  it('follows document visibility live, without a reload', () => {
    controllableReducedMotion(false)
    const setVisibility = controllableVisibility('visible')
    const { result } = renderPolicy()
    expect(result.current.motionAllowed).toBe(true)

    act(() => setVisibility('hidden'))
    expect(result.current).toEqual({ effectsEnabled: true, motionAllowed: false })

    act(() => setVisibility('visible'))
    expect(result.current.motionAllowed).toBe(true)
  })

  it('re-resolves for subscribers when the choice changes', () => {
    controllableReducedMotion(false)
    controllableVisibility('visible')
    const { result } = renderPolicy()

    act(() => setVisualEffects(false))
    expect(result.current).toEqual({ effectsEnabled: false, motionAllowed: false })

    act(() => setVisualEffects(true))
    expect(result.current).toEqual({ effectsEnabled: true, motionAllowed: true })
  })

  it('follows a choice another tab stored', () => {
    controllableReducedMotion(false)
    controllableVisibility('visible')
    const { result } = renderPolicy()

    act(() => {
      localStorage.setItem(STORAGE_KEY, 'off')
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
    })
    expect(result.current.effectsEnabled).toBe(false)
  })

  it('keeps one snapshot between changes, so subscribers do not re-render for nothing', () => {
    controllableReducedMotion(false)
    controllableVisibility('visible')
    const { result, rerender } = renderPolicy()
    const first = result.current

    rerender()
    expect(result.current).toBe(first)
  })

  it('stops listening when the provider unmounts', () => {
    controllableReducedMotion(false)
    controllableVisibility('visible')
    const remove = vi.spyOn(document, 'removeEventListener')

    renderPolicy().unmount()
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('refuses to answer outside the root provider rather than guessing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useVisualEffects())).toThrow(/VisualEffectsProvider/)
  })
})
