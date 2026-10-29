/** A circuit's movement clock belongs to its row, not optional load entry. */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkoutExerciseRow } from '../state/schemas'
import { AppProviders, signedIn } from '../test/render'
import { createWorkoutDouble, snapshotFixture } from '../test/workout-double'
import { routes } from './router'

let clock = 0

beforeEach(() => {
  window.localStorage.clear()
  clock = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

function advance(seconds: number) {
  clock += seconds * 1000
  act(() => window.dispatchEvent(new Event('focus')))
}

async function shell(prescription: Partial<WorkoutExerciseRow> = {}) {
  const double = createWorkoutDouble({ session: snapshotFixture({
    sections: [{ title: 'Conditioning', sectionType: 'conditioning', blocks: [{
      structureType: 'circuit', rounds: 3, roundRestSeconds: 15,
      exercises: [{ prescription: {
        exercise_id: 'hollow-body-hold', equipment_used: 'bodyweight',
        load_type: 'bodyweight', load_value: null, modality: 'time', target_value: 30,
        ...prescription,
      } }, { prescription: { exercise_id: 'bench-press' } }],
    }] }],
  }) })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider router={createMemoryRouter(routes, {
        initialEntries: ['/', '/workout'], initialIndex: 1,
      })} />
    </AppProviders>,
  )
  await screen.findByRole('navigation', { name: 'Workout sections' })
  return double
}

function row() {
  const found = screen.getByRole('heading', { name: /hollow body hold$/ }).closest('li')
  if (found === null) throw new Error('no owning circuit movement row')
  return found
}

const region = () => screen.getByRole('region', { name: 'hollow body hold countdown' })
const timer = () => within(region()).getByRole('timer', { name: 'Countdown' })
const button = (name: string) => within(region()).getByRole('button', { name })

describe('AC-051: a circuit movement owns its countdown independently of load entry', () => {
  it('offers its clock before any load entry opens, in the owning row without extra frames', async () => {
    await shell()
    expect(within(row()).getByRole('button', { name: 'Rest for hollow body hold' }))
      .toHaveAttribute('aria-expanded', 'false')
    expect(row()).toContainElement(region())
    expect(timer()).toHaveTextContent('00:30')
    expect(button('Start')).toBeEnabled()
    expect(screen.queryByRole('form', { name: /^Log set/ })).toBeNull()
    expect(timer()).not.toHaveClass('clr-card__body')
    const card = timer().closest('.clr-card')!
    expect(card.querySelectorAll('.clr-card__bar')).toHaveLength(1)
    expect(card.querySelectorAll('.clr-card .clr-card')).toHaveLength(0)
  })

  it('keeps the same running clock through load-entry show/hide and shared-sheet opening', async () => {
    const user = userEvent.setup()
    await shell()
    const original = timer()
    fireEvent.click(button('Start'))
    advance(5)
    await user.click(within(row()).getByRole('button', { name: 'Rest for hollow body hold' }))
    expect(timer()).toBe(original)
    expect(timer()).toHaveTextContent('00:25')
    const form = screen.getByRole('form', { name: 'Log set 1 of hollow body hold' })
    expect(form).not.toContainElement(region())
    expect(screen.getAllByRole('region', { name: 'hollow body hold countdown' })).toHaveLength(1)
    expect(row()).toContainElement(region())
    advance(5)
    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    await user.click(within(row()).getByRole('button', { name: 'Hide load entry for hollow body hold' }))
    expect(timer()).toBe(original)
    expect(timer()).toHaveTextContent('00:20')
    advance(5)
    expect(timer()).toHaveTextContent('00:15')
    await user.click(within(row()).getByRole('button', { name: 'Rest for hollow body hold' }))
    expect(timer()).toBe(original)
    expect(screen.getAllByRole('region', { name: 'hollow body hold countdown' })).toHaveLength(1)
  })

  it('keeps pause/reset usable with load entry closed and records nothing at expiry', async () => {
    const double = await shell()
    fireEvent.click(button('Start'))
    advance(10)
    fireEvent.click(button('Pause'))
    advance(50)
    expect(timer()).toHaveTextContent('00:20')
    fireEvent.click(button('Start'))
    advance(5)
    expect(timer()).toHaveTextContent('00:15')
    fireEvent.click(button('Reset'))
    expect(timer()).toHaveTextContent('00:30')
    fireEvent.click(button('Start'))
    advance(31)
    expect(timer()).toHaveTextContent('00:00')
    expect(button('Start')).toBeDisabled()
    expect(double.loggedSets()).toEqual([])
    // A movement's countdown is not the round clock: round 1 is still unstarted.
    expect(screen.getByRole('button', { name: 'Start round 1' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: /^Log set/ })).toBeNull()
  })

  it('uses each valid time-sequence target and rearms only after explicit logging', async () => {
    const user = userEvent.setup()
    const double = await shell({ target_kind: 'sequence', target_value: null,
      target_sequence: [30, 20], sets: 2 })
    expect(timer()).toHaveTextContent('00:30')
    fireEvent.click(button('Start'))
    advance(31)
    expect(timer()).toHaveTextContent('00:00')
    expect(double.loggedSets()).toEqual([])
    await user.click(within(row()).getByRole('button', { name: 'Rest for hollow body hold' }))
    const form = within(screen.getByRole('form', { name: 'Log set 1 of hollow body hold' }))
    expect(form.getByLabelText('Seconds')).toHaveValue(30)
    await user.click(form.getByRole('button', { name: 'Log set 1' }))
    await within(row()).findByText('Saved')
    expect(timer()).toHaveTextContent('00:20')
    expect(button('Start')).toBeEnabled()
    expect(double.loggedSets()).toHaveLength(1)
  })
})
