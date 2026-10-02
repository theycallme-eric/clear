import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GenerationLoading } from '../../app/GenerationLoading'
import {
  FAILURE_CLASSES,
  noCandidatesError,
  type FailureClass,
  type SectionCandidates,
  type SectionSupport,
} from '../../data/candidates'
import {
  createGenerationClient,
  type GenerationError,
  type GenerationInput,
} from '../../data/generation'
import { ErrorCode, ok } from '../../state/errors'
import {
  GENERATION_CANCEL_LABEL,
  GENERATION_CHANGE_LABEL,
  GENERATION_FAILED_LABEL,
} from '../../state/generation-loading'
import { toastQueue } from '../../state/toasts'
import { makeSessionAcceptance } from '../factories'
import { renderWithProviders } from '../render'

// GR-04 — REQ-014, REQ-031.
//
// The refusal a person reads on the Generate/Loading failure path, followed
// from where it is classified to where it is shown:
//
//   1. Every class in the closed set produces its own sentence from the
//      classifier's own inputs, and a class with no row below fails here.
//   2. The sentence crosses the wire in the existing `{ code, message,
//      requestId }` envelope and the client keeps it.
//   3. The existing Loading composition shows it — the failed loader, one
//      negative toast with the request id and one action, and the cancel
//      button — and no workout.

const REQUEST_ID = 'req_task012_refusal'

const INPUT: GenerationInput = {
  goal: 'strength',
  focus: 'lower_body',
  requested_intensity: 7,
  requested_duration_mins: 45,
  location_id: '11111111-2222-4333-8444-555555555555',
  notes: null,
  deload: false,
}

const empty = (section: SectionCandidates['section']): SectionCandidates => ({
  section,
  relaxed: true,
  candidates: [],
})

/** The inputs that make the classifier answer each class for `conditioning`. */
const SETUPS: Record<
  FailureClass,
  { sections: readonly SectionCandidates[]; support: readonly SectionSupport[] | null }
> = {
  catalog_defect: {
    sections: [empty('conditioning')],
    support: [{ section: 'conditioning', catalogExercises: 0, equippedExercises: 0 }],
  },
  athlete_constraint: {
    sections: [empty('conditioning')],
    support: [{ section: 'conditioning', catalogExercises: 12, equippedExercises: 4 }],
  },
  missing_equipment: {
    sections: [empty('conditioning')],
    support: [{ section: 'conditioning', catalogExercises: 12, equippedExercises: 0 }],
  },
  empty_profile: { sections: [], support: null },
  undetermined: { sections: [empty('conditioning')], support: null },
}

/** What the athlete is told, per class. Written out, not read from the mapping. */
const MESSAGES: Record<FailureClass, string> = {
  catalog_defect: 'Conditioning: this selection is not currently supported.',
  athlete_constraint:
    'Conditioning: your exclusions remove every exercise. Remove one under Work around in Settings.',
  missing_equipment:
    'Conditioning: nothing can be done with the equipment at this place. Add equipment in Places and equipment, or choose another place.',
  empty_profile: 'Your profile has no sections turned on. Turn on sections in Settings.',
  undetermined: 'Conditioning: no exercises match these options. Change equipment or exclusions.',
}

const refusalFor = (failureClass: FailureClass) =>
  noCandidatesError(SETUPS[failureClass].sections, SETUPS[failureClass].support)

/** The refusal as the client reads it off the wire: the 422 envelope, parsed. */
async function received(failureClass: FailureClass): Promise<GenerationError> {
  const refusal = refusalFor(failureClass)
  const fetchImpl = vi.fn(() =>
    Promise.resolve(
      Response.json(
        { code: refusal.code, message: refusal.message, requestId: REQUEST_ID },
        { status: 422 },
      ),
    ),
  ) as unknown as typeof globalThis.fetch

  const result = await createGenerationClient({
    auth: {
      getSession: () =>
        Promise.resolve(
          ok({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 3_600_000,
            user: { id: '99999999-8888-7777-6666-555555555555', email: 'lifter@example.test' },
          }),
        ),
    },
    supabase: { url: 'https://project.supabase.co', anonKey: 'anon-key', fetch: fetchImpl },
    requestId: () => REQUEST_ID,
    today: () => '2026-10-01',
  }).generate(INPUT)

  if (result.ok) throw new Error('the request resolved; this test needs a refusal')
  return result.error
}

beforeEach(() => {
  toastQueue.clear()
})

describe('every failure class has a message (REQ-014)', () => {
  it('covers the closed set, and nothing outside it', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...FAILURE_CLASSES].sort())
    expect(Object.keys(SETUPS).sort()).toEqual([...FAILURE_CLASSES].sort())
  })

  it.each(FAILURE_CLASSES)('%s: the classified refusal carries its sentence', (failureClass) => {
    const refusal = refusalFor(failureClass)

    expect(refusal.code).toBe(ErrorCode.GENERATION_NO_CANDIDATES)
    expect(refusal.message).toBe(MESSAGES[failureClass])
  })

  it('no two classes share a sentence', () => {
    const sentences = FAILURE_CLASSES.map((failureClass) => refusalFor(failureClass).message)

    expect(new Set(sentences).size).toBe(FAILURE_CLASSES.length)
  })

  it('names each failed section beside the choice that emptied it', () => {
    const refusal = noCandidatesError(
      [empty('primary_lift'), empty('conditioning')],
      [
        { section: 'primary_lift', catalogExercises: 21, equippedExercises: 0 },
        { section: 'conditioning', catalogExercises: 0, equippedExercises: 0 },
      ],
    )

    expect(refusal.message).toBe(
      'Conditioning: this selection is not currently supported. ' +
        'Primary lift: nothing can be done with the equipment at this place. Add equipment in Places and equipment, or choose another place.',
    )
  })
})

describe('a catalog defect is not the athlete’s to fix (REQ-014)', () => {
  it('says the selection is unsupported and suggests no change', () => {
    const { message } = refusalFor('catalog_defect')

    expect(message).toContain('not currently supported')
    expect(message).not.toMatch(/goal|focus|equipment|exclusion|settings|change|try/i)
  })

  it.each(['athlete_constraint', 'missing_equipment'] as const)(
    '%s says what to change and where',
    (failureClass) => {
      expect(refusalFor(failureClass).message).toMatch(/Settings|Places and equipment/)
    },
  )
})

describe('the refusal on the Loading failure path (REQ-014, REQ-031)', () => {
  it.each(FAILURE_CLASSES)('%s: the client keeps the sentence and the request id', async (failureClass) => {
    const error = await received(failureClass)

    expect(error.code).toBe(ErrorCode.GENERATION_NO_CANDIDATES)
    expect(error.message).toBe(MESSAGES[failureClass])
    expect(error.requestId).toBe(REQUEST_ID)
    // Repeating the same request cannot answer differently.
    expect(error.retryable).toBe(false)
  })

  it.each(FAILURE_CLASSES)(
    '%s: shown in the existing error composition, recoverable, with no workout',
    async (failureClass) => {
      const user = userEvent.setup()
      const error = await received(failureClass)
      const onCancel = vi.fn()
      const onRetry = vi.fn()
      const workout = makeSessionAcceptance().workout

      renderWithProviders(
        createElement(GenerationLoading, {
          state: { status: 'error', input: INPUT, error },
          stage: null,
          onCancel,
          onRetry,
        }),
      )

      expect(screen.getByRole('status')).toHaveTextContent(GENERATION_FAILED_LABEL)

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(MESSAGES[failureClass])
      expect(alert).toHaveTextContent(REQUEST_ID)

      // Nothing composed, nothing invented: no title and no exercise.
      expect(document.body).not.toHaveTextContent(workout.title)
      for (const section of workout.sections) {
        for (const block of section.blocks) {
          for (const exercise of block.exercises) {
            expect(document.body).not.toHaveTextContent(exercise.exercise_id)
          }
        }
      }

      // The way out stays on the screen, and the toast's one action is it too.
      expect(screen.getByRole('button', { name: GENERATION_CANCEL_LABEL })).toBeEnabled()
      expect(within(alert).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
      await user.click(within(alert).getByRole('button', { name: GENERATION_CHANGE_LABEL }))

      expect(onCancel).toHaveBeenCalledTimes(1)
      expect(onRetry).not.toHaveBeenCalled()
    },
  )
})
