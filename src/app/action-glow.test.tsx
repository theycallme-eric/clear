/**
 * TASK-004 (REQ-005) on the real route tree at `/`: Mark Rest Day and Settings
 * carry the Generate button's glow in every skin, no card acquires one, and
 * the controls keep their focus, disabled and loading states.
 *
 * jsdom runs no stylesheet, so the glow is proved as structure — the same
 * package `.clr-glow` wrapper Generate gets — plus the shipped and local
 * rules read from source. How it looks rendered is the browser lane's to prove.
 */
import { readFileSync } from 'node:fs'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { Button, IconButton } from '../design-system/index'
import { SKINS } from '../design-system/skin'
import { makeSessionRow } from '../test/factories'
import { createFakeGenerationClient } from '../test/generation-double'
import { renderApp, signedIn } from '../test/render'
import { createFakeRestDayClient } from '../test/rest-day-double'
import { createWorkoutDouble } from '../test/workout-double'
import { suggestionDay } from '../state/session-suggestion'
import { ActionGlow } from '../ui/action-glow'
import { GENERATE_ACTION_LABEL, SETTINGS_CONTROL_LABEL } from './Home'

const foundation = readFileSync('src/design-system/css/foundation.css', 'utf8')
const skins = readFileSync('src/design-system/css/skins.css', 'utf8')
const local = readFileSync('src/ui/action-glow.css', 'utf8')

const LOCATION_ID = 'd0000001-0000-4000-8000-000000000000'

/** Trained yesterday, so today keeps its rest-day affordance. */
function yesterday() {
  const [year, month, date] = suggestionDay().split('-').map(Number)
  const day = new Date(Date.UTC(year, month - 1, date - 1)).toISOString().slice(0, 10)
  return makeSessionRow({
    id: 'c0000001-0000-4000-8000-000000000000',
    location_id: LOCATION_ID,
    date: day,
    created_at: `${day}T08:00:00.000Z`,
    started_at: `${day}T09:00:00.000Z`,
    completed_at: `${day}T10:00:00.000Z`,
  })
}

function renderHome() {
  const restDays = createFakeRestDayClient()
  const workout = createWorkoutDouble({ session: null, historyRows: [yesterday()] })
  const view = renderApp(
    ['/'],
    signedIn({ workout: workout.clients, generation: createFakeGenerationClient(), restDays }),
  )
  return { ...view, user: userEvent.setup(), restDays }
}

/** The element casting a control's glow: the wrapper around its bleed. */
function glowOf(button: HTMLElement): HTMLElement | null {
  const bleed = button.parentElement!
  expect(bleed).toHaveClass('clr-bleed')
  const wrapper = bleed.classList.contains('clr-glow') ? bleed : bleed.parentElement
  return wrapper?.classList.contains('clr-glow') ? wrapper : null
}

async function controls() {
  const settings = await screen.findByRole('button', { name: SETTINGS_CONTROL_LABEL })
  const rest = await screen.findByRole('region', { name: 'Rest day' })
  const mark = await within(rest).findByRole('button', { name: 'Mark Rest Day' })
  const generate = await screen.findByRole('button', { name: GENERATE_ACTION_LABEL })
  return { settings, rest, mark, generate }
}

afterEach(() => {
  document.documentElement.removeAttribute('data-skin')
})

describe('Generate glow on actionable controls (REQ-005)', () => {
  it('AC-016: the package glow is Generate\'s 6px in the interaction role, re-tinted by every skin', () => {
    expect(foundation).toContain('--glow-spread: 6px;')
    expect(foundation).toContain('--glow-color: var(--interaction-a300);')
    expect(foundation).toContain(
      '.clr-glow { display: inline-flex; filter: drop-shadow(0 0 var(--glow-spread) var(--glow-color)); }',
    )
    // No skin restates the glow; each changes only the role it reads.
    expect(skins).not.toMatch(/--glow-(spread|color)\s*:/)
    expect(SKINS).toHaveLength(4)
  })

  it('AC-016: Mark Rest Day and Settings sit in the same glow wrapper as Generate, in all four skins', async () => {
    for (const skin of SKINS) {
      document.documentElement.setAttribute('data-skin', skin)
      const { unmount } = renderHome()
      const { settings, mark, generate } = await controls()

      const reference = glowOf(generate)
      expect(reference).not.toBeNull()
      for (const control of [settings, mark]) {
        const glow = glowOf(control)
        expect(glow, `${skin}: ${control.textContent || control.getAttribute('aria-label')}`).not.toBeNull()
        expect(glow).toHaveClass('clr-glow', 'clr-action-glow')
        // The shipped values, untouched: nothing inline overrides them.
        expect(glow!.getAttribute('style')).toBeNull()
        // A glow, not a promotion: they stay the secondary framed control.
        expect(control).not.toHaveClass('clr-btn--primary')
      }
      expect(document.documentElement.getAttribute('data-skin')).toBe(skin)
      unmount()
    }
  })

  it('AC-016: Change reason, the same trigger once a day is marked, keeps the glow', async () => {
    const { user } = renderHome()
    const { rest, mark } = await controls()

    await user.click(mark)
    await user.click(within(rest).getByRole('button', { name: 'Save rest day' }))

    const change = await within(rest).findByRole('button', { name: 'Change reason' })
    expect(glowOf(change)).toHaveClass('clr-action-glow')
  })

  it('AC-017: the local sheet adds no halo of its own and restates no glow value', () => {
    const rules = local.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).not.toMatch(/drop-shadow|box-shadow|text-shadow|--glow-|--interaction|\d+px/)
    // Its only filter rule is the one that turns the glow off.
    expect(rules.match(/filter\s*:[^;]*;/g)).toEqual(['filter: none;'])
  })

  it('AC-017: every glow on Home wraps one control, and no card glows', async () => {
    const { container } = renderHome()
    await controls()

    const glows = [...container.querySelectorAll<HTMLElement>('.clr-glow')]
    expect(glows).toHaveLength(3)
    for (const glow of glows) {
      expect(glow.querySelectorAll('button')).toHaveLength(1)
      expect(glow.querySelector('.clr-card, h1, h2, h3, h4, h5, h6, section, ul, ol')).toBeNull()
    }

    const cards = [...container.querySelectorAll<HTMLElement>('.clr-card')]
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      expect(card.closest('.clr-glow')).toBeNull()
      expect(card.parentElement).not.toHaveClass('clr-glow')
    }
  })

  it('AC-018: both controls take keyboard focus and still act', async () => {
    const { user } = renderHome()
    const { settings, rest, mark } = await controls()

    mark.focus()
    expect(mark).toHaveFocus()
    expect(mark).toBeEnabled()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(within(rest).getByLabelText('Reason')).toHaveFocus())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(within(rest).getByRole('button', { name: 'Mark Rest Day' })).toHaveFocus())

    settings.focus()
    expect(settings).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('button', { name: SETTINGS_CONTROL_LABEL })).toBeNull())
  })

  it('AC-018: a disabled or loading control keeps the component\'s state, and its glow goes out', () => {
    expect(local).toContain('.clr-action-glow:has(> .clr-bleed > :disabled) {\n  filter: none;\n}')
    expect(foundation).toContain('.clr-glow:has(> :disabled) { filter: none; }')

    render(
      <>
        <ActionGlow>
          <Button loading>Mark Rest Day</Button>
        </ActionGlow>
        <ActionGlow>
          <IconButton label="Settings" icon={<span />} disabled />
        </ActionGlow>
        <ActionGlow>
          <Button>Ready</Button>
        </ActionGlow>
      </>,
    )

    const loading = screen.getByRole('button', { name: 'Mark Rest Day' })
    expect(loading).toBeDisabled()
    expect(loading).toHaveAttribute('aria-busy', 'true')
    expect(loading.parentElement).toHaveStyle({ '--bleed': 'var(--border-disabled)' })

    const disabled = screen.getByRole('button', { name: 'Settings' })
    expect(disabled).toBeDisabled()

    const off = '.clr-action-glow:has(> .clr-bleed > :disabled)'
    expect(glowOf(loading)!.matches(off)).toBe(true)
    expect(glowOf(disabled)!.matches(off)).toBe(true)
    expect(glowOf(screen.getByRole('button', { name: 'Ready' }))!.matches(off)).toBe(false)
  })
})
