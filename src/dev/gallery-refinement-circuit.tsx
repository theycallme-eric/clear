/**
 * TASK-021 (REQ-021; C48, G13; R18, R103, R104, R105; V13) — the accepted
 * `/gallery/refinements?state=circuit-round` (accepted gallery reference
 * eded158cfd928d382c9a9409e2c372270312741d, `GalleryLoggingMoment` with the
 * `circuit-round` context; LOGGING-FIELDS "Circuit round / take back").
 *
 * Deliberate consolidation of the reference's synthetic form. The reference
 * drew a look-alike "Round 1 recorded" form with a held 45-second rest and a
 * synthetic save inside the shared `LoggingOverlay`. Here the state renders
 * the route's own `CircuitBlock` — its round clock, Finish round, round-time
 * history and optional movement entry — and Finish round opens the route's
 * own `Round 1 recorded` log: the overlay's framed Close log X, the round
 * time read back from the circuit's stored history, the circuit's own rest
 * between rounds as the shared whole timer body at the log's full width, and
 * Take back this round. Nothing is copied: the controller, the rest and the
 * Undo are `circuit.ts`'s, as on `/workout`.
 *
 * Memory only. Round 1's clock is seeded as started 32 seconds before the
 * mount into the mount's own in-memory storage (never the route's), so
 * Finish round 1 reads back about 00:32, as the reference does; every tap
 * changes only that copy. The set observations of the optional movement entry
 * are answered in memory (`MemorySetLogClients`), every other client refuses,
 * and the block completion has no forward action here. No account, no
 * network, and no production writer is substituted.
 */
import { useState } from 'react'

import { BlockCompletionProvider } from '../state/block-completion-provider'
import type { CircuitState } from '../state/circuit'
import { RestTimerProvider } from '../state/rest-provider'
import { CONTRACT_VERSION, type Prescription, type SessionAcceptance } from '../state/schemas'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { writeCircuitState, type ShellStorage } from '../state/workout-persistence'
import type { BlockProgress } from '../state/workout-progress'
import { CircuitBlock } from '../ui/circuit-block'
import { SectionLabelContext } from '../ui/section-label-context'
import { SetLoggingSheetHost } from '../ui/set-logging-sheet'
import { GalleryCoachingClients } from './gallery-refinement-coaching'
import { galleryAmrapProgress } from './gallery-refinement-forms-data'
import { MemorySetLogClients } from './gallery-refinement-set-logging'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

/** A session id the gallery's block reports under; nothing is ever written for it. */
const GALLERY_SESSION_ID = '00000000-0000-4000-8000-000000009021'
const noop = () => {}

/** The seeded round 1 clock, in seconds before the mount. */
export const GALLERY_CIRCUIT_ROUND_SECONDS = 32
/** The reference's rest between rounds. */
export const GALLERY_CIRCUIT_REST_SECONDS = 45

function movement(overrides: Partial<Prescription> & Pick<Prescription, 'exercise_id' | 'equipment'>): Prescription {
  return {
    session_function: 'conditioning',
    anchor_relationship: 'complementary',
    modality: 'reps',
    sets: 3,
    target_kind: 'fixed',
    target_value: 8,
    target_min: null,
    target_max: null,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: null,
    tempo: null,
    load_type: 'absolute',
    load_value: 12,
    is_interval_exercise: false,
    ...overrides,
  } as Prescription
}

/**
 * V13's circuit: three rounds, 45 seconds between them, goblet squat first.
 * Also the circuit-movement state's (TASK-044).
 */
export const CIRCUIT: Block = {
  structure_type: 'circuit',
  rounds: 3,
  timer_type: 'none',
  timer_seconds: null,
  round_rest_seconds: GALLERY_CIRCUIT_REST_SECONDS,
  rep_scheme: 'fixed',
  block_notes: null,
  exercises: [
    movement({ exercise_id: 'goblet-squat', equipment: 'kettlebell', target_value: 8, load_value: 12 }),
    movement({
      exercise_id: 'push-up', equipment: 'bodyweight', load_type: 'bodyweight', load_value: null, target_value: 10,
    }),
    movement({ exercise_id: 'kb-swing', equipment: 'kettlebell', target_value: 15, load_value: 16 }),
  ],
}

/** The mount's own storage: a map, never the route's `localStorage`. */
export function memoryStorage(): ShellStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

/** Round 1's clock running since `seconds` before now; nothing recorded yet. */
function seededCircuit(block: BlockProgress, seconds: number): ShellStorage {
  const storage = memoryStorage()
  const state: CircuitState = {
    round: 1,
    position: 1,
    restStartedAt: null,
    roundStartedAt: new Date(Date.now() - seconds * 1000).toISOString(),
    history: [],
  }
  writeCircuitState(storage, block.blockId, state)
  return storage
}

/** The accepted circuit round / take back moment: the route's circuit, in memory. */
export function GalleryCircuitRound() {
  const [block] = useState(() => galleryAmrapProgress(CIRCUIT, 96))
  const [storage] = useState(() => seededCircuit(block, GALLERY_CIRCUIT_ROUND_SECONDS))
  return (
    <GalleryCoachingClients>
      <MemorySetLogClients seeded={[]}>
        <BlockCompletionProvider sessionId={GALLERY_SESSION_ID} blocks={[block]}>
          <SetLoggingProvider
            sessionId={GALLERY_SESSION_ID}
            exercises={block.exercises}
            weightUnit="kg"
            storage={null}
            onFailure={noop}
          >
            <RestTimerProvider>
              <SetLoggingSheetHost>
                <div className="clr-stack" data-gallery-circuit-round="" data-contract={CONTRACT_VERSION}>
                  <SectionLabelContext value="Conditioning">
                    <CircuitBlock block={block} storage={storage} />
                  </SectionLabelContext>
                </div>
              </SetLoggingSheetHost>
            </RestTimerProvider>
          </SetLoggingProvider>
        </BlockCompletionProvider>
      </MemorySetLogClients>
    </GalleryCoachingClients>
  )
}
