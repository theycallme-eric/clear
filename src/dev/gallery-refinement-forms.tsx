/** Gallery-only state/controllers. No account client, persistence or route injection. */
import { useState } from 'react'
import { Button, Checkbox, ChoiceGroup, Input } from '../design-system/index'
import { FeelingRow } from '../ui/feeling-row'
import { Select } from '../ui/select'
import { SetEffortChoice, type SetEffort } from '../ui/set-effort'
import { DeadlineTimer } from '../ui/refinements/deadline-timer'
import { LoggingOverlay } from '../ui/refinements/logging-overlay'
import { TimedResultLog, type TimedFormat } from '../ui/refinements/timed-result-log'
import { LOGGING_CONTEXTS, sampleBlock, type LoggingContext } from './gallery-refinement-data'

function MovementEntry({ name, context }: { name: string; context: LoggingContext }) {
  const [done, setDone] = useState(false)
  const [weight, setWeight] = useState('')
  const [unit, setUnit] = useState('lb')
  const [amount, setAmount] = useState('8')
  const [effort, setEffort] = useState<SetEffort | null>(null)
  const measure = context === 'timed-movement' ? 'Seconds' : context === 'distance-movement' ? 'Distance' : 'Reps'
  return <section className="clr-accepted-form__movement" aria-label={name}>
    <p>{name}</p>
    <Checkbox label="Performed" checked={done} onChange={setDone} />
    <div className="clr-accepted-form__measure">
      <Input label="Weight" type="number" min="0" value={weight} onChange={setWeight} />
      <Select label="Unit" value={unit} onChange={setUnit} options={[{value:'lb',label:'lb'},{value:'kg',label:'kg'}]} />
      <Input label={measure} type="number" min="0" value={amount} onChange={setAmount} />
    </div>
    <SetEffortChoice scopeLabel={name} value={effort} onChange={setEffort} />
  </section>
}

function ContextForm({ context, fail, onSave }: { context: LoggingContext; fail: boolean; onSave: () => void }) {
  const [notes, setNotes] = useState('')
  const [feeling, setFeeling] = useState<number | null>(null)
  const [reason, setReason] = useState('recovery')
  const [error, setError] = useState(false)
  const [rest, setRest] = useState(90)
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
      <div className="clr-timed-actions"><Button variant="secondary" onClick={() => setRest(value => value+30)}>Add 30s</Button><Button variant="quiet" onClick={() => setRestRunning(value => !value)}>{restRunning ? 'Pause rest' : 'Resume rest'}</Button><Button variant="quiet" onClick={() => { setRest(0); setRestRunning(false) }}>Skip rest</Button></div>
    </div>}
    {recorded ? <><p>00:32 round time recorded</p><Button variant="secondary" onClick={onSave}>Take back this round</Button></> : <>
      {!noteOnly && <><MovementEntry name={group ? 'A1 One arm row · 3 × 8–12 reps' : 'Back squat · 3 × 8 reps'} context={context} />
        {group && <MovementEntry name="A2 Bicep curl · 3 × 8–12 reps" context={context} />}</>}
      {context === 'workout-feedback' && <FeelingRow value={feeling} onChange={setFeeling} />}
      {context === 'rest-day' && <ChoiceGroup legend="Reason" value={reason} options={[{value:'recovery',label:'Recovery'},{value:'schedule',label:'Schedule'},{value:'other',label:'Other'}]} onChange={value => setReason(String(value))} />}
      <Input label={context === 'movement-note' ? 'Movement note' : 'Notes · optional'} multiline rows={3} value={notes} onChange={setNotes} />
      {error && <p role="alert">Your log didn’t save. Try again.</p>}
      <div className="clr-accepted-form__actions"><Button type="submit" variant="primary">{error ? 'Retry save' : context === 'set-correction' ? 'Save correction' : 'Save log'}</Button></div>
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
  return <div className="clr-accepted-example" data-logging-context={context}>
    <Button onClick={() => setOpen(true)}>Open {title}</Button>
    <Checkbox label="Fail next sample save" checked={fail} onChange={setFail} />
    {saved && <p role="status">Sample saved locally for this example.</p>}
    <LoggingOverlay open={open} title={saved ? 'Recorded' : timed ? 'Log results' : context === 'superset' ? 'Log round 1' : title} onClose={() => setOpen(false)}>
      {saved ? <p role="status">Recorded</p> : timed ? <TimedResultLog embedded block={sampleBlock(context as TimedFormat,rounds)} format={context as TimedFormat} finished={false} weightUnit="lb" onSave={async () => {
        setAttempts(value => value+1)
        if (fail && attempts === 0) throw new Error('Synthetic retry fixture')
        setSaved(true)
      }} /> : <ContextForm context={context} fail={fail} onSave={() => setSaved(true)} />}
    </LoggingOverlay>
    {saved && <Button variant="quiet" onClick={() => { setSaved(false); setAttempts(0) }}>Reset sample</Button>}
  </div>
}
