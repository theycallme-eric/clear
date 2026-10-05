/**
 * EXE-07 — the one thing the shell says about a signal that is gone.
 *
 * The requirement is precise about the shape of this, and the shape is the
 * whole point: *sustained* failure surfaces *once*, *factually*, with the
 * *count* of unsynced sets — not a toast per set. So this is one region that
 * states a number, not a queue of messages; it appears only once a set has
 * been refused more than once, so an ordinary hiccup between sets says nothing
 * here; and it never says the work is lost, because it is not — it is on this
 * device, and it is still being retried.
 *
 * It is a polite `role="status"`, not an alert. A person mid-set is not in a
 * position to act on an interruption, the app is already recovering on its
 * own, and the one action offered is an accelerator rather than a repair.
 *
 * Severity is carried by a glyph and a sentence before it is carried by a hue.
 *
 * It is one card on the urgency role, with its heading and its one action
 * inside it. A pass already under way scans the button, and that scan takes
 * the view's one loop in turn with the rest timer and any loading region.
 */
import { AlertTriangle, Button } from '../design-system/index'
import { useSetLogging } from '../state/set-logging'
import { Card } from './card'
import { useInterfaceLoop } from './motion'

/** The count, as a sentence. Singular and plural are written out, not `(s)`. */
export function unsyncedSetsText(count: number): string {
  return count === 1
    ? '1 set is saved on this device and hasn’t reached the server yet.'
    : `${count} sets are saved on this device and haven’t reached the server yet.`
}

/**
 * What the shell renders for the session's sync state. Nothing, almost always:
 * a queue that is emptying is the normal case and needs no commentary.
 */
export function SetSyncNotice() {
  const { sync, retrySync } = useSetLogging()

  const shown = sync.sustainedFailure && sync.unsyncedCount > 0
  const loop = useInterfaceLoop('busy', shown && sync.syncing)

  if (!shown) return null

  return (
    // The card's own `role` is its colour role, so the live region wraps it.
    <div role="status">
      <Card
        role="urgency"
        heading={
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--spacing-200)',
              color: 'var(--icon-toast-negative)',
            }}
          >
            <span aria-hidden="true" style={{ display: 'flex' }}>
              <AlertTriangle />
            </span>
            Sets waiting to sync
          </span>
        }
      >
        <p style={{ margin: 0 }}>
          {unsyncedSetsText(sync.unsyncedCount)} Nothing is lost — they’ll be sent when
          the connection returns, and logging the next set still works.
        </p>

        <div {...loop}>
          <Button variant="secondary" onClick={retrySync} loading={sync.syncing}>
            Try now
          </Button>
        </div>
      </Card>
    </div>
  )
}
