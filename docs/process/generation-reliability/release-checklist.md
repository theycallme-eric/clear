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
|      |        |                      |

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
