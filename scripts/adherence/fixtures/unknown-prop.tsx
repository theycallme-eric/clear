// VIOLATION: a prop <EmptyState> does not declare.
import { EmptyState } from '../../../src/design-system/index'

export function UnknownProp() {
  return <EmptyState title="NO WORKOUTS" message="Generate one." subtitle="Nothing yet" />
}
