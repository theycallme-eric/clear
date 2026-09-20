// The control: the same shapes, written the way the design system asks for them.
import { Button, EmptyState } from '../../../src/design-system/index'

export function Compliant() {
  return (
    <div style={{ color: 'var(--ink)', marginBlockEnd: 'var(--space-4)' }}>
      <EmptyState title="NO WORKOUTS" message="Generate one." />
      <Button variant="primary" size="md">
        START
      </Button>
    </div>
  )
}
