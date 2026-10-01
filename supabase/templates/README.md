# Hosted Auth email templates

These files are the reviewable source for Supabase-hosted Auth emails. The hosted project does not
automatically deploy them with migrations or Edge Functions, so a cutover or Auth change must copy
the reviewed source into **Authentication → Emails → Templates** and then run the live verifier.

## Magic link or OTP

`magic-link.html` deliberately renders `{{ .Token }}` and never `{{ .ConfirmationURL }}`. CLEAR's
Auth screen asks for a numeric code; sending a clickable link creates a different flow that the app
does not consume.

The hosted subject is `Your CLEAR sign-in code`.

To compare the live project with the committed contract:

```sh
SUPABASE_ACCESS_TOKEN=… npm run backend:auth-template
```

`npm run gr:auth-template -- --check` runs the same read-only comparison and also works without the
token: it then checks only the committed template and prints that the hosted comparison was not run.
Add `--require-hosted` to make a missing token a failure, as the release checklist at
`docs/process/generation-reliability/release-checklist.md` does.

The access token is read from the process environment only. Do not commit it, pass it as a command
argument, or paste it into a journal. A successful admin-generated OTP test is not a substitute for
this check: that test never renders or delivers an email.
