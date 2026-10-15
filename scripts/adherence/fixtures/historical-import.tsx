// VIOLATION: the worked app is evidence, not a runtime module. Its kit duplicates the public
// components; importing it bypasses the public composition.
import { Card } from '../../../src/design-system/ui_kits/app/Primitives.jsx'

export function HistoricalImport() {
  return <Card>Ready</Card>
}
