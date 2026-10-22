/**
 * EXE-01 — which renderer performs a block, and what every one of them is
 * allowed to do about completing it.
 *
 * The requirement splits the work in two: a renderer supplies the outcome
 * fields its structure observed, and the shell writes the row. This registry is
 * where that split is made structural rather than remembered. It is total over
 * `structure_type`, so EXE-02…EXE-04c land by replacing an entry — and a new
 * structure type fails to compile until something renders it, instead of
 * quietly falling through to a panel that records nothing.
 *
 * A renderer receives the block and completes it through
 * `BlockCompletionControl`, the one component in this layer that calls the
 * seam. It is given no client, no callback and no row: the only thing it can do
 * with an outcome is hand it to the shell, which is what keeps `block_results`
 * to one writer for every structure type.
 *
 * `standard` is EXE-02's `StandardBlock` — straight sets, each one logged as it
 * happens. `superset` is its `SupersetBlock`, the same set logging with the
 * pair's ordering and the block's own rest around it. `circuit` is EXE-03's
 * `CircuitBlock`, which tracks the round and position and supplies
 * `rounds_completed`; `emom` is its `EmomBlock`, which runs the block's minute
 * grid and supplies `minutes_completed`; `amrap` is EXE-04c's `AmrapBlock`,
 * which counts the window down and records its score; and `for_time` is
 * EXE-04b's `ForTimeBlock`, which races the cap. EXE-04a's `LadderBlock` is the
 * one override keyed by rep scheme; see `blockRendererFor`.
 *
 * What a renderer is *drawn with* — `BlockPanel`, the block's one card, and its
 * ruled groups, movement rows and field row — is `block-renderers-frame.tsx`,
 * a leaf every renderer can import without importing this registry back.
 */
import { createElement, type ReactElement } from 'react'

import type { Enums } from '../data/database.types'
import { explicitLadderTiming, isLadderScheme } from '../state/ladder'
import type { BlockProgress } from '../state/workout-progress'
import { AmrapBlock } from './amrap-block'
import { CircuitBlock } from './circuit-block'
import { EmomBlock } from './emom-block'
import { ForTimeBlock } from './for-time-block'
import { LadderBlock } from './ladder-block'
import { StandardBlock } from './standard-block'
import { SupersetBlock } from './superset-block'

export interface BlockRendererProps {
  readonly block: BlockProgress
}

/** What every structure's renderer is: a block in, an element out. */
export type BlockRenderer = (props: BlockRendererProps) => ReactElement

/**
 * Structure type → the renderer that performs it. Total by type, which is the
 * point: there is no default arm, so every structure has a renderer and every
 * renderer completes through the shell.
 */
export const BLOCK_RENDERERS: Readonly<Record<Enums<'structure_type'>, BlockRenderer>> = {
  standard: StandardBlock,
  superset: SupersetBlock,
  circuit: CircuitBlock,
  emom: EmomBlock,
  amrap: AmrapBlock,
  for_time: ForTimeBlock,
}

/**
 * Which renderer performs this block — its structure, and then the one thing
 * that is not its structure.
 *
 * A ladder is a **rep scheme**, not a structure type (`workout_blocks` carries
 * both), so it cannot be a seventh entry in a map keyed by type without
 * claiming to be a structure it is not. EXE-04a therefore lands as an override
 * rather than a replacement: a For Time block whose scheme is a ladder is
 * performed by `LadderBlock`, and every other For Time block is still the
 * default panel that EXE-04b replaces.
 *
 * The override is narrowed to `for_time` deliberately. The quickfix spec is
 * right that ladders appear under other structures too — a circuit, an
 * accessory pyramid — but those structures have their own renderers landing in
 * EXE-03 and EXE-04c, and each of them composes `LadderRungs` when it does.
 * Claiming them here would be this ticket rendering another ticket's structure.
 *
 * REQ-018 widens the override by exactly one fact: a ladder with an explicit
 * `ladder_timing` is a ladder whatever clock it runs under. A scheduled ladder
 * inside an `emom` block, or a capped window inside an `amrap`, has rungs to
 * perform rather than a minute grid or a score, so it goes to `LadderBlock`
 * too. Legacy blocks — no timing — dispatch exactly as before.
 */
export function blockRendererFor(block: BlockProgress): BlockRenderer {
  if (
    isLadderScheme(block.repScheme) &&
    (block.structureType === 'for_time' || explicitLadderTiming(block) !== null)
  ) {
    return LadderBlock
  }
  return BLOCK_RENDERERS[block.structureType]
}

/**
 * The shell's dispatch: one block, rendered by whatever performs its structure.
 *
 * `createElement` rather than JSX because the renderer is looked up rather than
 * named: a capitalised local read as a tag is how a component gets *defined*
 * during render, and `react-hooks/static-components` is right to refuse that
 * shape even when the value behind it is a module constant.
 */
export function BlockSlot({ block }: BlockRendererProps) {
  return createElement(blockRendererFor(block), { block })
}
