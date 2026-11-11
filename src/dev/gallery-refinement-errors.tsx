/**
 * TASK-028 (REQ-028; C55, G23; R22) — `/gallery/refinements?state=errors`,
 * the released semantic error treatment, as accepted gallery reference
 * eded158cfd928d382c9a9409e2c372270312741d draws it: the one shared
 * `ErrorView` (`src/ui/view-state.tsx`), standalone, for a network timeout
 * with its one Retry.
 *
 * This is a regression reference, not a redesign. The owner is unchanged:
 * PR611's released correction (pilot c0d5782 / 55843bd) scopes both existing
 * border hooks (`--border-card`, `--brd`) to `--border-toast-negative` on the
 * alert root, so the frame, the accent bar and the emission share the error
 * role in every skin, and the glyph paints `--icon-toast-negative`. Every
 * application error screen renders this same owner; no route CSS restates it.
 * Retry is inert here, as in every gallery controller — the routes keep the
 * real re-reads, proved in `e2e/refinement/task-028.spec.ts`.
 */
import { createError, ErrorCode } from '../state/errors'
import { ErrorView } from '../ui/view-state'

const TIMEOUT = createError(ErrorCode.NETWORK_TIMEOUT)

export function GalleryErrors() {
  return <ErrorView error={TIMEOUT} onRetry={() => undefined} />
}
