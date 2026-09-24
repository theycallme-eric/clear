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
 * happens — and `superset` is its `SupersetBlock`, the same set logging with
 * the pair's ordering and the block's own rest around it. `emom` is EXE-03's
 * `EmomBlock`, which runs the block's own minute grid and supplies
 * `minutes_completed`. Every other structure is still performed by `BlockPanel`:
 * the block's identity, its size, and the shell's completion control. That is
 * deliberate rather than a placeholder with no meaning — the path OVR-03 reads
 * is live for every structure from day one, and a block completed through it
 * records the effort with no outcome fields rather than with invented ones.
 */
import { createElement, type ReactElement } from 'react'

import type { Enums } from '../data/database.types'
import type { BlockProgress } from '../state/workout-progress'
import { BlockCompletionControl } from './block-completion-control'
import { Card } from './card'
import { EmomBlock } from './emom-block'
import { StandardBlock } from './standard-block'
import { SupersetBlock } from './superset-block'
import { StructureBadge } from './workout-chrome'

export interface BlockRendererProps {
  readonly block: BlockProgress
}

/** What every structure's renderer is: a block in, an element out. */
export type BlockRenderer = (props: BlockRendererProps) => ReactElement

/**
 * One block, as the shell knows it: its structure identity, how much is in it,
 * and the completion the shell owns.
 *
 * The *contents* are not here and are not meant to be — the movements, the
 * clock and the per-structure controls are EXE-02…EXE-04c's. What this does
 * carry is the contract they inherit: `completeBlock` with what was observed,
 * and nothing else.
 */
export function BlockPanel({ block }: BlockRendererProps) {
  return (
    <Card>
      <div className="clr-stack--tight" style={{ display: 'flex', flexDirection: 'column' }}>
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
        {/*
          No outcome fields: this panel runs no clock and counts no rounds, and
          a zero it never observed would be a measurement (DATA_MODEL §8).
        */}
        <BlockCompletionControl blockId={block.blockId} outcome={{}} />
      </div>
    </Card>
  )
}

/**
 * Structure type → the renderer that performs it. Total by type, which is the
 * point: there is no default arm, so every structure has a renderer and every
 * renderer completes through the shell.
 */
export const BLOCK_RENDERERS: Readonly<Record<Enums<'structure_type'>, BlockRenderer>> = {
  standard: StandardBlock,
  superset: SupersetBlock,
  circuit: BlockPanel,
  emom: EmomBlock,
  amrap: BlockPanel,
  for_time: BlockPanel,
}

export function blockRendererFor(structureType: Enums<'structure_type'>): BlockRenderer {
  return BLOCK_RENDERERS[structureType]
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
  return createElement(blockRendererFor(block.structureType), { block })
}
