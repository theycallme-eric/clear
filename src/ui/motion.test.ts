import { afterEach, describe, expect, it, vi } from 'vitest'

import { prefersReducedMotion } from './motion'

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => {
    return {
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList
  })
}

describe('prefersReducedMotion (CORE-05)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports true when the platform asks for reduced motion', () => {
    stubMatchMedia(true)

    expect(prefersReducedMotion()).toBe(true)
  })

  it('reports false when motion is allowed', () => {
    stubMatchMedia(false)

    expect(prefersReducedMotion()).toBe(false)
  })
})
