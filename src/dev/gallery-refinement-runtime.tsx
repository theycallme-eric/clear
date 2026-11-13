/**
 * A memory-only workout runtime for /gallery/refinements, so the gallery mounts
 * the real Round 7 block components instead of copies. Nothing is persisted or
 * sent anywhere: sets live in component state, notes in a local map, and the
 * clock is the wall clock plus an offset the scene driver can move.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { WorkoutClients } from '../data/workout'
import { PreviewBlockCompletion } from '../state/block-completion-provider'
import { createError, err, ErrorCode, ok } from '../state/errors'
import { EMPTY_DRAFT, onboardingReducer } from '../state/onboarding'
import { QueryClient, QueryClientContext } from '../state/query'
import { RestTimerProvider } from '../state/rest-provider'
import type { LoggedSet } from '../state/set-logging'
import { PreviewSetLogging } from '../state/set-logging-provider'
import type { ShellStorage } from '../state/workout-persistence'
import { WorkoutClientsContext } from '../state/workout-queries'
import { SectionLabelContext } from '../ui/section-label-context'
import { SetLoggingSheetHost, SetLoggingSheetOverlay } from '../ui/set-logging-sheet'
import { WorkoutExperiencePresentationProvider, type WorkoutExperiencePresentation } from '../ui/workout-experience-presentation'

export interface GalleryClock {
  now(): number
  advance(ms: number): void
}

export function useGalleryClock(): GalleryClock {
  const offset = useRef(0)
  return useMemo(() => ({ now: () => Date.now() + offset.current, advance: ms => { offset.current += ms } }), [])
}

/** Circuit progress stays in this scene; it is never written to the browser. */
export function memoryStorage(): ShellStorage {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}

/**
 * Coaching reads a definition and writes a note; both answer locally. Every
 * other client answers offline, so a stray read shows its error state rather
 * than reaching a backend.
 */
function memoryWorkoutClients(notes: Map<string, string | null>): WorkoutClients {
  const offline = async () => err(createError(ErrorCode.NETWORK_OFFLINE))
  const exercises = {
    definition: async () => ok(null),
    saveNotes: async (id: string, text: string | null) => {
      notes.set(id, text)
      return ok({ id, exercise_notes: text })
    },
  }
  const clients = { exercises }
  return new Proxy(clients, {
    get: (target, key) => key in target ? target[key as keyof typeof target]
      : new Proxy({}, { get: () => offline }),
  }) as unknown as WorkoutClients
}

let setupDraft = onboardingReducer(EMPTY_DRAFT, { type: 'tier', value: 'full' })
setupDraft = onboardingReducer(setupDraft, { type: 'experience', value: 'some' })
setupDraft = onboardingReducer(setupDraft, { type: 'goal', value: 'balanced' })

/** The values the approved Round 7 captures were rendered with. */
export function galleryPresentation(saveResult: NonNullable<WorkoutExperiencePresentation['timedWorkflows']>['saveResult']): WorkoutExperiencePresentation {
  return {
    dialogBackdrop: 'balanced', equipmentPlacement: 'name', loggingOverlay: 'dialog',
    timedWorkflows: { logPresentation: 'sheet', counterStyle: 'wide', logHierarchy: 'simple', rungEmphasis: 'reps', saveResult },
    focusAction: 'text',
    guides: {
      warmup: { title: 'Warm-up', minutes: 4, movements: ['Arm circles', 'Scapular push-ups', 'Bench press rehearsal'] },
      cooldown: { title: 'Cooldown', minutes: 3, movements: ['Chest stretch', 'Thoracic rotation', 'Child’s pose'] },
    },
    suggestedLoads: { 'dumbbell-thruster': '20–25 lb per hand', 'farmers-carry': '20–25 lb per hand' },
    equipmentSetupDraft: setupDraft,
    showTrainingReport: false,
    report: [],
  }
}

export interface GalleryRuntimeProps {
  readonly clock: GalleryClock
  readonly presentation: WorkoutExperiencePresentation
  readonly seed?: Readonly<Record<string, readonly LoggedSet[]>>
  /** The section the block sits in, which the Workout screen names above it. */
  readonly section?: string
  readonly children: ReactNode
}

/** The same provider order as the Workout screen, with memory in place of the account. */
export function GalleryRuntime({ clock, presentation, seed = {}, section = 'Conditioning', children }: GalleryRuntimeProps) {
  const [cache] = useState(() => new QueryClient())
  const [clients] = useState(() => memoryWorkoutClients(new Map()))
  return <WorkoutExperiencePresentationProvider value={presentation}>
    <QueryClientContext value={cache}>
      <WorkoutClientsContext value={clients}>
        <PreviewBlockCompletion>
          <PreviewSetLogging seed={seed}>
            <RestTimerProvider now={clock.now}>
              <SetLoggingSheetHost>
                <SectionLabelContext value={section}>{children}</SectionLabelContext>
                <SetLoggingSheetOverlay />
              </SetLoggingSheetHost>
            </RestTimerProvider>
          </PreviewSetLogging>
        </PreviewBlockCompletion>
      </WorkoutClientsContext>
    </QueryClientContext>
  </WorkoutExperiencePresentationProvider>
}

/** One driver step: act on the scene and answer true once it is done. */
export type DriverStep = (scene: HTMLElement, clock: GalleryClock, tries: number) => boolean

const DRIVER_TICK_MS = 40

const buttons = (scene: HTMLElement) => [...scene.querySelectorAll('button')]

export const click = (match: (button: HTMLButtonElement) => boolean): DriverStep => scene => {
  const button = buttons(scene).find(match)
  if (button === undefined || button.disabled) return false
  button.click()
  return true
}
export const clickText = (text: string | RegExp): DriverStep =>
  click(button => typeof text === 'string' ? button.textContent?.trim() === text : text.test(button.textContent?.trim() ?? ''))
export const clickLabel = (label: string): DriverStep => click(button => button.getAttribute('aria-label') === label)
/** Lets the clocks' own ticks re-read the moved clock before the next control is pressed. */
export const wait = (ms: number): DriverStep => (_scene, _clock, tries) => tries * DRIVER_TICK_MS >= ms
export const advance = (ms: number | ((scene: HTMLElement) => number)): DriverStep => (scene, clock) => {
  clock.advance(typeof ms === 'number' ? ms : ms(scene))
  return true
}

/**
 * Runs the steps against the real controls, the way a person would reach the
 * state: each step is retried until the control it needs has rendered.
 */
export function useSceneDriver(scene: React.RefObject<HTMLElement | null>, clock: GalleryClock, steps: readonly DriverStep[] | null) {
  useEffect(() => {
    if (steps === null || steps.length === 0) return
    let index = 0
    let tries = 0
    const id = setInterval(() => {
      const root = scene.current
      if (root === null) return
      if (steps[index](root, clock, tries)) { index += 1; tries = 0 } else tries += 1
      if (index >= steps.length || tries > 100) clearInterval(id)
    }, DRIVER_TICK_MS)
    return () => clearInterval(id)
  }, [scene, clock, steps])
}
