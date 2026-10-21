/**
 * SET-01 / U24 — the appearance choice.
 *
 * The assertions that matter are about what this module does *not* do: it keeps
 * no skin list, it stores nothing of its own, it offers no System option, and
 * it never lets the OS contrast preference pick a skin. So the derivation is
 * proved against a mocked export carrying a fifth skin — the requirement's
 * "adding a skin to the export adds an option with no code change", which no
 * test against the four real ones could tell apart from a hardcoded list — and
 * persistence is read back from `localStorage['clear.skin']`, which is
 * `skin.js`'s key and not one invented here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  appearanceLabel,
  appearanceOptions,
  applyAppearance,
  currentAppearance,
  DEFAULT_SKIN,
} from './appearance'

const STORAGE_KEY = 'clear.skin'

/** Pretend the OS asks for more contrast, for the length of `run`. */
function withMoreContrast(run: () => void) {
  const original = window.matchMedia
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('prefers-contrast'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia

  try {
    run()
  } finally {
    window.matchMedia = original
  }
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-skin')
  vi.resetModules()
  vi.doUnmock('../design-system/skin')
})

describe('the option list', () => {
  it('offers exactly the skins the export ships, in order, and no System option', async () => {
    const { SKINS } = await import('../design-system/skin')

    expect(appearanceOptions().map((option) => option.value)).toEqual([...SKINS])
    for (const option of appearanceOptions()) {
      expect(option.value).not.toBe('system')
      expect(option.label).not.toMatch(/system/i)
    }
  })

  it('grows with the export rather than with this file', async () => {
    vi.doMock('../design-system/skin', async () => {
      const actual = await vi.importActual<typeof import('../design-system/skin')>(
        '../design-system/skin',
      )
      return { ...actual, SKINS: [...actual.SKINS, 'ember'] }
    })

    const { appearanceOptions: derived } = await import('./appearance')

    expect(derived().map((option) => option.value)).toContain('ember')
    // Labelled from its own id: an unknown skin is an option, not a blank chip.
    expect(derived().map((option) => option.label)).toContain('Ember')
  })
})

describe('the labels', () => {
  it('calls Mono enhanced contrast, and never accessible', () => {
    const mono = appearanceLabel('mono')

    expect(mono).toContain('Mono')
    expect(mono).toContain('enhanced contrast')

    for (const option of appearanceOptions()) {
      expect(option.label.toLowerCase()).not.toContain('accessible')
    }
  })

  it('writes CLEAR the way the product writes it', () => {
    expect(appearanceLabel('clear')).toBe('CLEAR')
  })
})

describe('applying a choice', () => {
  it('flips the attribute every screen reads, and stores the choice', () => {
    applyAppearance('vapour')

    expect(document.documentElement.getAttribute('data-skin')).toBe('vapour')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('vapour')
  })

  it('keeps a colour skin chosen while the OS asks for more contrast', () => {
    withMoreContrast(() => {
      applyAppearance('signal')

      expect(document.documentElement.getAttribute('data-skin')).toBe('signal')
      expect(currentAppearance()).toBe('signal')
    })
  })

  it('keeps enhanced contrast one explicit choice away', () => {
    applyAppearance('mono')

    expect(document.documentElement.getAttribute('data-skin')).toBe('mono')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('mono')
  })

  it('leaves the stored choice alone when asked not to persist', () => {
    applyAppearance('signal')
    applyAppearance('mono', { persist: false })

    expect(document.documentElement.getAttribute('data-skin')).toBe('mono')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('signal')
  })
})

describe('the stored choice', () => {
  it('is the product default while nothing is stored', () => {
    expect(DEFAULT_SKIN).toBe('clear')
    expect(currentAppearance()).toBe(DEFAULT_SKIN)
  })

  it('is the product default for a legacy System preference', () => {
    localStorage.setItem(STORAGE_KEY, 'system')

    expect(currentAppearance()).toBe(DEFAULT_SKIN)
  })

  it('survives a reload, because it is read from storage and not from state', () => {
    applyAppearance('signal')

    expect(currentAppearance()).toBe('signal')
  })

  it('is never picked by the OS contrast preference', () => {
    withMoreContrast(() => {
      expect(currentAppearance()).toBe(DEFAULT_SKIN)

      localStorage.setItem(STORAGE_KEY, 'system')
      expect(currentAppearance()).toBe(DEFAULT_SKIN)
    })
  })

  it('ignores a stored value the export does not know', () => {
    localStorage.setItem(STORAGE_KEY, 'ember')

    expect(currentAppearance()).toBe(DEFAULT_SKIN)
  })
})
