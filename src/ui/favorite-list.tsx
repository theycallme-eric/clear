/**
 * FAV-01's list, as the one app-owned domain component it needs.
 *
 * `FavoriteListItem` is the favorites-v2 §"Favorites Tab" card: the same frame
 * as a history row, with the progression the favorite is *for* printed on it —
 * title with its star, anchor · duration · intensity, and how many times it has
 * been done. It is deliberately the same `Card` as `WorkoutListItem` rather than
 * a second list idiom, because a favorite is a workout and the tab beside it is
 * showing the same kind of thing.
 *
 * Two rules it keeps:
 *
 *   · **The star is never the only thing saying this is a favorite.** It is a
 *     favorite because it is in the Favorites tab, and the glyph is decoration
 *     that agrees with the tab rather than the only cue for it.
 *   · **A snapshot this build cannot read says so, in words, where the action
 *     would be.** That is the acceptance criterion about a favorite predating a
 *     breaking contract change: the Start control is *absent* — not disabled —
 *     and the sentence in its place explains what happened and what to do
 *     instead. A disabled button with a tooltip would be an affordance that
 *     lies, and a button that failed on press would be the obscure failure the
 *     requirement exists to prevent.
 */
import type { CSSProperties } from 'react'

import { AlertCircle, Button, Play, Star, Trash } from '../design-system/index'
import {
  completionSummary,
  OUTDATED_SNAPSHOT_MESSAGE,
  type FavoriteEntry,
} from '../state/favorites'
import { Card } from './card'
import { Heading, HeadingSection } from './Heading'

export const START_FAVORITE_LABEL = 'Start'
export const REMOVE_FAVORITE_LABEL = 'Remove from favorites'

const META_STYLE: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-card-label)',
  margin: 0,
}

const TITLE_STYLE: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--heading-h5-size)',
  color: 'var(--text-card-header)',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacing-200)',
}

const OUTDATED_STYLE: CSSProperties = {
  ...META_STYLE,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--spacing-200)',
  color: 'var(--text-negative)',
}

const ACTIONS_STYLE: CSSProperties = {
  flexWrap: 'wrap',
  gap: 'var(--spacing-100)',
  marginTop: 'var(--spacing-200)',
}

export interface FavoriteListItemProps {
  entry: FavoriteEntry
  /** Restarts it: restore the snapshot and review it. No generation call. */
  onStart: (entry: FavoriteEntry) => void
  /** Unfavorite. The caller confirms first — the progression is deleted. */
  onRemove: (entry: FavoriteEntry) => void
  /** This one's removal is in flight. */
  removing?: boolean
}

export function FavoriteListItem({
  entry,
  onStart,
  onRemove,
  removing = false,
}: FavoriteListItemProps) {
  return (
    <HeadingSection>
      <Card>
        <Heading style={TITLE_STYLE}>
          <span aria-hidden="true" style={{ display: 'flex' }}>
            <Star size={16} />
          </span>
          {entry.title}
        </Heading>
        <p style={{ ...META_STYLE, marginTop: 'var(--spacing-200)' }}>{entry.meta}</p>
        <p style={META_STYLE}>{completionSummary(entry)}</p>

        {!entry.restorable && (
          <p style={OUTDATED_STYLE} role="note">
            <span aria-hidden="true" style={{ display: 'flex' }}>
              <AlertCircle size={16} />
            </span>
            {OUTDATED_SNAPSHOT_MESSAGE}
          </p>
        )}

        <div className="clr-row" style={ACTIONS_STYLE}>
          {entry.restorable && (
            <Button
              variant="secondary"
              icon={<Play size={16} />}
              disabled={removing}
              onClick={() => onStart(entry)}
            >
              {START_FAVORITE_LABEL}
            </Button>
          )}
          {/* Quiet, and second: removing a favorite deletes the progression it
              was kept for, so it is not offered as a peer of starting it. */}
          <Button
            variant="quiet"
            icon={<Trash size={16} />}
            loading={removing}
            onClick={() => onRemove(entry)}
          >
            {REMOVE_FAVORITE_LABEL}
          </Button>
        </div>
      </Card>
    </HeadingSection>
  )
}

export interface FavoriteListProps {
  entries: readonly FavoriteEntry[]
  /** Names the list for assistive technology — "Favorites". */
  label: string
  onStart: (entry: FavoriteEntry) => void
  onRemove: (entry: FavoriteEntry) => void
  /** The id of the favorite whose removal is in flight, if any. */
  removingId?: string | null
}

/** The favorites the user keeps, newest first, as a real list. */
export function FavoriteList({
  entries,
  label,
  onStart,
  onRemove,
  removingId = null,
}: FavoriteListProps) {
  return (
    <ul
      aria-label={label}
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gap: 'var(--spacing-300)',
      }}
    >
      {entries.map((entry) => (
        <li key={entry.key}>
          <FavoriteListItem
            entry={entry}
            onStart={onStart}
            onRemove={onRemove}
            removing={entry.id === removingId}
          />
        </li>
      ))}
    </ul>
  )
}
