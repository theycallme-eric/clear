/**
 * SET-01 — the picker, and the composition a screen makes of it.
 *
 * Two halves. The first is the control: one radio per option, derived from the
 * export's list, with Mono named as enhanced contrast. The second is what the
 * requirement actually asks for — that choosing flips the live skin and stores
 * it, and that the system option clears the store again — so it is asserted
 * through the same `useAppearance` + `AppearancePicker` pair Settings composes,
 * by clicking, rather than by calling the state module directly.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { SKINS } from '../design-system/skin'
import { useAppearance } from '../state/appearance'
import { AppearancePicker } from './appearance-picker'

const STORAGE_KEY = 'clear.skin'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-skin')
})

/** Exactly what the Settings hub composes: the hook, and the control. */
function AppearanceSetting() {
  const [appearance, choose] = useAppearance()
  return <AppearancePicker value={appearance} onChange={choose} />
}

describe('the control', () => {
  it('offers the system option and every skin the export ships', () => {
    render(<AppearanceSetting />)

    expect(screen.getAllByRole('radio')).toHaveLength(SKINS.length + 1)
    expect(screen.getByRole('radio', { name: /^System/ })).toBeInTheDocument()
    for (const skin of SKINS) {
      expect(
        screen.getByRole('radio', { name: new RegExp(skin, 'i') }),
      ).toBeInTheDocument()
    }
  })

  it('names Mono enhanced contrast, and nothing accessible', () => {
    render(<AppearanceSetting />)

    expect(
      screen.getByRole('radio', { name: /Mono — enhanced contrast/ }),
    ).toBeInTheDocument()
    for (const option of screen.getAllByRole('radio')) {
      expect(option.textContent?.toLowerCase()).not.toContain('accessible')
    }
  })

  it('names the group, so each option is announced against it', () => {
    render(<AppearanceSetting />)

    // The shipped control is a real fieldset/legend around one radiogroup.
    expect(screen.getByRole('group', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
  })

  it('starts on the system option while nothing is stored', () => {
    render(<AppearanceSetting />)

    expect(screen.getByRole('radio', { name: /^System/ })).toBeChecked()
  })

  it('starts on the stored choice after a reload', () => {
    localStorage.setItem(STORAGE_KEY, 'signal')

    render(<AppearanceSetting />)

    expect(screen.getByRole('radio', { name: 'Signal' })).toBeChecked()
  })
})

describe('choosing', () => {
  it('applies the skin live and persists it', async () => {
    const user = userEvent.setup()
    render(<AppearanceSetting />)

    await user.click(screen.getByRole('radio', { name: 'Vapour' }))

    // Live: the attribute is on <html>, which is every screen at once.
    expect(document.documentElement.getAttribute('data-skin')).toBe('vapour')
    // Persisted: `skin.js`'s own key, written by `setSkin` and not by the app.
    expect(localStorage.getItem(STORAGE_KEY)).toBe('vapour')
    expect(screen.getByRole('radio', { name: 'Vapour' })).toBeChecked()
  })

  it('clears the stored choice for the system option', async () => {
    const user = userEvent.setup()
    render(<AppearanceSetting />)

    await user.click(
      screen.getByRole('radio', { name: /Mono — enhanced contrast/ }),
    )
    expect(localStorage.getItem(STORAGE_KEY)).toBe('mono')

    await user.click(screen.getByRole('radio', { name: /^System/ }))

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.getByRole('radio', { name: /^System/ })).toBeChecked()
  })
})
