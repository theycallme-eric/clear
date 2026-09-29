/**
 * REQ-010 — the screens CLEAR must have, and the journeys they belong to.
 *
 * This list is the requirement, not a reading of the implementation. It is a
 * transcription of IA.md §4's headings and §2's navigation graph, and it
 * deliberately imports nothing from `src/app/router.tsx`: a screen that
 * disappears from the router must not disappear from here with it. The unit
 * suite (`src/test/required-routes.test.ts`) holds the router to this list, so
 * a required route the router does not serve fails the build, and
 * `e2e/screens.ts` derives the browser suite's screens from it — so the product
 * and its tests cannot lose a screen together.
 *
 * Pure data on purpose. Nothing here touches Playwright or React, so the unit
 * suite and the browser suite read the same values.
 */

/** The core journeys REQ-010 names, each walked on the mobile viewport. */
export type JourneyId =
  | 'new-user'
  | 'history-detail'
  | 'settings-appearance'
  | 'focused-forms'

export interface RequiredJourney {
  readonly id: JourneyId
  /** What the journey proves, in REQ-010's words. */
  readonly summary: string
  /** The screens it passes through, in order, by their IA.md §4 name. */
  readonly steps: readonly string[]
}

export const REQUIRED_JOURNEYS: readonly RequiredJourney[] = [
  {
    id: 'new-user',
    summary:
      'Sign up or sign in, onboarding, Home, Generate, Loading, Review, Workout, Summary and back to Home',
    steps: [
      'Welcome',
      'OTP Login',
      'Onboarding',
      'Home',
      'Generate',
      'Loading',
      'Review',
      'Workout',
      'Summary',
      'Home',
    ],
  },
  {
    id: 'history-detail',
    summary: 'History list to session detail',
    steps: ['Home', 'History', 'Session Detail'],
  },
  {
    id: 'settings-appearance',
    summary: 'Settings to appearance',
    steps: ['Home', 'Settings'],
  },
  {
    id: 'focused-forms',
    summary:
      'Focused OTP and Settings forms show the focus indicator on the control, not a chamfered ancestor',
    steps: ['OTP Login', 'Settings'],
  },
]

/**
 * The IA.md §1 guard. It decides what the credential-free preview resolves a
 * route to, which is what `e2e/screens.ts` expects the browser to find there.
 */
export type RequiredGuard = 'public-only' | 'protected' | 'onboarding' | 'dev-only' | 'none'

export interface RequiredScreen {
  /** The screen exactly as IA.md §4 heads it. */
  readonly screen: string
  /** The route pattern IA.md §4 gives it, or null for a transient screen. */
  readonly route: string | null
  /** A concrete URL for `route` — the one the router and the browser are asked for. */
  readonly path: string | null
  /** Further routed paths of the same §4 entry — Settings' sub-views. */
  readonly subPaths?: readonly string[]
  readonly guard: RequiredGuard
  /** For a transient screen: the routed screens that render it in place. */
  readonly renderedWithin?: readonly string[]
  /** Every journey whose steps include this screen. */
  readonly journeys: readonly JourneyId[]
  /**
   * A required route that is not mounted yet, named with the recovery node that
   * owns mounting it. This is the only way a required route may be missing from
   * the router, and the unit suite fails the moment the router starts serving
   * it — so the marker cannot outlive the gap it records.
   */
  readonly pendingOwner?: string
}

/** Every screen IA.md §4 heads, in document order. */
export const REQUIRED_SCREENS: readonly RequiredScreen[] = [
  {
    screen: 'Welcome',
    route: '/welcome',
    path: '/welcome',
    guard: 'public-only',
    journeys: ['new-user'],
  },
  {
    screen: 'OTP Login',
    route: '/login',
    path: '/login',
    guard: 'public-only',
    journeys: ['new-user', 'focused-forms'],
  },
  {
    screen: 'Onboarding',
    route: '/onboarding',
    path: '/onboarding',
    guard: 'onboarding',
    journeys: ['new-user'],
  },
  {
    screen: 'Home',
    route: '/',
    path: '/',
    guard: 'protected',
    journeys: ['new-user', 'history-detail', 'settings-appearance'],
  },
  {
    screen: 'Generate',
    route: '/generate',
    path: '/generate',
    guard: 'protected',
    journeys: ['new-user'],
  },
  {
    // IA.md §4: "transient, no route". GEN-05 renders it in place of whichever
    // screen started generation, so it is reached by driving one of them.
    screen: 'Loading',
    route: null,
    path: null,
    guard: 'protected',
    renderedWithin: ['Home', 'Generate', 'Review'],
    journeys: ['new-user'],
  },
  {
    screen: 'Review',
    route: '/review',
    path: '/review',
    guard: 'protected',
    journeys: ['new-user'],
  },
  {
    screen: 'Workout',
    route: '/workout',
    path: '/workout',
    guard: 'protected',
    journeys: ['new-user'],
  },
  {
    screen: 'Summary',
    route: '/summary',
    path: '/summary',
    guard: 'protected',
    journeys: ['new-user'],
  },
  {
    screen: 'History',
    route: '/history',
    path: '/history',
    guard: 'protected',
    journeys: ['history-detail'],
  },
  {
    screen: 'Session Detail',
    route: '/history/:id',
    path: '/history/00000000-0000-4000-8000-000000000000',
    guard: 'protected',
    journeys: ['history-detail'],
    pendingOwner: 'G03 / UAT-R03 — Session-detail route and restart journey',
  },
  {
    screen: 'Settings',
    route: '/settings',
    path: '/settings',
    subPaths: ['/settings/locations'],
    guard: 'protected',
    journeys: ['settings-appearance', 'focused-forms'],
  },
  {
    // Development only: a production build — which is what the preview serves —
    // has no gallery to scan, so the browser suite does not visit it.
    screen: 'Component Gallery',
    route: '/dev/gallery',
    path: '/dev/gallery/ds',
    guard: 'dev-only',
    journeys: [],
  },
  {
    screen: 'Not Found',
    route: '*',
    path: '/does-not-exist',
    guard: 'none',
    journeys: [],
  },
]
