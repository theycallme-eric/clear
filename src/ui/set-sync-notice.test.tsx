/**
 * EXE-07's last acceptance criterion, as a test: *sustained failure surfaces
 * once, factually, with the count of unsynced sets — not a toast per set.*
 *
 * Each clause is asserted separately, because each one is a way this could go
 * wrong: it is silent while there is nothing sustained to say; it states a
 * number rather than a list; there is exactly one region no matter how many
 * sets are waiting; and it says where the work is rather than apologising for
 * losing it, because it has not been lost.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SetLoggingContext, type SetLoggingApi } from '../state/set-logging'
import { SetSyncNotice, unsyncedSetsText } from './set-sync-notice'

function mount(
  sync: SetLoggingApi['sync'],
  retrySync: () => void = () => {},
): void {
  const api: SetLoggingApi = {
    weightUnit: 'kg',
    logSet: vi.fn(),
    loggedSets: () => [],
    isSaving: () => false,
    sync,
    retrySync,
  }

  render(
    <SetLoggingContext value={api}>
      <SetSyncNotice />
    </SetLoggingContext>,
  )
}

describe('the notice appears only when there is something sustained to say', () => {
  it('says nothing while everything is synced', () => {
    mount({ unsyncedCount: 0, sustainedFailure: false, syncing: false })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('says nothing while a set is merely on its way', () => {
    // An ordinary write between sets is not news, and a notice per attempt is
    // the per-set toast the requirement rules out.
    mount({ unsyncedCount: 1, sustainedFailure: false, syncing: true })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('states it once, with the count, when the signal is actually gone', () => {
    mount({ unsyncedCount: 3, sustainedFailure: true, syncing: false })

    const notices = screen.getAllByRole('status')
    expect(notices).toHaveLength(1)
    expect(notices[0]).toHaveTextContent('3 sets are saved on this device')
    // Factual about where the work is: it is held, not lost.
    expect(notices[0]).toHaveTextContent('Nothing is lost')
  })

  it('is polite rather than an alert, because the user is mid-set', () => {
    mount({ unsyncedCount: 2, sustainedFailure: true, syncing: false })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

describe('what the count reads as', () => {
  it('writes the singular and the plural out', () => {
    expect(unsyncedSetsText(1)).toContain('1 set is saved on this device')
    expect(unsyncedSetsText(4)).toContain('4 sets are saved on this device')
  })
})

describe('the one action it offers', () => {
  it('flushes the queue now', async () => {
    const user = userEvent.setup()
    const retrySync = vi.fn()
    mount({ unsyncedCount: 1, sustainedFailure: true, syncing: false }, retrySync)

    await user.click(screen.getByRole('button', { name: 'Try now' }))

    expect(retrySync).toHaveBeenCalledTimes(1)
  })

  it('says a pass is already running rather than inviting a second', () => {
    mount({ unsyncedCount: 1, sustainedFailure: true, syncing: true })

    expect(screen.getByRole('button', { name: 'Try now' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })
})

describe('how it is drawn', () => {
  it('is one urgency card, with its heading, its glyph and its action inside', () => {
    mount({ unsyncedCount: 2, sustainedFailure: true, syncing: false })

    const notice = screen.getByRole('status')
    expect(notice.querySelectorAll('.clr-card')).toHaveLength(1)
    expect(notice.querySelectorAll('.clr-card__bar')).toHaveLength(1)

    const body = notice.querySelector('.clr-card__body') as HTMLElement
    expect(body).toHaveClass('clr-chamfer--urgency')
    const heading = screen.getByRole('heading', { name: 'Sets waiting to sync' })
    expect(body).toContainElement(heading)
    // Severity is a glyph beside the words, not the card's colour alone.
    expect(heading.querySelector('svg')).not.toBeNull()
    expect(body).toContainElement(screen.getByRole('button', { name: 'Try now' }))
  })

  it('claims the view’s loop only while a pass is running', () => {
    mount({ unsyncedCount: 1, sustainedFailure: true, syncing: true })
    const running = screen.getByRole('button', { name: 'Try now' }).closest('[data-loop]')
    expect(running).toHaveAttribute('data-loop', 'run')
  })

  it('claims nothing while it is only waiting', () => {
    mount({ unsyncedCount: 1, sustainedFailure: true, syncing: false })
    const idle = screen.getByRole('button', { name: 'Try now' }).closest('[data-loop]')
    expect(idle).toHaveAttribute('data-loop', 'still')
  })
})
