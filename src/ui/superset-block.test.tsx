/**
 * EXE-02 acceptance — "superset exercises remain ordered and every set persists
 * unit and correct exercise/block attribution", asserted through the renderer
 * the shell actually dispatches to.
 *
 * The two halves of that sentence are tested as two different kinds of thing,
 * on purpose:
 *
 *   · **Ordered** is a claim about the screen, so it is read off the screen —
 *     and the fixture prescribes its movements in one order while the snapshot
 *     lists them in the other, because a renderer that labelled them in arrival
 *     order would pass a test whose fixture agreed with itself.
 *   · **Persists unit and attribution** is a claim about the row, so it is read
 *     off the client: the entry the shell handed the transport, with the
 *     exercise, the block, the weight unit and — for a distance — the
 *     prescription's own unit on it.
 *
 * Completion is not re-asserted here. `block-renderers.test.tsx` already proves
 * every structure, this one included, completes through the shell's seam with
 * an outcome it observed; what this file adds is what a superset does that no
 * other structure does.
 *
 * And the 0.14.3 composition of the same block (REQ-023): it draws with the
 * shared `BlockPanel` frame — one card, the pair as rows of one list, current
 * element-frame fields and exactly one completion — while each movement's set
 * progression, the in-flight and refused-entry disabled states and the
 * save/retry path stay exactly the shell's.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, type Mock } from 'vitest'

import {
  BlockCompletionContext,
  type BlockCompletionApi,
} from '../state/block-completion'
import { createError, err, ErrorCode, type AppError } from '../state/errors'
import type { WorkoutExerciseRow } from '../state/schemas'
import type { SetLogEntry } from '../state/set-logging'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { sessionProgress, type BlockProgress } from '../state/workout-progress'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type BlockFixture,
  type ExerciseFixture,
  type WorkoutDouble,
} from '../test/workout-double'
import type { Enums } from '../data/database.types'
import { BlockSlot } from './block-renderers'

/** The id the double mints for the first set a test logs. */
const MINTED = 'a0000001-0000-4000-8000-000000000000'

/** The nth id minted: the first is `MINTED`, and no two sets share one. */
function mintedId(index: number): string {
  return `a000000${index + 1}-0000-4000-8000-000000000000`
}

/** No pass the test did not ask for: a retry here is something the user did. */
const NO_AUTOMATIC_RETRY = () => 1_000_000

const offline = () => createError(ErrorCode.NETWORK_OFFLINE)

/**
 * The pair, prescribed in the opposite order to the one it is listed in:
 * `back-squat` carries `order_index` 1 and `romanian-deadlift` carries 0, so
 * the snapshot's array order and the prescription's order disagree. A1 is
 * therefore the second row in the list, and its `workout_exercises.id` is the
 * second the fixture mints — which is what makes the attribution assertion mean
 * something.
 */
function pair(shared: Partial<WorkoutExerciseRow> = {}): ExerciseFixture[] {
  return [
    { prescription: { exercise_id: 'back-squat', order_index: 1, ...shared } },
    { prescription: { exercise_id: 'romanian-deadlift', order_index: 0, ...shared } },
  ]
}

interface Mounted {
  workout: WorkoutDouble
  block: BlockProgress
  /** Every write the transport was asked for, refused or not, in order. */
  attempts: SetLogEntry[]
  onFailure: Mock<(error: AppError) => void>
  completion: { reportOutcome: Mock<BlockCompletionApi['reportOutcome']> }
}

function mount(
  options: {
    block?: BlockFixture
    weightUnit?: Enums<'weight_unit'> | null
    /** Refuse a write: the error to answer, or `null` to let it through. */
    refuse?: (entry: SetLogEntry, attempt: number) => AppError | null
    /** Hold every write unanswered until this settles. */
    held?: Promise<void>
  } = {},
): Mounted {
  const snapshot = snapshotFixture({
    sections: [
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [
          {
            structureType: 'superset',
            roundRestSeconds: 90,
            exercises: pair(),
            ...options.block,
          },
        ],
      },
    ],
  })
  const base = createWorkoutDouble({ session: snapshot })
  const attempts: SetLogEntry[] = []
  const workout: WorkoutDouble = {
    ...base,
    clients: {
      ...base.clients,
      setLogs: {
        ...base.clients.setLogs,
        async log(entry) {
          attempts.push(entry)
          await options.held
          const refusal = options.refuse?.(entry, attempts.length) ?? null
          return refusal === null ? base.clients.setLogs.log(entry) : err(refusal)
        },
      },
    },
  }
  const progress = sessionProgress(snapshot)
  const block = progress.sections[0].blocks[0]
  const onFailure = vi.fn<(error: AppError) => void>()
  let minted = 0

  const completion = {
    reportOutcome: vi.fn<BlockCompletionApi['reportOutcome']>(),
    isBlockRecorded: () => false,
  } satisfies BlockCompletionApi

  render(
    <AppProviders workout={workout.clients}>
      <BlockCompletionContext value={completion}>
        <SetLoggingProvider
          sessionId={FIXTURE_SESSION_ID}
          storage={null}
          exercises={block.exercises}
          weightUnit={options.weightUnit === undefined ? 'kg' : options.weightUnit}
          onFailure={onFailure}
          newId={() => mintedId(minted++)}
          retryDelay={NO_AUTOMATIC_RETRY}
        >
          {/* Dispatched rather than named: the registry decides the renderer. */}
          <BlockSlot block={block} />
        </SetLoggingProvider>
      </BlockCompletionContext>
    </AppProviders>,
  )

  return { workout, block, attempts, onFailure, completion }
}

/** Every card frame in the document, and the ones that sit inside another. */
function cards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.clr-card'))
}

function nestedCards(): HTMLElement[] {
  return cards().filter((card) => card.parentElement?.closest('.clr-card') != null)
}

/** The list the pair is drawn as. */
function movementList(): HTMLElement {
  return screen.getByRole('list', { name: 'Movements in this superset' })
}

/** The pair's rows, in the order the list lays them out. */
function movementRows(): HTMLElement[] {
  return Array.from(movementList().children) as HTMLElement[]
}

/** The row of one movement, found by its heading. */
function rowFor(heading: string) {
  const row = screen.getByRole('heading', { name: heading }).closest('li')
  if (row === null) throw new Error(`no row for ${heading}`)
  return within(row)
}

/**
 * Logs one movement's set as a partial round (REQ-016): 60 kg for 8 typed into
 * its own fields, and the round logged with its partner left alone.
 */
async function logSet(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  setNumber: number,
) {
  const form = formFor(name, setNumber)
  const weight = form.getByLabelText('Weight')
  const reps = form.getByLabelText('Reps')
  await user.clear(weight)
  await user.type(weight, '60')
  await user.clear(reps)
  await user.type(reps, '8')
  await user.click(logRoundButton(setNumber))
}

/** The open round sheet's one action. */
function logRoundButton(round: number): HTMLElement {
  return within(screen.getByRole('form', { name: /^Log round \d+ of / })).getByRole('button', {
    name: `Log round ${round}`,
  })
}

/** Every movement's heading, in the order the document lays them out. */
function movementHeadings(): string[] {
  return screen
    .getAllByRole('heading')
    .map((heading) => heading.textContent ?? '')
}

/**
 * The one movement's part of the round sheet, so two movements' fields never
 * collide. The sheet is the block's, opened from its one Log round.
 */
function formFor(name: string, setNumber = 1) {
  if (screen.queryByRole('form', { name: /^Log round \d+ of / }) === null) {
    fireEvent.click(screen.getByRole('button', { name: 'Log round' }))
  }
  const form = screen.getByRole('form', { name: /^Log round \d+ of / })
  return within(within(form).getByRole('group', { name: new RegExp(`^A\\d ${name}, set ${setNumber}$`) }))
}

describe('a superset keeps its movements in the order the rows prescribe', () => {
  it('labels them A1 and A2 by order_index, not by the order they arrived in', () => {
    mount()

    expect(movementHeadings()).toEqual(['A1 romanian deadlift', 'A2 back squat'])
  })

  it('states the alternation in words, not only with the connector', () => {
    mount()

    // Colour is never the only cue: the rule down the pair's left edge says
    // "one unit" visually, and this says it in the text.
    expect(
      screen.getByText('Alternate A1 → A2 — no rest between movements'),
    ).toBeInTheDocument()
  })

  it('offers each movement its own set-one entry in the round, named for that movement', () => {
    mount()

    expect(formFor('romanian deadlift').getByLabelText('Reps')).toBeInTheDocument()
    expect(formFor('back squat').getByLabelText('Reps')).toBeInTheDocument()
    expect(logRoundButton(1)).toBeInTheDocument()
  })
})

describe('rest is the block’s, prescribed after both movements', () => {
  it('states the block’s rest once, below the pair', () => {
    mount()

    expect(screen.getByText('Rest 90s after both movements')).toBeInTheDocument()
  })

  it('states no per-movement rest, however much the prescriptions carry', () => {
    // Both prescriptions carry `rest_seconds: 90`; a superset rests once, after
    // A2, so neither movement states a rest of its own.
    mount()

    expect(screen.queryByText('Rest 90s')).not.toBeInTheDocument()
  })

  it('renders no rest line at all when the block prescribes none', () => {
    mount({ block: { roundRestSeconds: null } })

    // The pairing line's "no rest between movements" is the opposite claim, and
    // is not what is looked for: a *statement of rest* is `Rest 90s …`.
    expect(screen.queryByText(/^Rest \d/)).not.toBeInTheDocument()
  })

  it('never renders a zero rest as a rest', () => {
    mount({ block: { roundRestSeconds: 0 } })

    expect(screen.queryByText(/^Rest \d/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Rest 0/)).not.toBeInTheDocument()
  })
})

describe('every set persists its unit and its exercise and block attribution', () => {
  it('writes the set against the movement performed, in the block it was performed in', async () => {
    const user = userEvent.setup()
    const { workout, block } = mount()

    // A2 — the movement whose row is *first* in the snapshot and second on the
    // screen. Logging against it is what a positional bug would get wrong.
    const form = formFor('back squat')
    await user.type(form.getByLabelText('Weight'), '60')
    await user.clear(form.getByLabelText('Reps'))
    await user.type(form.getByLabelText('Reps'), '8')
    await user.click(logRoundButton(1))

    const a2 = block.exercises[1]
    await waitFor(() =>
      expect(workout.loggedSets()).toEqual([
        {
          id: MINTED,
          exerciseId: a2.exerciseId,
          blockId: block.blockId,
          distanceUnit: null,
          weightUnit: 'kg',
          performed: { setNumber: 1, reps: 8, weight: 60 },
        },
      ]),
    )
    expect(a2.prescription.exercise_id).toBe('back-squat')
  })

  it('stamps the profile’s unit on the row rather than a guessed one', async () => {
    const user = userEvent.setup()
    const { workout } = mount({ weightUnit: 'lb' })

    const form = formFor('romanian deadlift')
    await user.type(form.getByLabelText('Weight'), '135')
    await user.clear(form.getByLabelText('Reps'))
    await user.type(form.getByLabelText('Reps'), '10')
    await user.click(logRoundButton(1))

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(1))
    expect(workout.loggedSets()[0].weightUnit).toBe('lb')
  })

  it('logs the modality prescribed, in the prescription’s own unit', async () => {
    const user = userEvent.setup()
    const { workout, block } = mount({
      block: {
        structureType: 'superset',
        roundRestSeconds: 90,
        exercises: pair({
          modality: 'distance',
          distance_unit: 'm',
          target_kind: 'fixed',
          target_value: 400,
        }),
      },
    })

    const form = formFor('romanian deadlift')
    await user.clear(form.getByLabelText('Distance (m)'))
    await user.type(form.getByLabelText('Distance (m)'), '400')
    await user.click(logRoundButton(1))

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(1))
    // Distance in its own column and its own unit: a carry logged as reps is
    // the quiet data loss the requirement forbids.
    expect(workout.loggedSets()[0]).toMatchObject({
      exerciseId: block.exercises[0].exerciseId,
      blockId: block.blockId,
      distanceUnit: 'm',
      performed: { setNumber: 1, distance: 400 },
    })
  })

  it('shows each target kind from the structured prescription, never a parsed string', () => {
    mount({
      block: {
        structureType: 'superset',
        exercises: [
          {
            prescription: {
              exercise_id: 'back-squat',
              order_index: 0,
              target_kind: 'range',
              target_value: null,
              target_min: 8,
              target_max: 10,
            },
          },
          {
            prescription: {
              exercise_id: 'romanian-deadlift',
              order_index: 1,
              target_kind: 'sequence',
              target_value: null,
              target_sequence: [15, 12, 9, 6, 3],
            },
          },
        ],
      },
    })

    expect(screen.getByText('3 × 8–10 reps')).toBeInTheDocument()
    expect(screen.getByText('5 rungs · 15-12-9-6-3 reps')).toBeInTheDocument()
  })
})

describe('a superset whose movements were swapped out', () => {
  it('says the block has nothing left to perform rather than drawing an empty card', () => {
    mount({
      block: {
        structureType: 'superset',
        exercises: pair({ revision_status: 'superseded' }),
      },
    })

    expect(
      screen.getByText(/every movement in it was swapped\s+out/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
  })

  it('still states the block’s rest and its remaining movement when one survives', () => {
    mount({
      block: {
        structureType: 'superset',
        roundRestSeconds: 60,
        exercises: [
          {
            prescription: {
              exercise_id: 'back-squat',
              order_index: 0,
              revision_status: 'superseded',
            },
          },
          { prescription: { exercise_id: 'romanian-deadlift', order_index: 1 } },
        ],
      },
    })

    expect(movementHeadings()).toEqual(['A1 romanian deadlift'])
    // One movement is not an alternation, so the pairing line is not drawn —
    // but the block's rest is still the block's.
    expect(screen.queryByText(/Alternate/)).not.toBeInTheDocument()
    expect(screen.getByText('Rest 60s after the movement')).toBeInTheDocument()
  })

  it('draws no connector round the one movement left, because there is no pair to link', () => {
    mount({
      block: {
        structureType: 'superset',
        exercises: [
          {
            prescription: {
              exercise_id: 'back-squat',
              order_index: 0,
              revision_status: 'superseded',
            },
          },
          { prescription: { exercise_id: 'romanian-deadlift', order_index: 1 } },
        ],
      },
    })

    expect(movementRows()).toHaveLength(1)
    expect((movementList().parentElement as HTMLElement).style.borderLeft).toBe('')
  })
})

describe('the superset draws with the shared block frame', () => {
  it('is one card, with the pair as rows of one list and never a card inside it', () => {
    mount()

    expect(cards()).toHaveLength(1)
    expect(nestedCards()).toEqual([])

    const rows = movementRows()
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.tagName).toBe('LI')
      expect(row.closest('.clr-card')).toBe(cards()[0])
      expect(row.querySelector('.clr-card')).toBeNull()
      // A superset tracks no live position: neither row is marked current.
      expect(row).not.toHaveAttribute('aria-current')
    }
    expect(rows.map((row) => within(row).getAllByRole('heading')[0].textContent)).toEqual([
      'A1 romanian deadlift',
      'A2 back squat',
    ])
  })

  it('carries the identity row, the pairing and the rest inside the card, and no completion of its own', () => {
    mount()

    const inside = within(cards()[0])
    expect(inside.getByText('2 movements')).toBeInTheDocument()
    expect(
      inside.getByText('Alternate A1 → A2 — no rest between movements'),
    ).toBeInTheDocument()
    expect(inside.getByText('Rest 90s after both movements')).toBeInTheDocument()
    // REQ-013: the section's forward action completes the block.
    expect(inside.queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()
  })

  it('links the pair with one rule drawn from tokens, not one per row', () => {
    mount()

    const connector = movementList().parentElement as HTMLElement
    expect(connector.style.borderLeft).toBe(
      'var(--border-width) solid var(--border-frame-structure)',
    )
    expect(connector.style.paddingLeft).toBe('var(--spacing-200)')
    for (const row of movementRows()) expect(row.style.borderLeft).toBe('')
  })

  it('sets each movement’s fields in one compact row of current element frames', () => {
    mount()

    for (const name of ['romanian deadlift', 'back squat']) {
      const form = formFor(name)
      const row = form.getByLabelText('Weight').closest('.clr-set-sheet__measures')
      expect(row).not.toBeNull()
      // The row adds no frame: the fields are the only chamfers in it.
      expect(row).not.toHaveClass('clr-chamfer')

      // Weight and reps only: no effort field and no warmup checkbox (U36).
      expect(form.getAllByRole('spinbutton')).toHaveLength(2)
      for (const label of ['Weight', 'Reps']) {
        const field = form.getByLabelText(label)
        expect(field).toHaveClass('clr-input')
        expect(field.closest('.clr-set-sheet__measures')).toBe(row)
        expect(field.closest('.clr-field')).not.toBeNull()
      }
      expect(form.queryByLabelText(/RPE/i)).not.toBeInTheDocument()
      // The one checkbox is the round's Performed tick (REQ-016), never a warmup.
      expect(form.getAllByRole('checkbox')).toEqual([
        form.getByRole('checkbox', { name: 'Performed' }),
      ])
      const unit = form.getByRole('combobox', { name: 'Unit' })
      expect(unit).toHaveClass('clr-input')
      expect(unit.closest('.clr-set-sheet__measures')).toBe(row)
      expect(unit.closest('.clr-field')).not.toBeNull()
    }
  })

  it('gives the pair one Log round, and reports the block as a whole', () => {
    const { completion } = mount()

    // REQ-016: one combined action, inside the card, and no per-movement Log set.
    expect(within(cards()[0]).getAllByRole('button', { name: 'Log round' })).toHaveLength(1)
    expect(rowFor('A1 romanian deadlift').queryByRole('button', { name: 'Log set' })).toBeNull()
    expect(rowFor('A2 back squat').queryByRole('button', { name: 'Log set' })).toBeNull()

    // The report is the block's, with nothing a superset did not observe.
    expect(completion.reportOutcome).toHaveBeenLastCalledWith(expect.any(String), {})
  })
})

describe('set progression follows the round, and each movement keeps its own rows', () => {
  it('moves the pair on to the next round, recording only the movement logged', async () => {
    const user = userEvent.setup()
    const { workout } = mount()

    await logSet(user, 'romanian deadlift', 1)

    // The round moves on. A1 is prefilled from the set just done; A2 missed
    // round one and stays missing there rather than being filled in.
    await screen.findByRole('form', { name: /^Log round 2 of / })
    const next = formFor('romanian deadlift', 2)
    expect(rowFor('A1 romanian deadlift').getByText('Set 2/3')).toBeInTheDocument()
    expect(next.getByLabelText('Weight')).toHaveValue(60)
    expect(next.getByLabelText('Reps')).toHaveValue(8)
    expect(rowFor('A2 back squat').getByText('Set 2/3')).toBeInTheDocument()

    const a1 = rowFor('A1 romanian deadlift')
    expect(a1.getByText('Set 1 · 8 reps · 60 kg')).toBeInTheDocument()
    await waitFor(() => expect(a1.getByText('Saved')).toBeInTheDocument())
    expect(rowFor('A2 back squat').queryByRole('list', { name: 'Logged sets' })).toBeNull()
    expect(workout.loggedSets()).toHaveLength(1)
  })

  it('logs the whole pair under the round’s one set number', async () => {
    const user = userEvent.setup()
    const { workout, block } = mount()

    for (const round of [1, 2]) {
      for (const name of ['romanian deadlift', 'back squat']) {
        const form = formFor(name, round)
        await user.clear(form.getByLabelText('Weight'))
        await user.type(form.getByLabelText('Weight'), '60')
      }
      await user.click(logRoundButton(round))
      await screen.findByRole('form', { name: new RegExp(`^Log round ${round + 1} of `) })
    }

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(4))
    const [a1, a2] = block.exercises
    expect(
      workout.loggedSets().map((set) => [set.exerciseId, set.performed.setNumber]),
    ).toEqual([
      [a1.exerciseId, 1],
      [a2.exerciseId, 1],
      [a1.exerciseId, 2],
      [a2.exerciseId, 2],
    ])
  })

  it('resumes the pair one round past the highest set either has recorded', () => {
    mount({
      block: {
        structureType: 'superset',
        roundRestSeconds: 90,
        exercises: [
          {
            prescription: { exercise_id: 'back-squat', order_index: 1 },
            setLogs: [{ set_number: 1, actual_reps: 8 }],
          },
          {
            prescription: { exercise_id: 'romanian-deadlift', order_index: 0 },
            setLogs: [
              { set_number: 1, actual_reps: 8 },
              { set_number: 2, actual_reps: 8 },
              { set_number: 3, actual_reps: 8 },
            ],
          },
        ],
      },
    })

    // A1 has done every round prescribed, so the next is an extra one. A2
    // missed rounds two and three; those stay missing, not refilled.
    expect(formFor('romanian deadlift', 4).getByLabelText('Reps')).toBeInTheDocument()
    expect(rowFor('A1 romanian deadlift').getByText('Extra set 4')).toBeInTheDocument()
    expect(formFor('back squat', 4).getByLabelText('Reps')).toBeInTheDocument()
    expect(rowFor('A2 back squat').getByText('Extra set 4')).toBeInTheDocument()
    expect(logRoundButton(4)).toBeInTheDocument()
  })
})

describe('saving, refusing and retrying a set', () => {
  it('holds the round’s action busy and disabled while a set from it is in flight', async () => {
    const user = userEvent.setup()
    let release: (() => void) | null = null
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { workout, attempts } = mount({ held })

    await logSet(user, 'romanian deadlift', 1)

    // The set is on the screen at once, and said to be saving — not saved.
    const a1 = rowFor('A1 romanian deadlift')
    await screen.findByRole('form', { name: /^Log round 2 of / })
    const busy = logRoundButton(2)
    await waitFor(() => expect(busy).toBeDisabled())
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(a1.getByText('Saving')).toBeInTheDocument()
    expect(a1.queryByText('Saved')).not.toBeInTheDocument()

    // A second press while the first is unanswered writes nothing more.
    await user.click(formFor('back squat', 2).getByRole('checkbox', { name: 'Performed' }))
    await user.click(busy)
    expect(attempts).toHaveLength(1)
    expect(workout.loggedSets()).toEqual([])

    await act(async () => {
      release?.()
      await held
    })

    await waitFor(() => expect(a1.getByText('Saved')).toBeInTheDocument())
    expect(logRoundButton(2)).toBeEnabled()
    expect(workout.loggedSets()).toHaveLength(1)
  })

  it('disables the action for an entry it would refuse, and says why at the field', async () => {
    const user = userEvent.setup()
    const { attempts } = mount()

    const form = formFor('back squat')
    await user.type(form.getByLabelText('Weight'), '-5')

    expect(logRoundButton(1)).toBeDisabled()
    expect(form.getByLabelText('Weight')).toBeInvalid()
    expect(form.getByText('Enter a weight of zero or more')).toBeInTheDocument()
    // Its partner is not marked invalid by it.
    expect(formFor('romanian deadlift').getByLabelText('Weight')).toBeValid()

    await user.clear(form.getByLabelText('Weight'))
    expect(form.getByLabelText('Weight')).toBeValid()
    // Clearing the only entered result leaves an untouched prescription, not
    // an observation. A deliberate tick may still accept the suggested reps.
    expect(logRoundButton(1)).toBeDisabled()
    await user.click(form.getByRole('checkbox', { name: 'Performed' }))
    expect(logRoundButton(1)).toBeEnabled()
    expect(attempts).toEqual([])
  })

  it('keeps a refused set on the screen as unsaved, and sends it with the next set logged', async () => {
    const user = userEvent.setup()
    let online = false
    const { workout, attempts, block } = mount({
      refuse: () => (online ? null : offline()),
    })

    await logSet(user, 'romanian deadlift', 1)

    // Refused, and neither lost nor drawn as saved: a word and a glyph say so.
    const a1 = rowFor('A1 romanian deadlift')
    expect(await a1.findByText('On this device only')).toBeInTheDocument()
    expect(a1.getByText('Set 1 · 8 reps · 60 kg')).toBeInTheDocument()
    expect(a1.queryByText('Saved')).not.toBeInTheDocument()
    expect(workout.loggedSets()).toEqual([])
    expect(attempts).toHaveLength(1)

    // Logging is not blocked by it: the round has moved on and is open.
    await screen.findByRole('form', { name: /^Log round 2 of / })
    expect(logRoundButton(2)).toBeInTheDocument()

    // The connection returns, and the next set logged carries the first along.
    online = true
    await logSet(user, 'back squat', 2)

    await waitFor(() => expect(workout.loggedSets()).toHaveLength(2))
    const [first, second] = block.exercises
    expect(
      workout
        .loggedSets()
        .map((set) => `${set.id} ${set.exerciseId}`)
        .sort(),
    ).toEqual(
      [`${MINTED} ${first.exerciseId}`, `${mintedId(1)} ${second.exerciseId}`].sort(),
    )
    // The retry is the same row under the same id — never a second set.
    expect(attempts.filter((entry) => entry.id === MINTED)).toHaveLength(2)
    await waitFor(() =>
      expect(a1.queryByText('On this device only')).not.toBeInTheDocument(),
    )
    expect(a1.getByText('Saved')).toBeInTheDocument()
    expect(rowFor('A2 back squat').getByText('Saved')).toBeInTheDocument()
  })

  it('refuses a set with no unit to stamp, and says so through the shell', async () => {
    const user = userEvent.setup()
    const { attempts, onFailure } = mount({ weightUnit: null })

    const form = formFor('back squat')
    await user.type(form.getByLabelText('Weight'), '60')
    await user.clear(form.getByLabelText('Reps'))
    await user.type(form.getByLabelText('Reps'), '8')
    await user.click(logRoundButton(1))

    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(onFailure.mock.calls[0][0].code).toBe(ErrorCode.VALIDATION_REQUIRED_FIELD)
    expect(attempts).toEqual([])
    // Nothing was recorded, so the movement is still on set one, as typed.
    expect(formFor('back squat', 1).getByLabelText('Weight')).toHaveValue(60)
    expect(logRoundButton(1)).toBeInTheDocument()
    expect(rowFor('A2 back squat').getByText('Set 1/3')).toBeInTheDocument()
  })
})
