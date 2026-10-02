# Generation reliability — release checklist

Run before a generation-reliability release is called ready. Each step names the boundary it
proves. Record the result in the table under the step, in this file, in the release pull request.

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
|      |        |                                |

### 1.3 Manual inbox check — a person, a real inbox

Run against the deployed application, after 1.2 passes, with an address whose inbox you can read.

1. Open the sign-in screen and request a code with the real address.
2. Confirm an email arrives and that it contains a **numeric code** and **no sign-in link**.
3. Enter the code and confirm you are signed in and reach Home.

Record only the outcome. If it fails, give the sub-step number (1, 2 or 3) in the notes column
and nothing from the email itself.

| Date | Run by | Result (pass / fail) | Failed sub-step, if any |
| ---- | ------ | -------------------- | ----------------------- |
|      |        |                      |                         |

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
|      |        |                      |

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
|      |        |                      |

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
Record only the outcome, and the request id if it fails.

| Date | Run by | Result (pass / fail) | Request id, if failed |
| ---- | ------ | -------------------- | --------------------- |
|      |        |                      |                       |
