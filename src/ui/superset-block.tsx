/**
 * EXE-02 — the superset block: two (or more) movements performed back to back,
 * logged set by set like any other, and resting only once the pair is done.
 *
 * `StandardBlock` established what a set-logging renderer is; this one adds the
 * single thing that makes a superset a superset rather than two movements that
 * happen to share a card, and `superset-circuit-clarity.md` is emphatic that it
 * is exactly one thing — **the pairing**:
 *
 *   · **Order is the prescription.** A1 is performed, then A2, then back to A1.
 *     The ordinals come from `ExerciseProgress.position`, which
 *     `sessionProgress` derives by sorting on `order_index` — so the labels
 *     cannot drift from the order the rows prescribe, whatever order the read
 *     answered in (§1).
 *   · **Rest is the block's, and it comes after both movements.** The
 *     transition from A1 to A2 has no rest by definition, so a per-movement
 *     rest line here would state a rest the user is not meant to take (§2).
 *     The number is `workout_blocks.round_rest_seconds` — the block is where
 *     the clock lives, once, so the two members cannot disagree about it
 *     (DATA-01c §5) — and a block with no rest renders no rest line at all,
 *     never `Rest: 0s`.
 *   · **The pair is one unit.** The movements are connected by a rule down
 *     their left edge rather than separated by a divider (§4), and the
 *     alternation is stated in words above them, because a line is a colour cue
 *     and colour is never the only cue.
 *
 * Everything else is deliberately `StandardBlock`'s: `ExerciseSetLogger` reads
 * the structured prescription and writes each set through the shell's one path,
 * and completion is `BlockCompletionControl` with an empty outcome — a superset
 * runs no clock, and a zero it never watched would be a measurement
 * (DATA_MODEL §8).
 */
import type { CSSProperties } from 'react'

import type { BlockRendererProps } from './block-renderers'
import { BlockCompletionControl } from './block-completion-control'
import { Card } from './card'
import { ExerciseSetLogger } from './set-logger'
import { StructureBadge } from './workout-chrome'

/**
 * The label for one member of the pair: `A1`, `A2`, `A3`.
 *
 * One letter for the block and a number for the position within it, which is
 * the notation the whole app writes supersets in. A block is the group, so the
 * letter does not vary inside one.
 */
function supersetOrdinal(position: number): string {
  return `A${position}`
}

/**
 * How the block's rest is stated, or `null` when it prescribes none.
 *
 * "After both" is the whole point of the line: it is the pair's rest, taken
 * once the second movement is done, not a rest between them.
 */
function supersetRestText(seconds: number | null, movements: number): string | null {
  if (seconds === null || seconds <= 0) return null
  return `Rest ${seconds}s ${afterPhrase(movements)}`
}

function afterPhrase(movements: number): string {
  if (movements === 2) return 'after both movements'
  // A superset whose partner was swapped out is still a block with rest after
  // it; and a trio is a superset the generator is allowed to write.
  if (movements <= 1) return 'after the movement'
  return `after all ${movements} movements`
}

export function SupersetBlock({ block }: BlockRendererProps) {
  const movements = block.exercises
  const rest = supersetRestText(block.roundRestSeconds, movements.length)

  return (
    <Card>
      <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="clr-row" style={{ justifyContent: 'space-between' }}>
          <StructureBadge identity={block.identity} />
          <span style={labelStyle}>
            {block.exerciseCount} {block.exerciseCount === 1 ? 'movement' : 'movements'}
          </span>
        </div>

        {movements.length === 0 ? (
          <p style={{ margin: 0 }}>
            Nothing left to perform in this block — every movement in it was swapped
            out.
          </p>
        ) : (
          <>
            {/*
              The alternation in words. Two movements are the pair the spec
              describes; one is what is left of it after a swap, and saying
              "alternate" of a single movement would be a lie.
            */}
            {movements.length > 1 && (
              <p style={labelStyle}>
                Alternate{' '}
                {movements
                  .map((exercise) => supersetOrdinal(exercise.position))
                  .join(' → ')}{' '}
                — no rest between movements
              </p>
            )}

            {/*
              The connector: one rule down the left of the pair, so A1 and A2
              read as one linked unit. Inset from the card's own accent bar
              rather than replacing it, and it shifts no text — the padding it
              sits in is the component's, not the card's.
            */}
            <div
              className="clr-stack--tight"
              style={{
                display: 'flex',
                flexDirection: 'column',
                borderLeft:
                  movements.length > 1
                    ? 'var(--border-width) solid var(--border-frame-structure)'
                    : undefined,
                paddingLeft: movements.length > 1 ? 'var(--spacing-200)' : undefined,
              }}
            >
              {movements.map((exercise) => (
                <ExerciseSetLogger
                  key={exercise.exerciseId}
                  exercise={exercise}
                  ordinal={supersetOrdinal(exercise.position)}
                  // Rest here is the block's, stated once below the pair.
                  statesRest={false}
                />
              ))}
            </div>

            {rest === null ? null : <p style={{ margin: 0 }}>{rest}</p>}
          </>
        )}

        <BlockCompletionControl blockId={block.blockId} outcome={{}} />
      </div>
    </Card>
  )
}

const labelStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  color: 'var(--text-card-label)',
}
