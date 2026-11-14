/** The Round 7 workout presentation (owner-approved 2026-11-13), and its switch.
 * No history calculations, persistence or generation contracts live here.
 *
 * The product mounts it at the app root with `PRODUCT_PRESENTATION`
 * (`./product-presentation`): look choices only. The data-bearing inputs are
 * optional and absent in the product
 * until a real source is wired: `guides` (warm-up/cooldown from the session),
 * `suggestedLoads` (absent: the prescription's own load is shown),
 * `timedWorkflows.saveResult` (absent: the timed blocks keep their shipped
 * renderers), the training report, and `equipmentSetupDraft` (the review app's
 * onboarding preview, never the product's). The gallery passes sample values.
 * A presentation never removes behaviour: Settings, History and Onboarding keep
 * their full controls under it.
 */
import './workout-experience-presentation.css'
import '../styles/workout-r7.css'
import {createContext,use,type ReactNode} from 'react'
import type {OnboardingDraft} from '../state/onboarding'
import type { TimedResultReceipt } from './timed-result-log'
export interface PreparationGuideView {title:'Warm-up'|'Cooldown';minutes:number;movements:readonly string[]}
export interface TrainingProgressView {movement:string;equipment:string;previous:string;latest:string;next:string;evidence:string}
export interface WorkoutExperiencePresentation {
 dialogBackdrop?: 'balanced' | 'dark' | 'soft'
 equipmentPlacement?: 'name' | 'line'
 loggingOverlay?: 'dialog' | 'sheet'
 timedWorkflows?: { logPresentation: 'inline' | 'sheet'; counterStyle: 'compact' | 'wide'; logHierarchy?: 'simple' | 'grouped'; rungEmphasis?: 'round' | 'reps'; saveResult?: (result: TimedResultReceipt) => Promise<void> }
 focusAction:'text'|'framed'
 guides?:{warmup:PreparationGuideView;cooldown:PreparationGuideView}
 suggestedLoads?:Readonly<Record<string,string|null>>
 /** Review-app onboarding preview only: seeds the draft and shows two steps. */
 equipmentSetupDraft?:OnboardingDraft
 showTrainingReport?:boolean
 report?:readonly TrainingProgressView[]
}
const Context=createContext<WorkoutExperiencePresentation|null>(null)
export function WorkoutExperiencePresentationProvider({value,children}:{value:WorkoutExperiencePresentation;children:ReactNode}){return <Context value={value}><div className="clr-v4-experience" data-logging-overlay={value.loggingOverlay} data-refinement-round="7" style={{display:'contents'}}>{children}</div></Context>}
export function useWorkoutExperiencePresentation(){return use(Context)}
