/**
 * TASK-008 (REQ-011) — one set's optional three-choice effort, in the sheet.
 *
 * Mounted the way the workout shell mounts the logger: the real set-logging
 * provider and its queue, the session's rest, and the sheet host with its slot.
 * What is pinned here is the observation itself — three faces with hidden
 * words and exposed selection, a Clear that returns to unanswered, and null
 * that stays null — and that it is not the session's five-choice feeling.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BlockCompletionContext, type BlockCompletionApi } from '../state/block-completion'
import { Constants } from '../data/database.types'
import { Frown, Meh, Smile } from '../design-system/index'
import { MOOD_SCALE } from '../state/mood'
import { RestTimerProvider } from '../state/rest-provider'
import type { PerformedSet, SetLogEntry } from '../state/set-logging'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { sessionProgress } from '../state/workout-progress'
import { AppProviders } from '../test/render'
import { createWorkoutDouble, FIXTURE_SESSION_ID, snapshotFixture } from '../test/workout-double'
import { FeelingRow } from './feeling-row'
import { SET_EFFORT_CHOICES, SetEffortReading } from './set-effort'
import { ExerciseSetLogger } from './set-logger'
import { SetLoggingSheetHost, SetLoggingSheetSlot } from './set-logging-sheet'

function mount({ correctable = false }: { correctable?: boolean } = {}) {
  const snapshot = snapshotFixture({
    sections: [{ sectionType: 'primary_lift', blocks: [{ structureType: 'standard' }] }],
  })
  const base = createWorkoutDouble({ session: snapshot })
  const attempts: SetLogEntry[] = []
  const clients = {
    ...base.clients,
    setLogs: {
      ...base.clients.setLogs,
      async log(entry: SetLogEntry) {
        attempts.push(entry)
        return base.clients.setLogs.log(entry)
      },
    },
  }
  const block = sessionProgress(snapshot).sections[0].blocks[0]
  const completion: BlockCompletionApi = { reportOutcome: vi.fn(), isBlockRecorded: () => false }
  const onCorrectSet = vi.fn<(exerciseId: string, corrected: PerformedSet) => void>()

  render(
    <AppProviders workout={clients}>
      <BlockCompletionContext value={completion}>
        <SetLoggingProvider
          sessionId={FIXTURE_SESSION_ID}
          storage={null}
          exercises={block.exercises}
          weightUnit="kg"
          onFailure={() => {}}
        >
          <RestTimerProvider>
            <SetLoggingSheetHost>
              <main>
                <ExerciseSetLogger
                  exercise={block.exercises[0]}
                  {...(correctable ? { onCorrectSet } : {})}
                />
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

  return { attempts, onCorrectSet }
}

const main = () => within(screen.getByRole('main'))

function form(setNumber: number, mode: 'Log' | 'Edit' = 'Log') {
  return within(screen.getByRole('form', { name: `${mode} set ${setNumber} of back squat` }))
}

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(main().getByRole('button', { name: 'Rest' }))
}

async function logSet(user: ReturnType<typeof userEvent.setup>, setNumber: number, effort?: string) {
  if (effort !== undefined) await user.click(form(setNumber).getByRole('radio', { name: effort }))
  await user.click(form(setNumber).getByRole('button', { name: `Log set ${setNumber}` }))
  await waitFor(() => expect(screen.getByRole('region', { name: `Log set ${setNumber + 1}` })).toBeInTheDocument())
}

const checked = (scope: ReturnType<typeof form>) =>
  scope.getAllByRole('radio').filter((radio) => radio.getAttribute('aria-checked') === 'true')

/** The markup a design-system glyph draws, to tell the three faces apart. */
function glyphMarkup(Glyph: typeof Frown): string {
  const { container, unmount } = render(<Glyph size={20} />)
  const markup = container.querySelector('svg')!.innerHTML
  unmount()
  return markup
}

describe('AC-039: one optional three-choice effort with the set’s entry', () => {
  it('offers too hard / about right / too easy in the same form as reps and load', async () => {
    const user = userEvent.setup()
    mount()
    await openSheet(user)

    const group = form(1).getByRole('radiogroup')
    expect(within(group).getAllByRole('radio').map((radio) => radio.textContent))
      .toEqual(['Too hard', 'About right', 'Too easy'])
    // Exactly one effort question, with the measures, in the one form.
    expect(form(1).getAllByRole('radiogroup')).toHaveLength(1)
    expect(form(1).getByLabelText('Weight')).toBeInTheDocument()
    expect(form(1).getByLabelText('Reps')).toBeInTheDocument()
  })

  it('has no arbitrary-number field and no step after the set', async () => {
    const user = userEvent.setup()
    mount()
    await openSheet(user)

    // Weight and Reps are the only numbers; effort is not one.
    expect(form(1).getAllByRole('spinbutton').map((field) => field.getAttribute('aria-label') ?? field.id))
      .toHaveLength(2)
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByLabelText(/RPE/i)).toBeNull()

    await logSet(user, 1, 'About right')
    // Logging moves straight to the next set: no dialog asks afterwards.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('is optional: a set logs without any answer', async () => {
    const user = userEvent.setup()
    const { attempts } = mount()
    await openSheet(user)
    await logSet(user, 1)
    expect(attempts).toHaveLength(1)
  })
})

describe('AC-040: hidden words, exposed state, Frown / Meh / Smile left to right', () => {
  it('draws the current glyphs in order and keeps the words visually hidden', async () => {
    const user = userEvent.setup()
    mount()
    await openSheet(user)
    const expected = [Frown, Meh, Smile].map(glyphMarkup)

    const radios = form(1).getAllByRole('radio')
    for (const [index, radio] of radios.entries()) {
      // Each chip draws its own face (beside the chip's selection tick) and no other.
      const faces = [...radio.querySelectorAll('svg')]
        .map((svg) => svg.innerHTML)
        .filter((markup) => expected.includes(markup))
      expect(faces).toEqual([expected[index]])
      // The accessible name is the word; the word lives only in the hidden span.
      const word = within(radio).getByText(SET_EFFORT_CHOICES[index].label)
      expect(word).toHaveClass('a11y-hidden')
      for (const svg of radio.querySelectorAll('svg')) expect(svg).toHaveAttribute('aria-hidden', 'true')
    }
    expect(SET_EFFORT_CHOICES.map((choice) => [choice.label, choice.Glyph])).toEqual([
      ['Too hard', Frown], ['About right', Meh], ['Too easy', Smile],
    ])
  })

  it('exposes the selected choice as checked, and only that one', async () => {
    const user = userEvent.setup()
    mount()
    await openSheet(user)
    expect(checked(form(1))).toEqual([])

    await user.click(form(1).getByRole('radio', { name: 'Too easy' }))
    expect(form(1).getByRole('radio', { name: 'Too easy' })).toHaveAttribute('aria-checked', 'true')
    expect(checked(form(1))).toHaveLength(1)

    await user.click(form(1).getByRole('radio', { name: 'Too hard' }))
    expect(checked(form(1)).map((radio) => radio.textContent)).toEqual(['Too hard'])
  })

  it('maps each face to its stored category, and only to the three categories', () => {
    expect(SET_EFFORT_CHOICES.map((choice) => choice.value)).toEqual(['too_hard', 'about_right', 'too_easy'])
    expect(new Set(SET_EFFORT_CHOICES.map((choice) => choice.value)))
      .toEqual(new Set(Constants.public.Enums.set_effort))
  })
})

describe('AC-041: a compact Clear returns the set to unanswered', () => {
  it('appears only once answered, and clears back to no selection', async () => {
    const user = userEvent.setup()
    const { attempts } = mount()
    await openSheet(user)
    expect(form(1).queryByRole('button', { name: /Clear effort/ })).toBeNull()

    await user.click(form(1).getByRole('radio', { name: 'About right' }))
    const clear = form(1).getByRole('button', { name: 'Clear effort for set 1' })
    expect(clear).toHaveTextContent('Clear')
    expect(clear).toHaveClass('clr-btn--quiet')
    expect(clear).toHaveClass('clr-chamfer--sm')
    // Clearing is not logging: it is a button, not a submit.
    expect(clear).toHaveAttribute('type', 'button')

    await user.click(clear)
    expect(checked(form(1))).toEqual([])
    expect(form(1).queryByRole('button', { name: /Clear effort/ })).toBeNull()
    expect(form(1).getAllByRole('radio')[0]).toHaveFocus()
    expect(attempts).toEqual([])

    // The cleared set logs as unanswered.
    await logSet(user, 1)
    expect(attempts[0].performed).not.toHaveProperty('effort')
  })
})

describe('AC-042: null is unanswered, sets are independent, mood is separate', () => {
  it('stores no effort for an unanswered set — never the middle, zero or a guess', async () => {
    const user = userEvent.setup()
    const { attempts } = mount()
    await openSheet(user)
    await logSet(user, 1)

    expect(attempts[0].performed).not.toHaveProperty('effort')
    expect(attempts[0].performed).not.toHaveProperty('rpe')
    const row = within(main().getByRole('list', { name: 'Logged sets' })).getByRole('listitem')
    expect(within(row).queryByRole('img', { name: /Effort/ })).toBeNull()
    // The next set does not inherit a face either.
    expect(checked(form(2))).toEqual([])
  })

  it('reads an old record with no effort back without a fabricated face', () => {
    const { container } = render(<SetEffortReading value={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps each set’s answer independent through logging, edits and clears', async () => {
    const user = userEvent.setup()
    const { attempts, onCorrectSet } = mount({ correctable: true })
    await openSheet(user)
    await logSet(user, 1, 'Too hard')
    await logSet(user, 2)
    await logSet(user, 3, 'Too easy')

    expect(attempts.map((entry) => entry.performed.effort ?? null)).toEqual(['too_hard', null, 'too_easy'])
    const rows = within(main().getByRole('list', { name: 'Logged sets' })).getAllByRole('listitem')
    expect(rows.map((row) => within(row).queryByRole('img')?.getAttribute('aria-label') ?? null))
      .toEqual(['Effort: too hard', null, 'Effort: too easy'])

    // Set 1's edit reads back its own answer; set 2's reads back none.
    await user.click(main().getByRole('button', { name: 'Edit set 2' }))
    expect(checked(form(2, 'Edit'))).toEqual([])
    await user.click(form(2, 'Edit').getByRole('button', { name: 'Cancel' }))

    await user.click(main().getByRole('button', { name: 'Edit set 1' }))
    expect(checked(form(1, 'Edit')).map((radio) => radio.textContent)).toEqual(['Too hard'])

    // Clearing set 1 in edit hands over null for set 1 and touches no other set.
    await user.click(form(1, 'Edit').getByRole('button', { name: 'Clear effort for set 1' }))
    await user.click(form(1, 'Edit').getByRole('button', { name: 'Save correction' }))
    expect(onCorrectSet).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      expect.objectContaining({ setNumber: 1, effort: null }),
    )
    expect(attempts).toHaveLength(3)

    // Set 3 still reads back its own answer.
    await user.click(main().getByRole('button', { name: 'Edit set 3' }))
    expect(checked(form(3, 'Edit')).map((radio) => radio.textContent)).toEqual(['Too easy'])
  })

  it('leaves the five-choice session feeling a separate question', () => {
    expect(MOOD_SCALE).toHaveLength(5)
    const onChange = vi.fn()
    render(<FeelingRow value={null} onChange={onChange} />)
    const feeling = screen.getByRole('group', { name: 'How do you feel?' })
    expect(within(feeling).getAllByRole('radio')).toHaveLength(5)
    // None of the per-set effort words is a feeling option.
    for (const { label } of SET_EFFORT_CHOICES) {
      expect(within(feeling).queryByRole('radio', { name: label })).toBeNull()
    }
  })

  it('never writes a mood with a set', async () => {
    const user = userEvent.setup()
    const { attempts } = mount()
    await openSheet(user)
    await logSet(user, 1, 'Too easy')
    expect(Object.keys(attempts[0].performed).sort()).toEqual(['effort', 'reps', 'setNumber'])
  })
})
