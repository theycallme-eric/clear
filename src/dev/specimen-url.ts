/**
 * The one URL contract shared by the two halves of DS-07's specimen serving:
 * the browser-side catalogue (`specimens.ts`) that frames each card, and the
 * Node-side dev middleware (`specimen-server.ts`) that answers for it.
 *
 * It lives in its own module because those two halves cannot import each
 * other — one runs in the browser, the other in Vite's config — and a prefix
 * written down twice is a prefix that drifts.
 */

/** Dev-only URL prefix the specimen middleware answers on. */
export const SPECIMEN_BASE = '/dev/specimens/'

/** The vendored export's folder, relative to the project root. */
export const VENDOR_DIR = 'src/design-system'
