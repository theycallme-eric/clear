# App-wide state contract (CORE-04)

Every data-driven view resolves to exactly **one of four states** — loading, empty, error,
populated — and renders something for each. No view is allowed to render nothing. This document is
the contract; `src/state/view-state.ts` and `src/ui/view-state.tsx` are its shared implementation.

## The rule

**Model the view's data as a `ViewState<T>` and render it through `ViewStateSwitch`.**

```tsx
import { viewStateFromResult, type ViewState } from '@/state/view-state'
import { ViewStateSwitch } from '@/ui/view-state'
import { EmptyState } from '@/design-system/index'

function HistoryScreen() {
  const [state, setState] = useState<ViewState<Session[]>>(viewLoading())
  const load = () => { setState(viewLoading()); fetchSessions().then((r) => setState(viewStateFromResult(r))) }
  useEffect(load, [])

  return (
    <ViewStateSwitch
      state={state}
      loadingLabel="Reading history"
      empty={
        <EmptyState
          title="No sessions logged"
          message="Completed workouts appear here."
          actionLabel="Generate workout"
          onAction={goToGenerate}
        />
      }
      errorTitle="History didn't load"
      onRetry={load}
    >
      {(sessions) => <SessionList sessions={sessions} />}
    </ViewStateSwitch>
  )
}
```

The union is closed and the switch is exhaustive with no default branch, so the compiler proves a
view using it cannot fall through to a blank render.

## The four states

| State | Rendered as | Rules |
|---|---|---|
| `loading` | `LoadingView` → `ScanLoader` | Polite `role="status"` + `aria-busy`. No spinner exists in this system. Pass `value`/`max` only when progress is real. |
| `empty` | The screen's own `EmptyState` | Copy is per-screen, factual, never apologetic ("No sessions logged"), with one imperative action. `ViewStateSwitch` deliberately has no default empty view. |
| `error` | `ErrorView` → `EmptyState` in an urgency frame | `role="alert"`. Shows the `AppError`'s plain-language message, its `requestId` when present, and a retry that **re-runs the failed operation**. Severity carries a glyph (`AlertTriangle`), never colour alone. |
| `ready` | The screen's populated render | The only state that receives data. |

**The three non-populated states are three different screens.** Loading is a busy status region;
empty is factual copy with a create-style action; error is an alert with a retry. A spinner never
silently means "nothing here", and "nothing yet" is never worded like "nothing matches" — a
filtered-to-nothing view clears the filter, it does not offer to create data.

## Slow operations

A loading view must not appear frozen. `LoadingView` uses `useSlowThreshold` — after
`SLOW_THRESHOLD_MS` (4 s app-wide default) it switches `ScanLoader` to its honest `slow` status and
the factual copy "Taking longer than usual". Override the threshold per operation only with a
documented reason; never manufacture delay.

## Mapping results

Operations return `Result<T>` (see `error-handling.md`). `viewStateFromResult` maps it onto the
contract: a failure becomes `error` carrying the `AppError`; a success becomes `empty` when the
payload has nothing to show (arrays by default; pass an `isEmpty` predicate otherwise), else
`ready`.

## Top-level error boundary

`src/app/ErrorBoundary.tsx` wraps the router in `src/main.tsx` (and in the shared test providers,
so tests exercise the real behavior). A render crash anywhere below it:

- shows a recoverable screen — never a white page, never a raw stack trace;
- keeps the thrown error's own text off the screen (it may carry internal detail) and shows fixed
  plain-language copy plus the `requestId` when the crash carried one;
- offers one action, **Reload**;
- reports the normalized `AppError` through the structured logger (CORE-02), never `console.*`.

## Reference implementation

`src/ui/view-state.test.tsx` mounts a representative History-style view through `ViewStateSwitch`
and simulates every state of the contract — loading, slow, empty, error (including retry re-running
the operation), and populated. `src/app/ErrorBoundary.test.tsx` does the same for render crashes.
The first shipping data-driven screen must follow the reference screen's shape; per-screen states
and copy come from `docs/specs/IA.md`.

## Review checklist

- [ ] Every data-driven view renders through `ViewStateSwitch` (or implements all four states with
      the same components and semantics)
- [ ] Empty copy is screen-specific and distinguishes "nothing yet" from "nothing matches"
- [ ] Error views show `error.message`, the `requestId` when present, and a retry wired to the
      actual operation
- [ ] Loading uses `ScanLoader` via `LoadingView` — no spinner, no fake progress
- [ ] A test simulates each state for the view
