/**
 * FAV-01's save-as-favorite control — one control, two screens.
 *
 * Summary offers it for the session just debriefed and Session Detail
 * (REQ-003) for any completed session in the record. It is the same component
 * rather than a second copy so "the same one-tap behavior" is a fact of the
 * code rather than a promise two files keep: same read, same write, same two
 * outcomes reported in place.
 */
import { useState, type CSSProperties } from 'react'

import { Button, Star } from '../design-system/index'
import { useAuth } from '../state/auth-context'
import { isErr } from '../state/errors'
import { favoritesQueryKey, useFavoritesQuery } from '../state/favorite-queries'
import { favoriteDraft } from '../state/favorites'
import { useQueryClient } from '../state/query'
import { useWorkoutClients } from '../state/workout-queries'

export const SAVE_FAVORITE_LABEL = 'Save as favorite'
export const SAVED_FAVORITE_LABEL = 'Saved to favorites'
export const SAVE_FAVORITE_FAILED =
  'That workout wasn’t saved as a favorite. Try again.'

/**
 * One tap, no naming modal — favorites-v2 §"Favoriting a Workout" is explicit
 * that the favorite inherits the workout's own title and that there is no
 * ceremony around it.
 *
 * What it saves is **SES-01b's *intended at start* reconstruction**, not the
 * session row and not what was performed: the workout a person means when they
 * say "this one again" is the one they set out to do, after any swap they made
 * before starting and before anything they logged or skipped. `favoriteDraft`
 * turns that into the snapshot plus the metadata the list reads, stamped with
 * the contract version this build writes.
 *
 * It is a control rather than a data-driven view, which is why it has two
 * states and not four. It *reads* the favorites list to know whether this
 * session is already saved, and every answer that read can give is still
 * handled: while it is settling the control is busy, and a read that failed
 * leaves the control offering to save — which is safe, because saving one
 * twice answers the row that is already there rather than writing a second.
 * Rendering a retry for a list nobody asked to see would be asking the user to
 * repair a read they did not make.
 */
export function FavoriteToggle({ sessionId }: { sessionId: string }) {
  const { user } = useAuth()
  const { sessions, favorites } = useWorkoutClients()
  const query = useFavoritesQuery()
  const cache = useQueryClient()

  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const saved =
    query.state.status === 'ready' &&
    query.state.data.some((row) => row.original_session_id === sessionId)

  async function save() {
    if (user === null) return

    setSaving(true)
    setFailed(false)

    // Three steps, and the order is the requirement: read what was intended,
    // turn it into a snapshot that validates, then write both rows in the one
    // transaction `save_favorite` is.
    const reconstruction = await sessions.asIntendedAtStart(sessionId)
    if (isErr(reconstruction)) {
      setSaving(false)
      setFailed(true)
      return
    }

    const draft = favoriteDraft(reconstruction.value)
    if (isErr(draft)) {
      setSaving(false)
      setFailed(true)
      return
    }

    const written = await favorites.save(user.id, draft.value)
    setSaving(false)

    if (isErr(written)) {
      setFailed(true)
      return
    }

    // The cache holds what the database now holds, newest first, so the
    // favorites tab shows it without a second read and this control knows it
    // is saved without asking again.
    const held = query.state.status === 'ready' ? query.state.data : []
    cache.setData(favoritesQueryKey(user.id), [
      written.value,
      ...held.filter((row) => row.id !== written.value.id),
    ])
  }

  return (
    <div className="clr-stack clr-stack--tight">
      <span className="label">Favorite</span>
      {failed && (
        <p role="alert" style={{ margin: 0, color: 'var(--text-negative)' }}>
          {SAVE_FAVORITE_FAILED}
        </p>
      )}
      {saved ? (
        // Not a button: it has already happened, and a control that could only
        // be pressed again to do the same thing is not an action. Unfavoriting
        // lives where the favorite does — the Favorites tab, behind its confirm.
        <p role="status" style={SAVED_STYLE}>
          <span aria-hidden="true" style={{ display: 'flex' }}>
            <Star size={16} />
          </span>
          {SAVED_FAVORITE_LABEL}
        </p>
      ) : (
        <Button
          variant="secondary"
          icon={<Star size={20} />}
          loading={saving || query.state.status === 'loading'}
          onClick={() => void save()}
        >
          {SAVE_FAVORITE_LABEL}
        </Button>
      )}
    </div>
  )
}

const SAVED_STYLE: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacing-200)',
  color: 'var(--text-selected)',
}
