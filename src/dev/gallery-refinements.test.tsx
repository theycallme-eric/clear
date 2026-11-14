import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LOGGING_CONTEXTS, type LoggingContext } from './gallery-refinement-data'
import { GalleryLoggingMoment } from './gallery-refinement-forms'
import { GalleryLadderFlow } from './gallery-refinement-flow'
import { REFINEMENT_STATE_IDS } from './gallery-refinement-states'
import coverage from './gallery-refinement-coverage.json'

const title = (context: LoggingContext) => LOGGING_CONTEXTS.find(([id]) => id === context)![1]

/** Opens a state the way the gallery does: the real controls are clicked until its dialog is up. */
async function open(context: LoggingContext): Promise<HTMLDialogElement> {
  const view = render(<MemoryRouter><GalleryLoggingMoment context={context} title={title(context)} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: `Open ${title(context)}` }))
  let dialog: HTMLDialogElement | undefined
  await waitFor(() => {
    dialog = [...view.container.querySelectorAll('dialog')].filter(d => d.open).at(-1)
    expect(dialog).toBeDefined()
  }, { timeout: 3000 })
  return dialog!
}

it('preserves every native criterion and resolves every reference state',()=>{
  expect(coverage.requirements).toHaveLength(40)
  expect(coverage.requirements.flatMap(r=>r.acceptanceCriteria)).toHaveLength(162)
  const ids=coverage.requirements.flatMap(r=>r.acceptanceCriterionIds)
  expect(new Set(ids).size).toBe(ids.length)
  for(const requirement of coverage.requirements) {
    expect(requirement.acceptanceCriteria.length).toBe(requirement.acceptanceCriterionIds.length)
    for(const id of requirement.states) expect(REFINEMENT_STATE_IDS).toContain(id)
    expect(requirement.limit.length).toBeGreaterThan(20)
  }
})

const DIALOG_NAMES: Readonly<Record<LoggingContext, string>> = {
  anchor: 'Log set 1', 'other-lift': 'Log set 1', 'timed-movement': 'Log set 1', 'distance-movement': 'Log set 1',
  'extra-set': 'Log set 4', 'set-correction': 'Edit set 1', superset: 'Log round 1', 'circuit-round': 'Round 1 recorded',
  'circuit-movement': 'Log set 1', 'movement-note': 'Movement note', 'workout-feedback': 'Workout feedback',
  'rest-day': 'Log rest day', emom: 'Log results', amrap: 'Log results', for_time: 'Log results', ladder: 'Log results',
}

describe('shared logging contexts',()=>{
  it.each(LOGGING_CONTEXTS)('%s reaches its real Round 7 dialog, named, with an X-only close', async (context)=>{
    const dialog=await open(context)
    expect(dialog).toHaveAttribute('aria-label', DIALOG_NAMES[context])
    const close=within(dialog).getByRole('button',{name:'Close log'})
    expect(close.textContent).not.toContain('Close')
    fireEvent.click(close)
    await waitFor(()=>expect(dialog.open).toBe(false))
  })
})

it.each(['anchor','other-lift','timed-movement','distance-movement','extra-set','superset'] as const)(
  '%s shows the running rest at the top of its set dialog', async context=>{
    const dialog=await open(context)
    expect(within(dialog).getByRole('button',{name:'Skip rest'})).toBeInTheDocument()
    expect(within(dialog).getByRole('button',{name:'Add 30s'})).toBeInTheDocument()
  })

it('Finish carries checked progress and Undo preserves the draft',async()=>{
  render(<MemoryRouter><GalleryLadderFlow /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button',{name:'Start ladder'}))
  fireEvent.click(await screen.findByRole('button',{name:'Complete round 3'}))
  fireEvent.click(screen.getByRole('button',{name:'Finish'}))
  const dialog=await screen.findByRole('dialog',{name:'Log results'})
  fireEvent.change(within(dialog).getByLabelText('Notes · optional'),{target:{value:'Keep this draft'}})
  fireEvent.click(within(dialog).getByRole('button',{name:/^Undo finish/}))
  expect(screen.getByRole('button',{name:'Complete round 3'})).toHaveAttribute('aria-pressed','true')
  fireEvent.click(screen.getByRole('button',{name:'Finish'}))
  expect(within(await screen.findByRole('dialog',{name:'Log results'})).getByLabelText('Notes · optional')).toHaveValue('Keep this draft')
})

it('a failed timed save keeps the entries and saves on an explicit retry',async()=>{
  render(<MemoryRouter><GalleryLoggingMoment context="for_time" title={title('for_time')} /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button',{name:'Fail next sample save'}))
  fireEvent.click(screen.getByRole('button',{name:'Open For Time results'}))
  const dialog=await screen.findByRole('dialog',{name:'Log results'},{timeout:3000})
  fireEvent.change(within(dialog).getByLabelText('Completed · wall ball'),{target:{value:'30'}})
  fireEvent.click(within(dialog).getByRole('button',{name:'Save log'}))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/didn’t save/i)
  expect(within(dialog).getByLabelText('Completed · wall ball')).toHaveValue(30)
  fireEvent.click(within(dialog).getByRole('button',{name:'Save log'}))
  expect(await screen.findByText('Log saved')).toBeInTheDocument()
})

it.each(['anchor','other-lift','extra-set','superset'] as const)('%s keeps its own fields and adds no notes field',async context=>{
  const dialog=await open(context)
  expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
  expect(within(dialog).queryAllByRole('checkbox',{name:'Performed'})).toHaveLength(context==='superset'?2:0)
})

it('names the movement on the note field and saves it',async()=>{
  const dialog=await open('movement-note')
  expect(within(dialog).getByRole('textbox',{name:'one arm row'})).toBeInTheDocument()
  expect(within(dialog).getByRole('button',{name:'Save note — one arm row'})).toBeInTheDocument()
})

it('retains real rest-day reasons and adds no rest-day note',async()=>{
  const dialog=await open('rest-day')
  expect(within(dialog).getAllByRole('option').map(option=>(option as HTMLOptionElement).value)).toEqual(['rest','injury','sick','vacation'])
  expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
})

it('opens a saved set for correction with its stored values',async()=>{
  const dialog=await open('set-correction')
  expect(within(dialog).getByLabelText('Weight')).toHaveValue(95)
  expect(within(dialog).getByLabelText('Reps')).toHaveValue(5)
  expect(within(dialog).getByRole('button',{name:'Save correction'})).toBeInTheDocument()
  expect(within(dialog).getByRole('button',{name:'Clear set 1'})).toBeInTheDocument()
})

it('keeps decimal actual load valid instead of inheriting the native integer step',async()=>{
  const dialog=await open('anchor')
  const weight=within(dialog).getByLabelText('Weight') as HTMLInputElement
  fireEvent.change(weight,{target:{value:'60.5'}})
  expect(weight.checkValidity()).toBe(true)
})
