// VIOLATION: a <Button> variant outside primary | secondary | quiet | critical.
import { Button } from '../../../src/design-system/index'

export function OutOfRangeVariant() {
  return <Button variant="danger">DELETE</Button>
}
