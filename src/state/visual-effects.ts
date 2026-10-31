/**
 * Effects TASK-001 — the one shared comfort policy for optional effects.
 *
 * Every optional effect (Phosphor Echo, CRT Glass), the atmosphere's motion,
 * scanline drift and grain refresh ask this module one question instead of
 * keeping toggles of their own that could disagree. It has three inputs:
 *
 *   1. The device's Visual effects choice, stored under
 *      `localStorage['clear.visual-effects']` by the same convention as
 *      `clear.skin`: an explicit value wins, an unknown value is ignored, and
 *      with nothing valid stored the product default — on — applies.
 *   2. The live OS `prefers-reduced-motion` preference.
 *   3. Document visibility, so a hidden tab does no decorative motion.
 *
 * Off always wins. With Visual effects off the policy reports effects
 * disabled and motion disallowed, and nothing else — no motion setting, no
 * skin, no appearance preset — is an input that could say otherwise.
 *
 * All three inputs are external stores, read through `useSyncExternalStore`,
 * so a change to any of them re-resolves the policy for every subscriber
 * without a reload. `VisualEffectsProvider` resolves it once at the root and
 * `useVisualEffects` is how a surface reads it.
 */
import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

const KEY = 'clear.visual-effects'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** The stored values. Checked means on. */
const STORED = { on: true, off: false } as const

type StoredValue = keyof typeof STORED

/** Visual effects with nothing valid stored. */
export const DEFAULT_VISUAL_EFFECTS = true

/** The resolved answer every effect reads. */
export interface VisualEffectsPolicy {
  /** The device's Visual effects choice: optional effects may render at all. */
  effectsEnabled: boolean
  /** Decorative motion may run: effects on, OS allows motion, tab visible. */
  motionAllowed: boolean
}

/** What the policy is resolved from. */
export interface VisualEffectsInputs {
  visualEffects: boolean
  prefersReducedMotion: boolean
  documentVisible: boolean
}

/** Pure resolution. Off wins over everything; motion needs all three to agree. */
export function resolveVisualEffectsPolicy({
  visualEffects,
  prefersReducedMotion,
  documentVisible,
}: VisualEffectsInputs): VisualEffectsPolicy {
  return {
    effectsEnabled: visualEffects,
    motionAllowed: visualEffects && !prefersReducedMotion && documentVisible,
  }
}

const isStoredValue = (value: string | null): value is StoredValue =>
  value !== null && Object.hasOwn(STORED, value)

/** The stored explicit choice, or null. Unknown values are ignored, not thrown. */
export function storedVisualEffects(): boolean | null {
  try {
    const value = localStorage.getItem(KEY)
    return isStoredValue(value) ? STORED[value] : null
  } catch {
    return null
  }
}

/** The device's choice: the stored one, else the default. */
export function currentVisualEffects(): boolean {
  return storedVisualEffects() ?? DEFAULT_VISUAL_EFFECTS
}

const listeners = new Set<() => void>()

/**
 * Store a choice. It survives a reload, and every subscriber re-resolves
 * immediately — storage events only reach other tabs, so this one is told.
 */
export function setVisualEffects(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? 'on' : 'off')
  } catch {
    // Blocked storage: nothing persists, so the device keeps its default.
  }
  for (const listener of listeners) listener()
}

function readInputs(): VisualEffectsInputs {
  return {
    visualEffects: currentVisualEffects(),
    prefersReducedMotion:
      typeof window.matchMedia === 'function' &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches,
    documentVisible: document.visibilityState !== 'hidden',
  }
}

/** One object per distinct answer, so the store snapshot is stable between changes. */
const POLICIES = new Map<string, VisualEffectsPolicy>()

function readPolicy(): VisualEffectsPolicy {
  const policy = resolveVisualEffectsPolicy(readInputs())
  const key = `${policy.effectsEnabled}:${policy.motionAllowed}`
  const cached = POLICIES.get(key)
  if (cached) return cached
  POLICIES.set(key, policy)
  return policy
}

function subscribe(onChange: () => void) {
  const query =
    typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCED_MOTION_QUERY)
      : null
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) onChange()
  }

  listeners.add(onChange)
  query?.addEventListener('change', onChange)
  document.addEventListener('visibilitychange', onChange)
  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(onChange)
    query?.removeEventListener('change', onChange)
    document.removeEventListener('visibilitychange', onChange)
    window.removeEventListener('storage', onStorage)
  }
}

const VisualEffectsContext = createContext<VisualEffectsPolicy | null>(null)

/** Resolves the policy once at the root, live, for everything beneath it. */
export function VisualEffectsProvider({ children }: { children: ReactNode }) {
  const policy = useSyncExternalStore(subscribe, readPolicy)

  return createElement(VisualEffectsContext.Provider, { value: policy }, children)
}

/** The resolved policy. Every optional effect reads this and nothing else. */
export function useVisualEffects(): VisualEffectsPolicy {
  const policy = useContext(VisualEffectsContext)
  if (policy === null) {
    throw new Error('useVisualEffects must be used inside VisualEffectsProvider')
  }
  return policy
}
