/**
 * Round 7's Warm-up and Cooldown (A3 TASK-109; TASK-022, TASK-034: REQ-022,
 * REQ-034; C49; R01, R13, R14, R15) — the concise guide and its separate
 * preparation clock, on `/review`, `/workout` and `/history/:id`.
 *
 * The look is the accepted gallery's (bec4454, `?state=preparation`): one card
 * with the section's stable title, its approximate total time on the heading
 * row and the movement names on separate lines; on the live workout the rest
 * timer's own pattern (`CountdownBar`) below it, with Start / Pause and Add
 * 30 sec and no Dismiss or other hiding action.
 *
 * The routes draw it from real data only: TASK-034's reading
 * (`src/state/preparation-guide.ts`) of the composed workout on Review and of
 * the session's active rows on Workout and History detail, so a swap reads in
 * place and the title, names, count and time are data, never the gallery's
 * sample. A reading is drawn in its four states: loading and a failed read keep
 * their meanings (a busy region; a named failure with its retry), a section
 * with no movement left says so, and a workout that composes no such section
 * draws nothing. The gallery still hands its sample straight in as `guide`;
 * no route does.
 *
 * The clock is the session's (`usePreparationClock`): the workout shell holds
 * every preparation clock once (`PreparationClockProvider`), keyed by its
 * section, so leaving the section and coming back finds it as it was; without a
 * provider (a gallery specimen) it is the component's own. Its warning is the
 * shared one, read from its own deadline (`movementCountdownDeadline`): the
 * colour and "Final 10 seconds" from ten seconds, the breathe and the one edge
 * at five only while it runs (a paused clock keeps the colour), and none once
 * it has run out. It records nothing.
 */
import {Button,Plus,Play,Pause} from '../design-system/index'
import {COUNTDOWN_COLOR_SECONDS,movementCountdownDeadline} from '../state/countdown-urgency'
import {sectionTypeLabel} from '../state/onboarding'
import {usePreparationClock} from '../state/preparation-clock'
import {approximateDurationText,type PreparationGuide as PreparationGuideData,type PreparationGuideReading,type PreparationSectionType} from '../state/preparation-guide'
import {Card} from './card'
import {ErrorView,LoadingView} from './view-state'
import {CountdownBar} from './workout-chrome'
import type {PreparationGuideView} from './workout-experience-presentation'

interface GuideOptions {
 /** The live workout's separate preparation clock (R15). Review and History draw none. */
 withTimer?: boolean
 /** The section the clock belongs to: one clock per section, per session. */
 clockKey?: string
 /** Injectable clock, for a test that moves time. */
 now?: () => number
}

export type PreparationGuideProps = GuideOptions & (
 /** A ready guide as Round 7 draws it: the gallery's sample, or a route's reading. */
 | {guide:PreparationGuideView;reading?:never;type?:never;onRetry?:never}
 /** TASK-034's reading of one section, in whichever state it is in. */
 | {reading:PreparationGuideReading;type:PreparationSectionType;onRetry?:()=>void;guide?:never}
)

/** TASK-034's guide as Round 7's view: the title, whole minutes and the names, nothing else. */
function preparationGuideView(guide:PreparationGuideData):PreparationGuideView{
 return {title:guide.title==='Cooldown'?'Cooldown':'Warm-up',minutes:guide.approximateMinutes,movements:guide.movements.map(movement=>movement.name)}
}

export function PreparationGuide(props:PreparationGuideProps){
 const {withTimer=false,clockKey,now}=props
 if(props.reading===undefined)return <ReadyGuide guide={props.guide} withTimer={withTimer} clockKey={clockKey} now={now} />
 const {reading,type,onRetry}=props
 // The title heads the section on every route (Round 7: the live workout's
 // compact navigator draws no heading of its own, so the card's title does).
 const title=sectionTypeLabel(type)
 switch(reading.status){
  case 'loading':return <div className="clr-stack" data-preparation-guide={title} data-preparation-state="loading">
   <Card heading={title}><LoadingView label={`Reading the ${title.toLowerCase()}`} /></Card>
  </div>
  case 'error':return <div className="clr-stack" data-preparation-guide={title} data-preparation-state="error">
   <Card heading={title}><ErrorView error={reading.error} title={`The ${title.toLowerCase()} didn’t load`} actionLabel="Try again" onRetry={onRetry} /></Card>
  </div>
  case 'missing':
   // No such section composed, or no workout: nothing to guide, and nothing drawn in its place.
   if(reading.reason!=='no-movements')return null
   return <div className="clr-stack" data-preparation-guide={title} data-preparation-state="missing">
    <Card heading={title}><p style={{margin:0}}>No movements are left in this {title.toLowerCase()}.</p></Card>
   </div>
  case 'ready':return <ReadyGuide guide={preparationGuideView(reading.guide)} withTimer={withTimer} clockKey={clockKey} now={now} />
 }
}

function ReadyGuide({guide,withTimer,clockKey,now}:{guide:PreparationGuideView}&Required<Pick<GuideOptions,'withTimer'>>&Pick<GuideOptions,'clockKey'|'now'>){
 return <div className="clr-stack" data-preparation-guide={guide.title} data-preparation-state="ready">
  <Card heading={guide.title} meta={approximateDurationText(guide.minutes)}><ul className="clr-v4-guide-list" aria-label={`${guide.title} movements`}>{guide.movements.map((m,index)=><li key={`${index}-${m}`}>{m}</li>)}</ul></Card>
  {withTimer&&<PreparationTimer clockKey={clockKey??guide.title} title={guide.title} minutes={guide.minutes} now={now} />}
 </div>
}

/** The separate preparation clock: the rest timer's pattern over the guide's own time (R14, R15). */
function PreparationTimer({clockKey,title,minutes,now}:{clockKey:string;title:string;minutes:number;now?:()=>number}){
 const {status,totalSeconds,remainingSeconds,start,pause,extend}=usePreparationClock(clockKey,minutes,now)
 const running=status==='running'
 return <CountdownBar label={title} remainingSeconds={remainingSeconds} totalSeconds={totalSeconds}
  deadline={movementCountdownDeadline(status,remainingSeconds)}
  urgent={remainingSeconds>0&&remainingSeconds<=COUNTDOWN_COLOR_SECONDS}
  actions={<><Button variant="secondary" icon={running?<Pause/>:<Play/>} disabled={remainingSeconds===0} onClick={running?pause:start}>{remainingSeconds===0?'Time reached':running?'Pause':'Start'}</Button><Button variant="quiet" icon={<Plus/>} onClick={extend}>Add 30 sec</Button></>}/>
}
