import { LOGGING_CONTEXTS } from './gallery-refinement-data'
export const EXTRA_STATES = [
  ['cards','Movement cards and shared header'],['overview','Overview and Summary frames'],
  ['preparation','Preparation and Review order'],['screens','Generate, Setup and History'],
  ['ladder-4','Live ladder · 4 rounds'],['ladder-12','Live ladder · 12 rounds'],
  ['ladder-long','Long ladder results · final scrolling'],['urgency','Soft deadline warning · synchronized'],
  ['errors','Released error semantics'],['assets','Equipment and icon inventory'],
] as const
export const REFINEMENT_STATE_IDS: readonly string[] = [...EXTRA_STATES.map(([id])=>id),...LOGGING_CONTEXTS.map(([id])=>id)]
