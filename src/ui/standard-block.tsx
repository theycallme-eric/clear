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
 * It draws with the shared block frame (`block-renderers-frame.tsx`): the one
 * card, the identity row and the single completion are `BlockPanel`'s, and the
 * movements are rows of its list — never a card inside the card.
 *
 * The block's own state is not a query and has no four states of its own: the
 * shell owns loading and error for the session, and a block with no active
 * prescriptions left is a real, drawable case rather than an empty view —
 * everything in it was swapped out, and it says so.
 */
import type { BlockRendererProps } from './block-renderers'
import { BlockPanel } from './block-renderers-frame'
import { ExerciseSetLogger } from './set-logger'

export function StandardBlock({ block }: BlockRendererProps) {
  return (
    <BlockPanel block={block}>
      {block.exercises.length === 0 ? (
        <BlockPanel.EmptyNote />
      ) : (
        <BlockPanel.MovementList label="Movements in this block">
          {block.exercises.map((exercise) => (
            <BlockPanel.MovementItem key={exercise.exerciseId}>
              <ExerciseSetLogger exercise={exercise} />
            </BlockPanel.MovementItem>
          ))}
        </BlockPanel.MovementList>
      )}
    </BlockPanel>
  )
}
