/**
 * DS-05 acceptance, dialog half: the app wrapper gives the shipped Dialog its
 * entrance (`clr-app-dialog-enter` composes trace + materialize + cut-in from
 * `src/styles/app-motion.css`) and its exit (`.clr-phosphor-out` runs before
 * the platform close). Esc still dismisses — through the same animated path —
 * and when the animation cannot run the close is immediate; nothing waits.
 */
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/render'
import { AppDialog } from './app-dialog'

afterEach(() => vi.restoreAllMocks())

/** Report the phosphor exit as a running animation on the leaving <dialog>. */
function mockPhosphorOutRuns() {
  const original = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = original(element, pseudo)
    if (!(element instanceof Element) || !element.classList.contains('clr-phosphor-out')) {
      return style
    }
    return new Proxy(style, {
      get(target, property) {
        if (property === 'animationName') return 'clr-phosphor-out'
        const value = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  })
}

function getDialog(): HTMLDialogElement {
  const dialog = document.querySelector('dialog')
  if (!dialog) throw new Error('no dialog rendered')
  return dialog
}

/** jsdom has no AnimationEvent; build the end event by hand. */
function fireAnimationEnd(element: Element, animationName: string) {
  const event = new Event('animationend', { bubbles: true })
  Object.assign(event, { animationName })
  fireEvent(element, event)
}

describe('entrance — a dialog constructs itself', () => {
  it('opens via showModal wearing the composed entrance class', () => {
    renderWithProviders(
      <AppDialog open onClose={() => {}} title="Why this number">
        Body copy
      </AppDialog>,
    )

    const dialog = getDialog()
    expect(dialog.open).toBe(true)
    expect(dialog).toHaveClass('clr-app-dialog-enter')
    // Visibly distinct from a toast's arrival: no phosphor-in anywhere.
    expect(dialog.querySelector('.clr-phosphor-in')).toBeNull()
    expect(dialog).not.toHaveClass('clr-phosphor-in')
  })

  it('keeps the consumer className alongside the motion class', () => {
    renderWithProviders(
      <AppDialog open onClose={() => {}} className="app-extra">
        Body
      </AppDialog>,
    )

    expect(getDialog()).toHaveClass('clr-dialog', 'clr-app-dialog-enter', 'app-extra')
  })
})

describe('dismissal — phosphor-out before the platform close', () => {
  it('holds the dialog open through the exit animation, then closes', () => {
    mockPhosphorOutRuns()
    const onClose = vi.fn()
    const view = renderWithProviders(
      <AppDialog open onClose={onClose} title="Why this number">
        Body
      </AppDialog>,
    )

    view.rerender(
      <AppDialog open={false} onClose={onClose} title="Why this number">
        Body
      </AppDialog>,
    )

    // Mid-animation: still open, decaying, no longer wearing the entrance.
    const dialog = getDialog()
    expect(dialog.open).toBe(true)
    expect(dialog).toHaveClass('clr-phosphor-out')
    expect(dialog).not.toHaveClass('clr-app-dialog-enter')

    fireAnimationEnd(dialog, 'clr-phosphor-out')

    expect(dialog.open).toBe(false)
    // The wrapper staged this close itself; no extra onClose report.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes immediately when the exit animation cannot run — nothing waits', () => {
    const onClose = vi.fn()
    const view = renderWithProviders(
      <AppDialog open onClose={onClose}>
        Body
      </AppDialog>,
    )

    view.rerender(
      <AppDialog open={false} onClose={onClose}>
        Body
      </AppDialog>,
    )

    expect(getDialog().open).toBe(false)
  })

  it('Esc reports one dismissal and leaves the close to the animated path', () => {
    const onClose = vi.fn()
    renderWithProviders(
      <AppDialog open onClose={onClose}>
        Body
      </AppDialog>,
    )

    const dialog = getDialog()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))

    // The wrapper cancelled the instant native close and reported the
    // dismissal; the dialog stays open until the controlling parent reacts.
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dialog.open).toBe(true)
  })

  it('a close the wrapper did not stage still lands closed, reported once', () => {
    const onClose = vi.fn()
    renderWithProviders(
      <AppDialog open onClose={onClose}>
        Body
      </AppDialog>,
    )

    const dialog = getDialog()
    // form method="dialog" or an uncancellable platform close.
    dialog.close()

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dialog.open).toBe(false)
    expect(dialog).not.toHaveClass('clr-phosphor-out')
  })
})

describe('platform contract preserved', () => {
  it('renders a real <dialog> with the shipped chamfered panel and title', () => {
    renderWithProviders(
      <AppDialog open onClose={() => {}} title="Why this number">
        Body copy
      </AppDialog>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Why this number' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog.querySelector('.clr-chamfer')).not.toBeNull()
  })
})
