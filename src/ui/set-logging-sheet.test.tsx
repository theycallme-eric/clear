/**
 * TASK-006 (REQ-008, REQ-009) — the shared set-logging half-sheet and the
 * active movement card it is opened from.
 *
 * Mounted the way the workout shell mounts them: the real set-logging
 * provider, the session's one rest, the sheet host with its slot in a pinned
 * foot, and the open section's label around the block. What is pinned here is
 * the card's hierarchy, the sheet's layout, the existing saving and error
 * retention, and — since TASK-008 — the complete effort-enabled sheet: the
 * per-set effort and its Clear between the measurement row and the action, in
 * both modes. Durable correction (TASK-011) is still exercised through its
 * interface with a test double only.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { Enums } from '../data/database.types'
import { BlockCompletionContext, type BlockCompletionApi } from '../state/block-completion'
import { createError, err, ErrorCode } from '../state/errors'
import { RestTimerProvider } from '../state/rest-provider'
import type { WorkoutExerciseRow } from '../state/schemas'
import type { PerformedSet, SetLogEntry } from '../state/set-logging'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { sessionProgress } from '../state/workout-progress'
import { AppProviders } from '../test/render'
import {
  createWorkoutDouble,
  FIXTURE_SESSION_ID,
  snapshotFixture,
  type ExerciseFixture,
} from '../test/workout-double'
import { BlockSlot } from './block-renderers'
import { SectionLabelContext } from './section-label-context'
import { ExerciseSetLogger, type ExerciseSetLoggerProps } from './set-logger'
import { SetLoggingSheetHost, SetLoggingSheetSlot } from './set-logging-sheet'

interface MountOptions {
  prescription?: Partial<WorkoutExerciseRow>
  exercises?: ExerciseFixture[]
  weightUnit?: Enums<'weight_unit'> | null
  refuse?: boolean
  logger?: Partial<ExerciseSetLoggerProps>
  /** Draw the logger directly rather than through the dispatched block. */
  bare?: boolean
}

function mount(options: MountOptions = {}) {
  const snapshot = snapshotFixture({
    sections: [
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [
          {
            structureType: 'standard',
            exercises: options.exercises ?? [{ prescription: options.prescription ?? {} }],
          },
        ],
      },
    ],
  })
  const base = createWorkoutDouble({ session: snapshot })
  const attempts: SetLogEntry[] = []
  const clients = {
    ...base.clients,
    setLogs: {
      async log(entry: SetLogEntry) {
        attempts.push(entry)
        return options.refuse
          ? err(createError(ErrorCode.NETWORK_OFFLINE))
          : base.clients.setLogs.log(entry)
      },
    },
  }
  const section = sessionProgress(snapshot).sections[0]
  const block = section.blocks[0]
  const completion: BlockCompletionApi = { reportOutcome: vi.fn(), isBlockRecorded: () => false }
  const onFailure = vi.fn()

  const content: ReactNode = options.bare ? (
    <ExerciseSetLogger exercise={block.exercises[0]} {...options.logger} />
  ) : (
    <SectionLabelContext value={section.title}>
      <BlockSlot block={block} />
    </SectionLabelContext>
  )

  render(
    <AppProviders workout={clients}>
      <BlockCompletionContext value={completion}>
        <SetLoggingProvider
          sessionId={FIXTURE_SESSION_ID}
          storage={null}
          exercises={block.exercises}
          weightUnit={options.weightUnit === undefined ? 'kg' : options.weightUnit}
          onFailure={onFailure}
        >
          <RestTimerProvider>
            <SetLoggingSheetHost>
              <main>{content}</main>
              <footer aria-label="Pinned foot">
                <SetLoggingSheetSlot />
              </footer>
            </SetLoggingSheetHost>
          </RestTimerProvider>
        </SetLoggingProvider>
      </BlockCompletionContext>
    </AppProviders>,
  )

  return { attempts, onFailure, base }
}

const main = () => within(screen.getByRole('main'))
const foot = () => within(screen.getByRole('contentinfo', { name: 'Pinned foot' }))

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(main().getByRole('button', { name: 'Log set' }))
  return screen.getByRole('region', { name: /^(Log|Edit) set \d+$/ })
}

function form(setNumber: number, name = 'back squat') {
  return within(screen.getByRole('form', { name: `Log set ${setNumber} of ${name}` }))
}

// ─────────────────────────────────────────────────────────────────────────────
// REQ-008 — the movement card
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-025: the card’s top row', () => {
  it('holds the secondary section label left and the compact structure badge right', () => {
    mount()

    const row = document.querySelector('[data-block-top-row]')
    expect(row).not.toBeNull()
    const [label, badge] = Array.from(row!.children)
    expect(label).toHaveTextContent('Primary lift')
    expect(badge).toHaveTextContent(/standard/i)
    // Compact: the small element frame, in the label face, never a heading.
    expect(badge.querySelector('.clr-chamfer--sm.clr-chamfer--structure')).not.toBeNull()
    expect(badge.closest('h1, h2, h3, h4, h5, h6')).toBeNull()
    expect(within(row as HTMLElement).queryByRole('heading')).toBeNull()
  })

  it('leaves the movement name as the heading, so the badge never competes with it', () => {
    mount()

    const headings = main().getAllByRole('heading')
    expect(headings.map((heading) => heading.textContent)).toEqual(['back squat'])
  })
})

describe('AC-026: heading, counter, prescription and equipment', () => {
  it('puts a subordinate Set X/Y counter beside the heading, then prescription and equipment', () => {
    mount()

    const heading = main().getByRole('heading', { name: 'back squat' })
    const headRow = heading.parentElement!
    expect(within(headRow).getByText('Set 1/3')).not.toHaveRole('heading')

    const order = [
      heading,
      main().getByText('3 × 8 reps'),
      main().getByText('Equipment · barbell'),
    ]
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1].compareDocumentPosition(order[index]))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    }
  })

  it('moves the counter on as sets are logged', async () => {
    const user = userEvent.setup()
    mount()
    await openSheet(user)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    expect(await main().findByText('Set 2/3')).toBeInTheDocument()
  })
})

describe('AC-027: saved rows and Edit precede Log set, then coaching', () => {
  it('orders saved results with their Edit controls, then Log set, then the coaching disclosure', async () => {
    const user = userEvent.setup()
    mount({ bare: true, logger: { onCorrectSet: vi.fn() } })
    await openSheet(user)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    const rows = await main().findByRole('list', { name: 'Logged sets' })
    const edit = within(rows).getByRole('button', { name: 'Edit set 1' })
    const log = main().getByRole('button', { name: 'Log set' })
    const coaching = main().getByRole('button', { name: /coaching/i })

    expect(edit.compareDocumentPosition(log)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(log.compareDocumentPosition(coaching)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-009 — the half-sheet
// ─────────────────────────────────────────────────────────────────────────────

describe('the sheet opens from the card and keeps the main screen free of fields', () => {
  it('draws no entry fields on the card, and opens the sheet in the pinned foot', async () => {
    const user = userEvent.setup()
    mount()

    expect(main().queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('form')).toBeNull()

    const sheet = await openSheet(user)
    expect(foot().getByRole('region', { name: 'Log set 1' })).toBe(sheet)
    expect(main().queryByRole('spinbutton')).toBeNull()
    expect(main().getByRole('button', { name: 'Log set' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('titles the sheet Log set N with the top collapse chevron, then context, fields and one full-width action', async () => {
    const user = userEvent.setup()
    mount()
    const sheet = within(await openSheet(user))

    const title = sheet.getByRole('heading', { name: 'Log set 1' })
    const chevron = sheet.getByRole('button', { name: 'Minimize' })
    const context = sheet.getByText('back squat · 3 × 8 reps · barbell')
    const weight = sheet.getByLabelText('Weight')
    const effort = sheet.getByRole('radiogroup')
    const submit = sheet.getByRole('button', { name: 'Log set 1' })

    for (const [before, after] of [
      [title, chevron], [chevron, context], [context, weight], [weight, effort], [effort, submit],
    ]) {
      expect(before.compareDocumentPosition(after)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    }
    // One action only, and it fills its row.
    expect(sheet.getAllByRole('button').filter((button) => button.getAttribute('type') === 'submit'))
      .toHaveLength(1)
    expect(submit.closest('.clr-action-group')).not.toBeNull()
    expect(sheet.queryByRole('button', { name: /^Minimi[sz]e$/ })).toBe(chevron)
    expect(sheet.queryByRole('button', { name: /Cancel|Save correction/ })).toBeNull()
  })

  it('collapses with the chevron and reopens with the draft as it was typed', async () => {
    const user = userEvent.setup()
    const { attempts } = mount()
    await openSheet(user)
    await user.clear(form(1).getByLabelText('Reps'))
    await user.type(form(1).getByLabelText('Reps'), '6')
    await user.type(form(1).getByLabelText('Weight'), '70')

    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(screen.queryByRole('region', { name: 'Log set 1' })).toBeNull()
    expect(main().getByRole('button', { name: 'Log set' })).toHaveFocus()

    await openSheet(user)
    expect(form(1).getByLabelText('Reps')).toHaveValue(6)
    expect(form(1).getByLabelText('Weight')).toHaveValue(70)
    expect(attempts).toEqual([])
  })

  it('holds one sheet open at a time across movements', async () => {
    const user = userEvent.setup()
    mount({
      exercises: [
        { prescription: { exercise_id: 'back-squat', order_index: 0 } },
        { prescription: { exercise_id: 'romanian-deadlift', order_index: 1 } },
      ],
    })

    const [first, second] = main().getAllByRole('button', { name: 'Log set' })
    await user.click(first)
    expect(screen.getByRole('form', { name: 'Log set 1 of back squat' })).toBeInTheDocument()
    await user.click(second)
    expect(screen.queryByRole('form', { name: 'Log set 1 of back squat' })).toBeNull()
    expect(screen.getByRole('form', { name: 'Log set 1 of romanian deadlift' })).toBeInTheDocument()
  })
})

describe('AC-031: one compact measurement row', () => {
  it('puts Weight, Unit and Reps in that order on one row, labelled Reps', async () => {
    const user = userEvent.setup()
    mount()
    await openSheet(user)

    const weight = form(1).getByLabelText('Weight')
    const unit = form(1).getByRole('combobox', { name: 'Unit' })
    const reps = form(1).getByLabelText('Reps')
    const row = weight.closest('.clr-set-sheet__measures')
    expect(row).not.toBeNull()
    expect(unit.closest('.clr-set-sheet__measures')).toBe(row)
    expect(reps.closest('.clr-set-sheet__measures')).toBe(row)
    expect(weight.compareDocumentPosition(unit)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(unit.compareDocumentPosition(reps)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(screen.queryByText(/Reps performed/i)).toBeNull()
  })

  it('asks for Seconds on a timed prescription', async () => {
    const user = userEvent.setup()
    const { attempts } = mount({
      prescription: { modality: 'time', target_kind: 'fixed', target_value: 30 },
    })
    await openSheet(user)

    expect(form(1).queryByLabelText('Reps')).toBeNull()
    expect(form(1).getByLabelText('Seconds')).toHaveValue(30)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(attempts).toHaveLength(1))
    expect(attempts[0].performed).toEqual({ setNumber: 1, durationSeconds: 30 })
  })

  it('omits the load fields for a bodyweight movement', async () => {
    const user = userEvent.setup()
    const { attempts } = mount({ prescription: { equipment_used: 'bodyweight' } })
    await openSheet(user)

    expect(form(1).queryByLabelText('Weight')).toBeNull()
    expect(form(1).queryByRole('combobox', { name: 'Unit' })).toBeNull()
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(attempts).toHaveLength(1))
    expect(attempts[0].performed).toEqual({ setNumber: 1, reps: 8 })
  })

  it('keeps the entered number and unit, converting nothing', async () => {
    const user = userEvent.setup()
    const { attempts } = mount()
    await openSheet(user)

    await user.type(form(1).getByLabelText('Weight'), '135.5')
    await user.selectOptions(form(1).getByRole('combobox', { name: 'Unit' }), 'lb')
    expect(form(1).getByLabelText('Weight')).toHaveValue(135.5)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    await waitFor(() => expect(attempts).toHaveLength(1))
    expect(attempts[0].weightUnit).toBe('lb')
    expect(attempts[0].performed).toEqual({ setNumber: 1, reps: 8, weight: 135.5 })
  })
})

describe('AC-032: prescribed numbers are suggestions; only Log set records', () => {
  it('prefills the prescribed reps as an editable value and records nothing until Log set', async () => {
    const user = userEvent.setup()
    const { attempts } = mount()
    await openSheet(user)

    const reps = form(1).getByLabelText('Reps')
    expect(reps).toHaveValue(8)
    await user.clear(reps)
    await user.type(reps, '7')
    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    await openSheet(user)
    expect(attempts).toEqual([])

    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(attempts).toHaveLength(1))
    expect(attempts[0].performed).toEqual({ setNumber: 1, reps: 7 })
  })

  it('suggests each ladder rung and the bottom of a range', async () => {
    const user = userEvent.setup()
    mount({ prescription: { target_kind: 'range', target_value: null, target_min: 8, target_max: 10 } })
    await openSheet(user)
    expect(form(1).getByLabelText('Reps')).toHaveValue(8)
  })
})

describe('AC-033: the removed copy, with the structured data kept', () => {
  it('prints no unit helper, no empty-list sentence, no repeated target and no tempo', async () => {
    const user = userEvent.setup()
    mount({ prescription: { tempo: '3-1-1-0' } })
    await openSheet(user)

    expect(screen.queryByText(/Changing units keeps the number/)).toBeNull()
    expect(screen.queryByText(/No sets logged yet/)).toBeNull()
    expect(screen.queryByText(/Target/)).toBeNull()
    expect(screen.queryByText(/Tempo/)).toBeNull()
    expect(screen.queryByText(/3-1-1-0/)).toBeNull()
    // Stated once on the card, and once in the sheet's one-line context.
    expect(main().getAllByText('3 × 8 reps')).toHaveLength(1)
  })
})

describe('AC-034: result formatter, sync feedback, and a saved state only on success', () => {
  it('shows the logged row in the current formatter, and Saved only once the database has it', async () => {
    const user = userEvent.setup()
    mount()
    await openSheet(user)
    await user.type(form(1).getByLabelText('Weight'), '60')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    const rows = await main().findByRole('list', { name: 'Logged sets' })
    const row = within(rows).getByRole('listitem')
    await waitFor(() => expect(within(row).getByText('Saved')).toBeInTheDocument())
    expect(row).toHaveTextContent('Set 1 · 8 reps · 60 kg')
    // The sheet moves on to the next set, carrying the weight forward.
    expect(screen.getByRole('region', { name: 'Log set 2' })).toBeInTheDocument()
    expect(form(2).getByLabelText('Weight')).toHaveValue(60)
  })

  it('never says Saved for a set the database refused', async () => {
    const user = userEvent.setup()
    mount({ refuse: true })
    await openSheet(user)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    const rows = await main().findByRole('list', { name: 'Logged sets' })
    await waitFor(() =>
      expect(within(rows).getByText('On this device only')).toBeInTheDocument(),
    )
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('keeps the entry, recoverable, when the shell refuses the set', async () => {
    const user = userEvent.setup()
    const { attempts, onFailure } = mount({ weightUnit: null })
    await openSheet(user)
    await user.type(form(1).getByLabelText('Weight'), '60')
    await user.selectOptions(form(1).getByRole('combobox', { name: 'Unit' }), 'kg')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    await waitFor(() => expect(onFailure).toHaveBeenCalled())
    expect(attempts).toEqual([])
    expect(screen.queryByText('Saved')).toBeNull()
    expect(form(1).getByLabelText('Weight')).toHaveValue(60)
    expect(form(1).getByLabelText('Reps')).toHaveValue(8)
  })

  it('keeps coaching on demand behind its disclosure', () => {
    mount()
    expect(main().getByRole('button', { name: /coaching/i })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('AC-035: borders and the countdown', () => {
  it('frames the sheet with the structural border and the chevron with the action border', async () => {
    const user = userEvent.setup()
    mount()
    const sheet = await openSheet(user)

    const frame = sheet.querySelector('.clr-set-sheet__frame')
    expect(frame).toHaveClass('clr-chamfer--structure')
    expect((frame!.parentElement as HTMLElement).style.getPropertyValue('--bleed'))
      .toBe('var(--border-frame-structure)')
    const chevron = within(sheet).getByRole('button', { name: 'Minimize' })
    // A secondary button: the normal action-coloured border.
    expect(chevron).not.toHaveClass('clr-btn--quiet')
    expect((chevron.parentElement as HTMLElement).style.getPropertyValue('--bleed'))
      .toBe('var(--border-cta-primary)')
  })

  it('draws a running rest with the timer card inside the sheet, without recolouring it', async () => {
    const user = userEvent.setup()
    mount()
    const sheet = await openSheet(user)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    const rest = await within(sheet).findByRole('region', { name: 'Rest' })
    expect(rest.querySelector('.clr-chamfer--timer, .clr-chamfer--timer-low')).not.toBeNull()
    expect(sheet.querySelector('.clr-set-sheet__frame')).toHaveClass('clr-chamfer--structure')
    expect(sheet.querySelector('.clr-set-sheet__frame')).not.toHaveClass('clr-chamfer--timer')

    // Context, then the countdown, then the entry.
    const context = within(sheet).getByText(/back squat · 3 × 8 reps/)
    expect(context.compareDocumentPosition(rest)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(rest.compareDocumentPosition(form(2).getByLabelText('Reps')))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-028 / AC-029 / AC-030 — the complete effort-enabled sheet (TASK-008)
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-028: existing roles and variants, aligned', () => {
  it('draws effort with the system choice group and Clear with the quiet small button', async () => {
    const user = userEvent.setup()
    mount()
    const sheet = within(await openSheet(user))

    // The legend is ChoiceGroup's own fieldset legend, like any field label.
    const group = sheet.getByRole('group', { name: 'Effort' })
    expect(group.tagName).toBe('FIELDSET')
    expect(group.querySelector('legend')).toHaveTextContent('Effort')
    for (const radio of sheet.getAllByRole('radio')) expect(radio).toHaveClass('clr-chip')

    await user.click(sheet.getByRole('radio', { name: 'About right' }))
    const clear = sheet.getByRole('button', { name: 'Clear effort for set 1' })
    expect(clear).toHaveClass('clr-btn--quiet')
    expect(clear).toHaveClass('clr-chamfer--sm')
    // Choices and Clear share one row; the row adds no frame or type of its own.
    const row = group.closest('.clr-set-effort')
    expect(clear.closest('.clr-set-effort')).toBe(row)
    expect(row).not.toHaveClass('clr-chamfer')
    expect(row?.getAttribute('style')).toBeNull()
  })
})

describe('AC-029 / AC-030: one sheet for new entry and edit, effort in both', () => {
  it('draws no Edit control when no correction can be saved, and still asks effort', async () => {
    const user = userEvent.setup()
    mount({ bare: true })
    await openSheet(user)
    expect(form(1).getAllByRole('radio')).toHaveLength(3)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await main().findByRole('list', { name: 'Logged sets' })

    expect(screen.queryByRole('button', { name: /^Edit set/ })).toBeNull()
  })

  it('places effort between the measurement row and the action, inside the same form', async () => {
    const user = userEvent.setup()
    mount({ bare: true })
    await openSheet(user)

    const effort = form(1).getByRole('radiogroup')
    expect(form(1).getByLabelText('Reps').compareDocumentPosition(effort))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(effort.compareDocumentPosition(form(1).getByRole('button', { name: 'Log set 1' })))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    // The measures and effort are the sheet's only entry; the card has none.
    expect(main().queryByRole('radiogroup')).toBeNull()
  })

  it('records effort only on Log set, and the logged row reads it back', async () => {
    const user = userEvent.setup()
    const { attempts } = mount()
    await openSheet(user)
    await user.click(form(1).getByRole('radio', { name: 'Too hard' }))
    expect(attempts).toEqual([])

    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(attempts).toHaveLength(1))
    expect(attempts[0].performed.effort).toBe('too_hard')

    const row = within(await main().findByRole('list', { name: 'Logged sets' })).getByRole('listitem')
    await waitFor(() => expect(within(row).getByText('Saved')).toBeInTheDocument())
    expect(within(row).getByRole('img', { name: 'Effort: too hard' })).toBeInTheDocument()
    // The next set starts unanswered.
    expect(form(2).getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false'))
      .toBe(true)
  })

  it('keeps a chosen effort through collapse and reopen', async () => {
    const user = userEvent.setup()
    const { attempts } = mount()
    await openSheet(user)
    await user.click(form(1).getByRole('radio', { name: 'Too easy' }))
    await user.click(screen.getByRole('button', { name: 'Minimize' }))
    await openSheet(user)

    expect(form(1).getByRole('radio', { name: 'Too easy' })).toHaveAttribute('aria-checked', 'true')
    expect(attempts).toEqual([])
  })

  it('opens a saved row in the same sheet as Edit set N, ending in Cancel / Save correction', async () => {
    const user = userEvent.setup()
    const onCorrectSet = vi.fn<(exerciseId: string, corrected: PerformedSet) => void>()
    const { attempts } = mount({ bare: true, logger: { onCorrectSet } })
    await openSheet(user)
    await user.type(form(1).getByLabelText('Weight'), '60')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(attempts).toHaveLength(1))

    await user.click(await main().findByRole('button', { name: 'Edit set 1' }))
    const sheet = within(screen.getByRole('region', { name: 'Edit set 1' }))
    const edit = within(screen.getByRole('form', { name: 'Edit set 1 of back squat' }))
    expect(edit.getByLabelText('Weight')).toHaveValue(60)
    expect(edit.getByRole('combobox', { name: 'Unit' })).toHaveValue('kg')
    expect(edit.getByLabelText('Reps')).toHaveValue(8)
    expect(sheet.getByRole('button', { name: 'Minimize' })).toBeInTheDocument()
    // Edit mode asks effort in the same place, after the measures.
    expect(edit.getByLabelText('Reps').compareDocumentPosition(edit.getByRole('radiogroup')))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    const cancel = edit.getByRole('button', { name: 'Cancel' })
    const save = edit.getByRole('button', { name: 'Save correction' })
    expect(cancel.closest('.clr-action-group--paired')).toBe(save.closest('.clr-action-group--paired'))
    expect(edit.queryByRole('button', { name: /^Log set/ })).toBeNull()

    // Cancel hands nothing over and returns to the next new entry.
    await user.click(cancel)
    expect(onCorrectSet).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'Log set 2' })).toBeInTheDocument()

    // Save correction hands the corrected set to whoever inserted the interface.
    await user.click(main().getByRole('button', { name: 'Edit set 1' }))
    const again = within(screen.getByRole('form', { name: 'Edit set 1 of back squat' }))
    await user.clear(again.getByLabelText('Reps'))
    await user.type(again.getByLabelText('Reps'), '7')
    await user.click(again.getByRole('button', { name: 'Save correction' }))
    // An unanswered set's correction states its effort as null, never a guess.
    expect(onCorrectSet).toHaveBeenCalledExactlyOnceWith(expect.any(String), {
      setNumber: 1, reps: 7, weight: 60, weightUnit: 'kg', effort: null,
    })
    // The logging path itself wrote nothing more.
    expect(attempts).toHaveLength(1)
  })
})

describe('the sheet stays usable without the shell’s host', () => {
  it('draws in place when no host is mounted, so a renderer alone still logs', async () => {
    const user = userEvent.setup()
    const snapshot = snapshotFixture({
      sections: [{ sectionType: 'primary_lift', blocks: [{ structureType: 'standard' }] }],
    })
    const double = createWorkoutDouble({ session: snapshot })
    const exercise = sessionProgress(snapshot).sections[0].blocks[0].exercises[0]
    render(
      <AppProviders workout={double.clients}>
        <SetLoggingProvider
          sessionId={FIXTURE_SESSION_ID}
          storage={null}
          exercises={[exercise]}
          weightUnit="kg"
          onFailure={() => {}}
        >
          <ExerciseSetLogger exercise={exercise} />
        </SetLoggingProvider>
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: 'Log set' }))
    await act(async () => {
      await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    })
    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))
  })
})
