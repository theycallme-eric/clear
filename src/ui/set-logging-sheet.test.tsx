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
 *
 * TASK-043 (REQ-019; C45; R82, R100) moves this family's entry — the standard
 * block's anchor/primary and other lifts, timed and distance movements, extra
 * sets and saved-set corrections — from the pinned-foot half-sheet into the
 * shared focused logging dialog (`refinements/logging-overlay.tsx`): a native
 * modal (`showModal`, so the workout behind it is inert), titled with the
 * entry's one title, collapsed by its framed "Close log" X (or Escape) instead
 * of the Minimize chevron. The pinned-foot, chevron and half-sheet frame
 * expectations are replaced here by the dialog's; the draft, correction,
 * one-rest-clock, reopen, save, error and retry coverage is kept as it was. A
 * superset's round (TASK-020's superset case) stays on the half-sheet until
 * TASK-044.
 *
 * A3 TASK-106 (F4; owner decision 1) brings these cases back on Round 7's
 * logging dialog (`src/ui/logging-overlay.tsx`), which the product mounts
 * through its presentation (`PRODUCT_PRESENTATION`, here by `AppProviders`):
 * the same native modal, titled with the entry's one title and closed by its
 * framed "Close log" X or Escape, with Round 7's frame (`.clr-logging-overlay`,
 * its one chamfer, its body) in place of the build's `.clr-accepted-log`
 * markup. Round 7's dialog plays the shared Dialog's exit before it closes,
 * so a step that closes it waits for the close; focus returns once it has.
 * The old build's per-entry `focused` prop is retired: under the dialog
 * every entry is held by it. Every assertion is otherwise the build's.
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
import { VisualEffectsProvider } from '../state/visual-effects'
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
import { SetLoggingSheetHost, SetLoggingSheetOverlay } from './set-logging-sheet'
import { useSetLoggingSheetOpen } from './set-logging-sheet-context'
import { RestTimerBar } from './workout-chrome'

interface MountOptions {
  prescription?: Partial<WorkoutExerciseRow>
  exercises?: ExerciseFixture[]
  weightUnit?: Enums<'weight_unit'> | null
  refuse?: boolean
  logger?: Partial<ExerciseSetLoggerProps>
  /** Draw the logger directly rather than through the dispatched block. */
  bare?: boolean
  /** Mount under the root Visual effects provider, as the app does. */
  effects?: boolean
  /** The block's structure and round rest (TASK-020: a superset's round). */
  block?: { structureType: 'standard' | 'superset'; roundRestSeconds?: number | null }
  /** The wall clock the session's one rest is read against (TASK-020). */
  now?: () => number
  /** A3 TASK-106: the shell offers corrections and clears, as the route does. */
  corrections?: boolean
}

function mount(options: MountOptions = {}) {
  const snapshot = snapshotFixture({
    sections: [
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [
          {
            structureType: options.block?.structureType ?? 'standard',
            roundRestSeconds: options.block?.roundRestSeconds ?? null,
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
      ...base.clients.setLogs,
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
    // TASK-043, A3 TASK-106: drawn the way the standard block draws it, in the
    // logging dialog (every entry is held by it; no per-entry opt-in).
    <ExerciseSetLogger exercise={block.exercises[0]} {...options.logger} />
  ) : (
    <SectionLabelContext value={section.title}>
      <BlockSlot block={block} />
    </SectionLabelContext>
  )

  const tree = (
    <AppProviders workout={clients}>
      <BlockCompletionContext value={completion}>
        <SetLoggingProvider
          sessionId={FIXTURE_SESSION_ID}
          storage={null}
          exercises={block.exercises}
          weightUnit={options.weightUnit === undefined ? 'kg' : options.weightUnit}
          onFailure={onFailure}
          corrections={options.corrections ?? false}
        >
          <RestTimerProvider now={options.now}>
            <SetLoggingSheetHost>
              <main>{content}</main>
              <footer aria-label="Pinned foot">
                <FooterRest />
              </footer>
              {/* A3 TASK-106: where `Workout.tsx` draws it — Round 7's dialog
                  slot, after the screen, outside the pinned foot. */}
              <SetLoggingSheetOverlay />
            </SetLoggingSheetHost>
          </RestTimerProvider>
        </SetLoggingProvider>
      </BlockCompletionContext>
    </AppProviders>
  )
  render(options.effects ? <VisualEffectsProvider>{tree}</VisualEffectsProvider> : tree)

  return { attempts, onFailure, base }
}

/** The workout footer's rest, unless the open sheet draws it (as `Workout.tsx` does). */
function FooterRest() {
  return useSetLoggingSheetOpen() ? null : <RestTimerBar />
}

const main = () => within(screen.getByRole('main'))
const foot = () => within(screen.getByRole('contentinfo', { name: 'Pinned foot' }))

/** TASK-043: the entry opens in the focused logging dialog, named by its title. */
async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(main().getByRole('button', { name: 'Rest' }))
  return screen.getByRole('dialog', { name: /^(Log|Edit) set \d+$/ })
}

/** The dialog's framed X: the entry's one collapse (TASK-043, was Minimize). */
const CLOSE_LOG = { name: 'Close log' } as const

/**
 * A3 TASK-106: Round 7's dialog, its one frame (the shared Dialog's chamfer)
 * and the body under its header, where the entry is drawn.
 */
function frameOf(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(':scope > .clr-bleed > .clr-chamfer'))
}
function bodyOf(dialog: HTMLElement): HTMLElement {
  return dialog.querySelector<HTMLElement>('.clr-logging-overlay__body')!
}

/**
 * Round 7's dialog plays the shared Dialog's exit before it closes: wait for
 * the named dialog to be gone, then for focus to have come back.
 */
async function closed(name: string | RegExp) {
  await waitFor(() => expect(screen.queryByRole('dialog', { name })).toBeNull())
}

/**
 * Close log, then Round 7's exit: when this returns the dialog has closed
 * and the workout behind it is no longer inert (A3 TASK-106).
 */
async function closeLog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', CLOSE_LOG))
  await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0))
}

function form(setNumber: number, name = 'back squat') {
  return within(screen.getByRole('form', { name: `Log set ${setNumber} of ${name}` }))
}

// ─────────────────────────────────────────────────────────────────────────────
// REQ-008 — the movement card
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-025: the card’s top row', () => {
  // A3 TASK-106: kept as A3 task 1 rewrote them for Round 7 (owner decision
  // 2, the compact section header); the build's bodies read its own block top
  // row ([data-block-top-row]), which Round 7 replaced.
  it('holds the secondary section label left and the compact structure badge right', () => {
    mount()

    // Round 7: the top row is the shared movement-group header.
    const row = document.querySelector('[data-movement-group-header]')
    expect(row).not.toBeNull()
    const [label, badge] = Array.from(row!.children)
    expect(label).toHaveTextContent('Primary lift')
    expect(badge).toHaveTextContent(/standard/i)
    // Compact: the small element frame, in the label face, never a heading.
    expect(badge.querySelector('.clr-chamfer--sm.clr-chamfer--structure')).not.toBeNull()
    expect(badge.closest('h1, h2, h3, h4, h5, h6')).toBeNull()
    // Round 7 (decision 2): the section label is the row's one heading; the badge never is.
    expect(within(row as HTMLElement).getAllByRole('heading')).toEqual([label])
  })

  it('leaves the movement name as the heading, so the badge never competes with it', () => {
    mount()

    // Round 7 (decision 2): the section name heads the block, then the movement
    // is its own heading, named by the movement alone. The badge is neither.
    expect(main().getAllByRole('heading')).toEqual([
      main().getByRole('heading', { name: 'Primary lift' }),
      main().getByRole('heading', { name: 'back squat' }),
    ])
    expect(main().queryByRole('heading', { name: /standard/i })).toBeNull()
  })
})

describe('AC-026: heading, counter, prescription and equipment', () => {
  // TASK-001 (R132, C01): the shared MovementIdentity sets the compact
  // equipment beside the name and the counter in its own slot of the name row.
  // A3 TASK-106, Round 7 look: the name row is Round 7's MovementIdentity head
  // (the heading's own row), and the compact equipment is drawn inline after
  // the name inside it. Same order: the name, the equipment, the prescription.
  it('puts a subordinate Set X/Y counter in the name row beside the heading and equipment, then prescription', () => {
    mount()

    const heading = main().getByRole('heading', { name: 'back squat' })
    const headRow = heading.parentElement as HTMLElement
    expect(within(headRow).getByText('Set 1/3')).not.toHaveRole('heading')
    const equipment = within(headRow).getByText('barbell')

    const order = [within(heading).getByText('back squat'), equipment, main().getByText('3 × 8 reps')]
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1].compareDocumentPosition(order[index]))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    }
  })

  // The integration branch's own Round 7 case (A3 task 1), kept beside it.
  it('puts a subordinate Set X/Y counter beside the heading, then prescription and equipment', () => {
    mount()

    const heading = main().getByRole('heading', { name: 'back squat' })
    const headRow = heading.parentElement!
    expect(within(headRow).getByText('Set 1/3')).not.toHaveRole('heading')

    // Round 7 look: equipment is the bare name, drawn inline after the movement
    // name as the heading's description — never part of its name — and the
    // prescription follows the heading.
    const equipment = main().getByText('barbell', { selector: '[data-movement-context]' })
    expect(heading).toContainElement(equipment)
    expect(heading).toHaveAccessibleDescription('barbell')
    expect(within(heading).getByText('back squat').compareDocumentPosition(equipment))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(heading.compareDocumentPosition(main().getByText('3 × 8 reps')))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(main().queryByText(/Equipment ·/)).toBeNull()
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
    const log = main().getByRole('button', { name: 'Rest' })
    const coaching = main().getByRole('button', { name: /coaching/i })

    expect(edit.compareDocumentPosition(log)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(log.compareDocumentPosition(coaching)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REQ-009 — the half-sheet
// ─────────────────────────────────────────────────────────────────────────────

describe('the sheet opens from the card and keeps the main screen free of fields', () => {
  it('draws no entry fields on the card, and opens the entry in the modal focused logging dialog, not the pinned foot (TASK-043)', async () => {
    const user = userEvent.setup()
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    mount()

    expect(main().queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()

    const sheet = await openSheet(user)
    // A native modal: `showModal()` (never `show()`) makes the workout behind
    // it inert while the entry is open.
    expect(sheet).toBeInstanceOf(HTMLDialogElement)
    expect((sheet as HTMLDialogElement).open).toBe(true)
    expect(showModal).toHaveBeenCalledTimes(1)
    expect(showModal.mock.contexts[0]).toBe(sheet)
    expect(sheet).toHaveClass('clr-logging-overlay')
    // Not the half-sheet: nothing is drawn in the pinned foot or on the card.
    expect(foot().queryByRole('form')).toBeNull()
    expect(document.querySelector('section.clr-set-sheet')).toBeNull()
    expect(main().queryByRole('spinbutton')).toBeNull()
    expect(within(sheet).getByRole('form', { name: 'Log set 1 of back squat' })).toBeInTheDocument()
    expect(main().getByRole('button', { name: 'Rest' })).toHaveAttribute('aria-expanded', 'true')
    showModal.mockRestore()
  })

  it('titles the dialog Log set N with its framed Close log X as the top collapse control, then context, fields and one full-width action', async () => {
    const user = userEvent.setup()
    mount()
    const sheet = within(await openSheet(user))

    const title = sheet.getByRole('heading', { name: 'Log set 1' })
    // The dialog opens on its X (TASK-016/018), never on the frame.
    const chevron = sheet.getByRole('button', CLOSE_LOG)
    expect(chevron).toHaveFocus()
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
    expect(sheet.queryByRole('button', { name: /^Minimi[sz]e$/ })).toBeNull()
    expect(sheet.getAllByRole('button', CLOSE_LOG)).toEqual([chevron])
    expect(sheet.getAllByRole('heading')).toEqual([title])
    expect(sheet.queryByRole('button', { name: /Cancel|Save correction/ })).toBeNull()
  })

  it('collapses with the X (or Escape) and reopens with the draft as it was typed', async () => {
    const user = userEvent.setup()
    const { attempts } = mount()
    await openSheet(user)
    await user.clear(form(1).getByLabelText('Reps'))
    await user.type(form(1).getByLabelText('Reps'), '6')
    await user.type(form(1).getByLabelText('Weight'), '70')

    await closeLog(user)
    await closed('Log set 1')
    expect(main().getByRole('button', { name: 'Rest' })).toHaveFocus()

    const sheet = await openSheet(user)
    expect(form(1).getByLabelText('Reps')).toHaveValue(6)
    expect(form(1).getByLabelText('Weight')).toHaveValue(70)
    expect(attempts).toEqual([])

    // Escape is the native dialog's cancel: the same collapse, the draft kept.
    act(() => {
      sheet.dispatchEvent(new Event('cancel', { cancelable: true }))
    })
    await closed('Log set 1')
    expect(main().getByRole('button', { name: 'Rest' })).toHaveFocus()
    await openSheet(user)
    expect(form(1).getByLabelText('Reps')).toHaveValue(6)
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

    const [first, second] = main().getAllByRole('button', { name: 'Rest' })
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
    await closeLog(user)
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
    // TASK-020 (C46, R07) supersedes the move straight to the next set: the
    // sheet confirms set 1, and the next deliberate Rest opens set 2, still
    // carrying the weight forward.
    expect(screen.getByRole('dialog', { name: 'Set 1 logged' })).toBeInTheDocument()
    expect(screen.queryByRole('form')).toBeNull()
    // TASK-043: the workout behind the modal is inert; the log is closed first.
    await closeLog(user)
    await user.click(main().getByRole('button', { name: 'Rest' }))
    expect(screen.getByRole('dialog', { name: 'Log set 2' })).toBeInTheDocument()
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
  it('frames the entry with the dialog’s one frame and the X with the action border (TASK-043)', async () => {
    const user = userEvent.setup()
    mount()
    const sheet = await openSheet(user)

    // The logging dialog's one stationary frame (Round 7: the shared Dialog's
    // chamfer), not the half-sheet's.
    const frames = frameOf(sheet)
    expect(frames).toHaveLength(1)
    expect(frames[0]).toHaveClass('clr-chamfer', 'clr-chamfer--lg')
    expect(sheet.querySelector('.clr-set-sheet__frame')).toBeNull()
    expect(frames[0]!.contains(bodyOf(sheet))).toBe(true)
    const chevron = within(sheet).getByRole('button', CLOSE_LOG)
    // A secondary button: the normal action-coloured border.
    expect(chevron).not.toHaveClass('clr-btn--quiet')
    expect((chevron.parentElement as HTMLElement).style.getPropertyValue('--bleed'))
      .toBe('var(--border-cta-primary)')
  })

  it('draws the half-sheet’s scoped accent bar (EXC-06) nowhere in the dialog, without making the entry a card (TASK-043)', async () => {
    const user = userEvent.setup()
    mount()
    const sheet = await openSheet(user)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await within(sheet).findByRole('region', { name: 'Rest' })

    // The accent bar was the half-sheet's owner exception; the focused dialog
    // carries the selected frame alone.
    const frame = frameOf(sheet)[0]!
    expect(sheet.querySelector('.clr-set-sheet__bar')).toBeNull()
    expect(Array.from(frame.parentElement!.children).filter((child) =>
      child.classList.contains('clr-card__bar'))).toEqual([])
    // The dialog is an overlay, not a card: the rest's timer card inside it is not nested.
    expect(sheet.closest('.clr-card')).toBeNull()
    expect(frame).not.toHaveClass('clr-card__body')
  })

  it('gives the rest timer card inside the sheet no Phosphor Echo: the sheet is not the background', async () => {
    const user = userEvent.setup()
    mount({ effects: true })
    const sheet = await openSheet(user)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    const rest = await within(sheet).findByRole('region', { name: 'Rest' })
    expect(rest.querySelector('.clr-card')).not.toBeNull()
    // The dialog's frame keeps its own emission; nothing in the entry echoes.
    const body = bodyOf(sheet)
    expect(body.contains(rest)).toBe(true)
    expect(body.querySelector('[data-echo], .clr-echo__source')).toBeNull()
  })

  it('draws a running rest with the timer card inside the sheet, without recolouring it', async () => {
    const user = userEvent.setup()
    mount()
    const sheet = await openSheet(user)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))

    const rest = await within(sheet).findByRole('region', { name: 'Rest' })
    expect(rest.querySelector('.clr-chamfer--timer, .clr-chamfer--timer-low')).not.toBeNull()
    expect(frameOf(sheet)[0]).not.toHaveClass('clr-chamfer--timer')
    expect(frameOf(sheet)[0]).not.toHaveClass('clr-chamfer--timer-low')

    // Context, then the countdown, then what follows it: since TASK-020
    // (C46) the saved set's confirmation, and after a deliberate Rest the
    // next entry, in the same place.
    const context = within(sheet).getByText(/back squat · 3 × 8 reps/)
    expect(context.compareDocumentPosition(rest)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(rest.compareDocumentPosition(within(sheet).getByRole('status')))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    // TASK-043: the log is closed (the workout behind it is inert), then Rest.
    // Round 7 removes a closed dialog once its exit has played, and draws the
    // next entry's in the same place: the shell's one dialog slot.
    const slot = sheet.closest('[data-set-sheet-slot]')
    expect(slot).not.toBeNull()
    await closeLog(user)
    await user.click(main().getByRole('button', { name: 'Rest' }))
    const reopened = screen.getByRole('dialog', { name: 'Log set 2' })
    expect(reopened.closest('[data-set-sheet-slot]')).toBe(slot)
    const next = within(reopened).getByRole('region', { name: 'Rest' })
    expect(screen.getAllByRole('region', { name: 'Rest' })).toEqual([next])
    expect(next.compareDocumentPosition(form(2).getByLabelText('Reps')))
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
    // The next set, opened deliberately (TASK-020: C46), starts unanswered.
    await closeLog(user)
    await user.click(main().getByRole('button', { name: 'Rest' }))
    expect(form(2).getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false'))
      .toBe(true)
  })

  it('keeps a chosen effort through collapse and reopen', async () => {
    const user = userEvent.setup()
    const { attempts } = mount()
    await openSheet(user)
    await user.click(form(1).getByRole('radio', { name: 'Too easy' }))
    await closeLog(user)
    await openSheet(user)

    expect(form(1).getByRole('radio', { name: 'Too easy' })).toHaveAttribute('aria-checked', 'true')
    expect(attempts).toEqual([])
  })

  it('opens a saved row in the same dialog as Edit set N, ending in Cancel / Save correction', async () => {
    const user = userEvent.setup()
    const onCorrectSet = vi.fn<(exerciseId: string, corrected: PerformedSet) => void>()
    const { attempts } = mount({ bare: true, logger: { onCorrectSet } })
    await openSheet(user)
    await user.type(form(1).getByLabelText('Weight'), '60')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(attempts).toHaveLength(1))

    // TASK-043: the saved row's Edit is on the card, behind the modal log.
    await closeLog(user)
    await user.click(await main().findByRole('button', { name: 'Edit set 1' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Edit set 1' }))
    const edit = within(screen.getByRole('form', { name: 'Edit set 1 of back squat' }))
    expect(edit.getByLabelText('Weight')).toHaveValue(60)
    expect(edit.getByRole('combobox', { name: 'Unit' })).toHaveValue('kg')
    expect(edit.getByLabelText('Reps')).toHaveValue(8)
    expect(sheet.getByRole('button', CLOSE_LOG)).toBeInTheDocument()
    // Edit mode asks effort in the same place, after the measures.
    expect(edit.getByLabelText('Reps').compareDocumentPosition(edit.getByRole('radiogroup')))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    const cancel = edit.getByRole('button', { name: 'Cancel' })
    const save = edit.getByRole('button', { name: 'Save correction' })
    expect(cancel.closest('.clr-action-group--paired')).toBe(save.closest('.clr-action-group--paired'))
    expect(edit.queryByRole('button', { name: /^Log set/ })).toBeNull()

    // Cancel hands nothing over and returns to where the sheet was: the new
    // entry, set 2 — TASK-043's Close log above ended set 1's confirmation
    // (TASK-020, C46), and nothing else is opened.
    await user.click(cancel)
    expect(onCorrectSet).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Log set 2' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Set 1 logged' })).toBeNull()

    // Save correction hands the corrected set to whoever inserted the interface.
    await closeLog(user)
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

    await user.click(screen.getByRole('button', { name: 'Rest' }))
    await act(async () => {
      await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    })
    await waitFor(() => expect(double.loggedSets()).toHaveLength(1))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK-020 (REQ-020; C46, G12; R07, R17) — deliberate Save and the existing rest
// ─────────────────────────────────────────────────────────────────────────────

/** An injected wall clock for the session's one rest, moved by the test. */
function wallClock(start = 1_700_000_000_000) {
  let at = start
  return {
    now: () => at,
    /** Moves the clock and lets the rest read it, as a phone waking does. */
    advance(seconds: number) {
      act(() => {
        at += seconds * 1000
        window.dispatchEvent(new Event('focus'))
      })
    },
  }
}

/** The one rest's reading, in seconds, wherever it is drawn. */
function restSeconds(): number {
  const rests = screen.getAllByRole('region', { name: 'Rest' })
  expect(rests).toHaveLength(1)
  const text = within(rests[0]).getByRole('timer').textContent ?? ''
  const digits = /(\d\d):(\d\d)/.exec(text)
  if (digits === null) throw new Error(`no rest digits in ${text}`)
  return Number(digits[1]) * 60 + Number(digits[2])
}

const SHEET_TITLE = /^(Log|Edit) (set|round) \d+$|^(Set|Round) \d+ logged$/

/**
 * Every open entry: a superset round's half-sheet (a region) or, since
 * TASK-043, a set's focused logging dialog.
 */
function openSheets() {
  return [
    ...screen.queryAllByRole('region', { name: SHEET_TITLE }),
    ...screen.queryAllByRole('dialog', { name: SHEET_TITLE }),
  ]
}

describe('TASK-020 deliberate Save confirmation and existing rest lifecycle', () => {
  it('AC-C46-01 Log set N shows its saved confirmation beside the same running rest and no next-set form; at rest end the sheet collapses and resets, and only a deliberate Rest opens set N + 1', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const clock = wallClock()
    const { attempts } = mount({ now: clock.now, prescription: { rest_seconds: 60 } })

    await openSheet(user)
    expect(restSeconds()).toBe(60)
    clock.advance(10)
    await user.type(form(1).getByLabelText('Weight'), '60')
    await user.click(form(1).getByRole('radio', { name: 'Too easy' }))
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(attempts).toHaveLength(1))

    // The confirmation, in the sheet that stayed open: its title, the saved
    // result read back from the shell's list, and no form for set 2.
    const sheet = screen.getByRole('dialog', { name: 'Set 1 logged' })
    expect(within(sheet).getByRole('heading', { name: 'Set 1 logged' })).toHaveFocus()
    const status = within(sheet).getByRole('status')
    expect(status).toHaveTextContent('Set 1 · 8 reps · 60 kg')
    expect(within(status).getByRole('img', { name: 'Effort: too easy' })).toBeInTheDocument()
    await waitFor(() => expect(within(status).getByText('Saved')).toBeInTheDocument())
    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Log set 2' })).toBeNull()
    expect(within(sheet).getByRole('button', CLOSE_LOG)).toBeInTheDocument()

    // The same rest, in the same place, neither restarted nor replaced (R17:
    // the shared timer card, with its own Add 30s and Skip rest).
    const rest = within(sheet).getByRole('region', { name: 'Rest' })
    expect(rest.compareDocumentPosition(status)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(restSeconds()).toBe(50)
    expect(within(rest).getByRole('button', { name: 'Add 30s' })).toBeInTheDocument()
    expect(within(rest).getByRole('button', { name: 'Skip rest' })).toBeInTheDocument()
    clock.advance(20)
    expect(screen.getByRole('dialog', { name: 'Set 1 logged' })).toBe(sheet)
    expect(restSeconds()).toBe(30)

    // Rest end: the sheet collapses, focus returns to the entry action, and
    // nothing is opened or recorded.
    clock.advance(31)
    await waitFor(() => expect(openSheets()).toEqual([]))
    expect(main().getByRole('button', { name: 'Rest' })).toHaveFocus()
    expect(main().getByRole('button', { name: 'Rest' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'Rest' })).toBeNull()
    clock.advance(120)
    expect(openSheets()).toEqual([])
    expect(attempts).toHaveLength(1)

    // Reset: the next deliberate Rest opens set 2, weight carried forward and
    // effort unanswered, with its own prescribed rest.
    await user.click(main().getByRole('button', { name: 'Rest' }))
    expect(screen.getByRole('dialog', { name: 'Log set 2' })).toBeInTheDocument()
    expect(form(2).getByLabelText('Weight')).toHaveValue(60)
    expect(form(2).getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false'))
      .toBe(true)
    expect(restSeconds()).toBe(60)
    expect(attempts).toHaveLength(1)
  })

  it('AC-R020-01 Save never replaces the entry with another form; an early collapse is kept: the rest ending never reopens the sheet, and Rest opens the next entry on the same rest', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const clock = wallClock()
    const { attempts } = mount({ now: clock.now, prescription: { rest_seconds: 60 } })

    await openSheet(user)
    clock.advance(5)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(attempts).toHaveLength(1))
    expect(screen.getByRole('dialog', { name: 'Set 1 logged' })).toBeInTheDocument()

    // Close log (Minimize before TASK-043) before the rest ends: the sheet closes, the same rest runs on
    // in the footer, and focus returns to Rest.
    await closeLog(user)
    expect(openSheets()).toEqual([])
    expect(main().getByRole('button', { name: 'Rest' })).toHaveFocus()
    expect(foot().queryByRole('region', { name: 'Rest' })).not.toBeNull()
    expect(restSeconds()).toBe(55)

    // The rest ending finds nothing open and reopens nothing.
    clock.advance(70)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Rest' })).toBeNull())
    expect(openSheets()).toEqual([])
    clock.advance(60)
    expect(openSheets()).toEqual([])
    expect(attempts).toHaveLength(1)

    // A second set, collapsed early and reopened deliberately during its rest:
    // the next entry, on the rest already running, never the old confirmation.
    await user.click(main().getByRole('button', { name: 'Rest' }))
    clock.advance(4)
    await user.click(form(2).getByRole('button', { name: 'Log set 2' }))
    await waitFor(() => expect(attempts).toHaveLength(2))
    expect(screen.getByRole('dialog', { name: 'Set 2 logged' })).toBeInTheDocument()
    await closeLog(user)
    clock.advance(6)
    await user.click(main().getByRole('button', { name: 'Rest' }))
    expect(screen.getByRole('dialog', { name: 'Log set 3' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Set 2 logged' })).toBeNull()
    expect(restSeconds()).toBe(50)
    expect(attempts).toHaveLength(2)
  })

  it('AC-R020-02 Add 30s and Skip rest stay the existing rest’s: the extension keeps the confirmation and Skip rest ends it; rest expiry or its final-seconds warning never records another set or closes a draft', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const clock = wallClock()
    const { attempts } = mount({ now: clock.now, prescription: { rest_seconds: 30 } })

    await openSheet(user)
    clock.advance(10)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(attempts).toHaveLength(1))
    const sheet = screen.getByRole('dialog', { name: 'Set 1 logged' })

    // Add 30s extends the same rest: 20 s left becomes 50, the confirmation stays.
    await user.click(within(sheet).getByRole('button', { name: 'Add 30s' }))
    expect(restSeconds()).toBe(50)
    clock.advance(25)
    expect(screen.getByRole('dialog', { name: 'Set 1 logged' })).toBe(sheet)
    expect(restSeconds()).toBe(25)

    // The warning in its final seconds is the rest's; it records nothing.
    clock.advance(17)
    expect(within(sheet).getByText('Final 10 seconds')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Set 1 logged' })).toBe(sheet)
    expect(attempts).toHaveLength(1)

    // Skip rest ends the rest, and with it the confirmation.
    await user.click(within(sheet).getByRole('button', { name: 'Skip rest' }))
    await waitFor(() => expect(openSheets()).toEqual([]))
    expect(main().getByRole('button', { name: 'Rest' })).toHaveFocus()
    expect(attempts).toHaveLength(1)

    // A deliberately opened draft is not collapsed or saved by its rest ending.
    await user.click(main().getByRole('button', { name: 'Rest' }))
    await user.clear(form(2).getByLabelText('Reps'))
    await user.type(form(2).getByLabelText('Reps'), '6')
    clock.advance(45)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Rest' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Log set 2' })).toBeInTheDocument()
    expect(form(2).getByLabelText('Reps')).toHaveValue(6)
    expect(attempts).toHaveLength(1)

    // Its own Save, with no rest running, is confirmed until the athlete collapses it.
    await user.click(form(2).getByRole('button', { name: 'Log set 2' }))
    await waitFor(() => expect(attempts).toHaveLength(2))
    expect(attempts[1].performed).toMatchObject({ setNumber: 2, reps: 6 })
    expect(screen.getByRole('dialog', { name: 'Set 2 logged' })).toBeInTheDocument()
    clock.advance(300)
    expect(screen.getByRole('dialog', { name: 'Set 2 logged' })).toBeInTheDocument()
    await closeLog(user)
    expect(openSheets()).toEqual([])
    expect(attempts).toHaveLength(2)
  })

  it('AC-R020-02 a superset’s Log round N confirms each logged movement’s own actuals and effort beside the round’s one rest; the rest ending collapses without opening round N + 1', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const clock = wallClock()
    const { attempts } = mount({
      now: clock.now,
      block: { structureType: 'superset', roundRestSeconds: 60 },
      exercises: [
        { prescription: { exercise_id: 'bench-press', order_index: 0, target_value: 8, sets: 3 } },
        { prescription: { exercise_id: 'plank', order_index: 1, equipment_used: 'bodyweight', load_type: 'bodyweight',
          load_value: null, modality: 'time', target_value: 30, sets: 3 } },
      ],
    })

    await user.click(main().getByRole('button', { name: 'Rest' }))
    const round = within(screen.getByRole('form', { name: 'Log round 1 of bench press and plank' }))
    expect(restSeconds()).toBe(60)
    const bench = within(round.getByRole('group', { name: 'A1 bench press, set 1' }))
    const plank = within(round.getByRole('group', { name: 'A2 plank, set 1' }))
    await user.type(bench.getByLabelText('Weight'), '135')
    await user.selectOptions(bench.getByRole('combobox', { name: 'Unit' }), 'lb')
    await user.clear(bench.getByLabelText('Reps'))
    await user.type(bench.getByLabelText('Reps'), '7')
    await user.click(bench.getByRole('radio', { name: 'Too easy' }))
    await user.clear(plank.getByLabelText('Seconds'))
    await user.type(plank.getByLabelText('Seconds'), '28')
    clock.advance(10)
    await user.click(round.getByRole('button', { name: 'Log round 1' }))
    await waitFor(() => expect(attempts).toHaveLength(2))
    // Each movement its own observation, under the round's number.
    expect(attempts[0].exerciseId).not.toBe(attempts[1].exerciseId)
    expect(attempts[0].weightUnit).toBe('lb')
    expect(attempts[0].performed).toMatchObject({ setNumber: 1, reps: 7, weight: 135, effort: 'too_easy' })
    expect(attempts[1].performed).toMatchObject({ setNumber: 1, durationSeconds: 28 })
    expect(attempts[1].performed.weight ?? null).toBeNull()

    const sheet = screen.getByRole('dialog', { name: 'Round 1 logged' })
    const status = within(sheet).getByRole('status')
    expect(status).toHaveTextContent('A1 bench press · Set 1 · 7 reps · 135 lb')
    expect(status).toHaveTextContent('A2 plank · Set 1 · 28 sec')
    expect(within(status).getByRole('img', { name: 'Effort: too easy' })).toBeInTheDocument()
    expect(screen.queryByRole('form')).toBeNull()
    expect(within(sheet).getByRole('region', { name: 'Rest' })).toHaveTextContent('Rest after round 1')
    expect(restSeconds()).toBe(50)

    clock.advance(51)
    await waitFor(() => expect(openSheets()).toEqual([]))
    expect(main().getByRole('button', { name: 'Rest' })).toHaveFocus()
    clock.advance(60)
    expect(openSheets()).toEqual([])
    expect(attempts).toHaveLength(2)

    // Round 2, deliberately: only the movement the athlete identifies is
    // logged, and only it is confirmed.
    await user.click(main().getByRole('button', { name: 'Rest' }))
    const round2 = within(screen.getByRole('form', { name: 'Log round 2 of bench press and plank' }))
    await user.click(within(round2.getByRole('group', { name: 'A1 bench press, set 2' })).getByRole('checkbox', { name: 'Performed' }))
    await user.click(round2.getByRole('button', { name: 'Log round 2' }))
    await waitFor(() => expect(attempts).toHaveLength(3))
    const status2 = within(screen.getByRole('dialog', { name: 'Round 2 logged' })).getByRole('status')
    expect(status2).toHaveTextContent('A1 bench press · Set 2')
    expect(status2).not.toHaveTextContent('plank')
  })

  it('AC-R020-02 a Save the shell refuses claims no confirmation: the entry stays on its form, and the rest ending neither collapses nor records it', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const clock = wallClock()
    const { attempts, onFailure } = mount({ now: clock.now, weightUnit: null, prescription: { rest_seconds: 30 } })

    await openSheet(user)
    await user.type(form(1).getByLabelText('Weight'), '60')
    await user.selectOptions(form(1).getByRole('combobox', { name: 'Unit' }), 'kg')
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(onFailure).toHaveBeenCalled())
    expect(screen.queryByRole('dialog', { name: 'Set 1 logged' })).toBeNull()
    expect(form(1).getByLabelText('Weight')).toHaveValue(60)

    clock.advance(31)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Rest' })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Log set 1' })).toBeInTheDocument()
    expect(form(1).getByLabelText('Weight')).toHaveValue(60)
    expect(attempts).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A3 TASK-106 (F4) — set logging in Round 7's dialog: focus and self-closing
// ─────────────────────────────────────────────────────────────────────────────

describe('A3 TASK-106 set logging in the Round 7 dialog: focus return and the dialog closing itself', () => {
  it('TASK-AC-C53DC0A896ED no rest prescribed: Log set N is confirmed, then the dialog closes itself once the shell holds the set, and focus returns to the card’s Rest, never the page body', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const { attempts } = mount({ prescription: { rest_seconds: null } })
    const rest = main().getByRole('button', { name: 'Rest' })

    await openSheet(user)
    expect(screen.queryByRole('region', { name: 'Rest' })).toBeNull()
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await waitFor(() => expect(attempts).toHaveLength(1))

    // Nothing to wait for: the dialog leaves through its exit and closes.
    await waitFor(() => expect(openSheets()).toHaveLength(0))
    expect(rest).toHaveFocus()
    expect(document.activeElement).not.toBe(document.body)
    expect(rest).toHaveAttribute('aria-expanded', 'false')
    // The card's saved row reads it back; nothing more was written or opened.
    expect(within(main().getByRole('list', { name: 'Logged sets' })).getByRole('listitem')).toHaveTextContent('Set 1 · 8 reps')
    expect(attempts).toHaveLength(1)

    // The next entry is opened deliberately, as ever.
    await user.click(rest)
    expect(screen.getByRole('dialog', { name: 'Log set 2' })).toBeInTheDocument()
  })

  it('TASK-AC-C53DC0A896ED a superset with no round rest: Log round N closes itself once the shell holds the round, and focus returns to the block’s Rest', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const { attempts } = mount({
      block: { structureType: 'superset', roundRestSeconds: null },
      exercises: [
        { prescription: { exercise_id: 'bench-press', order_index: 0 } },
        { prescription: { exercise_id: 'barbell-row', order_index: 1 } },
      ],
    })
    const rest = main().getByRole('button', { name: 'Rest' })

    await user.click(rest)
    const round = within(screen.getByRole('form', { name: 'Log round 1 of bench press and barbell row' }))
    await user.click(within(round.getByRole('group', { name: 'A1 bench press, set 1' })).getByRole('checkbox', { name: 'Performed' }))
    await user.click(round.getByRole('button', { name: 'Log round 1' }))
    await waitFor(() => expect(attempts).toHaveLength(1))

    await waitFor(() => expect(openSheets()).toHaveLength(0))
    expect(rest).toHaveFocus()
    expect(attempts).toHaveLength(1)
  })

  it('TASK-AC-A7CEAC5DC9DB a correction closed with its X or Escape returns focus to its Edit control once the dialog has closed', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    mount({ corrections: true })
    await openSheet(user)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await screen.findByRole('dialog', { name: 'Set 1 logged' })
    await closeLog(user)
    const edit = await main().findByRole('button', { name: 'Edit set 1' })

    // The X.
    await user.click(edit)
    expect(screen.getByRole('dialog', { name: 'Edit set 1' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', CLOSE_LOG))
    await waitFor(() => expect(openSheets()).toHaveLength(0))
    expect(edit).toHaveFocus()

    // Escape, the native cancel: the same return.
    await user.click(edit)
    const dialog = screen.getByRole('dialog', { name: 'Edit set 1' })
    act(() => {
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    })
    await waitFor(() => expect(openSheets()).toHaveLength(0))
    expect(edit).toHaveFocus()
  })

  it('TASK-AC-A7CEAC5DC9DB the Clear-set confirmation is drawn inside the logging dialog, and focus returns to Rest once both have closed', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const { base } = mount({ corrections: true })
    await openSheet(user)
    await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
    await screen.findByRole('dialog', { name: 'Set 1 logged' })
    await waitFor(() => expect(base.loggedSets()).toHaveLength(1))
    await closeLog(user)

    await user.click(await main().findByRole('button', { name: 'Edit set 1' }))
    const log = screen.getByRole('dialog', { name: 'Edit set 1' })
    await user.click(within(log).getByRole('button', { name: 'Clear set 1' }))
    const confirmation = await screen.findByRole('dialog', { name: 'Clear set 1 of back squat?' })
    // Inside the log: over it in the top layer and in document order alike.
    expect(log).toContainElement(confirmation)
    expect(within(confirmation).getAllByRole('button').map((button) => button.textContent)).toEqual(['Keep set', 'Clear set'])

    await user.click(within(confirmation).getByRole('button', { name: 'Clear set' }))
    await waitFor(() => expect(base.clearedSets()).toHaveLength(1))
    await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0))
    expect(main().getByRole('button', { name: 'Rest' })).toHaveFocus()
    expect(main().queryByRole('list', { name: 'Logged sets' })).toBeNull()
  })

  it('TASK-AC-A7CEAC5DC9DB a long entry opened by keyboard takes its opening focus on the X, never on the dialog’s scrolling region', { timeout: 20_000 }, async () => {
    // Chromium's dialog focusing steps count a scrolling region as a focusable
    // area ahead of the X in tree order: a long correction opened by keyboard
    // on a 320 px phone had its opening focus on the scroller (task-019,
    // JOURNEY-019 by keyboard). The browser's choice is reproduced here.
    const showModal = HTMLDialogElement.prototype.showModal
    const spy = vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
      showModal.call(this)
      const scroller = this.querySelector<HTMLElement>('.clr-logging-overlay__scroll')
      if (scroller === null) return
      scroller.tabIndex = -1
      scroller.focus()
    })
    try {
      const user = userEvent.setup()
      mount({ corrections: true })
      await openSheet(user)
      const opened = screen.getByRole('dialog', { name: 'Log set 1' })
      expect(within(opened).getByRole('button', CLOSE_LOG)).toHaveFocus()
      await user.click(form(1).getByRole('button', { name: 'Log set 1' }))
      await screen.findByRole('dialog', { name: 'Set 1 logged' })
      await closeLog(user)

      const edit = await main().findByRole('button', { name: 'Edit set 1' })
      edit.focus()
      await user.keyboard('{Enter}')
      const correction = screen.getByRole('dialog', { name: 'Edit set 1' })
      expect(within(correction).getByRole('button', CLOSE_LOG)).toHaveFocus()
      expect(document.activeElement).not.toBe(correction.querySelector('.clr-logging-overlay__scroll'))
    } finally {
      spy.mockRestore()
    }
  })
})
