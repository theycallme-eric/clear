import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LOGGING_CONTEXTS } from './gallery-refinement-data'
import { GalleryLoggingMoment } from './gallery-refinement-forms'
import { GalleryLadderFlow } from './gallery-refinement-flow'
import { REFINEMENT_STATE_IDS } from './gallery-refinement-states'
import coverage from './gallery-refinement-coverage.json'

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
describe('shared logging contexts',()=>{
  it.each(LOGGING_CONTEXTS)('%s opens a named native dialog with an X-only close', (context)=>{
    const view=render(<MemoryRouter><GalleryLoggingMoment context={context} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button',{name:/^Open /}))
    const dialog=view.container.querySelector('dialog')!
    expect(dialog.open).toBe(true)
    expect(within(dialog).getByRole('button',{name:'Close log'}).textContent).not.toContain('Close')
    fireEvent.click(within(dialog).getByRole('button',{name:'Close log'}))
    expect(dialog.open).toBe(false)
  })
})
it('Finish carries checked progress and Undo preserves the draft without selecting all rungs',()=>{
  render(<MemoryRouter><GalleryLadderFlow /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button',{name:'Start ladder'}))
  fireEvent.click(screen.getByRole('button',{name:'Complete round 3'}))
  fireEvent.click(screen.getByRole('button',{name:'Finish'}))
  const dialog=screen.getByRole('dialog')
  expect(within(dialog).getByText('3 of 4 rounds completed')).toBeInTheDocument()
  fireEvent.change(within(dialog).getByLabelText('Notes · optional'),{target:{value:'Keep this draft'}})
  fireEvent.click(within(dialog).getByRole('button',{name:'Undo finish · Resume ladder'}))
  expect(screen.getByRole('button',{name:'Complete round 3'})).toHaveAttribute('aria-pressed','true')
  fireEvent.click(screen.getByRole('button',{name:'Finish'}))
  expect(within(screen.getByRole('dialog')).getByLabelText('Notes · optional')).toHaveValue('Keep this draft')
})
it('a failed timed save retains measurements and retries explicitly',async()=>{
  render(<MemoryRouter><GalleryLoggingMoment context="for_time" /></MemoryRouter>)
  fireEvent.click(screen.getByLabelText('Fail next sample save'))
  fireEvent.click(screen.getByRole('button',{name:'Open For Time results'}))
  const dialog=screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText(/Completed ·/),{target:{value:'0'}})
  fireEvent.click(within(dialog).getByRole('button',{name:'Save log'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('didn’t save')
  expect(within(dialog).getByLabelText(/Completed ·/)).toHaveValue(0)
  fireEvent.click(within(dialog).getByRole('button',{name:'Save log'}))
  expect(await within(dialog).findByRole('status')).toHaveTextContent('Recorded')
})
