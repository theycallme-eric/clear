/** Current components and shared motion; experiments stay inside this review surface. */
import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { Button, ChamferedFrame, Chip, Clock, IntensitySlider, Progress, ScrollRegion, TimerDisplay } from '../design-system/index'
import { Card } from '../ui/card'
import { CollapsibleSection } from '../ui/collapsible-section'
import { ListFrame, ListRow } from '../ui/composition'
import { Heading, HeadingSection } from '../ui/Heading'
import { interruptMotion, prefersReducedMotion, useArrivalStagger, useInterfaceLoop } from '../ui/motion'
import { MOTION_PATTERNS, type MotionPattern } from './gallery-motion-patterns'

import './gallery-motion.css'

const EFFECT_CLASSES = [...MOTION_PATTERNS.map(pattern => pattern.className), 'clr-phosphor-in', 'clr-scan--once']
// The earlier source request specifies this preview depth. It is not a new app token.
const DISSOLVE_REFERENCE_PX = 26
const SCROLL_ROWS = Array.from({ length: 14 }, (_, index) => index + 1)

function clearSamples(elements: (HTMLElement | null)[]) {
  for (const element of elements) {
    if (typeof element?.getAnimations === 'function') element.getAnimations({ subtree: true }).forEach(animation => animation.cancel())
    element?.classList.remove(...EFFECT_CLASSES)
  }
}

function MotionLab() {
  const subject = useRef<HTMLDivElement>(null)
  const rows = useRef<HTMLDivElement>(null)
  const readout = useRef<HTMLDivElement>(null)
  const run = useRef(0)
  const [seconds, setSeconds] = useState(1428)
  const [duration, setDuration] = useState(200)
  const [steps, setSteps] = useState(6)
  const [customTiming, setCustomTiming] = useState(false)
  const [last, setLast] = useState('Choose an effect to replay it on the sample.')

  useEffect(() => {
    const elements = [subject.current, rows.current, readout.current]
    return () => { run.current += 1; clearSamples(elements) }
  }, [])

  function stop() {
    run.current += 1
    clearSamples([subject.current, rows.current, readout.current])
  }

  function play(pattern: MotionPattern) {
    stop()
    const generation = run.current
    const reduced = prefersReducedMotion()
    setLast(pattern.label + (reduced ? ' · reduced motion: static end state' : ' · ' + pattern.meaning))
    if (pattern.id === 'tumble') {
      setSeconds(value => value === 1428 ? 1539 : 1428)
      return
    }
    if (reduced) return
    const target = pattern.id === 'boot' ? rows.current : subject.current
    if (!target) return
    void target.offsetWidth
    target.classList.add(pattern.className)
    if (pattern.id === 'scan') target.classList.add('clr-scan--once')
    const finished = () => typeof target.getAnimations === 'function'
      ? Promise.allSettled(target.getAnimations({ subtree: true }).map(animation => animation.finished))
      : Promise.resolve([])
    void finished().then(async () => {
      if (run.current !== generation) return
      target.classList.remove(pattern.className, 'clr-scan--once')
      if (pattern.id === 'phosphor' || pattern.id === 'crtoff') {
        target.classList.add('clr-phosphor-in')
        await finished()
        if (run.current === generation) target.classList.remove('clr-phosphor-in')
      }
    })
  }

  const timing = customTiming ? {
    '--dur-base': String(duration) + 'ms', '--dur-fast': String(duration) + 'ms',
    '--dur-cut': String(duration) + 'ms', '--dur-slow': String(duration * 2) + 'ms',
    '--dur-disrupt': String(duration) + 'ms',
    ...Object.fromEntries([2, 3, 4, 6, 8, 12, 16, 24].map(count => ['--step-' + count, 'steps(' + steps + ', end)'])),
  } as CSSProperties : undefined

  return (
    <HeadingSection className="clr-gallery-motion__section" data-motion-lab="" style={timing}>
      <Heading>Motion Lab</Heading>
      <p>The nine effects from the package, replayed with current app components and the same shipped keyframes.</p>
      <Card heading="Replay a pattern">
        <div className="clr-gallery-motion__effects">
          {MOTION_PATTERNS.map(pattern => <Button key={pattern.id} variant="secondary" size="sm" onClick={() => play(pattern)}>{pattern.label}</Button>)}
        </div>
        <p role="status" className="clr-text-data-xs">{last}</p>
        <CollapsibleSection label="Local timing controls" defaultExpanded={false}>
          <div className="clr-gallery-motion__section">
            <p>Changes affect this lab only. Reset restores each pattern’s shipped timings and step counts.</p>
            <IntensitySlider label="Duration (ms)" aria-label="Duration (ms)" min={60} max={800} step={20} value={duration} valueText={String(duration) + ' milliseconds'} onChange={value => { stop(); setDuration(value); setCustomTiming(true) }} style={{ minWidth: 0 }} />
            <IntensitySlider label="Step count" aria-label="Step count" min={1} max={24} step={1} value={steps} onChange={value => { stop(); setSteps(value); setCustomTiming(true) }} style={{ minWidth: 0 }} />
            <Button variant="quiet" onClick={() => { stop(); setCustomTiming(false); setDuration(200); setSteps(6) }}>Reset timing</Button>
            <p className="clr-text-data-xs">{customTiming ? 'Custom lab timing' : 'System timing'}</p>
          </div>
        </CollapsibleSection>
      </Card>
      <div className="clr-gallery-motion__samples">
        <div ref={subject} data-motion-subject="">
          <Card heading="Chamfered panel">
            <p>Sharp glass, angular frame, and a stable foreground.</p>
          </Card>
          <span className="clr-scan-band" aria-hidden="true" />
        </div>
        <div ref={readout} data-motion-readout=""><TimerDisplay seconds={seconds} /></div>
      </div>
      <Card heading="Arriving entries">
        <ListFrame><div ref={rows} data-motion-rows="">
          {[1, 2, 3].map(value => <ListRow key={value}>Entry {String(value).padStart(2, '0')} · nominal</ListRow>)}
        </div></ListFrame>
      </Card>
    </HeadingSection>
  )
}

function ArrivingRows({ updated }: { updated: boolean }) {
  const arrival = useArrivalStagger()
  return <div {...arrival}>{[1, 2, 3].map(index => <ListRow key={index}>{updated ? 'Updated' : 'Entry'} {index}</ListRow>)}</div>
}

function LoopReading({ urgent = false }: { urgent?: boolean }) {
  const loop = useInterfaceLoop(urgent ? 'urgent' : 'busy')
  return (
    <div {...loop} data-motion-loop={urgent ? 'urgent' : 'busy'}>
      {urgent ? <p className="clr-text-data-xs clr-pulse-micro"><Clock size={16} /> Low timer · 00:05</p> : <Progress label="Reading sample history" />}
    </div>
  )
}

function MotionRules() {
  const [selected, setSelected] = useState(false)
  const [loopStarted, setLoopStarted] = useState(false)
  const [urgent, setUrgent] = useState(false)
  const [version, setVersion] = useState(0)
  const [updated, setUpdated] = useState(false)
  const interrupt = useRef<HTMLDivElement>(null)
  return (
    <HeadingSection className="clr-gallery-motion__section">
      <Heading>When to use each pattern</Heading>
      <Card heading="Each effect has a meaning">
        <p>Mechanical, linear or stepped interface feedback. Focus is immediate; atmosphere is the eased background exception. Available vocabulary is not an instruction to animate every surface.</p>
        <dl className="clr-gallery-motion__rules">
          {MOTION_PATTERNS.map(pattern => <div key={pattern.id}>
            <dt>{pattern.label} · {pattern.status}</dt>
            <dd>{pattern.meaning}<br />{pattern.use}<br /><code>{pattern.source}</code></dd>
          </div>)}
        </dl>
      </Card>
      <Card heading="Interaction timing">
        <div className="clr-gallery-motion__effects">
          <Button variant="secondary">Hover or hold</Button>
          <Chip selected={selected} onClick={() => setSelected(value => !value)}>Toggle selection</Chip>
          <Button variant="quiet">Tab to focus</Button>
        </div>
        <p>Hover uses the surface transition. Press is a hard cut. Selection changes state with a written/ticked cue. Keyboard focus appears immediately.</p>
      </Card>
      <Card heading="New state interrupts an entrance">
        <div className="clr-gallery-motion__effects">
          <Button variant="secondary" onClick={() => { interrupt.current?.classList.remove('clr-interlace'); setUpdated(false); setVersion(value => value + 1) }}>Start list arrival</Button>
          <Button variant="secondary" onClick={() => { if (interrupt.current) interruptMotion(interrupt.current); setUpdated(true) }}>Replace with updated state</Button>
        </div>
        <p>Start the arrival, then replace it. The app’s shared helper cuts the old entrance and re-syncs the new state; the action never waits for the animation.</p>
        <ListFrame><div ref={interrupt}>{version === 0
          ? [1, 2, 3].map(index => <ListRow key={index}>{updated ? 'Updated' : 'Entry'} {index}</ListRow>)
          : <ArrivingRows key={version} updated={updated} />}</div></ListFrame>
      </Card>
      <Card heading="One interface loop in view">
        <p>Urgent state takes priority over a busy loop. The other signal remains visible and still. Atmosphere is coordinated separately.</p>
        <Button variant="secondary" onClick={() => { setLoopStarted(value => !value); setUrgent(false) }}>{loopStarted ? 'Stop loop example' : 'Start loop example'}</Button>
        {loopStarted && <>
          <Chip selected={urgent} onClick={() => setUrgent(value => !value)}>Introduce urgent state</Chip>
          <LoopReading />
          {urgent && <LoopReading urgent />}
        </>}
      </Card>
    </HeadingSection>
  )
}

function ScrollComparison() {
  const pair = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(0)
  function scrollBoth(value: number) {
    setPosition(value)
    pair.current?.querySelectorAll<HTMLElement>('.clr-scroll-region__scroller').forEach(scroller => {
      scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * value / 100
    })
  }
  return (
    <HeadingSection className="clr-gallery-motion__section" data-scroll-comparison="">
      <Heading>Compare the scroll treatments</Heading>
      <Card heading="Sharp cutoff or CRT dissolve">
        <p>Both examples use the real ScrollRegion and identical content. The first cuts text off sharply. The second adds the earlier request’s edge fade. Both have the same brief edge glow while scrolling.</p>
        <IntensitySlider label="Scroll both samples (%)" aria-label="Scroll both samples (%)" min={0} max={100} value={position} onChange={scrollBoth} style={{ minWidth: 0 }} />
        <p className="clr-text-data-xs">Move the slider to compare matching positions, or scroll each panel independently.</p>
        <div ref={pair} className="clr-gallery-motion__scroll-pair" style={{ '--gallery-dissolve-depth': String(DISSOLVE_REFERENCE_PX) + 'px' } as CSSProperties}>
          {(['hard', 'dissolve'] as const).map(kind => <HeadingSection key={kind}>
            <Heading className="clr-gallery-motion__sample-title">{kind === 'hard' ? 'Hard edge' : 'CRT dissolve'}</Heading>
            <p className="clr-text-data-xs">{kind === 'hard' ? 'Current' : 'Reference'}</p>
            <ChamferedFrame role="structure" cornerSize="md" trace={false} className="clr-gallery-motion__scroll-stage" style={{ paddingBottom: 0 }}>
              <ScrollRegion title="Entries" foot={<span className="clr-text-data-xs">14 entries</span>} scrollerProps={{ role: 'region', 'aria-label': kind === 'hard' ? 'Hard edge sample entries' : 'CRT dissolve sample entries', tabIndex: 0, className: kind === 'dissolve' ? 'clr-gallery-motion__dissolve' : undefined }} data-gallery-scroll={kind}>
                <div className="clr-gallery-motion__scroll-body"><ListFrame>
                  {SCROLL_ROWS.map(index => <ListRow key={index}><span className="clr-text-data-xs">Entry {String(index).padStart(2, '0')}</span><br />Sample reading</ListRow>)}
                </ListFrame></div>
              </ScrollRegion>
            </ChamferedFrame>
          </HeadingSection>)}
        </div>
        <p>The 26 CSS pixel dissolve is a gallery-only comparison, not current app behavior or an approved rollout. The earlier request and shipped contract disagree; choose the treatment visually before integration.</p>
        <p>Home currently uses the hard edge. The glow appears while scrolling and settles shortly after you stop.</p>
      </Card>
    </HeadingSection>
  )
}

export function GalleryMotion() {
  const [reduced, setReduced] = useState(false)
  return (
    <div className={'clr-dev-gallery__section clr-gallery-motion' + (reduced ? ' clr-gallery-motion--reduced' : '')}>
      <Heading>Motion and behavior</Heading>
      <p>The 0.14.3 Motion Lab and Motion Rules, brought into the app-styled library. Replay the existing effects, see where they belong, and compare the two scroll treatments.</p>
      <Card heading="Review motion deliberately">
        <Button variant="quiet" aria-pressed={reduced} onClick={() => setReduced(value => !value)}>Preview reduced motion</Button>
        <p>Device reduced-motion preferences always apply. This control also makes this review area still, without changing your device or app settings.</p>
        <p className="clr-text-data-xs">{reduced ? 'Reduced-motion preview active' : 'Device motion preference active'}</p>
      </Card>
      <MotionLab />
      <ScrollComparison />
      <MotionRules />
      <p className="clr-text-data-xs">Sources: pinned 0.14.3 preview/motion-lab.html, preview/motion-rules.html and the current shared component/motion owners. Phosphor Echo is a separate static design input.</p>
    </div>
  )
}
