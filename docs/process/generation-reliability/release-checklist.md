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
