# Known human and service gates

These are predictable pauses, not surprises or reasons to abandon the run. An agent should complete
all safe local work first, then state the exact destination where Eric must authorize or enter a value.
Secret values are never pasted into chat, committed, or echoed into logs.

| Gate | Earliest issue | What the agent can do alone | What Eric may need to do |
|---|---|---|---|
| Vercel account/project | ENV-03 | Prepare deploy config and verify the local build | Authorize Vercel and confirm/link the project |
| New Supabase project | DATA-01a | Write and locally verify migrations | Authorize Supabase and create/link the new project if CLI access is absent |
| Old catalog export | DATA-02 | Reconstruct and audit the 140-row catalog committed in the archived repo | Grant old-project read access so the expected 173 live rows can be exported and reconciled |
| Browser Supabase client | DATA-03 | Add typed client and environment validation | Put the project URL and public anon key in the requested local/hosting environment |
| Privileged E2E lifecycle | ENV-07 | Build seed/reset and RLS tests | Store the service-role/test credential in the named secret store |
| Anthropic generation | GEN-02b | Build prompt, schema validation, and function boundary | Store `ANTHROPIC_API_KEY` in Supabase Edge Function secrets |
| Merge | every issue | Open a tested PR with evidence | Review and merge, unless an explicit protected auto-merge policy is later approved |

## Secret destinations

- Browser-safe Supabase URL and anon key: gitignored local environment plus Vercel environment values.
- Supabase service-role/test credentials: CI or hosting secret storage only; never browser code.
- Anthropic API key: Supabase Edge Function secret storage only.
- GitHub, Supabase, and Vercel login tokens: their own CLI/keychain/browser authorization flows.

The agent asks for the **action and destination**, never the secret value.
