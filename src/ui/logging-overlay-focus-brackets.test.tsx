/**
 * TASK-041 — intentional keyboard focus stays visible inside an open log
 * (REQ-018; C58, P02: "retain modal focus and intentional keyboard focus on
 * controls").
 *
 * Found by the route proof (`e2e/refinement/task-041.spec.ts`): the app runs
 * Foundation's `FocusBrackets`, whose one bracket layer is appended to the
 * page body, and in brackets mode a focused button draws no outline of its
 * own. A native modal is in the top layer, above everything in the body, so
 * with a log open the brackets were drawn underneath it: Tab moved through the
 * log's controls with nothing visible on them. `LoggingOverlay` now hosts that
 * one layer inside itself while it is open and hands it back to the body when
 * it closes or unmounts — the same move the deadline aura makes (TASK-008).
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FocusBrackets } from '../design-system/index'
import { LoggingOverlay } from './refinements/logging-overlay'

function App({ open, overlay = true }: { open: boolean; overlay?: boolean }) {
  return (
    <>
      <FocusBrackets />
      <button type="button">Rest</button>
      {overlay ? (
        <LoggingOverlay open={open} title="Log set 1" onClose={() => {}}>
          <button type="button">Log set 1</button>
        </LoggingOverlay>
      ) : null}
    </>
  )
}

const layers = () => document.querySelectorAll<HTMLElement>('.clr-focus-brackets')

describe('TASK-041 LoggingOverlay hosts the focus brackets while open', () => {
  it('moves the one bracket layer into the open log and back to the body when it closes', () => {
    const { rerender } = render(<App open={false} />)
    expect(layers()).toHaveLength(1)
    expect(layers()[0].parentElement).toBe(document.body)

    rerender(<App open />)
    const dialog = screen.getByRole('dialog', { name: 'Log set 1' })
    expect(layers()).toHaveLength(1)
    expect(layers()[0].parentElement).toBe(dialog)
    // Decorative and outside the reading order, wherever it is drawn.
    expect(layers()[0]).toHaveAttribute('aria-hidden', 'true')
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent || button.getAttribute('aria-label')))
      .toEqual(['Close log', 'Log set 1'])

    rerender(<App open={false} />)
    expect(layers()).toHaveLength(1)
    expect(layers()[0].parentElement).toBe(document.body)
  })

  it('hands the layer back to the body when an open log unmounts, so the page keeps its brackets', () => {
    const { rerender, unmount } = render(<App open />)
    expect(layers()[0].parentElement).toBe(screen.getByRole('dialog', { name: 'Log set 1' }))
    rerender(<App open overlay={false} />)
    expect(layers()).toHaveLength(1)
    expect(layers()[0].parentElement).toBe(document.body)
    unmount()
    expect(layers()).toHaveLength(0)
  })

  it('does nothing where no bracket layer is mounted', () => {
    render(
      <LoggingOverlay open title="Log set 1" onClose={() => {}}>
        <button type="button">Log set 1</button>
      </LoggingOverlay>,
    )
    expect(screen.getByRole('dialog', { name: 'Log set 1' })).toBeInTheDocument()
    expect(layers()).toHaveLength(0)
  })
})
