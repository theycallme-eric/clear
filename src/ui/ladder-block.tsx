/**
 * EXE-04a — the ladder block: one rep pattern, stated once, and the rung the
 * user actually reached.
 *
 * `ladder-for-time.md` opens with the defect this renderer exists to end: the
 * old card repeated `"2-4-6-8-10-8-6-4-2 each reps"` on *every* movement line,
 * which is both unreadable and a second source of truth for a pattern that
 * belongs to the block. So the hierarchy here is the spec's three tiers —
 * **LADDER** (the pattern, once) · **EACH RUNG** (what is performed at each of
 * those numbers) · the movements, named and nothing more.
 *
 * The rungs come from `target_sequence`, an `int[]`, through `state/ladder.ts`.
 * Nothing in this file splits a string, because the schema holds no string to
 * split (DATA_MODEL §`workout_exercises`).
 *
 * **How a ladder ends** is the other half. A For Time ladder has two endings
 * and they record different things (`ladder-for-time.md` §3): finishing the
 * pattern, or running into the cap having got part-way. The user says which,
 * and the cap-hit answer is what opens the rung selection — *how far did you
 * get?* — whose answer becomes `highest_rung` on the block's row.
 *
 * What this renderer deliberately does **not** own:
 *   · **the clock.** `elapsed_seconds` and `completed_under_cap` are EXE-04b's,
 *     and a cap countdown invented here would be a second timer for the same
 *     structure. The ending is therefore *declared* rather than observed, and
 *     when EXE-04b lands it drives this same state from the real clock.
 *   · **the write.** The outcome goes to `BlockCompletionControl` and the shell
 *     writes the row, once, for every structure type (EXE-01).
 *
 * `highest_rung` is the **rung number**, not the rep target — "which rung was
 * reached" (DATA_MODEL §`block_results`). The screen never says it that way:
 * a rung is identified to the user by its target, per the quickfix spec.
 */
import { useState, type CSSProperties } from 'react'

import { ChoiceGroup } from '../design-system/index'
import type { BlockOutcome } from '../state/block-completion'
import {
  ladderMovements,
  ladderRungs,
  ladderUnit,
  type LadderRung,
} from '../state/ladder'
import { exerciseName, targetText } from '../state/prescription'
import type { ExerciseProgress } from '../state/workout-progress'
import { BlockCompletionControl } from './block-completion-control'
import type { BlockRendererProps } from './block-renderers'
import { Card } from './card'
import { Heading, HeadingSection } from './Heading'
import { LadderRungs } from './ladder-rungs'
import { StructureBadge } from './workout-chrome'

/**
 * How the block ended, as the user says it.
 *
 * `undeclared` is a real third state rather than a default of either: a block
 * the user advanced past without answering recorded no ending, and guessing one
 * would be inventing a measurement (DATA_MODEL §8).
 */
type Ending = 'undeclared' | 'finished' | 'capped'

const ENDING_OPTIONS = [
  { value: 'finished', label: 'Finished the ladder' },
  { value: 'capped', label: 'Hit the time cap' },
]

/**
 * The outcome the block's row gets.
 *
 * Finishing reaches the last rung, so that is what is recorded — the ladder was
 * climbed to the top, and the fact is the rung, not a zero. A cap hit records
 * the rung the user chose, and records nothing at all if they chose none:
 * advancing without answering is allowed (`ladder-for-time.md` §3), and a
 * `highest_rung` nobody stated would be a guess.
 */
function ladderOutcome(
  ending: Ending,
  reached: number | null,
  rungs: readonly LadderRung[],
): BlockOutcome {
  if (rungs.length === 0) return {}

  switch (ending) {
    case 'finished':
      return { highestRung: rungs.length }
    case 'capped':
      return reached === null ? {} : { highestRung: reached }
    case 'undeclared':
      return {}
  }
}

export function LadderBlock({ block }: BlockRendererProps) {
  const [ending, setEnding] = useState<Ending>('undeclared')
  const [reached, setReached] = useState<number | null>(null)

  const rungs = ladderRungs(block.exercises)
  const unit = ladderUnit(block.exercises)
  const { laddered, interval } = ladderMovements(block.exercises)

  return (
    <Card>
      <div className="clr-stack" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="clr-row" style={{ justifyContent: 'space-between' }}>
          <StructureBadge identity={block.identity} />
          <span style={labelStyle}>
            {block.exerciseCount} {block.exerciseCount === 1 ? 'movement' : 'movements'}
          </span>
        </div>

        {block.exercises.length === 0 ? (
          <p style={{ margin: 0 }}>
            Nothing left to perform in this block — every movement in it was swapped
            out.
          </p>
        ) : (
          <>
            {rungs.length === 0 ? (
              // A ladder scheme with no sequence on any movement: the block is
              // malformed, and saying so is better than drawing an empty rail.
              <p style={{ margin: 0 }}>
                This ladder prescribes no rungs — perform the movements as written.
              </p>
            ) : ending === 'capped' ? (
              // The cap is where the row stops being a display and becomes the
              // question (`ladder-for-time.md` §3, Path B). One row, two modes
              // — never both at once.
              <LadderRungs
                rungs={rungs}
                unit={unit}
                label="How far did you get?"
                reached={reached}
                onSelect={setReached}
              />
            ) : (
              <LadderRungs
                rungs={rungs}
                unit={unit}
                label="Ladder"
                // Read-only while the block is being performed, and still
                // read-only once it is finished — with every rung climbed.
                reached={ending === 'finished' ? rungs.length : null}
              />
            )}

            {/*
              "Do all of these at each of those numbers." One movement needs no
              such line — the rungs already imply it (quickfix spec §1).
            */}
            {laddered.length > 1 && <p style={labelStyle}>Each rung</p>}

            <ul
              aria-label="Movements in this ladder"
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-200)',
              }}
            >
              {laddered.map((movement) => (
                <li key={movement.exerciseId}>
                  <LadderMovement movement={movement} companions={interval} />
                </li>
              ))}
              {/*
                A block whose scheme is a ladder but whose movements carry no
                sequence still has movements to name. They are listed plainly
                rather than as companions to a ladder that does not exist.
              */}
              {laddered.length === 0 &&
                interval.map((movement) => (
                  <li key={movement.exerciseId}>
                    <LadderMovement movement={movement} companions={[]} />
                  </li>
                ))}
            </ul>

            {rungs.length === 0 ? null : (
              <ChoiceGroup
                legend="How did this block end?"
                options={ENDING_OPTIONS}
                value={ending === 'undeclared' ? '' : ending}
                onChange={(value) => {
                  const chosen = Array.isArray(value) ? value[0] : value
                  setEnding(chosen === 'capped' ? 'capped' : 'finished')
                  // The rung only means something for a cap hit; finishing
                  // reached them all.
                  if (chosen !== 'capped') setReached(null)
                }}
              />
            )}
          </>
        )}

        <BlockCompletionControl
          blockId={block.blockId}
          outcome={ladderOutcome(ending, reached, rungs)}
        />
      </div>
    </Card>
  )
}

/**
 * One movement of the ladder: its name, and nothing that repeats the pattern.
 *
 * The companions are the `ladder_fixed_interval` case — a fixed target
 * performed between each rung, which the spec says is an annotation under the
 * primary movement rather than a peer card of its own. Stated under every
 * laddered movement because it is performed between the rungs of the ladder,
 * which all of them share.
 */
function LadderMovement({
  movement,
  companions,
}: {
  movement: ExerciseProgress
  companions: readonly ExerciseProgress[]
}) {
  return (
    <HeadingSection
      className="clr-stack--tight"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <Heading style={{ margin: 0, textTransform: 'uppercase' }}>
        {exerciseName(movement.prescription.exercise_id)}
      </Heading>
      {companions.map((companion) => (
        <p key={companion.exerciseId} style={{ margin: 0 }}>
          {targetText(companion.prescription)}{' '}
          {exerciseName(companion.prescription.exercise_id)} between each rung
        </p>
      ))}
    </HeadingSection>
  )
}

const labelStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--label-xs-size)',
  letterSpacing: 'var(--tracking-data)',
  textTransform: 'uppercase',
  color: 'var(--text-card-label)',
}
