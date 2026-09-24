/**
 * EXE-02 — the standard block: straight sets of one or more movements, logged
 * as they happen.
 *
 * It is the simplest structure in the app and the one every other renderer
 * borrows from, so what it establishes matters more than what it draws:
 *
 *   · a movement's card is `ExerciseSetLogger`, which reads the structured
 *     prescription and writes each set through the shell's one path;
 *   · rest belongs to the movement here, and only to it. A standard block runs
 *     no rounds, so `round_rest_seconds` has nothing to say — the superset
 *     renderer is where block-level rest, "after both movements", lives;
 *   · completion is `BlockCompletionControl` with an empty outcome, because a
 *     standard block observes nothing a clock would have measured. A zero it
 *     never watched would be a measurement (DATA_MODEL §8).
 *
 * The block's own state is not a query and has no four states of its own: the
 * shell owns loading and error for the session, and a block with no active
 * prescriptions left is a real, drawable case rather than an empty view —
 * everything in it was swapped out, and it says so.
 */
import type { BlockRendererProps } from './block-renderers'
import { BlockCompletionControl } from './block-completion-control'
import { Card } from './card'
import { ExerciseSetLogger } from './set-logger'
import { StructureBadge } from './workout-chrome'

export function StandardBlock({ block }: BlockRendererProps) {
  return (
    <Card>
      <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="clr-row" style={{ justifyContent: 'space-between' }}>
          <StructureBadge identity={block.identity} />
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 'var(--label-xs-size)',
              letterSpacing: 'var(--tracking-data)',
              color: 'var(--text-card-label)',
            }}
          >
            {block.exerciseCount} {block.exerciseCount === 1 ? 'movement' : 'movements'}
          </span>
        </div>

        {block.exercises.length === 0 ? (
          <p style={{ margin: 0 }}>
            Nothing left to perform in this block — every movement in it was swapped
            out.
          </p>
        ) : (
          block.exercises.map((exercise) => (
            <ExerciseSetLogger key={exercise.exerciseId} exercise={exercise} />
          ))
        )}

        <BlockCompletionControl blockId={block.blockId} outcome={{}} />
      </div>
    </Card>
  )
}
