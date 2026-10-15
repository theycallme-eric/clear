// VIOLATION: a prop CLEAR 0.14.3 removed. ChamferedFrame inherits DOM attributes, so the
// vendored unknown-prop rule cannot see it; the app-owned retired-vocabulary rule must.
import { ChamferedFrame } from '../../../src/design-system/index'

export function RetiredProp() {
  return (
    <ChamferedFrame role="structure" glow>
      Ready
    </ChamferedFrame>
  )
}
