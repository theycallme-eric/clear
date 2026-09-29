/**
 * REQ-004's foundation: one host renders the Loading screen for whichever route
 * started a run.
 *
 * Every test mounts the host inside a route, over GEN-03's real
 * `useGeneration()` and a client double that answers when a test says so, so
 * the atmosphere, the toast and the discard are asserted on the mutation the
 * app actually runs rather than on props a test invented.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { Link, Route, Routes, useLocation } from 'react-router-dom'

import type { GenerationInput } from '../data/generation'
import { GenerationClientContext, useGeneration } from '../state/generation'
import { GENERATION_LOADING_TITLE } from '../state/generation-loading'
import { toastQueue, type ToastMessage } from '../state/toasts'
import { makeGenerationError, makeSessionAcceptance } from '../test/factories'
import {
  createFakeGenerationClient,
  type FakeGenerationClient,
} from '../test/generation-double'
import { renderWithProviders } from '../test/render'
import { GenerationLoadingHost } from './GenerationLoadingHost'

const INPUT: GenerationInput = {
  goal: 'strength',
  focus: 'lower_body',
  requested_intensity: 7,
  requested_duration_mins: 45,
  location_id: '11111111-2222-4333-8444-555555555555',
  notes: null,
  deload: false,
}

const START = 'Start run'
const ROUTE_CONTENT = 'the route that started the run'

/**
 * Where the router is, and a way off the route, both outside the host so they
 * stay reachable while the Loading screen is up.
 */
function WhereAmI() {
  return (
    <>
      <p data-testid="location">{useLocation().pathname}</p>
      <Link to="/elsewhere">Leave</Link>
    </>
  )
}

/** A route that owns a run and hands its pending and error branch to the host. */
function StartingRoute({ cancelTo }: { cancelTo: string }) {
  const generation = useGeneration()
  const { state } = generation

  return (
    <GenerationLoadingHost generation={generation} cancelTo={cancelTo}>
      <p>{ROUTE_CONTENT}</p>
      {state.status === 'success' && <p>{state.acceptance.workout.title}</p>}
      <button onClick={() => generation.generate(INPUT)}>{START}</button>
    </GenerationLoadingHost>
  )
}

function mount(
  client: FakeGenerationClient,
  { path = '/review', cancelTo = path }: { path?: string; cancelTo?: string } = {},
) {
  return renderWithProviders(
    <GenerationClientContext value={client}>
      <WhereAmI />
      <Routes>
        <Route path={path} element={<StartingRoute cancelTo={cancelTo} />} />
        <Route path="/elsewhere" element={<p>elsewhere</p>} />
        {cancelTo !== path && <Route path={cancelTo} element={<p>cancel destination</p>} />}
      </Routes>
    </GenerationClientContext>,
    { route: path },
  )
}

const loader = () => screen.queryByRole('status')
const location = () => screen.getByTestId('location').textContent

/** Toasts still showing or waiting to show — a `leaving` one is on its way out. */
function liveToasts(): ToastMessage[] {
  const { current, phase, queue } = toastQueue.getState()
  return [...(current !== null && phase === 'visible' ? [current] : []), ...queue]
}

async function startRun(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: START }))
}

beforeEach(() => {
  toastQueue.clear()
  delete document.documentElement.dataset.atmosphere
})

describe('GenerationLoadingHost · the Loading screen for a run', () => {
  it('shows the route until a run starts, then the ScanLoader in its place', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    expect(screen.getByText(ROUTE_CONTENT)).toBeInTheDocument()
    expect(loader()).not.toBeInTheDocument()

    await startRun(user)

    const region = screen.getByRole('status')
    expect(region).toHaveTextContent(GENERATION_LOADING_TITLE)
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText(ROUTE_CONTENT)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(GENERATION_LOADING_TITLE)
  })

  it('passes no progress, because how long a run takes is not known', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await startRun(user)
    await act(async () => {
      client.reachStage('composing')
    })

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    const region = screen.getByRole('status')
    expect(region).not.toHaveAttribute('aria-valuenow')
    expect(region.querySelector('[aria-valuenow], [aria-valuemax], progress')).toBeNull()
  })

  it('takes the route back down to its own content when the run succeeds', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await startRun(user)
    await act(async () => {
      client.succeed({
        acceptance: makeSessionAcceptance({
          workout: { ...makeSessionAcceptance().workout, title: 'Squat-led session' },
        }),
      })
    })

    expect(loader()).not.toBeInTheDocument()
    expect(screen.getByText('Squat-led session')).toBeInTheDocument()
  })
})

describe('GenerationLoadingHost · cancel returns to the route that started the run', () => {
  it('puts the starting route back when cancel is its own path', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client, { path: '/review' })

    await startRun(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(loader()).not.toBeInTheDocument()
    expect(screen.getByText(ROUTE_CONTENT)).toBeInTheDocument()
    expect(location()).toBe('/review')
  })

  it('navigates to the destination the route names', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client, { path: '/start', cancelTo: '/origin' })

    await startRun(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(location()).toBe('/origin')
    expect(screen.getByText('cancel destination')).toBeInTheDocument()
  })

  it('sends a failure that cannot be retried to the same destination', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client, { path: '/start', cancelTo: '/origin' })

    await startRun(user)
    await act(async () => {
      client.fail(makeGenerationError({ retryable: false }))
    })
    const alert = await screen.findByRole('alert')
    await user.click(within(alert).getByRole('button', { name: 'Change options' }))

    expect(location()).toBe('/origin')
    expect(client.calls).toHaveLength(1)
  })
})

describe('GenerationLoadingHost · one negative toast per failure', () => {
  it('raises exactly one, with exactly one recovery action', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await startRun(user)
    await act(async () => {
      client.fail(makeGenerationError({ requestId: 'req_host_1' }))
    })

    expect(screen.getByRole('status')).toHaveTextContent('Generation failed')
    const toasts = liveToasts()
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.variant).toBe('negative')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('req_host_1')
    expect(within(alert).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Retry',
      '',
    ])
  })

  it('dismisses it when a retry replaces the failure, and raises one for the next', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await startRun(user)
    await act(async () => {
      client.fail(makeGenerationError())
    })
    const first = liveToasts()[0]
    const alert = await screen.findByRole('alert')
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(client.calls).toEqual([INPUT, INPUT])
    expect(liveToasts()).toEqual([])

    await act(async () => {
      client.fail(makeGenerationError())
    })

    const second = liveToasts()
    expect(second).toHaveLength(1)
    expect(second[0]?.id).not.toBe(first?.id)
  })

  it('dismisses it when the screen leaves', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await startRun(user)
    await act(async () => {
      client.fail(makeGenerationError())
    })
    expect(liveToasts()).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(liveToasts()).toEqual([])
  })

  it('dismisses it when the route unmounts under it', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    const view = mount(client)

    await startRun(user)
    await act(async () => {
      client.fail(makeGenerationError())
    })
    expect(liveToasts()).toHaveLength(1)

    view.unmount()

    expect(liveToasts()).toEqual([])
  })
})

describe('GenerationLoadingHost · the atmosphere swap', () => {
  it('sets full while it is up and restores the route level when it leaves', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    document.documentElement.dataset.atmosphere = 'quiet'
    mount(client)

    await startRun(user)
    expect(document.documentElement.dataset.atmosphere).toBe('full')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.documentElement.dataset.atmosphere).toBe('quiet')
  })

  it('restores the previous value when it unmounts mid-run', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    document.documentElement.dataset.atmosphere = 'medium'
    const view = mount(client)

    await startRun(user)
    expect(document.documentElement.dataset.atmosphere).toBe('full')

    view.unmount()
    expect(document.documentElement.dataset.atmosphere).toBe('medium')
  })

  it('removes the attribute on unmount when there was none before', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    const view = mount(client)

    await startRun(user)
    expect(document.documentElement.dataset.atmosphere).toBe('full')

    view.unmount()
    expect(document.documentElement.dataset.atmosphere).toBeUndefined()
  })
})

describe('GenerationLoadingHost · a late answer is discarded', () => {
  it('ignores a workout that arrives after cancel', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await startRun(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => {
      client.succeed({
        acceptance: makeSessionAcceptance({
          workout: { ...makeSessionAcceptance().workout, title: 'Too late' },
        }),
      })
    })

    expect(screen.queryByText('Too late')).not.toBeInTheDocument()
    expect(loader()).not.toBeInTheDocument()
    expect(screen.getByText(ROUTE_CONTENT)).toBeInTheDocument()
  })

  it('ignores a failure that arrives after cancel', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await startRun(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => {
      client.fail(makeGenerationError())
    })

    expect(loader()).not.toBeInTheDocument()
    expect(liveToasts()).toEqual([])
  })

  it('ignores a workout that arrives after the route unmounted', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    document.documentElement.dataset.atmosphere = 'quiet'
    mount(client)

    await startRun(user)
    // Navigation away from the starting route — the back button, a deep link.
    await user.click(screen.getByRole('link', { name: 'Leave' }))
    expect(location()).toBe('/elsewhere')
    expect(document.documentElement.dataset.atmosphere).toBe('quiet')

    await act(async () => {
      client.succeed({
        acceptance: makeSessionAcceptance({
          workout: { ...makeSessionAcceptance().workout, title: 'Too late' },
        }),
      })
    })

    expect(screen.queryByText('Too late')).not.toBeInTheDocument()
    expect(screen.getByText('elsewhere')).toBeInTheDocument()
  })

  it('ignores a workout that arrives after the host was unmounted', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    const view = mount(client)

    await startRun(user)
    view.unmount()

    await act(async () => {
      client.succeed({
        acceptance: makeSessionAcceptance({
          workout: { ...makeSessionAcceptance().workout, title: 'Too late' },
        }),
      })
    })

    expect(screen.queryByText('Too late')).not.toBeInTheDocument()
    expect(liveToasts()).toEqual([])
    expect(view.container).toBeEmptyDOMElement()
  })

  it('does not let an abandoned run replace a newer one', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await startRun(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await startRun(user)

    // The first run answers first; it belongs to nobody any more.
    await act(async () => {
      client.succeed({
        acceptance: makeSessionAcceptance({
          workout: { ...makeSessionAcceptance().workout, title: 'Abandoned' },
        }),
      })
    })
    expect(screen.queryByText('Abandoned')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')

    await act(async () => {
      client.succeed({
        acceptance: makeSessionAcceptance({
          workout: { ...makeSessionAcceptance().workout, title: 'Current' },
        }),
      })
    })
    expect(screen.getByText('Current')).toBeInTheDocument()
  })
})

describe('GenerationLoadingHost · the only place the branch is written', () => {
  /** App-owned runtime modules: tests, the export and the gallery aside. */
  function runtimeSources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        return entry.name === 'design-system' || entry.name === 'test' || entry.name === 'dev'
          ? []
          : runtimeSources(path)
      }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return []
      return [path]
    })
  }

  it('is the one runtime module that renders the Loading screen', () => {
    const renderers = runtimeSources(resolve(import.meta.dirname, '..'))
      .filter((path) => /<GenerationLoading[\s/>]/.test(readFileSync(path, 'utf-8')))
      .map((path) => path.slice(resolve(import.meta.dirname, '..').length + 1))

    expect(renderers).toEqual(['app/GenerationLoadingHost.tsx'])
  })
})
