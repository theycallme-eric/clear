import {useEffect,useState} from 'react'
import {Button,Plus,Play,Pause} from '../design-system/index'
import {Card} from './card'
import {CountdownBar} from './workout-chrome'
import type {PreparationGuideView} from './workout-experience-presentation'
export function PreparationGuide({guide,withTimer=false}:{guide:PreparationGuideView;withTimer?:boolean}){
 const [seconds,setSeconds]=useState(guide.minutes*60),[deadline,setDeadline]=useState<number|null>(null)
 useEffect(()=>{if(deadline===null)return;const tick=()=>{const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));setSeconds(left);if(left===0)setDeadline(null)};const id=setInterval(tick,200);return()=>clearInterval(id)},[deadline])
 const toggle=()=>setDeadline(deadline===null&&seconds>0?Date.now()+seconds*1000:null)
 return <div className="clr-stack" data-preparation-guide={guide.title}>
  <Card heading={guide.title} meta={`~${guide.minutes} minutes`}><ul className="clr-v4-guide-list">{guide.movements.map(m=><li key={m}>{m}</li>)}</ul></Card>
  {withTimer&&<CountdownBar label={guide.title} remainingSeconds={seconds} totalSeconds={guide.minutes*60} actions={<><Button variant="secondary" icon={deadline===null?<Play/>:<Pause/>} disabled={seconds===0} onClick={toggle}>{seconds===0?'Time reached':deadline===null?'Start':'Pause'}</Button><Button variant="quiet" icon={<Plus/>} onClick={()=>{setSeconds(n=>n+30);if(deadline!==null)setDeadline(d=>d===null?null:d+30000)}}>Add 30 sec</Button></>}/>}
 </div>
}
