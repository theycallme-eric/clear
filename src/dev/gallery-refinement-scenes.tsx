import { useState } from 'react'
import { ArrowLeft, Button, ChoiceGroup, IconButton, Input, Dumbbell, WeightPlate, Clock, Target, Gauge, Log } from '../design-system/index'
import { MetricFrame, MetricGrid, SummaryFact, SummaryFacts } from '../ui/composition'
import { Card } from '../ui/card'
import { EquipmentSummary } from '../ui/equipment-summary'
import { LoggingOverlay } from '../ui/logging-overlay'
import { PreparationGuide } from '../ui/preparation-guide'
import { EQUIPMENT, ONBOARDING_STEPS } from '../state/onboarding'
import { Select } from '../ui/select'
import { LiveFlow } from './gallery-refinement-flow'
import { SectionHeader } from '../ui/workout-chrome'
import type { SessionProgress } from '../state/workout-progress'
import { galleryPresentation } from './gallery-refinement-runtime'

/** The real timed cards before Start: shared group header, format badge and movement rows. */
export function GalleryMovementCards() {
  return <div className="clr-stack">
    <LiveFlow kind="emom" />
    <LiveFlow kind="amrap" />
    <LiveFlow kind="for_time" />
  </div>
}

/**
 * Composed from the Round 7 primitives Review's overview and Summary's readouts
 * use; both screens need the account, so they cannot mount here.
 */
export function GalleryOverviewSummary() {
  return <div className="clr-stack">
    <Card heading="Overview">
      <SummaryFacts aria-label="Workout facts">
        <SummaryFact glyph={<Clock size={16} />} term="Duration">50 min</SummaryFact>
        <SummaryFact glyph={<Target size={16} />} term="Focus">Upper body</SummaryFact>
        <SummaryFact glyph={<Gauge size={16} />} term="Intensity">7</SummaryFact>
        <SummaryFact glyph={<Log size={16} />} term="Movements">9</SummaryFact>
      </SummaryFacts>
      <EquipmentSummary equipment={['barbell', 'dumbbell', 'bench', 'kettlebell']} />
    </Card>
    <MetricGrid>
      <Card heading="Duration" padding="sm"><MetricFrame><p data-metric-value="">42 min</p></MetricFrame></Card>
      <Card heading="Streak" padding="sm"><MetricFrame><p data-metric-value="">2 days</p></MetricFrame></Card>
    </MetricGrid>
  </div>
}

const GUIDES = galleryPresentation(async () => {}).guides

/** The real preparation guides around the real For Time card, in Review order. */
export function GalleryPreparationReview() {
  return <div className="clr-stack">
    <PreparationGuide guide={GUIDES.warmup} withTimer />
    <LiveFlow kind="for_time" />
    <PreparationGuide guide={GUIDES.cooldown} />
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

const SECTIONS: SessionProgress = { total: 3, completed: 1, sections: [
  { sectionId: 'gallery-warmup', title: 'Warm-up', sectionType: 'warmup', index: 0, status: 'complete', blocks: [] },
  { sectionId: 'gallery-conditioning', title: 'Conditioning', sectionType: 'conditioning', index: 1, status: 'in_progress', blocks: [] },
  { sectionId: 'gallery-cooldown', title: 'Cooldown', sectionType: 'cooldown', index: 2, status: 'not_started', blocks: [] },
] }

/** The real section header, compact with its jump navigator or full with its progress bar. */
export function GallerySectionHeader({ compact = true }: { compact?: boolean }) {
  const [active, setActive] = useState(1)
  return <SectionHeader compact={compact} section={SECTIONS.sections[active]} position={active + 1} total={3} progress={SECTIONS}
    bar={!compact} onSelect={setActive} />
}
