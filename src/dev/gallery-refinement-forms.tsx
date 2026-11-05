/** Gallery-only state/controllers. No account client, persistence or route injection. */
import { useState } from 'react'
import { Button, Checkbox, Input } from '../design-system/index'
import { REST_DAY_REASONS, REST_DAY_REASON_LABELS, REST_DAY_REASON_EFFECTS, type RestDayReason } from '../state/rest-days'
import { ConfirmDialog } from '../ui/blocking-dialog'
import { FeelingRow } from '../ui/feeling-row'
import { Select } from '../ui/select'
import { SetEffortChoice, type SetEffort } from '../ui/set-effort'
import { DeadlineTimer } from '../ui/refinements/deadline-timer'
import { LoggingOverlay } from '../ui/refinements/logging-overlay'
import { TimedResultLog, type TimedFormat } from '../ui/refinements/timed-result-log'
import { LOGGING_CONTEXTS, sampleBlock, type LoggingContext } from './gallery-refinement-data'

function MovementEntry({ name, context }: { name: string; context: LoggingContext }) {
  const [done, setDone] = useState(false)
  const [weight, setWeight] = useState(context === 'set-correction' ? '60' : '')
  const [unit, setUnit] = useState('lb')
  const [amount, setAmount] = useState(context === 'timed-movement' ? '30' : context === 'distance-movement' ? '40' : '8')
  const [clearing,setClearing]=useState(false)
  const [cleared,setCleared]=useState(false)
  const [effort, setEffort] = useState<SetEffort | null>(null)
  const showLoad = context !== 'timed-movement'
  const measure = context === 'timed-movement' ? 'Seconds' : context === 'distance-movement' ? 'Distance' : 'Reps'
  return <section className="clr-accepted-form__movement" aria-label={name}>
    <p>{name}</p>
    {context === 'superset' && <Checkbox label="Performed" checked={done} onChange={setDone} />}
    <div className="clr-accepted-form__measure" data-load={showLoad}>
      {showLoad && <Input label="Weight" type="number" inputMode="decimal" step="any" min="0" value={weight} onChange={setWeight} />}
      {showLoad && <Select label="Unit" value={unit} onChange={setUnit} options={[{value:'lb',label:'lb'},{value:'kg',label:'kg'}]} />}
      <Input label={measure} type="number" inputMode={context === 'distance-movement' ? 'decimal' : 'numeric'} step="any" min="0" value={amount} onChange={setAmount} />
    </div>
    <SetEffortChoice scopeLabel={name} value={effort} onChange={setEffort} />
    {context === 'set-correction' && <><Button variant="quiet" size="sm" onClick={()=>setClearing(true)}>Clear set</Button>
      <ConfirmDialog open={clearing} critical title="Clear set 1 of Back squat?" confirmLabel="Clear set" cancelLabel="Keep set" onCancel={()=>setClearing(false)} onConfirm={()=>{setWeight('');setAmount('');setEffort(null);setClearing(false);setCleared(true)}}><p>60 lb × 8 reps</p></ConfirmDialog>
      {cleared && <p role="status">Sample set cleared</p>}</>}
  </section>
}

function ContextForm({ context, fail, onSave, onCancel }: { context: LoggingContext; fail: boolean; onSave: () => void; onCancel: () => void }) {
  const [notes, setNotes] = useState('')
  const [feeling, setFeeling] = useState<number | null>(null)
  const [reason, setReason] = useState<RestDayReason>('rest')
  const [error, setError] = useState(false)
  const [rest, setRest] = useState(context === 'circuit-round' ? 45 : 90)
  const [restRunning, setRestRunning] = useState(true)
  const noteOnly = ['movement-note','workout-feedback','rest-day'].includes(context)
  const group = context === 'superset'
  const recorded = context === 'circuit-round'
  return <form className="clr-accepted-form" onSubmit={event => {
    event.preventDefault()
    if (fail && !error) setError(true)
    else { setError(false); onSave() }
  }}>
    {!noteOnly && <div className="clr-accepted-form">
      <p className="label">Rest after {group ? 'round 1' : 'set 1'}</p>
      <DeadlineTimer seconds={rest} running={restRunning} label="Rest" />
      <div className="clr-timed-actions"><Button variant="secondary" onClick={() => setRest(value => value+30)}>Add 30s</Button><Button variant="quiet" onClick={() => { setRest(0); setRestRunning(false) }}>Skip rest</Button></div>
    </div>}
    {recorded ? <><p>00:32 round time recorded</p><Button variant="secondary" onClick={onSave}>Take back this round</Button></> : <>
      {!noteOnly && <><MovementEntry name={group ? 'A1 One arm row · 3 × 8–12 reps' : context === 'timed-movement' ? 'Plank · 30 sec' : context === 'distance-movement' ? 'Farmer carry · 40 m' : 'Back squat · 3 × 8 reps'} context={context} />
        {group && <MovementEntry name="A2 Bicep curl · 3 × 8–12 reps" context={context} />}</>}
      {context === 'workout-feedback' && <FeelingRow value={feeling} onChange={setFeeling} />}
      {context === 'rest-day' && <Select label="Reason" value={reason} options={REST_DAY_REASONS.map(value=>({value,label:REST_DAY_REASON_LABELS[value]}))} helperText={REST_DAY_REASON_EFFECTS[reason]} onChange={value=>setReason(value as RestDayReason)} />}
      {(context === 'movement-note' || context === 'workout-feedback') && <Input label={context === 'movement-note' ? 'Movement note' : 'Notes · optional'} multiline rows={3} value={notes} onChange={setNotes} />}
      {error && <p role="alert">Your log didn’t save. Try again.</p>}
      <div className="clr-accepted-form__actions"><Button type="submit" variant="primary">{error ? 'Retry save' : context === 'set-correction' ? 'Save correction' : context === 'rest-day' ? 'Save rest day' : group ? 'Log round 1' : context === 'movement-note' ? 'Save note' : context === 'workout-feedback' ? 'Save and close' : context === 'extra-set' ? 'Log set 4' : 'Log set 1'}</Button>{(context === 'set-correction' || context === 'rest-day') && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}</div>
    </>}
  </form>
}

export function GalleryLoggingMoment({ context = 'anchor', rounds = 4 }: { context?: LoggingContext; rounds?: number }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [fail, setFail] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const title = LOGGING_CONTEXTS.find(([id]) => id === context)![1]
  const timed = ['emom','amrap','for_time','ladder'].includes(context)
  const formTitle = context === 'superset' ? 'Log round 1' : context === 'circuit-round' ? 'Round 1 recorded' : context === 'set-correction' ? 'Edit set 1' : context === 'extra-set' ? 'Log set 4' : ['anchor','other-lift','timed-movement','distance-movement','circuit-movement'].includes(context) ? 'Log set 1' : title
  return <div className="clr-accepted-example" data-logging-context={context}>
    <Button onClick={() => setOpen(true)}>Open {title}</Button>
    <Checkbox label="Fail next sample save" checked={fail} onChange={setFail} />
    {saved && <p role="status">Sample saved locally for this example.</p>}
    <LoggingOverlay open={open} title={saved ? 'Recorded' : timed ? 'Log results' : formTitle} onClose={() => setOpen(false)}>
      {saved ? <p role="status">Recorded</p> : timed ? <TimedResultLog embedded block={sampleBlock(context as TimedFormat,rounds)} format={context as TimedFormat} finished={false} weightUnit="lb" onSave={async () => {
        setAttempts(value => value+1)
        if (fail && attempts === 0) throw new Error('Synthetic retry fixture')
        setSaved(true)
      }} /> : <ContextForm context={context} fail={fail} onSave={() => setSaved(true)} onCancel={()=>setOpen(false)} />}
    </LoggingOverlay>
    {saved && <Button variant="quiet" onClick={() => { setSaved(false); setAttempts(0) }}>Reset sample</Button>}
  </div>
}
