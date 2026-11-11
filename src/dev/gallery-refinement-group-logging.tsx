/**
 * TASK-044 (REQ-019; C45; R82, R100) — the accepted grouped logging moments,
 * `/gallery/refinements?state=superset` and `?state=circuit-movement`
 * (accepted gallery reference eded158cfd928d382c9a9409e2c372270312741d,
 * `GalleryLoggingMoment` with the `superset` and `circuit-movement`
 * contexts; LOGGING-FIELDS "Superset round" and "Circuit movement entry").
 * `?state=circuit-round` is TASK-021's (`gallery-refinement-circuit.tsx`).
 *
 * Deliberate consolidation of the reference's synthetic forms. The reference
 * drew look-alike forms with a synthetic Save inside the shared
 * `LoggingOverlay`. Here each state renders the route's own block over the
 * shell's own `SetLoggingProvider` and the session's one rest
 * (`RestTimerProvider`), as `/workout` composes them, so what opens is the
 * route's own entry in the shared focused logging dialog:
 *
 * - `superset`: the route's `SupersetBlock` (A1 one arm row, A2 bicep curl,
 *   3 × 8–12, 60 seconds after both). Its Rest opens `Log round 1` — each
 *   movement one complete group with Performed, Weight/Unit/Reps and Effort,
 *   no helper paragraph — beside the block's one rest, with the framed Close
 *   log X and Balanced backdrop; a saved set's Edit opens its correction.
 * - `circuit-movement`: the route's `CircuitBlock` (V13's circuit, shared
 *   with `circuit-round`). A movement's Rest opens its optional actual entry,
 *   `Log set 1`, in the same dialog; the circuit's round clock, rest and the
 *   movement's own countdown stay on the card.
 *
 * Memory only. Set observations are answered in memory for this mount
 * (`MemorySetLogClients`), every other client refuses, the coaching library
 * is the gallery's in-memory one, the circuit's record is the mount's own map
 * (never the route's storage), and the block completion has no forward action
 * here. No account, no network, and no production writer is substituted.
 */
import { useState } from 'react'

import { BlockCompletionProvider } from '../state/block-completion-provider'
import { RestTimerProvider } from '../state/rest-provider'
import { CONTRACT_VERSION, type Prescription, type SessionAcceptance } from '../state/schemas'
import { SetLoggingProvider } from '../state/set-logging-provider'
import { CircuitBlock } from '../ui/circuit-block'
import { SectionLabelContext } from '../ui/section-label-context'
import { SetLoggingSheetHost } from '../ui/set-logging-sheet'
import { SupersetBlock } from '../ui/superset-block'
import { CIRCUIT, memoryStorage } from './gallery-refinement-circuit'
import { GalleryCoachingClients } from './gallery-refinement-coaching'
import { galleryAmrapProgress } from './gallery-refinement-forms-data'
import { GalleryFooterRest, MemorySetLogClients } from './gallery-refinement-set-logging'

type Block = SessionAcceptance['workout']['sections'][number]['blocks'][number]

/** Session ids the gallery's blocks report under; nothing is ever written for them. */
const SUPERSET_SESSION_ID = '00000000-0000-4000-8000-000000009044'
const CIRCUIT_SESSION_ID = '00000000-0000-4000-8000-000000009045'
const noop = () => {}

/** The superset's block rest, after both movements. */
export const GALLERY_SUPERSET_REST_SECONDS = 60

function movement(overrides: Partial<Prescription> & Pick<Prescription, 'exercise_id' | 'equipment'>): Prescription {
  return {
    session_function: 'accessory',
    anchor_relationship: 'complementary',
    modality: 'reps',
    sets: 3,
    target_kind: 'range',
    target_value: null,
    target_min: 8,
    target_max: 12,
    target_sequence: null,
    per_side: false,
    distance_unit: null,
    rest_seconds: null,
    tempo: null,
    load_type: 'absolute',
    load_value: 16,
    is_interval_exercise: false,
    ...overrides,
  } as Prescription
}

/** The reference's superset: A1 one arm row, A2 bicep curl, 3 × 8–12. */
const SUPERSET: Block = {
  structure_type: 'superset',
  rounds: 3,
  timer_type: 'none',
  timer_seconds: null,
  round_rest_seconds: GALLERY_SUPERSET_REST_SECONDS,
  rep_scheme: 'fixed',
  block_notes: null,
  exercises: [
    movement({ exercise_id: 'one-arm-row', equipment: 'dumbbell', load_value: 22 }),
    movement({ exercise_id: 'bicep-curl', equipment: 'dumbbell', load_value: 12 }),
  ],
}

/** The accepted superset round: the route's superset block, in memory. */
export function GallerySupersetRound() {
  const [block] = useState(() => galleryAmrapProgress(SUPERSET, 97))
  return (
    <GalleryCoachingClients>
      <MemorySetLogClients seeded={[]}>
        <BlockCompletionProvider sessionId={SUPERSET_SESSION_ID} blocks={[block]}>
          <SetLoggingProvider
            sessionId={SUPERSET_SESSION_ID}
            exercises={block.exercises}
            weightUnit="kg"
            storage={null}
            onFailure={noop}
            // As the route offers them: Edit, Save correction and Clear set.
            corrections
          >
            <RestTimerProvider>
              <SetLoggingSheetHost>
                <div className="clr-stack" data-gallery-group-logging="superset" data-contract={CONTRACT_VERSION}>
                  <SectionLabelContext value="Accessory">
                    <SupersetBlock block={block} />
                  </SectionLabelContext>
                  <GalleryFooterRest />
                </div>
              </SetLoggingSheetHost>
            </RestTimerProvider>
          </SetLoggingProvider>
        </BlockCompletionProvider>
      </MemorySetLogClients>
    </GalleryCoachingClients>
  )
}

/** The accepted circuit movement entry: the route's circuit block, in memory. */
export function GalleryCircuitMovement() {
  const [block] = useState(() => galleryAmrapProgress(CIRCUIT, 98))
  const [storage] = useState(memoryStorage)
  return (
    <GalleryCoachingClients>
      <MemorySetLogClients seeded={[]}>
        <BlockCompletionProvider sessionId={CIRCUIT_SESSION_ID} blocks={[block]}>
          <SetLoggingProvider
            sessionId={CIRCUIT_SESSION_ID}
            exercises={block.exercises}
            weightUnit="kg"
            storage={null}
            onFailure={noop}
            corrections
          >
            <RestTimerProvider>
              <SetLoggingSheetHost>
                <div className="clr-stack" data-gallery-group-logging="circuit-movement" data-contract={CONTRACT_VERSION}>
                  <SectionLabelContext value="Conditioning">
                    <CircuitBlock block={block} storage={storage} />
                  </SectionLabelContext>
                  <GalleryFooterRest />
                </div>
              </SetLoggingSheetHost>
            </RestTimerProvider>
          </SetLoggingProvider>
        </BlockCompletionProvider>
      </MemorySetLogClients>
    </GalleryCoachingClients>
  )
}
