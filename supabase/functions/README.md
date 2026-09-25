# Edge functions

Deno functions deployed to the reused Supabase project. One directory per function, plus
`_shared/`, which is GEN-01's envelope and the only thing every function has in common.

## The envelope is the function's edges

`_shared/envelope.ts` owns CORS, the request id, JWT verification, body parsing, the error shape
and the single structured log line. A function file is the handler and the arguments that configure
the shell — `generate-workout/index.ts` is twenty lines for that reason, and `generate-section`
(REV-02) adopts the same module unchanged rather than copying its behaviour.

What the shell guarantees, which is what makes it worth being a module:

- Unauthenticated → `401` with `{ code, message, requestId }`; the handler never runs.
- A body the CORE-03 schema rejects → `400` carrying the field paths that were wrong.
- Every response — success, refusal, or a handler that threw — echoes the client's
  `X-Request-ID`, in the body and in the response header.
- One log line per request, with four fields picked by name. No header map, no request object and
  no access token is ever handed to a logger: that was defect D3.

## No second contract, and no second zod

Nothing here declares a schema. The request and response shapes come from `src/state/schemas.ts`,
which the function imports directly, and `src/state/schemas.test.ts` walks this directory to fail
if a zod import appears in it. That is also why the imports reach across the repository into
`src/`: one file, two runtimes.

Two consequences at deploy time, both handled in `deno.json` and `../config.toml`:

- `zod` is a bare specifier, so `deno.json` maps it to the same version `package.json` pins.
  `src/test/generation-envelope.test.ts` fails if the two drift.
- CORE-03's own relative imports are extensionless, which Deno resolves only with
  `unstable: ["sloppy-imports"]`.

`verify_jwt` is `false` for these functions, and that is not a relaxation: the gateway's refusal is
untyped and carries no request id, so the function verifies the same token against GoTrue itself
and refuses in CLEAR's words instead.

## Validation is a list you can falsify

`_shared/validate.ts` is GEN-02c's half of GENERATION_CONTRACT §6 and its `HARD_CHECKS` is the
correspondence the requirement asks for: one row per hard check, naming the constraint in
`supabase/migrations/20260921000002_workout_domain.sql` that would refuse the row at the INSERT.
`src/test/generation-validation.test.ts` reads every one of those declarations back out of the
migration and every rule back out of the spec's own table, so a check with no matching constraint —
or a constraint renamed under a check — fails a test rather than surviving as a paragraph.

Checks 4–7 are not implemented there. They are `src/state/schemas.ts`, which ran before validation
was reached; check 8 is duration plausibility and belongs to GEN-06. Checks 1–3 — the candidate set,
its usable equipment, the enabled sections — are what this module runs, because they are questions
about *this* request that neither the schema nor the database can answer.

The soft checks return a `QualityRecord` and cannot reject: `validateComposition` reaches its `ok`
before it observes anything. A rejection costs exactly one corrected retry, counted by `claude.ts`,
which receives validation as an optional function rather than an import — a composer configured
without one returns `validation: null`, which means nobody checked and never that nothing was wrong.

## Hydration is what the model is not asked for

`_shared/hydrate.ts` is §8: after validation and before persistence, the name, the equipment-resolved
display name, the coaching cues, the regression reference and the muscle coverage are read from
`exercise_catalog` by id. Contract v4.1 removed those fields from what Claude returns and
`generationOutputSchema` is strict, so a response reproducing one is rejected before hydration is
reached — drift is structurally impossible rather than something a check has to notice.

Two properties the module is shaped to keep. `hydrateWorkout` takes a `Validated`, which only
`validateComposition` produces, so hydrating an unchecked workout does not compile. And
`HydratedWorkout` has no duration field: Claude's `estimated_duration_mins` is carried once, as
`diagnostics.modelEstimateMins`, because the session's minutes are the request's and GEN-06's and
never the model's (D5). The catalog read is `fetch` against PostgREST rather than
`src/data/supabase.ts` — that client's extensionless imports do not resolve here — and it reads with
the caller's own token, since `exercise_catalog` is `security_invoker` and needs no privilege the
caller does not already hold.

## Persistence is one request, on purpose

`_shared/persist.ts` writes the validated, hydrated workout by calling `persist_session` — SES-01a's
function, which writes sessions → sections → blocks → exercises in one transaction. Nothing here
assembles that transaction, and that is the design: PostgREST runs one request in one transaction, so
a module that makes exactly one request inherits atomicity, while four inserts issued from a function
could not be given it. There is also no retry after a failed write. A generation retries once
(`claude.ts`); a write cannot, because the session id is minted by the database and a second attempt
cannot tell "not written" from "written and the answer was lost".

`prompt_version` and `contract_version` are read off the `HydratedWorkout`, never off the constants in
`prompt.ts`, so a session records the versions it was composed under. Hydration's catalog facts do not
reach a row — `workout_exercises` stores the prescription and the id it points at, and copying a name
into it would be the drift §8 exists to prevent. Claude's `estimated_duration_mins` travels in the
payload because `generationOutputSchema` requires the field and `persist_session` reads it nowhere
(D5).

## Testing

The envelope is a plain `(Request) => Promise<Response>` and touches no runtime global, so it is
tested with Vitest from `src/test/generation-envelope.test.ts` like any other module. Only the
entry point calls `Deno.serve`, and it is asserted as a file rather than imported.
