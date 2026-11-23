/** One countdown/deadline urgency vocabulary. Consumes actual remaining time;
 * owns no functional clock. Multiple active countdowns share one edge cue.
 *
 * A3 TASK-108 (TASK-008: C22, C23, C24, C61; R120, R125, R126, R133, R135,
 * R144; P05). Every clock feeds this hook its own deadline, read by the
 * per-clock adapters in `state/countdown-urgency.ts` (movement, rest, EMOM
 * minute, AMRAP window, race cap, schedule interval, circuit rest), so a
 * paused clock keeps the low colour but loses the breathe and the edge, and an
 * elapsed-only clock (`NO_DEADLINE`) stays neutral.
 *
 *   · **One loop.** Each urgent timer claims the view's one `urgent` loop
 *     (`motion.ts`), so a wait beside it is stilled; while any of those claims
 *     holds the loop, every urgent timer and the aura breathe together — never
 *     two competing pulses, and never one timer stilled beside another.
 *   · **One edge.** However many deadlines are urgent, exactly one decorative
 *     pointer-transparent aura is drawn — by the first urgent timer — over the
 *     whole viewport, portalled into the topmost open native dialog so it shows
 *     above an open log, otherwise onto the document body.
 *   · **One phase.** The timer's breathe and the aura's are the same keyframes
 *     on the same period and easing (`countdown-urgency.css`), and both are
 *     pinned to the document timeline's epoch whenever one starts, so they
 *     brighten and fade together over every cycle, whatever the numeric ticks
 *     and wherever the aura is portalled.
 *
 * Presentation only: it starts, pauses and stores nothing, and never records
 * performed work.
 */
import { useId, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { countdownUrgency, NO_DEADLINE, type CountdownDeadline } from '../state/countdown-urgency'
import { useInterfaceLoop, type InterfaceLoop, type InterfaceLoopState } from './motion'
import './countdown-urgency.css'

/** The keyframes the timer and the aura share (`countdown-urgency.css`). */
const WARNING_KEYFRAMES = 'clr-deadline-breathe'
/** Every element that breathes with the warning: urgent timers and the one aura. */
const BREATHING = '.clr-countdown-breathe, .clr-countdown-edge'

/**
 * Pin every warning breathe on the page to the document timeline's epoch, so a
 * timer that went urgent after another, or an aura portalled into a dialog that
 * just opened, brightens and fades with the rest (P05).
 */
function alignPhase() {
  if (typeof document === 'undefined') return
  for (const element of document.querySelectorAll(BREATHING)) {
    if (typeof element.getAnimations !== 'function') continue
    for (const animation of element.getAnimations()) {
      if ((animation as CSSAnimation).animationName === WARNING_KEYFRAMES && animation.startTime !== 0) {
        animation.startTime = 0
      }
    }
  }
}

/**
 * The urgent timers, in the order they went urgent, with the state of each
 * one's claim on the view's one loop. The first claim draws the one edge; the
 * warning runs when any claim holds the view's loop.
 */
const claims = new Map<string, InterfaceLoopState>()
const listeners = new Set<() => void>()
let warning: { readonly owner: string | null; readonly state: InterfaceLoopState } = { owner: null, state: 'still' }

function settle() {
  const owner = claims.keys().next().value ?? null
  const state: InterfaceLoopState = [...claims.values()].includes('run') ? 'run' : 'still'
  if (owner === warning.owner && state === warning.state) return
  warning = { owner, state }
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
const readWarning = () => warning

/**
 * The warning for one clock, from its own deadline. `low` is the timer-low
 * colour (a live deadline with 0 < remaining <= 10, running or paused);
 * `urgent` the breathe and the edge (running with 0 < remaining <= 5); `loop`
 * the shared warning loop to spread on the urgent timer; `edge` the one aura,
 * drawn only by the first urgent clock.
 */
export function useCountdownUrgency(deadline: CountdownDeadline = NO_DEADLINE) {
  const id = useId()
  const { low, urgent } = countdownUrgency(deadline.remaining, deadline.running)
  const own = useInterfaceLoop('urgent', urgent)['data-loop']

  // Its place in the warning, held for as long as it is urgent: the order of
  // the claims (and so the edge's owner) never moves when a loop state does.
  useLayoutEffect(() => {
    if (!urgent) return
    claims.set(id, 'still')
    return () => {
      claims.delete(id)
      settle()
    }
  }, [id, urgent])

  // Its claim's loop state, kept current in that same place.
  useLayoutEffect(() => {
    if (!urgent || !claims.has(id)) return
    claims.set(id, own)
    settle()
  }, [id, urgent, own])

  const shared = useSyncExternalStore(subscribe, readWarning, readWarning)
  const loop: InterfaceLoop = { 'data-loop': urgent ? shared.state : 'still' }
  const state = loop['data-loop']

  // A breathe that starts — a new urgent timer, a resume, a loop that runs
  // again — starts on the epoch the others already share.
  useLayoutEffect(() => {
    if (urgent) alignPhase()
  }, [urgent, state])

  return { low, urgent, loop, edge: urgent && shared.owner === id ? <CountdownEdgeCue loop={loop} /> : null }
}

/** The topmost open native dialog, or the body when none is open. */
function edgeHost(): HTMLElement {
  const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]')
  return dialogs.length ? dialogs[dialogs.length - 1] : document.body
}

function CountdownEdgeCue({ loop }: { loop: InterfaceLoop }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const update = () => setHost(edgeHost())
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] })
    return () => observer.disconnect()
  }, [])
  const state = loop['data-loop']
  // Moved into or out of a dialog, the aura is a new element: pinned to the same epoch.
  useLayoutEffect(() => {
    alignPhase()
  }, [host, state])
  return host ? createPortal(<div aria-hidden="true" className="clr-countdown-edge" data-countdown-edge="" {...loop} />, host) : null
}
