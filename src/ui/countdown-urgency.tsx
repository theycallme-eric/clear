/** One countdown/deadline urgency vocabulary. Consumes actual remaining time;
 * owns no functional clock. Multiple active countdowns share one edge cue. */
import { useEffect, useId, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { countdownUrgency } from '../state/countdown-urgency'
import { useInterfaceLoop, type InterfaceLoop } from './motion'
import './countdown-urgency.css'

type Claim = { id: string; loop: InterfaceLoop['data-loop'] }
const claims = new Map<string, Claim>()
const listeners = new Set<() => void>()
let winner: string | null = null
function updateWinner() {
  const next = [...claims.values()].find(claim => claim.loop === 'run')?.id ?? claims.keys().next().value ?? null
  if (next === winner) return
  winner = next
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }

export function useCountdownUrgency(remainingSeconds: number | null, running: boolean) {
  const id = useId()
  const { low, urgent } = countdownUrgency(remainingSeconds, running)
  const loop = useInterfaceLoop('urgent', urgent)
  const phase = loop['data-loop']
  useEffect(() => {
    if (!urgent) return
    claims.set(id, { id, loop: phase }); updateWinner()
    return () => { claims.delete(id); updateWinner() }
  }, [id, urgent, phase])
  const owner = useSyncExternalStore(subscribe, () => winner)
  return { low, urgent, loop, edge: urgent && owner === id ? <CountdownEdgeCue loop={loop} /> : null }
}

function CountdownEdgeCue({ loop }: { loop: InterfaceLoop }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const update = () => {
      const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]')
      setHost(dialogs.length ? dialogs[dialogs.length - 1] : document.body)
    }
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] })
    return () => observer.disconnect()
  }, [])
  return host ? createPortal(<div aria-hidden="true" className="clr-countdown-edge" data-countdown-edge="" {...loop} />, host) : null
}
