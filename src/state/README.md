# State boundary

Client state machines, query hooks, and cross-screen state coordination belong here.

## What is here now

- `errors.ts` (CORE-01) — the `AppError` union, the `Result` helpers, and the request-ID generator.
- `logger.ts` (CORE-02) — the one sanctioned logging sink, redacting by construction.
- `schemas.ts` (CORE-03) — the runtime-neutral boundary contract for generation envelopes,
  contract 4.1.0 output, and the row shapes `src/data/` reads. A future edge function must import
  this same source rather than restating the schemas in Deno.
- `session-machine.ts` (SES-01a) — the session lifecycle as four states and three events,
  pure. State is derived from the row's three timestamps, exactly as `session_state(...)` does in
  SQL, so there is no status column and no client-side copy to fall out of step with it. Abandoning
  is a state here for the same reason it is a column there: it is reachable from both non-terminal
  states and it is terminal, which is what a delete would not have been. `resumePoint` is the other
  half of a hard refresh — the first unfinished prescription and the set number the next log
  carries, recomputed from what is written rather than remembered.
- `streak.ts` (SES-01c) — consecutive training days, derived. A pure function of session rows and
  an IANA zone: no column stores a streak, so a deleted or abandoned session changes the answer on
  the next read with no repair step. The zone is resolved once into one formatter, and days are
  walked as calendar dates rather than as 24-hour blocks, which is the same distinction one DST
  boundary later. `StreakPolicy` is the named extension point — HOME-02's pause states and rest-day
  allowances arrive as a different policy passed to this same function, never as a second
  derivation beside it.
- `toasts.ts` (DS-05) — the root toast queue; `src/ui/toast-host.tsx` renders it.
- `view-state.ts` (CORE-04) — the four-state contract every data-driven view implements.
- `auth-context.ts` / `auth-provider.tsx` (AUTH-01) — the session context. The context file holds
  the vocabulary (`status`, `user`, `error`, `signOut`) and the pure reducer over `src/data/auth.ts`
  events; the provider subscribes, reduces, and renders. Together they are under 80 lines of code,
  with no ref, no timer, no lock, and no fetch of any kind — a token refresh is one `setState` and
  cannot start a request. `status: 'error'` is the state D1 lacked: a session that could not be
  revalidated is not an anonymous user, and nothing may route it to onboarding.
