/**
 * GEN-03 — the state a screen renders, and what it refuses to render.
 *
 * The four assertions the requirement makes are all here: a killed network
 * becomes an error state carrying message, request id and a retry that works;
 * a second submit while pending starts no second call; a success carries the
 * validated workout on to Review; and nothing anywhere produces content when
 * the call did not.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ErrorCode } from './errors'
import { GenerationClientContext, useGeneration } from './generation'
import { GenerationFailure, type GenerationInput } from '../data/generation'
import { makeGenerationError, makeGenerationOutput } from '../test/factories'
import {
  createFakeGenerationClient,
  type FakeGenerationClient,
} from '../test/generation-double'

const INPUT: GenerationInput = {
  focus: 'lower_body',
  requested_intensity: 7,
  requested_duration_mins: 45,
  location_id: '11111111-2222-4333-8444-555555555555',
  notes: null,
}

/** The state machine rendered flat, plus its four actions as buttons. */
function Probe() {
  const generation = useGeneration()
  const { state } = generation

  return (
    <div>
      <p data-testid="status">{state.status}</p>
      <p data-testid="pending">{String(generation.isPending)}</p>
      <p data-testid="title">{state.status === 'success' ? state.workout.title : ''}</p>
      <p data-testid="request-id">
        {state.status === 'success'
          ? state.requestId
          : state.status === 'error'
            ? state.error.requestId
            : ''}
      </p>
      <p data-testid="message">{state.status === 'error' ? state.error.message : ''}</p>
      <p data-testid="retryable">
        {state.status === 'error' ? String(state.error.retryable) : ''}
      </p>
      <button onClick={() => generation.generate(INPUT)}>generate</button>
      <button onClick={() => generation.retry()}>retry</button>
      <button onClick={() => generation.cancel()}>cancel</button>
      <button onClick={() => generation.reset()}>reset</button>
    </div>
  )
}

function mount(client: FakeGenerationClient) {
  return render(
    <GenerationClientContext value={client}>
      <Probe />
    </GenerationClientContext>,
  )
}

const status = () => screen.getByTestId('status').textContent

describe('the generation mutation', () => {
  it('starts idle and goes pending on the first submit', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    expect(status()).toBe('idle')

    await user.click(screen.getByRole('button', { name: 'generate' }))

    expect(status()).toBe('pending')
    expect(screen.getByTestId('pending').textContent).toBe('true')
    expect(client.calls).toEqual([INPUT])
  })

  it('hands the validated workout to review on success', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await user.click(screen.getByRole('button', { name: 'generate' }))
    await act(async () => {
      client.succeed({
        workout: makeGenerationOutput({ title: 'Squat-led session' }),
        requestId: 'req_abc_123',
      })
    })

    expect(status()).toBe('success')
    expect(screen.getByTestId('title').textContent).toBe('Squat-led session')
    expect(screen.getByTestId('request-id').textContent).toBe('req_abc_123')
    expect(screen.getByTestId('pending').textContent).toBe('false')
  })

  it('shows a killed network as an error with its message, request id and retry', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await user.click(screen.getByRole('button', { name: 'generate' }))
    await act(async () => {
      client.fail(makeGenerationError({ requestId: 'req_offline_9' }))
    })

    expect(status()).toBe('error')
    expect(screen.getByTestId('message').textContent).toBe('No connection. Check your network.')
    expect(screen.getByTestId('request-id').textContent).toBe('req_offline_9')
    expect(screen.getByTestId('retryable').textContent).toBe('true')
    // Nothing fabricated took its place.
    expect(screen.getByTestId('title').textContent).toBe('')

    await user.click(screen.getByRole('button', { name: 'retry' }))

    expect(status()).toBe('pending')
    // The same request, without the screen having to still hold its fields.
    expect(client.calls).toEqual([INPUT, INPUT])
  })

  it('says when a failure cannot be retried', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await user.click(screen.getByRole('button', { name: 'generate' }))
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

    expect(screen.getByTestId('retryable').textContent).toBe('false')
  })

  it('starts no second call while one is in flight', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await user.click(screen.getByRole('button', { name: 'generate' }))
    await user.click(screen.getByRole('button', { name: 'generate' }))
    await user.click(screen.getByRole('button', { name: 'retry' }))

    expect(client.calls).toEqual([INPUT])
    expect(client.outstanding).toBe(1)
  })

  it('prevents a double submit landing in the same tick', async () => {
    const client = createFakeGenerationClient()
    mount(client)

    // Two clicks before React re-renders: both see `idle`, and only the ref
    // guard knows one of them already started a call.
    const button = screen.getByRole('button', { name: 'generate' })
    await act(async () => {
      button.click()
      button.click()
    })

    expect(client.calls).toEqual([INPUT])
  })

  it('drops the answer to a cancelled call', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await user.click(screen.getByRole('button', { name: 'generate' }))
    await user.click(screen.getByRole('button', { name: 'cancel' }))

    expect(status()).toBe('idle')

    await act(async () => {
      client.succeed({ workout: makeGenerationOutput({ title: 'Too late' }) })
    })

    expect(status()).toBe('idle')
    expect(screen.getByTestId('title').textContent).toBe('')
  })

  it('accepts a new call after a cancelled one', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await user.click(screen.getByRole('button', { name: 'generate' }))
    await user.click(screen.getByRole('button', { name: 'cancel' }))
    await user.click(screen.getByRole('button', { name: 'generate' }))

    expect(client.calls).toEqual([INPUT, INPUT])
    expect(status()).toBe('pending')
  })

  it('forgets the last answer on reset', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    mount(client)

    await user.click(screen.getByRole('button', { name: 'generate' }))
    await act(async () => {
      client.succeed()
    })
    await user.click(screen.getByRole('button', { name: 'reset' }))

    expect(status()).toBe('idle')
    expect(screen.getByTestId('title').textContent).toBe('')
  })

  it('drops an answer that arrives after unmount', async () => {
    const user = userEvent.setup()
    const client = createFakeGenerationClient()
    const view = mount(client)

    await user.click(screen.getByRole('button', { name: 'generate' }))
    view.unmount()

    // No act() warning and no state update: the run was invalidated with the
    // component that owned it.
    await act(async () => {
      client.succeed()
    })

    expect(client.outstanding).toBe(0)
  })

  it('refuses to be used without a client', () => {
    expect(() => render(<Probe />)).toThrow(/GenerationClientContext/)
  })
})
