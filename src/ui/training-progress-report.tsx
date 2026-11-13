import {Card} from './card'
import {ListFrame,ListRow} from './composition'
import {useWorkoutExperiencePresentation} from './workout-experience-presentation'
export function TrainingProgressReport(){const p=useWorkoutExperiencePresentation();if(!p?.showTrainingReport)return null;return <Card heading="Training progress">{p.report.length===0?<p>No comparable lifting logs yet.</p>:<ListFrame as="div">{p.report.map(row=><ListRow key={row.movement}><strong>{row.movement} · {row.equipment}</strong><dl className="clr-v4-progress-facts"><dt>Previous</dt><dd>{row.previous}</dd><dt>Last logged</dt><dd>{row.latest}</dd><dt>Next target</dt><dd>{row.next}</dd></dl><p style={{margin:0,color:'var(--text-secondary)'}}>{row.evidence}</p></ListRow>)}</ListFrame>}</Card>}
