/**
 * TASK-011 / REQ-013 — correcting a saved set during the active workout, and
 * the wrong-movement recovery: confirm clearing the selected result, then log
 * it explicitly under the right movement.
 *
 * Mounted the way the workout shell mounts the card — the real provider with
 * corrections on, the rest, the sheet host and its slot — and once through the
 * workout route itself, so the shell's own wiring is what is proved. The queue
 * and transport rules behind each write are pinned in
 * `state/set-correction-queue.test.tsx`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { routes } from '../app/router'
import { BlockCompletionContext, type BlockCompletionApi } from '../state/block-completion'
import { createError, err, ErrorCode } from '../state/errors'
import { RestTimerProvider } from '../state/rest-provider'
import type { SetLogEntry } from '../state/set-logging'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { sessionProgress } from '../state/workout-progress'
import { AppProviders, signedIn } from '../test/render'
import { createWorkoutDouble, FIXTURE_SESSION_ID, snapshotFixture } from '../test/workout-double'
import { BlockSlot } from './block-renderers'
import { SectionLabelContext } from './section-label-context'
import { SetLoggingSheetHost, SetLoggingSheetSlot } from './set-logging-sheet'

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

type Behaviour = 'store' | 'refuse' | 'hold'

/** Two movements in one block: back squat, where the set went, and bench press. */
function mount(options: { corrections?: boolean; correct?: Behaviour } = {}) {
  const snapshot = snapshotFixture({
    sections: [
      {
        title: 'Primary lift',
        sectionType: 'primary_lift',
        blocks: [
          {
            structureType: 'standard',
            exercises: [
              { prescription: { exercise_id: 'back-squat' } },
              { prescription: { exercise_id: 'bench-press' } },
            ],
          },
        ],
      },
    ],
  })
  const base = createWorkoutDouble({ session: snapshot })
  let release: () => void = () => {}
  const clients = {
    ...base.clients,
    setLogs: {
      ...base.clients.setLogs,
      async correct(entry: SetLogEntry) {
        if (options.correct === 'refuse') return err(createError(ErrorCode.NETWORK_OFFLINE))
        if (options.correct === 'hold') await new Promise<void>((resolve) => { release = resolve })
        return base.clients.setLogs.correct(entry)
      },
    },
  }
  const section = sessionProgress(snapshot).sections[0]
  const block = section.blocks[0]
  const completion: BlockCompletionApi = { reportOutcome: vi.fn(), isBlockRecorded: () => false }

  render(
    <AppProviders workout={clients}>
      <BlockCompletionContext value={completion}>
        <SetLoggingProvider
          sessionId={FIXTURE_SESSION_ID}
          storage={null}
          exercises={block.exercises}
          weightUnit="kg"
          onFailure={() => {}}
          corrections={options.corrections ?? true}
        >
          <RestTimerProvider>
            <SetLoggingSheetHost>
              <main>
                <SectionLabelContext value={section.title}>
                  <BlockSlot block={block} />
                </SectionLabelContext>
              </main>
              <footer aria-label="Pinned foot">
                <SetLoggingSheetSlot />
              </footer>
            </SetLoggingSheetHost>
          </RestTimerProvider>
        </SetLoggingProvider>
      </BlockCompletionContext>
    </AppProviders>,
  )

  return { double: base, release: () => act(() => release()) }
}

/** The movement card whose heading names it. */
function card(name: string): HTMLElement {
  const found = screen
    .getAllByRole('heading', { name: new RegExp(`${name}$`) })
    .map((heading) => heading.closest('section'))
    .find((section) => section !== null && within(section).queryByRole('button', { name: 'Log set' }))
  if (found === undefined || found === null) throw new Error(`no ${name} card`)
  return found
}

const sheetForm = (mode: 'Log' | 'Edit', setNumber: number, name: string) =>
  within(screen.getByRole('form', { name: `${mode} set ${setNumber} of ${name}` }))

async function logFirstSet(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  fill: { weight?: string; unit?: 'kg' | 'lb'; effort?: string } = {},
) {
  await user.click(within(card(name)).getByRole('button', { name: 'Log set' }))
  const form = sheetForm('Log', 1, name)
  if (fill.weight !== undefined) await user.type(form.getByLabelText('Weight'), fill.weight)
  if (fill.unit !== undefined) await user.selectOptions(form.getByRole('combobox', { name: 'Unit' }), fill.unit)
  if (fill.effort !== undefined) await user.click(form.getByRole('radio', { name: fill.effort }))
  await act(async () => {
    await user.click(form.getByRole('button', { name: 'Log set 1' }))
  })
  await within(card(name)).findByText('Saved')
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-046 / AC-047 — the ordinary correction
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-046: Edit reopens the selected actual result', () => {
  it('preserves its movement, set number, values, unit and effort in the shared sheet', async () => {
    const user = userEvent.setup()
    mount()
    await logFirstSet(user, 'back squat', { weight: '135', unit: 'lb', effort: 'Too hard' })

    await user.click(within(card('back squat')).getByRole('button', { name: 'Edit set 1' }))

    // The sheet is titled for this set and named for this movement.
    expect(screen.getByRole('region', { name: 'Edit set 1' })).toBeInTheDocument()
    const edit = sheetForm('Edit', 1, 'back squat')
    expect(edit.getByLabelText('Weight')).toHaveValue(135)
    expect(edit.getByRole('combobox', { name: 'Unit' })).toHaveValue('lb')
    expect(edit.getByLabelText('Reps')).toHaveValue(8)
    expect(edit.getByRole('radio', { name: 'Too hard' })).toHaveAttribute('aria-checked', 'true')
    // The other movement's card is untouched by the edit.
    expect(within(card('bench press')).queryByRole('list', { name: 'Logged sets' })).toBeNull()
  })
})

describe('AC-047: Save correction updates the intended observation; Cancel leaves it', () => {
  it('writes the correction to the same row, and only after confirmation calls it saved', async () => {
    const user = userEvent.setup()
    const { double, release } = mount({ correct: 'hold' })
    await logFirstSet(user, 'back squat', { weight: '60' })
    const [stored] = double.loggedSets()

    await user.click(within(card('back squat')).getByRole('button', { name: 'Edit set 1' }))
    const edit = sheetForm('Edit', 1, 'back squat')
    await user.clear(edit.getByLabelText('Reps'))
    await user.type(edit.getByLabelText('Reps'), '6')
    await user.click(edit.getByRole('radio', { name: 'About right' }))
    await user.click(edit.getByRole('button', { name: 'Save correction' }))

    // Pending: the corrected values, said to be saving — not saved.
    const rows = within(card('back squat')).getByRole('list', { name: 'Logged sets' })
    expect(within(rows).getByText(/6 reps/)).toBeInTheDocument()
    expect(within(rows).getByText('Saving')).toBeInTheDocument()
    expect(within(rows).queryByText('Saved')).toBeNull()

    release()
    await within(rows).findByText('Saved')
    expect(double.correctedSets()).toEqual([
      expect.objectContaining({
        id: stored.id,
        exerciseId: stored.exerciseId,
        performed: expect.objectContaining({ setNumber: 1, reps: 6, weight: 60, effort: 'about_right' }),
      }),
    ])
    // A correction is not another set.
    expect(double.loggedSets()).toHaveLength(1)
    expect(within(rows).getAllByRole('listitem')).toHaveLength(1)
  })

  it('leaves the stored result exactly as it was on Cancel', async () => {
    const user = userEvent.setup()
    const { double } = mount()
    await logFirstSet(user, 'back squat', { weight: '60', effort: 'Too easy' })

    await user.click(within(card('back squat')).getByRole('button', { name: 'Edit set 1' }))
    const edit = sheetForm('Edit', 1, 'back squat')
    await user.clear(edit.getByLabelText('Weight'))
    await user.type(edit.getByLabelText('Weight'), '0')
    await user.click(edit.getByRole('button', { name: 'Clear effort for set 1' }))
    await user.click(edit.getByRole('button', { name: 'Cancel' }))

    expect(double.correctedSets()).toEqual([])
    expect(double.clearedSets()).toEqual([])
    const rows = within(card('back squat')).getByRole('list', { name: 'Logged sets' })
    expect(within(rows).getByText(/60 kg/)).toBeInTheDocument()
    expect(within(rows).getByText('Saved')).toBeInTheDocument()
  })

  it('shows a refused correction as on this device only, never as saved', async () => {
    const user = userEvent.setup()
    mount({ correct: 'refuse' })
    await logFirstSet(user, 'back squat', { weight: '60' })

    await user.click(within(card('back squat')).getByRole('button', { name: 'Edit set 1' }))
    const edit = sheetForm('Edit', 1, 'back squat')
    await user.clear(edit.getByLabelText('Weight'))
    await user.type(edit.getByLabelText('Weight'), '65')
    await act(async () => {
      await user.click(edit.getByRole('button', { name: 'Save correction' }))
    })

    const rows = within(card('back squat')).getByRole('list', { name: 'Logged sets' })
    await within(rows).findByText('On this device only')
    expect(within(rows).queryByText('Saved')).toBeNull()
    expect(within(rows).getByText(/65 kg/)).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-049 — wrong-movement recovery: confirm clear, then explicit re-entry
// ─────────────────────────────────────────────────────────────────────────────

describe('AC-049: clear the mistaken result after confirmation, then re-enter it', () => {
  it('keeps the observation when the confirmation is canceled', async () => {
    const user = userEvent.setup()
    const { double } = mount()
    await logFirstSet(user, 'back squat', { weight: '60' })

    await user.click(within(card('back squat')).getByRole('button', { name: 'Edit set 1' }))
    await user.click(sheetForm('Edit', 1, 'back squat').getByRole('button', { name: 'Clear set 1' }))

    const dialog = within(screen.getByRole('dialog', { name: 'Clear set 1 of back squat?' }))
    // It says exactly which result would be removed, and the safe action is first.
    expect(dialog.getByText('Set 1 · 8 reps · 60 kg')).toBeInTheDocument()
    const [keep, clear] = dialog.getAllByRole('button')
    expect(keep).toHaveTextContent('Keep set')
    expect(clear).toHaveTextContent('Clear set')
    await user.click(keep)

    expect(double.clearedSets()).toEqual([])
    expect(within(card('back squat')).getByRole('list', { name: 'Logged sets' })).toBeInTheDocument()
    // Still editing the same set; nothing was removed.
    expect(screen.getByRole('form', { name: 'Edit set 1 of back squat' })).toBeInTheDocument()
  })

  it('clears only the selected result, moves nothing, and lets the right movement log it explicitly', async () => {
    const user = userEvent.setup()
    const { double } = mount()
    await logFirstSet(user, 'back squat', { weight: '60' })
    const [mistaken] = double.loggedSets()

    await user.click(within(card('back squat')).getByRole('button', { name: 'Edit set 1' }))
    await user.click(sheetForm('Edit', 1, 'back squat').getByRole('button', { name: 'Clear set 1' }))
    await act(async () => {
      await user.click(
        within(screen.getByRole('dialog', { name: 'Clear set 1 of back squat?' })).getByRole('button', { name: 'Clear set' }),
      )
    })

    await waitFor(() => expect(double.clearedSets()).toHaveLength(1))
    expect(double.clearedSets()[0]).toMatchObject({ id: mistaken.id, exerciseId: mistaken.exerciseId })
    expect(within(card('back squat')).queryByRole('list', { name: 'Logged sets' })).toBeNull()
    expect(within(card('back squat')).getByText('Set 1/3')).toBeInTheDocument()
    // Nothing was moved or fabricated on the right movement.
    expect(within(card('bench press')).queryByRole('list', { name: 'Logged sets' })).toBeNull()
    expect(double.loggedSets()).toHaveLength(1)

    // Re-entry is the user's own Log set on the right movement.
    await logFirstSet(user, 'bench press', { weight: '60' })
    const entries = double.loggedSets()
    expect(entries).toHaveLength(2)
    expect(entries[1].id).not.toBe(mistaken.id)
    expect(entries[1].exerciseId).not.toBe(mistaken.exerciseId)
    expect(double.correctedSets()).toEqual([])
  })

  it('keeps ordinary numeric editing beside the clear, and offers no move-to-target flow', async () => {
    const user = userEvent.setup()
    mount()
    await logFirstSet(user, 'back squat', { weight: '60' })
    await user.click(within(card('back squat')).getByRole('button', { name: 'Edit set 1' }))

    const edit = sheetForm('Edit', 1, 'back squat')
    expect(edit.getByLabelText('Weight')).toBeEnabled()
    expect(edit.getByRole('button', { name: 'Save correction' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /move/i })).toBeNull()
    expect(screen.queryByRole('combobox', { name: /movement|target/i })).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AC-048 — only during the current workout, concise rows, no restored prose
// ─────────────────────────────────────────────────────────────────────────────

const RUNTIME_ROOT = join(process.cwd(), 'src')

function runtimeSources(directory = RUNTIME_ROOT): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    const rel = relative(RUNTIME_ROOT, path)
    if (rel === 'design-system' || rel === 'test' || rel === 'dev') return []
    if (statSync(path).isDirectory()) return runtimeSources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

describe('AC-048: corrections exist only in the current workout, with concise controls', () => {
  it('keeps each logged row to its result, status and one Edit — no Remove mistaken entry', async () => {
    const user = userEvent.setup()
    mount()
    await logFirstSet(user, 'back squat', { weight: '60' })

    const row = within(within(card('back squat')).getByRole('list', { name: 'Logged sets' })).getByRole('listitem')
    expect(within(row).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Edit set 1'])
    expect(screen.queryByText(/remove mistaken entry/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })

  it('draws no Edit where the shell does not offer corrections', async () => {
    const user = userEvent.setup()
    mount({ corrections: false })
    await logFirstSet(user, 'back squat', { weight: '60' })

    expect(screen.queryByRole('button', { name: /^Edit set/ })).toBeNull()
  })

  it('is offered by the active workout alone; no history editor or restored prose exists', () => {
    const offering = runtimeSources().filter((path) =>
      /<SetLoggingProvider[^>]*\bcorrections\b/s.test(readFileSync(path, 'utf8')))
    expect(offering.map((path) => relative(RUNTIME_ROOT, path))).toEqual(['app/Workout.tsx'])

    for (const path of runtimeSources()) {
      const source = readFileSync(path, 'utf8')
      expect(source, path).not.toMatch(/Remove mistaken entry/i)
      // Only the logger and its provider reach the correction seam.
      if (/\b(correctSet|clearSet)\b/.test(source)) {
        expect(['state/set-logging.ts', 'state/set-logging-provider.tsx', 'ui/set-logger.tsx'])
          .toContain(relative(RUNTIME_ROOT, path))
      }
    }
  })

  it('offers Edit on the workout screen itself, writing through the shell', async () => {
    const user = userEvent.setup()
    const double = createWorkoutDouble({
      session: snapshotFixture({
        sections: [
          {
            title: 'Strength',
            sectionType: 'primary_lift',
            blocks: [{ exercises: [{ prescription: { exercise_id: 'back-squat' } }] }],
          },
        ],
        startedAt: new Date(Date.now() - 600_000).toISOString(),
      }),
    })
    render(
      <AppProviders {...signedIn({ workout: double.clients })}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/', '/workout'], initialIndex: 1 })} />
      </AppProviders>,
    )
    await screen.findByRole('heading', { level: 1, name: 'Workout' })

    await user.click(within(card('back squat')).getByRole('button', { name: 'Log set' }))
    await act(async () => {
      await user.click(sheetForm('Log', 1, 'back squat').getByRole('button', { name: 'Log set 1' }))
    })
    await within(card('back squat')).findByText('Saved')

    await user.click(within(card('back squat')).getByRole('button', { name: 'Edit set 1' }))
    const edit = sheetForm('Edit', 1, 'back squat')
    await user.clear(edit.getByLabelText('Reps'))
    await user.type(edit.getByLabelText('Reps'), '4')
    await act(async () => {
      await user.click(edit.getByRole('button', { name: 'Save correction' }))
    })

    await waitFor(() => expect(double.correctedSets()).toHaveLength(1))
    expect(double.correctedSets()[0]).toMatchObject({
      id: double.loggedSets()[0].id,
      performed: { setNumber: 1, reps: 4 },
    })
  })
})
