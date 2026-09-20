// DS-08 — the adherence gate, run as `npm run lint:ds`. Separate from `eslint.config.js`
// because it enforces a different thing: design-system adherence, not code health. The rules
// come from the vendored export — see scripts/adherence/ds-config.mjs.
import { buildAdherenceConfig } from './scripts/adherence/ds-config.mjs'

export default buildAdherenceConfig()
