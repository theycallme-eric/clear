/** Controlled presentation inputs for the V4 design/gallery fixtures.
 * No history calculations, persistence or generation contracts live here.
 * The provider is mounted only by the isolated comparison entry.
 */
import './workout-experience-presentation.css'
import {createContext,use,type ReactNode} from 'react'
import type {OnboardingDraft} from '../state/onboarding'
export interface PreparationGuideView {title:'Warm-up'|'Cooldown';minutes:number;movements:readonly string[]}
export interface TrainingProgressView {movement:string;equipment:string;previous:string;latest:string;next:string;evidence:string}
export interface WorkoutExperiencePresentation {
 focusAction:'text'|'framed'
 guides:{warmup:PreparationGuideView;cooldown:PreparationGuideView}
 suggestedLoads:Readonly<Record<string,string|null>>
 equipmentSetupDraft:OnboardingDraft
 showTrainingReport:boolean
 report:readonly TrainingProgressView[]
}
const Context=createContext<WorkoutExperiencePresentation|null>(null)
export function WorkoutExperiencePresentationProvider({value,children}:{value:WorkoutExperiencePresentation;children:ReactNode}){return <Context value={value}><div className="clr-v4-experience" style={{display:'contents'}}>{children}</div></Context>}
export function useWorkoutExperiencePresentation(){return use(Context)}
