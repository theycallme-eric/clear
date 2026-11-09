/** Synthetic live ladder controller around the accepted shared owners.
 * Deliberately memory-only: refresh/History/backend behavior belongs to integration. */
import { useEffect, useState } from 'react'
import { Button, Checkbox } from '../design-system/index'
import { Card } from '../ui/card'
import { DeadlineTimer } from '../ui/refinements/deadline-timer'
import { LadderPrescription } from '../ui/refinements/ladder'
import { LoggingOverlay } from '../ui/refinements/logging-overlay'
import { TimedResultLog, type TimedResultDraft } from '../ui/refinements/timed-result-log'
import { sampleBlock } from './gallery-refinement-data'

export function GalleryLadderFlow({ rounds = 4 }: { rounds?: number }) {
  const block = sampleBlock('ladder',rounds)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [pausedAt, setPausedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now)
  const [progress, setProgress] = useState(0)
  const [finished, setFinished] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [draft, setDraft] = useState<TimedResultDraft>({completed:false,count:null,highestRung:0,effort:null,notes:'',measurements:{}})
  const cap = 420
  const elapsed = startedAt === null ? 0 : Math.max(0,Math.floor(((pausedAt ?? now)-startedAt)/1000))
  const expired = elapsed >= cap
  useEffect(() => {
    if (startedAt === null || pausedAt !== null || saved) return
    const timer = setInterval(() => setNow(Date.now()),200)
    return () => clearInterval(timer)
  }, [startedAt,pausedAt,saved])
  const finish = () => {
    setDraft(current => ({...current,highestRung:progress,completed:progress === rounds}))
    setDismissed(false);setFinished(true)
  }
  return <Card heading="Conditioning">
    <p className="label">Ladder</p><p>{rounds} rounds · 07:00 cap</p>
    <DeadlineTimer seconds={elapsed} remaining={cap-elapsed} running={startedAt!==null && pausedAt===null && !finished && !saved} label="Ladder elapsed" />
    {!startedAt ? <Button variant="primary" onClick={() => { const stamp=Date.now();setNow(stamp);setStartedAt(stamp) }}>Start ladder</Button> : !saved && !finished && !expired ? <div className="clr-timed-actions">
      <Button variant="secondary" onClick={() => {
        const stamp=Date.now()
        if (pausedAt!==null) {setStartedAt(startedAt+stamp-pausedAt);setPausedAt(null)} else setPausedAt(stamp)
        setNow(stamp)
      }}>{pausedAt===null?'Pause':'Resume'}</Button>
      <Button variant="primary" onClick={finish}>Finish</Button>
    </div> : saved ? <p role="status">Sample ladder recorded</p> : <Button onClick={() => {setDismissed(false);setFinished(true)}}>Log results</Button>}
    <LadderPrescription exercises={block.exercises} weightUnit="lb" completedThrough={progress}
      onProgress={startedAt!==null && !finished && !saved && !expired ? setProgress : undefined} />
    <LoggingOverlay open={(finished || expired) && !saved && !dismissed} title="Log results" onClose={() => setDismissed(true)}>
      <TimedResultLog embedded block={block} format="ladder" finished={progress===rounds} weightUnit="lb" value={draft} onDraftChange={setDraft}
        completionAction={!expired ? <div className="clr-timed-undo"><Button variant="quiet" size="sm" onClick={() => {
          setProgress(draft.highestRung ?? 0); setNow(Date.now()); setDismissed(false);setFinished(false)
        }}>Undo finish · Resume ladder</Button></div> : undefined}
        onSave={async () => {setProgress(draft.highestRung??0);setSaved(true)}} />
    </LoggingOverlay>
  </Card>
}

export function GalleryUrgency() {
  const [seconds,setSeconds]=useState(12)
  const [deadline,setDeadline]=useState<number|null>(null)
  const running=deadline!==null && seconds>0
  const [open,setOpen]=useState(false)
  const [cap,setCap]=useState(false)
  const [reduced,setReduced]=useState(false)
  useEffect(() => {
    if(deadline===null) return
    const timer=setInterval(()=>{const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));setSeconds(left);if(left===0)setDeadline(null)},100)
    return()=>clearInterval(timer)
  },[deadline])
  const cue=<DeadlineTimer seconds={cap?60-seconds:seconds} remaining={seconds} running={running} reducedMotion={reduced} label={cap?'Elapsed against cap':'Time remaining'} />
  return <div className="clr-accepted-example">
    <div className="clr-timed-actions"><Button onClick={()=>{setDeadline(null);setSeconds(10)}}>Inspect 10 seconds</Button><Button onClick={()=>{setDeadline(null);setSeconds(5)}}>Inspect 5 seconds</Button></div>
    <div className="clr-timed-actions"><Button variant="primary" onClick={()=>setDeadline(running?null:Date.now()+seconds*1000)}>{running?'Pause':'Run countdown'}</Button><Button onClick={()=>setCap(value=>!value)}>{cap?'Show countdown':'Show count-up cap'}</Button><Button onClick={()=>setOpen(true)}>Open log over cue</Button></div>
    <Checkbox label="Reduced-motion preview" checked={reduced} onChange={setReduced} />
    {cue}
    <p>Elapsed session timer — no deadline cue</p><DeadlineTimer seconds={5} elapsedOnly label="Session time" />
    <LoggingOverlay open={open} title="Log set" onClose={()=>setOpen(false)}><InputNote />{cue}</LoggingOverlay>
  </div>
}
function InputNote() { return <p>Rest and deadline cues stay visible over the focused log.</p> }
