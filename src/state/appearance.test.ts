/**
 * SET-01 — the appearance choice.
 *
 * The assertions that matter are about what this module does *not* do: it keeps
 * no skin list, and it stores nothing of its own. So the derivation is proved
 * against a mocked export carrying a fifth skin — the requirement's "adding a
 * skin to the export adds an option with no code change", which no test against
 * the four real ones could tell apart from a hardcoded list — and persistence
 * is read back from `localStorage['clear.skin']`, which is `skin.js`'s key and
 * not one invented here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  appearanceLabel,
  appearanceOptions,
  applyAppearance,
  currentAppearance,
  SYSTEM_APPEARANCE,
} from './appearance'

const STORAGE_KEY = 'clear.skin'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-skin')
  vi.resetModules()
  vi.doUnmock('../design-system/skin')
})

describe('the option list', () => {
  it('offers the system option first, then every skin the export ships', async () => {
    const { SKINS } = await import('../design-system/skin')

    expect(appearanceOptions().map((option) => option.value)).toEqual([
      SYSTEM_APPEARANCE,
      ...SKINS,
    ])
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

  it('says what the system option follows', () => {
    expect(appearanceLabel(SYSTEM_APPEARANCE)).toMatch(/^System/)
    expect(appearanceLabel(SYSTEM_APPEARANCE)).toContain('contrast')
  })
})

describe('applying a choice', () => {
  it('flips the attribute every screen reads, and stores the choice', () => {
    applyAppearance('vapour')

    expect(document.documentElement.getAttribute('data-skin')).toBe('vapour')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('vapour')
  })

  it('clears the stored choice for the system option', () => {
    applyAppearance('mono')
    applyAppearance(SYSTEM_APPEARANCE)

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    // Nothing stored and no OS contrast request: the app default is active.
    expect(document.documentElement.getAttribute('data-skin')).toBe('clear')
  })

  it('keeps a colour skin chosen while the OS asks for more contrast', async () => {
    const { resolveSkin } = await import('../design-system/skin')
    const original = window.matchMedia
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('prefers-contrast'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia

    try {
      applyAppearance('signal')
      // What the next load resolves to. An explicit choice wins over the OS,
      // including this one — overriding it would be deciding on someone's
      // behalf about their own eyes.
      expect(resolveSkin()).toBe('signal')

      applyAppearance(SYSTEM_APPEARANCE)
      // And the system option hands the decision back to the preference.
      expect(resolveSkin()).toBe('mono')
    } finally {
      window.matchMedia = original
    }
  })

  it('leaves the stored choice alone when asked not to persist', () => {
    applyAppearance('signal')
    applyAppearance('mono', { persist: false })

    expect(document.documentElement.getAttribute('data-skin')).toBe('mono')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('signal')
  })
})

describe('the stored choice', () => {
  it('is the system option while nothing is stored', () => {
    expect(currentAppearance()).toBe(SYSTEM_APPEARANCE)
  })

  it('survives a reload, because it is read from storage and not from state', () => {
    applyAppearance('signal')

    expect(currentAppearance()).toBe('signal')
  })

  it('stays the system option when the OS preference picks the skin', () => {
    // No stored choice, `prefers-contrast: more` — `initSkin` resolves mono,
    // but the user chose nothing, and the picker must not claim they did.
    document.documentElement.setAttribute('data-skin', 'mono')

    expect(currentAppearance()).toBe(SYSTEM_APPEARANCE)
  })

  it('ignores a stored value the export does not know', () => {
    localStorage.setItem(STORAGE_KEY, 'ember')

    expect(currentAppearance()).toBe(SYSTEM_APPEARANCE)
  })
})
