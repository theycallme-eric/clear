/**
 * U37 — the swap controls on a movement's Review row, and the alternatives.
 *
 * Two things are pinned. The treatment: the controls are the public quiet
 * `TextAction` and add no frame to the card that holds them, and the
 * alternatives are framed choices in one list. And the contract: the control
 * asks and the shell writes, so every callback fires once, with the slot or
 * the option it was given, and never while a write is in flight.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createError, ErrorCode } from '../state/errors'
import type { SwapOption } from '../state/swap'
import {
  ExerciseSwapContext,
  type ExerciseSwapApi,
  type SwapOptionsState,
} from '../state/swap-context'
import { prescriptionSiteKey } from '../state/load-suggestions'
import { Card } from './card'
import {
  equipmentText,
  ExerciseSwapControls,
  SwapDialog,
  type SwapDialogProps,
} from './exercise-swap'

/** One slot, prescribing a back squat. */
const SLOT = prescriptionSiteKey(0, 0, 0)

function seam(overrides: Partial<ExerciseSwapApi> = {}): ExerciseSwapApi {
  return {
    openFor: null,
    open: vi.fn(),
    close: vi.fn(),
    options: { status: 'loading' },
    retry: vi.fn(),
    choose: vi.fn(),
    undoTarget: () => null,
    undo: vi.fn(),
    isBusy: () => false,
    ...overrides,
  }
}

function withSeam(api: ExerciseSwapApi | null, children: ReactNode) {
  return <ExerciseSwapContext.Provider value={api}>{children}</ExerciseSwapContext.Provider>
}

/** Real state replacement removes Undo, including when it lives apart from Swap as in Review. */
function UndoFocusFixture({ split, onUndo }: { split: boolean; onUndo: (slot: string) => void }) {
  const [exerciseId, setExerciseId] = useState('goblet-squat')
  const otherSlot = prescriptionSiteKey(0, 0, 1)
  const api = seam({
    undoTarget: (slot) => slot === SLOT && exerciseId !== 'back-squat' ? 'back-squat' : null,
    undo: (slot) => {
      onUndo(slot)
      if (slot === SLOT) setExerciseId('back-squat')
    },
  })
  return withSeam(api, <>
    <div>
      {split ? <>
        <div><ExerciseSwapControls slot={SLOT} exerciseId={exerciseId} actions="swap" /></div>
        <p>Three rounds of eight reps</p>
        <span>Kettlebell</span>
        <ExerciseSwapControls slot={SLOT} exerciseId={exerciseId} actions="undo" />
      </> : <ExerciseSwapControls slot={SLOT} exerciseId={exerciseId} />}
    </div>
    <div><ExerciseSwapControls slot={otherSlot} exerciseId="front-squat" actions="swap" /></div>
  </>)
}

const GOBLET: SwapOption = {
  exerciseId: 'goblet-squat',
  name: 'Goblet squat',
  equipment: 'kettle-bell',
}
const SPLIT: SwapOption = {
  exerciseId: 'split-squat',
  name: 'Split squat',
  equipment: 'body_weight',
}

function renderDialog(overrides: Partial<SwapDialogProps> = {}) {
  const props: SwapDialogProps = {
    open: true,
    exerciseId: 'back-squat',
    options: { status: 'ready', options: [GOBLET, SPLIT] },
    busy: false,
    onRetry: vi.fn(),
    onChoose: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<SwapDialog {...props} />)
  return props
}

describe('ExerciseSwapControls', () => {
  it('draws nothing where there is no session to revise', () => {
    const { container } = render(withSeam(null, <ExerciseSwapControls slot={SLOT} exerciseId="back-squat" />))
    expect(container).toBeEmptyDOMElement()
  })

  it('asks for the slot it sits on, once, and names the movement', async () => {
    const user = userEvent.setup()
    const api = seam()
    render(withSeam(api, <ExerciseSwapControls slot={SLOT} exerciseId="back-squat" />))

    const swap = screen.getByRole('button', { name: 'Swap back squat' })
    expect(swap).toHaveTextContent('Swap')
    await user.click(swap)

    expect(api.open).toHaveBeenCalledTimes(1)
    expect(api.open).toHaveBeenCalledWith(SLOT)
    expect(api.undo).not.toHaveBeenCalled()
  })

  it('offers no undo for a slot that has no predecessor', () => {
    render(withSeam(seam(), <ExerciseSwapControls slot={SLOT} exerciseId="back-squat" />))
    expect(screen.queryByRole('button', { name: /Undo swap/ })).not.toBeInTheDocument()
  })

  it('undoes to the movement it names, once', async () => {
    const user = userEvent.setup()
    const undoTarget = vi.fn(() => 'front-squat')
    const api = seam({ undoTarget })
    render(withSeam(api, <ExerciseSwapControls slot={SLOT} exerciseId="back-squat" />))

    expect(undoTarget).toHaveBeenCalledWith(SLOT)
    await user.click(screen.getByRole('button', { name: 'Undo swap — back to front squat' }))

    expect(api.undo).toHaveBeenCalledTimes(1)
    expect(api.undo).toHaveBeenCalledWith(SLOT)
    expect(api.open).not.toHaveBeenCalled()
  })

  it.each([false, true])('returns keyboard focus to the restored slot after Undo (separate controls: %s)', async (split) => {
    const user = userEvent.setup()
    const onUndo = vi.fn()
    render(<UndoFocusFixture split={split} onUndo={onUndo} />)
    await user.tab()
    expect(screen.getByRole('button', { name: 'Swap goblet squat' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Undo swap — back to back squat' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(onUndo).toHaveBeenCalledExactlyOnceWith(SLOT)
    expect(screen.getByRole('button', { name: 'Swap back squat' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Swap front squat' })).not.toHaveFocus()
    expect(screen.queryByRole('button', { name: /^Undo swap/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Swap goblet squat' })).not.toBeInTheDocument()
  })

  it('does not move focus for a composition change that was not an explicit Undo', async () => {
    const user = userEvent.setup()
    const api = seam()
    const view = (exerciseId: string) => withSeam(api, <>
      <button type="button">Continue reading</button>
      <ExerciseSwapControls slot={SLOT} exerciseId={exerciseId} />
    </>)
    const { rerender } = render(view('back-squat'))
    await user.click(screen.getByRole('button', { name: 'Continue reading' }))
    rerender(view('front-squat'))

    expect(screen.getByRole('button', { name: 'Continue reading' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Swap front squat' })).not.toHaveFocus()
    expect(api.undo).not.toHaveBeenCalled()
  })

  it('can keep only Swap in the name row while Undo is available elsewhere', async () => {
    const user = userEvent.setup()
    const api = seam({ undoTarget: () => 'front-squat' })
    render(withSeam(api, <ExerciseSwapControls slot={SLOT} exerciseId="back-squat" actions="swap" />))

    expect(screen.queryByRole('button', { name: /Undo swap/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Swap back squat' }))
    expect(api.open).toHaveBeenCalledExactlyOnceWith(SLOT)
    expect(api.undo).not.toHaveBeenCalled()
  })

  it('can place the full Undo action independently with its original target', async () => {
    const user = userEvent.setup()
    const api = seam({ undoTarget: () => 'front-squat' })
    render(withSeam(api, <ExerciseSwapControls slot={SLOT} exerciseId="back-squat" actions="undo" />))

    expect(screen.queryByRole('button', { name: 'Swap back squat' })).not.toBeInTheDocument()
    const undo = screen.getByRole('button', { name: 'Undo swap — back to front squat' })
    expect(undo).toHaveTextContent('Undo swap')
    await user.click(undo)
    expect(api.undo).toHaveBeenCalledExactlyOnceWith(SLOT)
    expect(api.open).not.toHaveBeenCalled()
  })

  it('adds no empty Undo row before a movement has been swapped', () => {
    const { container } = render(withSeam(seam(),
      <ExerciseSwapControls slot={SLOT} exerciseId="back-squat" actions="undo" />))
    expect(container).toBeEmptyDOMElement()
  })

  it.each(['swap', 'undo'] as const)('keeps a separately placed %s disabled while busy', async (actions) => {
    const user = userEvent.setup()
    const api = seam({ isBusy: () => true, undoTarget: () => 'front-squat' })
    render(withSeam(api, <ExerciseSwapControls slot={SLOT} exerciseId="back-squat" actions={actions} />))
    const control = screen.getByRole('button')
    expect(control).toBeDisabled()
    expect(control).toHaveAttribute('aria-busy', 'true')
    await user.click(control)
    expect(api.open).not.toHaveBeenCalled()
    expect(api.undo).not.toHaveBeenCalled()
  })

  it('is the quiet text action: no frame, no second card in the card', () => {
    const api = seam({ undoTarget: () => 'front-squat' })
    const { container } = render(
      withSeam(
        api,
        <Card heading="Strength">
          <ExerciseSwapControls slot={SLOT} exerciseId="back-squat" />
        </Card>,
      ),
    )

    for (const action of screen.getAllByRole('button')) {
      expect(action).toHaveClass('clr-text-action')
      expect(action).not.toHaveClass('clr-btn')
      expect(action).not.toHaveClass('clr-chamfer')
      expect(action).toHaveAttribute('type', 'button')
    }
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(container.querySelectorAll('.clr-card')).toHaveLength(1)
  })

  it('takes the keyboard like any other action', async () => {
    const user = userEvent.setup()
    const api = seam()
    render(withSeam(api, <ExerciseSwapControls slot={SLOT} exerciseId="back-squat" />))

    await user.tab()
    expect(screen.getByRole('button', { name: 'Swap back squat' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(api.open).toHaveBeenCalledTimes(1)
  })

  it('is busy by name and takes no second answer while a write is in flight', async () => {
    const user = userEvent.setup()
    const isBusy = vi.fn(() => true)
    const api = seam({ isBusy, undoTarget: () => 'front-squat' })
    render(withSeam(api, <ExerciseSwapControls slot={SLOT} exerciseId="back-squat" />))

    const swap = screen.getByRole('button', { name: 'Swap back squat' })
    const undo = screen.getByRole('button', { name: 'Undo swap — back to front squat' })
    expect(isBusy).toHaveBeenCalledWith(SLOT)
    for (const action of [swap, undo]) {
      expect(action).toBeDisabled()
      expect(action).toHaveAttribute('aria-busy', 'true')
    }

    await user.click(swap)
    await user.click(undo)
    expect(api.open).not.toHaveBeenCalled()
    expect(api.undo).not.toHaveBeenCalled()
  })

  it('is not busy at rest', () => {
    render(withSeam(seam(), <ExerciseSwapControls slot={SLOT} exerciseId="back-squat" />))
    const swap = screen.getByRole('button', { name: 'Swap back squat' })
    expect(swap).toBeEnabled()
    expect(swap).not.toHaveAttribute('aria-busy')
  })
})

describe('SwapDialog', () => {
  it('names the movement being replaced and how to keep it', async () => {
    const user = userEvent.setup()
    const props = renderDialog()

    expect(screen.getByRole('heading', { name: 'Swap back squat' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep back squat' }))

    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(props.onChoose).not.toHaveBeenCalled()
  })

  it('asks the plain question when nothing is open', () => {
    renderDialog({ exerciseId: null, options: { status: 'loading' } })
    expect(screen.getByRole('heading', { name: 'Swap movement' })).toBeInTheDocument()
  })

  it('reports the alternative that was picked, once', async () => {
    const user = userEvent.setup()
    const props = renderDialog()

    const list = screen.getByRole('list', { name: 'Alternatives' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    await user.click(within(list).getByRole('button', { name: /Split squat/ }))

    expect(props.onChoose).toHaveBeenCalledTimes(1)
    expect(props.onChoose).toHaveBeenCalledWith(SPLIT)
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('draws each alternative as one framed choice with its equipment inside', () => {
    renderDialog()

    const list = screen.getByRole('list', { name: 'Alternatives' })
    const choices = within(list).getAllByRole('button')
    expect(choices.map((choice) => choice.textContent)).toEqual([
      'Goblet squatKETTLE BELL',
      'Split squatBODY WEIGHT',
    ])
    for (const choice of choices) {
      expect(choice).toHaveClass('clr-btn', 'clr-chamfer')
      expect(choice).not.toHaveClass('clr-btn--primary')
    }
    expect(list.closest('dialog')?.querySelector('.clr-card')).toBeNull()
  })

  it('stops accepting a second pick while the write is in flight', async () => {
    const user = userEvent.setup()
    const props = renderDialog({ busy: true })

    const choice = screen.getByRole('button', { name: /Goblet squat/ })
    expect(choice).toBeDisabled()
    await user.click(choice)

    expect(props.onChoose).not.toHaveBeenCalled()
    // Keeping the movement is still on offer: the way out never locks.
    expect(screen.getByRole('button', { name: 'Keep back squat' })).toBeEnabled()
  })

  it('is truthfully busy while the alternatives load', () => {
    renderDialog({ options: { status: 'loading' } })

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Finding alternatives')
    expect(screen.queryByRole('list', { name: 'Alternatives' })).not.toBeInTheDocument()
  })

  it('names the failed read and retries it, once', async () => {
    const user = userEvent.setup()
    const error = createError(ErrorCode.NETWORK_OFFLINE)
    const options: SwapOptionsState = { status: 'error', error }
    const props = renderDialog({ options })

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Alternatives didn’t load')).toBeInTheDocument()
    expect(within(alert).getByText(error.message)).toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(props.onRetry).toHaveBeenCalledTimes(1)
    expect(props.onChoose).not.toHaveBeenCalled()
  })

  it('says an over-filtered slot plainly, and offers no retry for a read that worked', () => {
    renderDialog({ options: { status: 'empty' } })

    expect(screen.getByText('Nothing else fits this slot')).toBeInTheDocument()
    expect(
      screen.getByText('Everything this location can do here is already in the workout.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep back squat' })).toBeInTheDocument()
  })
})

describe('equipmentText', () => {
  it('says the equipment plainly', () => {
    expect(equipmentText('kettle-bell')).toBe('KETTLE BELL')
    expect(equipmentText('body_weight')).toBe('BODY WEIGHT')
  })
})
