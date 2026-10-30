/**
 * REQ-016 / JOURNEY-012 — a superset's one Log round, at the workout-screen
 * boundary.
 *
 * Mounted through the real route tree on a synthetic session from the workout
 * double: no personal data, no backend. The pair is deliberately unlike — a
 * loaded bench press counted in reps and a bodyweight plank counted in
 * seconds — so a result that crossed from one movement to the other would
 * land in a column it could not belong to.
 *
 * What it holds the screen to:
 *
 *   · one combined Log round for the pair, with each movement's own fields and
 *     own effort, and nothing copied between them (AC-058);
 *   · only what the athlete identifies is logged: a typed result saves alone,
 *     a ticked movement with blank fields is performed and unmeasured (nulls),
 *     blank fields and prefills alone log nothing, the partner stays missing,
 *     and nothing requires both (AC-059);
 *   · the block's one rest is started by its Rest action, never by Log round
 *     (REQ-012), and the session clock runs on through it untouched (AC-060).
 *
 * The refused-write path — entered values kept when the shell cannot accept
 * the round — is held at the renderer, where the profile's unit can be absent.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BlockCompletionContext } from '../state/block-completion'
import { RestTimerContext, type RestTimerApi } from '../state/rest'
import { SetLoggingProvider } from '../state/set-logging-provider'
import type { WorkoutExerciseRow } from '../state/schemas'
import { sessionProgress } from '../state/workout-progress'
import { AppProviders, signedIn } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type SectionFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import { BlockSlot } from '../ui/block-renderers'
import { routes } from './router'

/** Synthetic: bench press for reps, then a plank for seconds, resting 60s after both. */
const SECTIONS: SectionFixture[] = [
  {
    title: 'Accessory',
    sectionType: 'accessory',
    blocks: [
      {
        structureType: 'superset',
        roundRestSeconds: 60,
        rounds: 3,
        exercises: [
          {
            prescription: {
              exercise_id: 'bench-press',
              order_index: 0,
              modality: 'reps',
              target_value: 8,
              sets: 3,
              rest_seconds: 90,
            },
          },
          {
            prescription: {
              exercise_id: 'plank',
              order_index: 1,
              equipment_used: 'bodyweight',
              load_type: 'bodyweight',
              load_value: null,
              modality: 'time',
              target_value: 30,
              sets: 3,
              rest_seconds: 90,
            },
          },
        ],
      },
    ],
  },
]

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

/** The wall clock moves, then the platform says the page is back. */
function advance(seconds: number) {
  clock += seconds * 1000
  act(() => {
    window.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
}

async function shell(timedPrescription: Partial<WorkoutExerciseRow> = {}): Promise<WorkoutDouble> {
  const sections = SECTIONS.map((section) => ({
    ...section,
    blocks: section.blocks?.map((block) => ({
      ...block,
      exercises: block.exercises?.map((exercise) => typeof exercise === 'object' && exercise.prescription?.exercise_id === 'plank'
        ? { ...exercise, prescription: { ...exercise.prescription, ...timedPrescription } }
        : exercise),
    })),
  }))
  const double = createWorkoutDouble({
    session: snapshotFixture({
      sections,
      startedAt: new Date(Date.now() - 600_000).toISOString(),
    }),
  })
  render(
    <AppProviders {...signedIn({ workout: double.clients })}>
      <RouterProvider
        router={createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })}
      />
    </AppProviders>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Workout' })
  await screen.findByRole('navigation', { name: 'Workout sections' })
  return double
}

/** The workout_exercises id the double minted for a catalog movement. */
function exerciseIdOf(double: WorkoutDouble, catalogId: string): string {
  const stored = double.stored()
  if (stored === null) throw new Error('the double holds no session')
  const found = stored.sections
    .flatMap((section) => section.blocks)
    .flatMap((block) => block.exercises)
    .find((row) => row.exercise.exercise_id === catalogId)
  if (found === undefined) throw new Error(`no ${catalogId}`)
  return found.exercise.id
}

function roundForm(round: number) {
  return screen.getByRole('form', { name: `Log round ${round} of bench press and plank` })
}

async function openRound(user: ReturnType<typeof userEvent.setup>, round: number) {
  if (screen.queryByRole('form', { name: /^Log round \d+ of / }) === null) {
    await user.click(screen.getByRole('button', { name: 'Rest' }))
  }
  return roundForm(round)
}

function movement(form: HTMLElement, label: string) {
  return within(within(form).getByRole('group', { name: label }))
}

function submit(form: HTMLElement, round: number) {
  return within(form).getByRole('button', { name: `Log round ${round}` })
}

async function retype(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, value: string) {
  await user.clear(field)
  await user.type(field, value)
}

function sessionClock(): HTMLElement {
  return screen.getByRole('timer', { name: 'Session time' })
}

function restBars(): HTMLElement[] {
  return screen.queryAllByRole('region', { name: 'Rest' })
}

function restTimer(): HTMLElement {
  return within(screen.getByRole('region', { name: 'Rest' })).getByRole('timer', {
    name: 'Time remaining',
  })
}

describe('one combined Log round (AC-058)', () => {
  it('offers the pair one Log round, and no per-movement Log set', async () => {
    await shell()

    expect(screen.getAllByRole('button', { name: 'Rest' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Log set' })).toBeNull()
  })

  it('enters each movement in its own fields, in its own modality', async () => {
    const user = userEvent.setup()
    await shell()
    const form = await openRound(user, 1)

    const a1 = movement(form, 'A1 bench press, set 1')
    const a2 = movement(form, 'A2 plank, set 1')
    expect(a1.getByLabelText('Weight')).toBeInTheDocument()
    expect(a1.getByLabelText('Reps')).toBeInTheDocument()
    expect(a1.queryByLabelText('Seconds')).toBeNull()
    // Bodyweight context omits the load fields.
    expect(a2.getByLabelText('Seconds')).toBeInTheDocument()
    expect(a2.queryByLabelText('Weight')).toBeNull()
    expect(a2.queryByLabelText('Reps')).toBeNull()
    // Each movement asks its own effort question.
    expect(a1.getByRole('group', { name: 'Effort' })).toBeInTheDocument()
    expect(a2.getByRole('group', { name: 'Effort' })).toBeInTheDocument()
  })

  it('logs both results in one action, each with its own effort, nothing copied', async () => {
    const user = userEvent.setup()
    const double = await shell()
    const form = await openRound(user, 1)
    const a1 = movement(form, 'A1 bench press, set 1')
    const a2 = movement(form, 'A2 plank, set 1')

    await retype(user, a1.getByLabelText('Weight'), '60')
    await retype(user, a1.getByLabelText('Reps'), '7')
    await user.click(a1.getByRole('radio', { name: 'Too hard' }))
    await retype(user, a2.getByLabelText('Seconds'), '45')
    await user.click(a2.getByRole('radio', { name: 'Too easy' }))
    await user.click(submit(form, 1))

    await waitFor(() => expect(double.loggedSets()).toHaveLength(2))
    const byExercise = (catalogId: string) =>
      double.loggedSets().find((entry) => entry.exerciseId === exerciseIdOf(double, catalogId))

    expect(byExercise('bench-press')?.performed).toEqual({
      setNumber: 1,
      reps: 7,
      weight: 60,
      effort: 'too_hard',
    })
    // The plank holds its own seconds and effort — no reps, no load, no "hard".
    expect(byExercise('plank')?.performed).toEqual({
      setNumber: 1,
      durationSeconds: 45,
      effort: 'too_easy',
    })
    // The sheet moves on to the next round, every field and effort fresh.
    const next = roundForm(2)
    expect(within(movement(next, 'A1 bench press, set 2').getByRole('group', { name: 'Effort' }))
      .queryByRole('radio', { checked: true })).toBeNull()
    expect(movement(next, 'A1 bench press, set 2').getByRole('checkbox', { name: 'Performed' })).not.toBeChecked()
  })
})

describe('partial rounds, without a both-movements gate (AC-059)', () => {
  it('logs nothing from blank fields or prefilled suggestions alone', async () => {
    const user = userEvent.setup()
    const double = await shell()
    const form = await openRound(user, 1)

    // The prescription's reps and seconds are prefilled as suggestions, and
    // neither movement is identified as performed: there is no round to log.
    expect(movement(form, 'A1 bench press, set 1').getByLabelText('Reps')).toHaveValue(8)
    expect(movement(form, 'A2 plank, set 1').getByLabelText('Seconds')).toHaveValue(30)
    expect(submit(form, 1)).toBeDisabled()
    await user.click(submit(form, 1))

    expect(double.loggedSets()).toEqual([])
    // Rest started the block's one rest when it opened the sheet; nothing more.
    expect(restBars()).toHaveLength(1)
  })

  it('saves an explicitly entered result alone, and leaves the partner missing', async () => {
    const user = userEvent.setup()
    const double = await shell()
    const form = await openRound(user, 1)
    const a1 = movement(form, 'A1 bench press, set 1')

    // Typing is the identification: no separate tick is needed.
    await retype(user, a1.getByLabelText('Reps'), '6')
    expect(a1.getByRole('checkbox', { name: 'Performed' })).toBeChecked()
    expect(movement(form, 'A2 plank, set 1').getByRole('checkbox', { name: 'Performed' })).not.toBeChecked()
    // No error asks for the partner.
    expect(within(form).queryByText(/required|both/i)).toBeNull()
    await user.click(submit(form, 1))

    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))
    expect(double.loggedSets()[0]).toMatchObject({
      exerciseId: exerciseIdOf(double, 'bench-press'),
      performed: { setNumber: 1, reps: 6 },
    })
    // Not a zero, not a prefill, not a copy: the plank has no row at all.
    expect(double.loggedSets().some((entry) => entry.exerciseId === exerciseIdOf(double, 'plank'))).toBe(false)

    // The next round keeps the plank's gap at set 1 rather than sliding into it.
    const next = roundForm(2)
    await user.click(movement(next, 'A2 plank, set 2').getByRole('checkbox', { name: 'Performed' }))
    await user.click(submit(next, 2))
    await waitFor(() => expect(double.loggedSets()).toHaveLength(2))
    expect(double.loggedSets()[1]).toMatchObject({
      exerciseId: exerciseIdOf(double, 'plank'),
      performed: { setNumber: 2, durationSeconds: 30 },
    })
  })

  it('logs a movement ticked as performed with blank fields as unmeasured, never zero', async () => {
    const user = userEvent.setup()
    const double = await shell()
    const form = await openRound(user, 1)
    const a1 = movement(form, 'A1 bench press, set 1')

    await user.click(a1.getByRole('checkbox', { name: 'Performed' }))
    await user.clear(a1.getByLabelText('Reps'))
    await user.click(submit(form, 1))

    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))
    // Only the set number: every measurement is absent, which the row stores as null.
    expect(double.loggedSets()[0].performed).toEqual({ setNumber: 1 })

    const rows = within(screen.getByRole('heading', { name: 'A1 bench press' }).closest('section')!)
      .getByRole('list', { name: 'Logged sets' })
    expect(rows).toHaveTextContent('Set 1')
    expect(rows).not.toHaveTextContent(/\b0\b/)
  })

  it('drops an entry the athlete unticks, and keeps the fields as typed', async () => {
    const user = userEvent.setup()
    const double = await shell()
    const form = await openRound(user, 1)
    const a2 = movement(form, 'A2 plank, set 1')

    await retype(user, a2.getByLabelText('Seconds'), '20')
    await user.click(a2.getByRole('checkbox', { name: 'Performed' }))
    expect(submit(form, 1)).toBeDisabled()
    expect(a2.getByLabelText('Seconds')).toHaveValue(20)
    expect(double.loggedSets()).toEqual([])
  })

  it('saves the selected partner independently of an excluded invalid entry', async () => {
    const user = userEvent.setup()
    const double = await shell()
    const form = await openRound(user, 1)
    const a1 = movement(form, 'A1 bench press, set 1')
    const a2 = movement(form, 'A2 plank, set 1')
    const weight = a1.getByLabelText('Weight') as HTMLInputElement
    const reps = a1.getByLabelText('Reps') as HTMLInputElement
    expect(weight.form).toBeNull()
    expect(reps.form).toBeNull()
    expect(weight).toBeEnabled()
    await user.type(a1.getByLabelText('Weight'), '-5')
    await retype(user, a2.getByLabelText('Seconds'), '24')
    // A selected invalid result is still refused, including with a valid partner.
    expect(weight.form).toBe(form)
    expect(reps.form).toBe(form)
    expect(a1.getByLabelText('Weight')).toBeInvalid()
    expect(submit(form, 1)).toBeDisabled()
    await user.click(submit(form, 1))
    expect(double.loggedSets()).toEqual([])

    // Excluding it retains the draft but removes its constraint on the partner.
    await user.click(a1.getByRole('checkbox', { name: 'Performed' }))
    expect(a1.getByLabelText('Weight')).toHaveValue(-5)
    expect(weight.form).toBeNull()
    expect(reps.form).toBeNull()
    expect((a2.getByLabelText('Seconds') as HTMLInputElement).form).toBe(form)
    expect((form as HTMLFormElement).checkValidity()).toBe(true)
    expect(submit(form, 1)).toBeEnabled()
    await user.click(submit(form, 1))

    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))
    expect(double.loggedSets()[0]).toMatchObject({
      exerciseId: exerciseIdOf(double, 'plank'),
      performed: { setNumber: 1, durationSeconds: 24 },
    })
  })

  it('clearing a suggestion does not identify an unmeasured partner', async () => {
    const user = userEvent.setup()
    const double = await shell()
    const form = await openRound(user, 1)
    const a1 = movement(form, 'A1 bench press, set 1')
    const a2 = movement(form, 'A2 plank, set 1')

    await user.clear(a1.getByLabelText('Reps'))
    expect(a1.getByRole('checkbox', { name: 'Performed' })).not.toBeChecked()
    expect(submit(form, 1)).toBeDisabled()
    await retype(user, a2.getByLabelText('Seconds'), '24')
    await user.click(submit(form, 1))

    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))
    expect(double.loggedSets()[0]).toMatchObject({
      exerciseId: exerciseIdOf(double, 'plank'),
      performed: { setNumber: 1, durationSeconds: 24 },
    })
  })

  it('clearing the last entered result or effort requires a deliberate unmeasured tick', async () => {
    const user = userEvent.setup()
    const double = await shell()
    const form = await openRound(user, 1)
    const a1 = movement(form, 'A1 bench press, set 1')
    const performed = a1.getByRole('checkbox', { name: 'Performed' })

    // An untouched prescription remains a suggestion even after a weight was entered.
    await user.type(a1.getByLabelText('Weight'), '60')
    expect(performed).toBeChecked()
    await user.clear(a1.getByLabelText('Weight'))
    expect(performed).not.toBeChecked()
    await retype(user, a1.getByLabelText('Reps'), '9')
    expect(performed).toBeChecked()
    await user.clear(a1.getByLabelText('Reps'))
    expect(performed).not.toBeChecked()

    await user.click(a1.getByRole('radio', { name: 'Too hard' }))
    expect(performed).toBeChecked()
    await user.click(a1.getByRole('button', { name: 'Clear effort for set 1' }))
    expect(performed).not.toBeChecked()
    expect(submit(form, 1)).toBeDisabled()

    // Clearing effort after explicitly excluding the movement cannot re-include it.
    await user.click(a1.getByRole('radio', { name: 'Too easy' }))
    await user.click(performed)
    await user.click(a1.getByRole('button', { name: 'Clear effort for set 1' }))
    expect(performed).not.toBeChecked()

    // The explicit Performed control still permits a wholly unmeasured set.
    await user.click(performed)
    await user.click(a1.getByRole('radio', { name: 'About right' }))
    await user.click(a1.getByRole('button', { name: 'Clear effort for set 1' }))
    expect(performed).toBeChecked()
    await user.click(submit(form, 1))
    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))
    expect(double.loggedSets()[0].performed).toEqual({ setNumber: 1 })
  })

  it('keeps the entry through minimise and reopen', async () => {
    const user = userEvent.setup()
    await shell()
    const form = await openRound(user, 1)
    await retype(user, movement(form, 'A2 plank, set 1').getByLabelText('Seconds'), '41')

    await user.click(within(form.closest('section')!).getByRole('button', { name: 'Minimize' }))
    expect(screen.queryByRole('form', { name: /^Log round/ })).toBeNull()

    const again = await openRound(user, 1)
    const a2 = movement(again, 'A2 plank, set 1')
    expect(a2.getByLabelText('Seconds')).toHaveValue(41)
    expect(a2.getByRole('checkbox', { name: 'Performed' })).toBeChecked()
  })
})

describe('movement countdown ownership through partial rounds', () => {
  const region = () => screen.getByRole('region', { name: 'plank countdown' })
  const timer = () => within(region()).getByRole('timer', { name: 'Countdown' })

  it('rearms an owning first log at its next prescribed time-sequence rung', async () => {
    const user = userEvent.setup()
    const double = await shell({ target_kind: 'sequence', target_value: null, target_sequence: [30, 20] })
    const original = timer()
    await user.click(within(region()).getByRole('button', { name: 'Start' }))
    advance(5)
    const form = await openRound(user, 1)
    await retype(user, movement(form, 'A2 plank, set 1').getByLabelText('Seconds'), '25')
    await user.click(submit(form, 1))
    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))

    expect(timer()).not.toBe(original)
    expect(timer()).toHaveTextContent('00:20')
    expect(within(region()).getByRole('button', { name: 'Start' })).toBeEnabled()
    expect(screen.getAllByRole('region', { name: 'plank countdown' })).toHaveLength(1)
  })

  it('keeps a running unlogged partner clock, then advances its own gapped log by set number', async () => {
    const user = userEvent.setup()
    const double = await shell({ target_kind: 'sequence', target_value: null, target_sequence: [30, 20, 10] })
    const original = timer()
    await user.click(within(region()).getByRole('button', { name: 'Start' }))
    advance(5)
    const form = await openRound(user, 1)
    await retype(user, movement(form, 'A1 bench press, set 1').getByLabelText('Reps'), '7')
    await user.click(submit(form, 1))
    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))

    expect(timer()).toBe(original)
    expect(timer()).toHaveTextContent('00:25')
    advance(5)
    expect(timer()).toHaveTextContent('00:20')
    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    const next = await openRound(user, 2)
    expect(timer()).toBe(original)
    expect(screen.getAllByRole('region', { name: 'plank countdown' })).toHaveLength(1)
    await retype(user, movement(next, 'A2 plank, set 2').getByLabelText('Seconds'), '18')
    await user.click(submit(next, 2))
    await waitFor(() => expect(double.loggedSets()).toHaveLength(2))

    expect(timer()).not.toBe(original)
    expect(timer()).toHaveTextContent('00:10')
    expect(double.loggedSets().find((entry) => entry.exerciseId === exerciseIdOf(double, 'plank'))?.performed.setNumber).toBe(2)
  })
})

describe('a grouped correction returns keyboard focus to an available control', () => {
  it('returns Minimize, Cancel and Save to Edit, and a cleared row to Log round', async () => {
    const user = userEvent.setup()
    const double = await shell()
    const form = await openRound(user, 1)
    await retype(user, movement(form, 'A1 bench press, set 1').getByLabelText('Reps'), '7')
    await user.click(submit(form, 1))
    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))
    const row = within(screen.getByRole('heading', { name: 'A1 bench press' }).closest('section')!)
    await row.findByText('Saved')
    const edit = row.getByRole('button', { name: 'Edit set 1' })
    const editForm = () => screen.getByRole('form', { name: 'Edit set 1 of bench press' })
    const openEdit = async () => {
      edit.focus()
      await user.keyboard('{Enter}')
      return within(await screen.findByRole('form', { name: 'Edit set 1 of bench press' }))
    }

    await openEdit()
    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(edit).toHaveFocus()
    await openEdit()
    await user.click(within(editForm()).getByRole('button', { name: 'Cancel' }))
    expect(edit).toHaveFocus()
    const correction = await openEdit()
    await retype(user, correction.getByLabelText('Reps'), '6')
    await user.click(correction.getByRole('button', { name: 'Save correction' }))
    expect(edit).toHaveFocus()
    await waitFor(() => expect(double.correctedSets()[0]?.performed.reps).toBe(6))

    const clear = await openEdit()
    await user.click(clear.getByRole('button', { name: 'Clear set 1' }))
    const confirmation = await screen.findByRole('dialog', { name: 'Clear set 1 of bench press?' })
    // Hold the native close event: requesting a controlled close still leaves
    // the background inert in a browser until the dialog actually closes.
    const nativeClose = HTMLDialogElement.prototype.close
    const close = vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(() => {})
    await user.click(within(confirmation).getByRole('button', { name: 'Clear set' }))
    await waitFor(() => expect(double.clearedSets()).toHaveLength(1))
    expect(row.queryByRole('list', { name: 'Logged sets' })).toBeNull()
    const logRound = screen.getByRole('button', { name: 'Rest' })
    expect(logRound).not.toHaveFocus()
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(confirmation).toHaveAttribute('open')
    act(() => nativeClose.call(confirmation as HTMLDialogElement))
    expect(logRound).toHaveFocus()
  })
})

describe('shared rest and the global clock (AC-060)', () => {
  it('starts the block’s one rest from Rest, runs it through Log round, and keeps the session clock', async () => {
    const user = userEvent.setup()
    const double = await shell()
    expect(sessionClock()).toHaveTextContent('10:00')
    expect(restBars()).toEqual([])

    // REQ-012: Rest opens the round and starts its one rest — the block's 60
    // seconds, not either movement's own 90 — before anything is logged.
    const form = await openRound(user, 1)
    expect(restBars()).toHaveLength(1)
    expect(screen.getAllByText('Rest after round 1').length).toBeGreaterThan(0)
    expect(restTimer()).toHaveTextContent('01:00')
    expect(double.loggedSets()).toEqual([])

    advance(10)
    await retype(user, movement(form, 'A1 bench press, set 1').getByLabelText('Reps'), '8')
    await retype(user, movement(form, 'A2 plank, set 1').getByLabelText('Seconds'), '30')
    await user.click(submit(form, 1))
    await waitFor(() => expect(double.loggedSets()).toHaveLength(2))

    // Log round saves only: the rest runs on from where it was.
    expect(restBars()).toHaveLength(1)
    expect(restTimer()).toHaveTextContent('00:50')
    advance(10)
    expect(restTimer()).toHaveTextContent('00:40')
    // The session clock is the same one, still counting up through the rest.
    expect(screen.getAllByRole('timer', { name: 'Session time' })).toHaveLength(1)
    expect(sessionClock()).toHaveTextContent('10:20')

    // A partial round still saves as one round, and starts no second rest.
    const next = roundForm(2)
    await retype(user, movement(next, 'A2 plank, set 2').getByLabelText('Seconds'), '25')
    await user.click(submit(next, 2))
    await waitFor(() => expect(double.loggedSets()).toHaveLength(3))
    expect(restBars()).toHaveLength(1)
    expect(screen.queryAllByText('Rest after round 2')).toEqual([])
    expect(restTimer()).toHaveTextContent('00:40')
    expect(sessionClock()).toHaveTextContent('10:20')
  })

  it('starts the rest, and no movement clock, before a round is logged', async () => {
    const user = userEvent.setup()
    const double = await shell()

    await openRound(user, 1)
    advance(5)
    expect(restTimer()).toHaveTextContent('00:55')
    expect(sessionClock()).toHaveTextContent('10:05')
    expect(double.loggedSets()).toEqual([])
  })
})

describe('a round the shell cannot accept keeps what was entered', () => {
  it('refuses with no unit to stamp, starts no further rest, and leaves every field as typed', async () => {
    const user = userEvent.setup()
    const snapshot = snapshotFixture({ sections: SECTIONS })
    const double = createWorkoutDouble({ session: snapshot })
    const block = sessionProgress(snapshot).sections[0].blocks[0]
    const onFailure = vi.fn()
    const start = vi.fn<RestTimerApi['start']>()
    const rest: RestTimerApi = { rest: null, remainingSeconds: 0, start, extend() {}, skip() {} }

    render(
      <AppProviders workout={double.clients}>
        <BlockCompletionContext value={{ reportOutcome: vi.fn(), isBlockRecorded: () => false }}>
        <RestTimerContext value={rest}>
          <SetLoggingProvider
            sessionId={FIXTURE_SESSION_ID}
            storage={null}
            exercises={block.exercises}
            weightUnit={null}
            onFailure={onFailure}
            retryDelay={() => 1_000_000}
          >
            <BlockSlot block={block} />
          </SetLoggingProvider>
        </RestTimerContext>
        </BlockCompletionContext>
      </AppProviders>,
    )

    const form = await openRound(user, 1)
    // Rest asked for the block's one rest as it opened the round.
    expect(start).toHaveBeenCalledTimes(1)
    const a1 = movement(form, 'A1 bench press, set 1')
    await retype(user, a1.getByLabelText('Reps'), '9')
    await user.click(submit(form, 1))

    expect(onFailure).toHaveBeenCalled()
    expect(start).toHaveBeenCalledTimes(1)
    expect(double.loggedSets()).toEqual([])
    // Still round 1, with the athlete's own number and tick.
    const same = roundForm(1)
    expect(movement(same, 'A1 bench press, set 1').getByLabelText('Reps')).toHaveValue(9)
    expect(movement(same, 'A1 bench press, set 1').getByRole('checkbox', { name: 'Performed' })).toBeChecked()
  })
})
