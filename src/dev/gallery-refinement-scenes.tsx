import { useState } from 'react'
import { ArrowLeft, Button, ChoiceGroup, IconButton, Input, Dumbbell, WeightPlate, Clock, Target, Gauge } from '../design-system/index'
import { SummaryFact } from '../ui/composition'
import { Card } from '../ui/card'
import { DeadlineTimer } from '../ui/refinements/deadline-timer'
import { RefinementWorkoutCard, RefinementWorkoutHeader, RefinementPreparation } from '../ui/refinements/workout-card'
import { LoggingOverlay } from '../ui/refinements/logging-overlay'
import { EQUIPMENT, ONBOARDING_STEPS } from '../state/onboarding'
import { SectionHeader } from '../ui/workout-chrome'
import type { SessionProgress } from '../state/workout-progress'
import { Select } from '../ui/select'

export function GalleryMovementCards({ initialReview = false }: { initialReview?: boolean } = {}) {
  const [review,setReview]=useState(initialReview)
  const [active,setActive]=useState(1)
  const progress: SessionProgress = {total:3,completed:1,sections:[
    {sectionId:'gallery-warmup',title:'Warm-up',sectionType:'warmup',index:0,status:'complete',blocks:[]},
    {sectionId:'gallery-conditioning',title:'Conditioning',sectionType:'conditioning',index:1,status:'in_progress',blocks:[]},
    {sectionId:'gallery-cooldown',title:'Cooldown',sectionType:'cooldown',index:2,status:'not_started',blocks:[]},
  ]}
  return <div className="clr-accepted-example">
    <ChoiceGroup legend="Context" value={review?'review':'workout'} options={[{value:'review',label:'Review'},{value:'workout',label:'Workout'}]} onChange={value=>setReview(value==='review')} />
    <RefinementWorkoutHeader />
    {!review && <SectionHeader compact section={progress.sections[active]} position={active+1} total={3} progress={progress} bar={false} onSelect={setActive} />}
    {(['EMOM','AMRAP','FOR TIME'] as const).map(format=><RefinementWorkoutCard key={format} format={format} review={review}
      movements={format==='FOR TIME'?[{name:'Wall ball',prescription:'40 reps',equipment:'Medicine ball',load:'9 lb'}]:[{name:'KB swing',prescription:format==='EMOM'?'Min 1 · 12 reps':'12 reps',equipment:'Kettlebell',load:'24 lb'},{name:'Burpee',prescription:'10 reps',equipment:'Bodyweight'}]}
      actions={<Button variant="primary">{review?'Start workout':`Start ${format}`}</Button>} />)}
  </div>
}
export function GalleryOverviewSummary() {
  const [saved,setSaved]=useState(false)
  const [bodyweight,setBodyweight]=useState(false)
  return <div className="clr-accepted-example">
    <ChoiceGroup legend="Overview context" value={saved?'saved':'planned'} options={[{value:'planned',label:'Planned workout'},{value:'saved',label:'Saved workout'}]} onChange={value=>setSaved(value==='saved')} />
    <ChoiceGroup legend="Equipment context" value={bodyweight?'bodyweight':'loaded'} options={[{value:'loaded',label:'Loaded'},{value:'bodyweight',label:'Bodyweight only'}]} onChange={value=>setBodyweight(value==='bodyweight')} />
    <Card heading={saved?'Saved workout':'Workout overview'}><dl className="clr-accepted-facts">
      <SummaryFact glyph={<Clock />} term="Duration">{saved?'42 min':'45 min'}</SummaryFact>
      <SummaryFact glyph={<Target />} term="Focus">Upper body</SummaryFact>
      <SummaryFact glyph={<Gauge />} term="Intensity">7</SummaryFact>
    </dl><p className="label">Required equipment</p><p>{bodyweight?'BODYWEIGHT ONLY':'BARBELL · BENCH · DUMBBELLS'}</p></Card>
    <Card heading="Upper-body strength, done."><Button variant="secondary">Save as favorite</Button></Card>
    <div className="clr-accepted-metrics"><Card heading="Duration"><p>42 min</p></Card><Card heading="Streak"><p>2 days</p><p>Through yesterday</p></Card></div>
  </div>
}
export function GalleryPreparationReview() {
  return <div className="clr-accepted-example"><RefinementPreparation movements={['Arm circles','Scapular push-up','Bodyweight squat']} />
    <DeadlineTimer seconds={300} label="Warm-up" />
    <RefinementWorkoutCard format="FOR TIME" review movements={[{name:'Wall ball',prescription:'40 reps',equipment:'Medicine ball',load:'9 lb'}]} />
    <RefinementPreparation title="Cooldown" minutes={3} movements={['Chest stretch','Lat stretch']} />
    <Button variant="secondary">Regenerate</Button>
  </div>
}
export function GalleryGenerateSetupHistory() {
  const [focus,setFocus]=useState('Upper body')
  const [minutes,setMinutes]=useState('45')
  const [focusOpen,setFocusOpen]=useState(false)
  const [filters,setFilters]=useState('all')
  return <div className="clr-accepted-example">
    <Card><div className="clr-accepted-example"><div className="clr-accepted-scene-head"><IconButton label="Back to Home" icon={<ArrowLeft />} /><p className="label">Generate</p></div>
      <p className="label">Build strength</p><Button variant="quiet" onClick={()=>setFocusOpen(true)}>{focus}</Button>
      <Input label="Time" unit="MINUTES" type="number" value={minutes} onChange={setMinutes} /><Button variant="primary">Generate workout</Button></div></Card>
    <LoggingOverlay open={focusOpen} title="Focus" onClose={()=>setFocusOpen(false)}><ChoiceGroup legend="Focus" value={focus} options={['Upper body','Lower body','Full body','Recovery']} onChange={value=>{setFocus(String(value));setFocusOpen(false)}} /></LoggingOverlay>
    <Card><div className="clr-accepted-setup"><header><p className="label">Setup</p><p>Step 1 of {ONBOARDING_STEPS.length} · Equipment</p></header><div><ChoiceGroup legend="Equipment" multiple value={['dumbbells']} options={[{value:'dumbbells',label:'Dumbbells'},{value:'kettlebell',label:'Kettlebell'},{value:'bench',label:'Bench'}]} /></div></div></Card>
    <Card heading="History"><Select label="Filter" value={filters} onChange={setFilters} options={[{value:'all',label:'All workouts'},{value:'completed',label:'Completed'},{value:'partial',label:'Incomplete'}]} />
      <div className="clr-accepted-history-row"><p className="label">Upper-body strength</p><p>November 3 · Completed</p></div>
      <div className="clr-accepted-history-row"><p className="label">Conditioning and longer session name</p><p>November 1 · Incomplete</p></div></Card>
  </div>
}

export function GalleryEquipmentInventory() {
  return <Card heading="Equipment icon inventory"><div className="clr-accepted-example">
    <p>Equipment names remain readable beside movement names. New glyphs are a wanted list; none are invented here.</p>
    <p><Dumbbell aria-hidden="true" /> Dumbbell · shipped</p><p><WeightPlate aria-hidden="true" /> WeightPlate · shipped supplementary glyph</p>
    <ul>{EQUIPMENT.map(option=><li key={option.value}>{option.label} · {option.value==='dumbbells'?'Dumbbell available':'equipment glyph wanted / text fallback'}</li>)}</ul>
    <p>Medicine ball is also wanted from the Wall ball review. It is not a current Setup equipment ID; resolve catalog coverage separately.</p>
  </div></Card>
}
