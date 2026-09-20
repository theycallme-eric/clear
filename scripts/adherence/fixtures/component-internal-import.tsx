// VIOLATION: reaching past the public entry into a component's internals.
import { Button } from '../../../src/design-system/components/Button/Button.js'

export function ComponentInternalImport() {
  return <Button variant="primary">START</Button>
}
