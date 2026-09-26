/**
 * GEN-05 acceptance, rendered over the real mutation: *the loader reflects real
 * stages, and says it is slow after the budget.*
 *
 * Every test here mounts the journey rather than the screen — Generate →
 * Loading → Review, over GEN-03's `useGeneration()` and a client double that
 * answers when a test says so. That is what makes the stage assertions worth
 * anything: the rows come off the call's own progress through its four stages,
 * so a screen that invented a sequence would pass a props-only test and fail
 * these.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GenerationFailure, type GenerationInput } from '../data/generation'
import { ErrorCode } from '../state/errors'
import { GenerationClientContext, useGeneration } from '../state/generation'
import { GENERATION_LOADING_TITLE } from '../state/generation-loading'
import { toastQueue } from '../state/toasts'
import { makeGenerationError, makeGenerationOutput } from '../test/factories'
import {
  createFakeGenerationClient,
  type FakeGenerationClient,
} from '../test/generation-double'
import { renderWithProviders } from '../test/render'
import { SLOW_LOADING_LABEL } from '../ui/view-state'
import { GenerationLoading } from './GenerationLoading'

const INPUT: GenerationInput = {
  focus: 'lower_body',
  requested_intensity: 7,
  requested_duration_mins: 45,
  location_id: '11111111-2222-4333-8444-555555555555',
  notes: null,
  deload: false,
}

const GENERATE = 'Generate'
const FORM = 'the generate screen'

/**
 * The journey this screen lives inside: the form, the loading screen for the
 * two states it is on screen for, and the workout on the other side. It is what
 * GEN-04 and REV-01 will each own half of, written here as the caller GEN-05
 * has to be correct for.
 */
function Journey({ slowThresholdMs }: { slowThresholdMs?: number }) {
  const generation = useGeneration()
  const { state } = generation

  if (state.status === 'pending' || state.status === 'error') {
    return (
      <GenerationLoading
        state={state}
        stage={generation.stage}
        onCancel={generation.cancel}
        onRetry={generation.retry}
        slowThresholdMs={slowThresholdMs}
      />
    )
  }

  return (
    <div>
      <p>{state.status === 'success' ? state.workout.title : FORM}</p>
      {/* A fresh arrow function per render on purpose: a caller that does not
          memoise its handlers must not make the failure toast repeat. */}
      <button
        onClick={() => {
          generation.generate(INPUT)
        }}
      >
        {GENERATE}
      </button>
    </div>
  )
}

function mountJourney(client: FakeGenerationClient, slowThresholdMs?: number) {
  return renderWithProviders(
    <GenerationClientContext value={client}>
      <Journey slowThresholdMs={slowThresholdMs} />
    </GenerationClientContext>,
  )
}

/** The ScanLoader's live region. Absent means the screen is not up. */
const loader = () => screen.queryByRole('status')

beforeEach(() => {
  toastQueue.clear()
  delete document.documentElement.dataset.atmosphere
})

// One test drives the slow budget on a fake clock. Restoring here rather than
// only in that test is the insurance: a fake clock that leaked would hang every
// test after it, which reads as seven unrelated failures.
afterEach(() => {
  vi.useRealTimers()
})

describe('GEN-05 · the loader reflects real stages', () => {
  it('is up for the whole mutation and names the operation before a stage lands', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mountJourney(client)

    expect(loader()).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: GENERATE }))

    const region = screen.getByRole('status')
    expect(region).toHaveTextContent(GENERATION_LOADING_TITLE)
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText(FORM)).not.toBeInTheDocument()
  })

  it('announces the stage in progress and logs the ones that finished', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mountJourney(client)

    await user.click(screen.getByRole('button', { name: GENERATE }))

    // Reported by the call as each stage begins — nothing here is on a timer.
    await act(async () => {
      client.reachStage('validating')
    })
    expect(screen.getByRole('status')).toHaveTextContent('Checking options')
    expect(screen.queryByText('Options · checked')).not.toBeInTheDocument()

    await act(async () => {
      client.reachStage('authorizing')
    })
    await act(async () => {
      client.reachStage('composing')
    })

    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('Composing session')
    // The log is ScanLoader's decorative boot rows: in the DOM, never announced.
    expect(screen.getByText('Options · checked')).toBeInTheDocument()
    expect(screen.getByText('Session · verified')).toBeInTheDocument()
    expect(screen.queryByText('Request · answered')).not.toBeInTheDocument()
  })

  it('shows no progress bar, because how long this takes is not known', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mountJourney(client)

    await user.click(screen.getByRole('button', { name: GENERATE }))
    await act(async () => {
      client.reachStage('composing')
    })

    // Three of four stages is not three quarters of the wait: `composing` holds
    // essentially all of it, and a fake percentage is a lie a reader repeats.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('hands the workout on and takes itself down', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mountJourney(client)

    await user.click(screen.getByRole('button', { name: GENERATE }))
    await act(async () => {
      client.succeed({ workout: makeGenerationOutput({ title: 'Squat-led session' }) })
    })

    expect(loader()).not.toBeInTheDocument()
    expect(screen.getByText('Squat-led session')).toBeInTheDocument()
  })
})

describe('GEN-05 · the slow notice after the budget', () => {
  it('states the fact, keeps working, and does not apologise', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mountJourney(client, 0)

    await user.click(screen.getByRole('button', { name: GENERATE }))
    await act(async () => {
      client.reachStage('composing')
    })

    const region = await screen.findByRole('status')
    await waitFor(() => {
      expect(region).toHaveTextContent(SLOW_LOADING_LABEL)
    })

    // Still working — `slow` is a statement about the wait, not about failure.
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(region.textContent).not.toMatch(/sorry|apolog|oops/i)
    // The log it earned is still there; the call is still in flight.
    expect(screen.getByText('Session · verified')).toBeInTheDocument()
    expect(client.outstanding).toBe(1)
  })

  it('does not call a fresh attempt slow because the one before it was', async () => {
    // The budget is driven rather than waited out: this screen stays mounted
    // across a retry, so the question is whether the clock restarted, and only
    // controlling it can answer that.
    // `shouldAdvanceTime` keeps the library's own zero-delay waits working while
    // leaving the four-second budget under the test's control.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const client = createFakeGenerationClient()
      mountJourney(client, 4000)

      await user.click(screen.getByRole('button', { name: GENERATE }))
      await act(async () => {
        vi.advanceTimersByTime(4000)
      })
      expect(screen.getByRole('status')).toHaveTextContent(SLOW_LOADING_LABEL)

      await act(async () => {
        client.fail(makeGenerationError())
      })
      const alert = screen.getByRole('alert')
      await user.click(within(alert).getByRole('button', { name: 'Retry' }))

      expect(client.calls).toHaveLength(2)
      expect(screen.getByRole('status')).toHaveTextContent(GENERATION_LOADING_TITLE)

      // And it is counting the new budget, not sitting at zero.
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.getByRole('status')).not.toHaveTextContent(SLOW_LOADING_LABEL)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('GEN-05 · a failure hands off to pattern 3', () => {
  it('says the loader failed and raises one negative toast with one retry', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mountJourney(client)

    await user.click(screen.getByRole('button', { name: GENERATE }))
    await act(async () => {
      client.reachStage('composing')
    })
    await act(async () => {
      client.fail(makeGenerationError({ requestId: 'req_offline_9' }))
    })

    // The loader is honest about it, and stops claiming to be busy.
    const region = screen.getByRole('status')
    expect(region).toHaveTextContent('Generation failed')
    expect(region).toHaveAttribute('aria-busy', 'false')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No connection. Check your network.')
    expect(alert).toHaveTextContent('req_offline_9')
    // Exactly one recovery action, beside the dismiss the host always offers.
    expect(within(alert).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Retry',
      '',
    ])

    await user.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(client.calls).toEqual([INPUT, INPUT])
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  })

  it('offers the request instead of a retry when a retry cannot work', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mountJourney(client)

    await user.click(screen.getByRole('button', { name: GENERATE }))
    await act(async () => {
      client.fail(
        makeGenerationError({
          code: ErrorCode.GENERATION_NO_CANDIDATES,
          message: 'No exercises match these options. Change equipment or exclusions.',
          failure: GenerationFailure.NO_CANDIDATES,
          retryable: false,
        }),
      )
    })

    const alert = await screen.findByRole('alert')
    expect(within(alert).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()

    await user.click(within(alert).getByRole('button', { name: 'Change options' }))

    // Never a dead end: the one action available leads somewhere.
    expect(screen.getByText(FORM)).toBeInTheDocument()
    expect(client.calls).toHaveLength(1)
  })

  it('raises one toast for one failure, however often the screen re-renders', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mountJourney(client, 0)

    await user.click(screen.getByRole('button', { name: GENERATE }))
    await act(async () => {
      client.fail(makeGenerationError())
    })
    await screen.findByRole('alert')

    // The slow budget, the stage and the caller's un-memoised handlers all
    // re-render this screen; none of them is a second failure.
    await waitFor(() => {
      expect(toastQueue.getState().queue).toHaveLength(0)
    })
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})

describe('GEN-05 · cancel, and the answer that arrives too late', () => {
  it('leaves for Generate and ignores the workout still on its way', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mountJourney(client)

    await user.click(screen.getByRole('button', { name: GENERATE }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(loader()).not.toBeInTheDocument()
    expect(screen.getByText(FORM)).toBeInTheDocument()

    await act(async () => {
      client.succeed({ workout: makeGenerationOutput({ title: 'Too late' }) })
    })

    expect(screen.queryByText('Too late')).not.toBeInTheDocument()
    expect(loader()).not.toBeInTheDocument()
  })
})

describe('GEN-05 · the brand moment, and the route underneath it', () => {
  it('renders at the full atmosphere IA.md gives it, and puts the route back', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    // The level the route that started the generation was showing.
    document.documentElement.dataset.atmosphere = 'quiet'
    mountJourney(client)

    await user.click(screen.getByRole('button', { name: GENERATE }))

    expect(document.documentElement.dataset.atmosphere).toBe('full')
    expect(document.querySelector('[data-atmosphere="full"]')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    // The screen was transient; the route below it never stopped being quiet.
    expect(document.documentElement.dataset.atmosphere).toBe('quiet')
  })

  it('is one screen: one main landmark and one h1', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mountJourney(client)

    await user.click(screen.getByRole('button', { name: GENERATE }))

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      GENERATION_LOADING_TITLE,
    )
    expect(document.title).toBe(`${GENERATION_LOADING_TITLE} · CLEAR`)
  })
})

describe('GEN-05 · no bespoke loading markup anywhere in the app', () => {
  /** Every runtime module the bundle can reach, tests and the export aside. */
  function runtimeSources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        // The export is not app-owned, `test/` is not runtime, and `dev/` is the
        // review surface — its specimen prose *states* the rule, and a sentence
        // naming the mistake is not the mistake.
        return entry.name === 'design-system' || entry.name === 'test' || entry.name === 'dev'
          ? []
          : runtimeSources(path)
      }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return []
      return [path]
    })
  }

  it('has no spinner and no skeleton in any of it', () => {
    const offenders = runtimeSources(resolve(import.meta.dirname, '..')).filter((path) => {
      // Comments stripped: the prose saying there is no spinner in this system
      // is how that decision stays in the tree, and is not the thing itself.
      const code = readFileSync(path, 'utf-8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      return /\bspinner\b|\bskeleton\b/i.test(code)
    })

    expect(offenders).toEqual([])
  })
})
