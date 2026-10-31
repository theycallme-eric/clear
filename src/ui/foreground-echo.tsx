/**
 * Effects TASK-004 (REQ-004) — where Phosphor Echo applies.
 *
 * `phosphor-echo.tsx` owns how a rear image is drawn and decides nothing about
 * which targets get one. This module is that decision, made once for every
 * screen: outer foreground artwork that sits directly on the background gets
 * one echo; everything inside it gets none. The shared owners opt in here —
 * `Screen` for its heading and header actions, the outer `Card`, and the
 * screen `ActionRow` for its CTA and button surfaces — so a screen never wraps
 * a target itself.
 *
 * What is not on the background is excluded by context, not by search:
 *
 *   - inside a Card (`useInsideCard`): card text, labels, inputs, chips and
 *     in-card actions;
 *   - inside an echoed owner: an IconButton's arrow and a CTA's label are part
 *     of the framed owner's silhouette, never a second source;
 *   - inside a dialog (`EchoExcluded`, applied by `AppDialog`): its surface is
 *     not the background.
 *
 * The exclusion also makes double filtering structural: an echoed owner
 * marks its subtree, so no nested owner can add a second rear source.
 *
 * Bleed and glow composition (owner review pending, see
 * `docs/journal/clear-effects-2026-10-30/TASK-004.md`): the foundation
 * `.clr-bleed` stroke emission and the primary's `.clr-glow` stay the
 * component's own and are left as shipped. The echo's source is the filled
 * silhouette only — never the emission — and it is drawn as a sibling beneath
 * the component, so neither filter ever covers the other's subtree.
 *
 * Outside the root effects provider (a Card or Screen rendered alone) nothing
 * here renders anything extra.
 */
import { createContext, useContext, type ReactElement, type ReactNode } from 'react'

import { useOptionalVisualEffects } from '../state/visual-effects'
import { useInsideCard } from './card-context'
import { PhosphorEchoFrame, PhosphorEchoText } from './phosphor-echo'

import './foreground-echo.css'

/** True beneath a surface that is not the background, or an echoed owner. */
const EchoExclusionContext = createContext(false)

/** Marks a subtree whose owners are not directly on the background. */
export function EchoExcluded({ children }: { children: ReactNode }) {
  return <EchoExclusionContext.Provider value>{children}</EchoExclusionContext.Provider>
}

/** Whether an owner rendered here sits directly on the background. */
function useOnBackground(): boolean {
  const policy = useOptionalVisualEffects()
  const insideCard = useInsideCard()
  const excluded = useContext(EchoExclusionContext)
  return policy !== null && !insideCard && !excluded
}

/**
 * One framed owner — a Card, a framed back action, a CTA — with its rear
 * image when it is on the background, and exactly as given when it is not.
 */
export function ForegroundEchoFrame({ children }: { children: ReactElement }) {
  if (!useOnBackground()) return children

  return (
    <EchoExcluded>
      <PhosphorEchoFrame>{children}</PhosphorEchoFrame>
    </EchoExcluded>
  )
}

/**
 * A standalone screen heading. Only plain text has a text silhouette; a
 * heading made of other artwork is drawn as given.
 */
export function ForegroundEchoText({ children }: { children: ReactNode }) {
  const onBackground = useOnBackground()
  if (!onBackground || typeof children !== 'string') return <>{children}</>
  return <PhosphorEchoText>{children}</PhosphorEchoText>
}
