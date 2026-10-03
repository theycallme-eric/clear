# Generation reliability — release checklist

Run before a generation-reliability release is called ready. Each step names the boundary it
proves. Record the result in the table under the step, in this file, in the release pull request;
the owner's two manual steps (1.3 and 4.2) are recorded with the command each one names instead.

**Never record a one-time code, an email address, or any email content here** — or in a journal,
a log, a screenshot, or a commit. A result is a date, who ran it, and pass or fail. If a step
fails, record which numbered sub-step failed, not what the email said.

## 1. Hosted sign-in email (REQ-018)

Automation proves two of the three parts of this boundary. The third — that a real inbox receives
a numeric code a person can sign in with — is manual, because no automated check here sends mail.

### 1.1 Committed template intent — automated, no credentials

```sh
npx vitest run src/test/generation-reliability/auth-email-template.test.ts
```

Fails if `supabase/templates/magic-link.html` lacks the numeric code token or uses a
confirmation-link token.

| Date | Run by | Result (pass / fail) |
| ---- | ------ | -------------------- |
| 2026-10-02 | Agent Runner recovery supervisor, under owner approval | pass |

### 1.2 Hosted template drift — automated, read-only

```sh
npm run gr:auth-template -- --check --require-hosted
```

Compares the hosted template and subject with the committed ones through one read-only request.
It sends no mail and changes no hosted configuration. It needs `SUPABASE_ACCESS_TOKEN` in the
process environment or `.env.runner.local`.

Without `--require-hosted` and without the token, the command passes on the committed template
alone and prints `NOT RUN hosted template comparison`. **That output is not a pass for this
step.** Only `PASS hosted template and subject match the committed template` is.

If it reports drift, copy the reviewed `supabase/templates/magic-link.html` into
**Authentication → Emails → Templates** (see `supabase/templates/README.md`), rerun, and then
repeat 1.3.

| Date | Run by | Result (pass / fail / not run) |
| ---- | ------ | ------------------------------ |
| 2026-10-02 | Recovery supervisor using existing CLI session, read-only | pass — hosted numeric-code template and subject match committed source; PROCESS_LOG TASK-028 owner-UAT gate |

### 1.3 Manual inbox check — a person, a real inbox

Run against the deployed application, after 1.2 passes, with an address whose inbox you can read.

1. Open the sign-in screen and request a code with the real address.
2. Confirm an email arrives and that it contains a **numeric code** and **no sign-in link**.
3. Enter the code and confirm you are signed in and reach Home.

The owner performs the steps. The owner or release operator may record only the owner's reported
outcome with the command below; the operator cannot perform or infer the inbox observation.
If it fails, give the sub-step number (1, 2 or 3)
and nothing from the email itself. The command writes today's date and the result to
`docs/process/generation-reliability/release-exit.json`; it has no field for anything else. Commit
the record.

```sh
npm run gr:exit -- --record inbox_check pass
npm run gr:exit -- --record inbox_check fail --sub-step <1|2|3>
```

## 2. Pre-change snapshot (REQ-027)

Run once, after the deterministic lanes are green and **before** the catalog section repair
migration is applied to the hosted project. It reads; it never writes to the hosted project.

### 2.1 Capture — a person or a trusted job, read-only

```sh
npm run gr:snapshot -- --out <directory outside the repository>
```

It needs `SUPABASE_URL` and `VERCEL_TOKEN` (`.env.runner.local`) and `SUPABASE_SERVICE_ROLE_KEY`
(`.env.audit.local`), or the same names in the process environment. Every request it makes is a
GET. The captured rows of the catalog tables and `profiles`, and the full deployed matrix, are
written to the directory given, which must be empty and outside the repository; keep it with the
off-machine backup. **Never copy a capture file into the repository.**

It writes `docs/process/generation-reliability/pre-change-snapshot.json`: the deployed commit, a
row count and SHA-256 per capture file, the pre-change deployed matrix (hash, summary, every
section × tier row, and how many rows differ from the committed seed's), and the rollback
rehearsal. Commit the manifest.

The command refuses, writing nothing, if the hosted catalog already carries the repair (the
capture would not be pre-change) or if the committed migration followed by the committed rollback
does not give the captured section tags back.

| Date | Run by | Result (pass / fail) |
| ---- | ------ | -------------------- |
| 2026-10-02 | Recovery supervisor, before catalog deployment | pass — captured 15:30:38.351 UTC; exact deployed commit and hashes in `pre-change-snapshot.json` |

### 2.2 Committed manifest — automated, no credentials

```sh
npx vitest run src/test/generation-reliability/pre-change-snapshot.test.ts
npm run gr:snapshot -- --check
```

Fails while the manifest is absent, if it carries anything but counts, hashes, instants and
enumerated values, or if the rollback it records as verified was rehearsed against a migration or
rollback script other than the committed ones. A changed migration means a new capture.

| Date | Run by | Result (pass / fail) |
| ---- | ------ | -------------------- |
| 2026-10-02 | Recovery supervisor before reviewed migration push | pass — committed manifest/migration binding and offline rollback rehearsal; journal TASK-025 approved operator recovery |

## 3. Protected deployment and deployed re-verification (REQ-027, REQ-002, REQ-021)

Run after step 2 and **before any application journey is opened**. Steps 3.1 and 3.2 write to the
hosted project; they are run by the approved release operator or a trusted job from the reviewed
commit on a clean worktree. The approved release operator may be the recovery supervisor acting
under the task's recorded owner approval, or protected automation with the same narrow scope. Any
failure stops the release at that step; the narrow way back is
`docs/backend/catalog-section-repair-rollback.md`.

### 3.1 Apply the reviewed migrations — authorized release step, writes

```sh
npm run gr:snapshot -- --check
supabase db push --db-url "$SUPABASE_DB_URL" --dry-run
supabase db push --db-url "$SUPABASE_DB_URL"
```

`gr:snapshot -- --check` first: it fails if
`supabase/migrations/20261001000019_catalog_section_repair.sql` no longer hashes to the
`rollback.migrationSha256` the committed manifest recorded, so the file pushed is the reviewed one,
byte for byte. The dry run must list only committed migrations from this directory, in order;
record which. Do not edit a file between the check and the push.

| Date | Run by | Commit | Migrations pushed | Result (pass / fail) |
| ---- | ------ | ------ | ----------------- | -------------------- |
| 2026-10-02 | Recovery supervisor under owner-approved TASK-025 | `821b0b23c8530b2f86e2e7570a65967a3f7e915c` | `20261001000019` through `20261002000024`, exactly as dry-run listed | pass |

### 3.2 Deploy the functions — authorized release step, writes

Deploy `generate-workout` from `supabase/functions/` at the same commit
(`supabase/functions/README.md`). The approved inventory retires `generate-section`; do not deploy
it. The deployment needs the CLI's own credential, which is not one of the workspace's ignored
files.

| Date | Run by | Commit | Result (pass / fail) |
| ---- | ------ | ------ | -------------------- |
| 2026-10-02 | Recovery supervisor under owner-approved TASK-025 | `821b0b23c8530b2f86e2e7570a65967a3f7e915c` | pass — `generate-workout` deployed |

### 3.3 Deployed matrix equals the committed-seed matrix — automated, read-only

```sh
npm run gr:matrix -- --deployed --check
```

Passes only with no differing row. A mismatch names each differing row and stops the release:
3.4 and every application journey stay unrun.

| Date | Run by | Result (pass / fail) | Differing rows |
| ---- | ------ | -------------------- | -------------- |
| 2026-10-02 | Agent Runner, TASK-025 attempt 2, before 3.1 | fail — 3.1 and 3.2 not yet run | 631 |
| 2026-10-02 | Recovery supervisor, after 3.1 and 3.2 | pass | 0 |

### 3.4 Database lane, live — automated, disposable users only

```sh
npx playwright test e2e/generation-database-lane.spec.ts --project=mobile
```

Run only after 3.3 passes. It must pass **unskipped** for the owner-mirror configuration and every
tier × Goal preset, and its cleanup test must report no disposable user left. A skipped run is not
a pass.

| Date | Run by | Passed / skipped / failed | Disposable users left | Result (pass / fail) |
| ---- | ------ | ------------------------- | --------------------- | -------------------- |
| 2026-10-02 | Agent Runner, TASK-025 attempt 2 | not run — stopped at 3.3 | — | not run |
| 2026-10-02 | Recovery supervisor, after deployed matrix passed | 25 passed, 0 skipped, 0 failed | 0 | pass |

## 4. Deployed UAT matrix (REQ-028)

Run after step 3 passes, against the deployed application.

### 4.1 Nine entries to Review — automated, disposable users only, no model call

```sh
npx playwright test e2e/generation-deployed-matrix.spec.ts --project=mobile
npx vitest run src/test/generation-reliability/release-evidence.test.ts
```

The first command walks a new user, a returning user, a default preset, the owner-mirror
customized profile, the Minimal tier, the Building tier, and one user for each of `skill_power`,
`carries` and `stability_balance` from Welcome to Review on the deployment. Generation is answered
from what the deployed candidate RPC resolved for that user. It must pass **unskipped**, and it
rewrites `docs/process/generation-reliability/release-evidence.json`: one row per saved section
for every entry, the deployed commit, and what was left behind. Commit the record. The second
command fails while the record is absent, lacks an entry or a section row, records a failure or a
leftover, or carries anything but enumerated values, counts and a commit.

The target is `E2E_BASE_URL` when set; otherwise the public alias of the newest ready production
deployment, read with `VERCEL_TOKEN`. The record names the commit, never the origin.

| Date | Run by | Deployed commit | Passed / skipped / failed | Disposable users or rows left | Result (pass / fail) |
| ---- | ------ | --------------- | ------------------------- | ----------------------------- | -------------------- |
| 2026-10-02 | Agent Runner, TASK-027 attempt 2 | `9995a5ad845f269e8d4cdfab55ffb130a399a145` | 11 passed, 0 skipped, 0 failed | 0 | pass |

### 4.2 Owner sign-in, generate and review — a person, the real profile

The owner signs in on the deployed application with the real account, generates a workout with
the current real profile and reaches Review. This step calls the model and is not automated here.

1. Sign in on the deployed application with the real account (step 1.3 covers the code itself).
2. Confirm Home shows the current real profile — do not change Goal, sections or location first.
3. Open Generate, choose a focus and generate.
4. Confirm Review shows a useful workout for the selected Goal, Focus and available time, choosing
   from the profile's available sections. Enabled sections are allowed choices, not mandatory
   headings; unsupported equipment or exclusions must not be bypassed.

The owner performs and reports the observation; the release operator may record that report on the
owner's behalf. Record only the outcome, with the command below, and the request id shown on the refusal if it
fails. The command writes today's date and the result to
`docs/process/generation-reliability/release-exit.json`. Commit the record.

```sh
npm run gr:exit -- --record generate_review pass
npm run gr:exit -- --record generate_review fail --request-id <id>
```

## 5. Release exit checklist (REQ-018, REQ-028)

Run last. `docs/process/generation-reliability/release-exit.json` links every release exit
criterion to its recorded results: a committed file and a line in it, a step of this checklist
whose last dated row passed, or one of the owner's two steps (1.3 and 4.2).

```sh
npm run gr:exit -- --check
npx vitest run src/test/generation-reliability/release-evidence.test.ts
```

Both fail, naming the criterion, while any criterion has no evidence, links to a file or line that
is not there, links to a checklist step whose last recorded run did not pass, or stands on an owner
step that is `not_recorded` or failed. **`not_recorded` is not a pass. The record command requires
the owner's reported observation; an operator must not fabricate or infer it.** The release is
not ready while either command fails.

| Exit criterion | Recorded result |
| -------------- | --------------- |
| Every selectable section has reviewed catalog coverage | `section-mapping-ledger.json`; journal 2026-10-01, TASK-003; step 3.3 |
| Every tier/Goal combination is supported or prevented before generation | `configuration-dispositions.json`; journal 2026-10-01, TASK-004 |
| Every supported Goal × Focus × tier returns candidates per required section | `legal-state-matrix.json`; steps 3.3 and 3.4 |
| The owner's current customized profile passes candidate resolution | steps 3.4 and 4.1; `release-evidence.json`, `customized_profile`; owner step 4.2 |
| New-user and returning-user authentication reach a generation-ready Home | step 4.1; `release-evidence.json`, `new_user` and `returning_user` |
| A deterministic browser journey reaches Review and a deployed integrated journey succeeds | journal 2026-10-03, TASK-028 latest exact-source release proof; historical TASK-026 recovery remains recorded |
| The deployed catalog matches the committed seed viability matrix | step 3.3 |
| Failures expose the failed boundary and section without leaking sensitive data | journal 2026-10-01, TASK-007 and TASK-012; step 3.4 |
| Requirements Builder and Agent Runner follow-up work has a traced task | journal 2026-10-01, TASK-029 and TASK-030; `task-032-replay.json` |
| UI/visual work remains unchanged until the explicit release word | journal 2026-10-01, TASK-012; journal 2026-10-02, TASK-011 recovery note |
| The owner requests a code with a real address, receives a numeric code, and signs in | owner step 1.3 |
| The owner signs in and generates and reviews a workout with the current real profile | owner step 4.2 |

The record is the authority; this table is its index for a reader.
