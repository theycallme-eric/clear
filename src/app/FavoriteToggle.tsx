/**
 * FAV-01's save-as-favorite control — one control, two screens.
 *
 * Summary offers it for the session just debriefed and Session Detail
 * (REQ-003) for any completed session in the record. It is the same component
 * rather than a second copy so "the same one-tap behavior" is a fact of the
 * code rather than a promise two files keep: same read, same write, same two
 * outcomes reported in place — and, once saved, the same way back (U22).
 */
import { useRef, useState, type CSSProperties } from 'react'

import { Button, Star, Trash } from '../design-system/index'
import { useAuth } from '../state/auth-context'
import { isErr } from '../state/errors'
import {
  favoriteRunsQueryKey,
  favoritesQueryKey,
  useFavoritesQuery,
} from '../state/favorite-queries'
import { favoriteDraft } from '../state/favorites'
import { useQueryClient } from '../state/query'
import type { SavedWorkoutRow } from '../state/schemas'
import { useWorkoutClients } from '../state/workout-queries'
import {
  REMOVE_FAVORITE_FAILED,
  REMOVE_FAVORITE_LABEL,
  RemoveFavoriteDialog,
} from '../ui/favorite-list'

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
 *
 * **Undoing it (U22) is the Favorites tab's removal, not a second one.** The
 * same `favorites.remove` hard delete behind the same `RemoveFavoriteDialog`:
 * the favorite and its progression go, and the session it was saved from —
 * which is a row of training history, not of favorites — is never touched.
 */
export function FavoriteToggle({
  sessionId,
  compact = false,
}: {
  sessionId: string
  /** Omit the repeated field label when a footer already establishes context. */
  compact?: boolean
}) {
  const { user } = useAuth()
  const { sessions, favorites } = useWorkoutClients()
  const query = useFavoritesQuery()
  const cache = useQueryClient()

  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  // A second confirm landing before the first delete has answered must not
  // send a second delete: state updates are not yet visible to that press.
  const inFlight = useRef(false)

  const favorite =
    query.state.status === 'ready'
      ? query.state.data.find((row) => row.original_session_id === sessionId)
      : undefined
  const saved = favorite !== undefined

  async function save() {
    if (user === null) return

    setSaving(true)
    setFailed(null)

    // Three steps, and the order is the requirement: read what was intended,
    // turn it into a snapshot that validates, then write both rows in the one
    // transaction `save_favorite` is.
    const reconstruction = await sessions.asIntendedAtStart(sessionId)
    if (isErr(reconstruction)) {
      setSaving(false)
      setFailed(SAVE_FAVORITE_FAILED)
      return
    }

    const draft = favoriteDraft(reconstruction.value)
    if (isErr(draft)) {
      setSaving(false)
      setFailed(SAVE_FAVORITE_FAILED)
      return
    }

    const written = await favorites.save(user.id, draft.value)
    setSaving(false)

    if (isErr(written)) {
      setFailed(SAVE_FAVORITE_FAILED)
      return
    }

    // Other screens can change this shared list while the write is pending.
    // Merge into its current value, never the render that started the save.
    const key = favoritesQueryKey(user.id)
    const current = cache.getState<readonly SavedWorkoutRow[]>(key)
    if (current.status === 'ready') {
      cache.setData(key, [
        written.value,
        ...current.data.filter((row) => row.id !== written.value.id),
      ])
    } else {
      // A loading/failed list is not a known empty list. Let its real reader
      // resolve all rows rather than publishing a partial list from this write.
      cache.invalidate(key)
    }
  }

  async function remove() {
    setConfirming(false)
    if (user === null || favorite === undefined || inFlight.current) return

    inFlight.current = true
    setRemoving(true)
    setFailed(null)
    const removed = await favorites.remove(favorite.id)
    inFlight.current = false
    setRemoving(false)

    if (isErr(removed)) {
      setFailed(REMOVE_FAVORITE_FAILED)
      return
    }

    // Remove this row from the latest known list, or refresh an unresolved
    // list. Drop its cached progression as well. History's caches are left
    // alone: the session was never part of what was removed.
    const key = favoritesQueryKey(user.id)
    const current = cache.getState<readonly SavedWorkoutRow[]>(key)
    if (current.status === 'ready') {
      cache.setData(key, current.data.filter((row) => row.id !== favorite.id))
    } else {
      cache.invalidate(key)
    }
    cache.invalidate(favoriteRunsQueryKey(favorite.id))
  }

  const content = (
    <>
      {!compact && <span className="label">Favorite</span>}
      {failed !== null && (
        <p role="alert" style={{ margin: 0, color: 'var(--text-negative)' }}>
          {failed}
        </p>
      )}
      {saved ? (
        <>
          {/* The outcome is a status rather than a button: pressing it again
              would not save it again. The way back is its own quiet action,
              behind the same confirm the Favorites tab asks. */}
          <p role="status" style={SAVED_STYLE}>
            <span aria-hidden="true" style={{ display: 'flex' }}>
              <Star size={16} />
            </span>
            {SAVED_FAVORITE_LABEL}
          </p>
          <Button
            variant="quiet"
            icon={<Trash size={16} />}
            loading={removing}
            onClick={() => setConfirming(true)}
          >
            {REMOVE_FAVORITE_LABEL}
          </Button>
        </>
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
      {/* An overlay, not content: it renders nothing until it is asked. */}
      <RemoveFavoriteDialog
        open={confirming}
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    </>
  )

  return compact ? content : <div className="clr-stack clr-stack--tight">{content}</div>
}

const SAVED_STYLE: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacing-200)',
  color: 'var(--text-selected)',
}
