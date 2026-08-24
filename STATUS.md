# Open Threads

Living doc. Updated when a thread opens, moves, or closes.
**Owner** is who the thread is actually waiting on — not who cares about it.

---

## Blocking the critical path

### 1. Requirements review — **Eric** · ~12% done
6 of 51 reviewed (DS-01, DS-02, DS-06, GEN-03, GEN-05, OVR-04). 45 untouched.
This is what gates ticket creation, the DAG, and the first build session.
→ [Review artifact](https://claude.ai/code/artifact/908ad21f-21be-4aeb-b948-59a417754a55) · "Copy review notes" → paste to Claude

**Do not review DATA-01, DATA-02, DATA-03 yet** — the schema pass will rewrite them.

### 2. Database model pass — **Claude** · proposed, not started
DATA-01 is the root of the dependency graph and currently reads "port the old schema's end state,"
which is the most old-work-dependent requirement in the doc. Real findings already: `reps` is TEXT
holding four data types, `anchor_type` mixes three taxonomies, streak is six columns of stored
derived state, TEXT where the schema's own conventions use enums.
**Nothing blocks this.** Deliverable: `specs/DATA_MODEL.md`, same treatment OVR-01 got.

---

## Waiting on the outside world

### 3. Claude Design export — **Eric** · not yet sent
Gates DS-01, DS-02, DS-06, GEN-05 — and the atomic component inventory (below).
`./scripts/import-design.sh <zip>` is ready: unpacks, diffs against the last export, shows
token-level changes.

### 4. Generation system review — **third-party LLM** · packet delivered
`specs/generation/GENERATION_REVIEW_PACKET.md` — self-contained, no attachments needed.
Optional sharpener: `scripts/export-sample-workouts.sql` pulls 3 real workouts from Supabase.
Findings may touch the schema — treat as additive revision, don't wait on it.

---

## Queued, correctly not started

### 5. IA / interaction diagram — **Claude** · buildable now
Screens, routes, flows, states, transitions. Independent of visual design.
Fixes the composition gap: requirements specify *behavior*, DS specifies *components*, nothing
specifies which components compose which screen.

### 6. Atomic component inventory — **Claude** · gated on the design export
The component vocabulary with variants, states, and token bindings. Prevents agents inventing
one-off UI per interaction.
**Deliberately gated** — same reason DS-01/02/06 are. Building it against soon-to-change tokens
means building it twice. `specs/design/ui-component-spec.md` (331 lines, from project knowledge)
is the starting material.

### 7. DAG playbook + review-process doc — **Claude** · deferred by design
The method isn't finished being invented — no tickets cut, no build session run. Written now it
documents predictions; written after the first pass it documents what happened.
`journal/` is collecting the raw material.

### 8. GitHub — **Eric** · paused deliberately
New repo not created, issues not cut. Unpauses when requirements are approved.
Decided: this workspace becomes the repo's `docs/`.

---

## Small, has ongoing cost

### 9. Project knowledge cleanup — **Eric** · not started
`process/PROJECT_CLEANUP.md` has the checklist. **This one degrades every future session** while
it sits: the project instructions still say Antigravity builds the app, the stack is Tailwind, and
Figma is the design source of truth. All three are wrong, and every new conversation inherits them.

### 10. `_to_delete/` on disk — **Eric** · one folder to delete
`~/Documents/Projects/Clear/_to_delete/` — emptied, renamed, safe to remove.

---

## Closed

- **Coworker's DAG viewer (Issue Atlas)** — read-only GraphQL viewer over native GitHub
  dependencies. Confirms the architecture; our graph fits inside its limits.
- **Old-repo independence** — 21 specs copied into `specs/`, mojibake repaired, zero references
  to `clear-app` remain. Only external read left is the exercise library data export.
- **Review-tool copy failure** — clipboard is blocked in the artifact sandbox; now falls back to a
  selectable text box that can't fail.
- **GitHub access confusion** — `api.github.com` is intercepted wholesale in this container
  (public repos fail identically). Not a permissions issue, not fixable with a token.

---

## Recommended order

1. **Schema pass** (Claude) — unblocked, highest cost-of-being-wrong, and makes Eric's review of
   the DATA requirements worth doing instead of wasted
2. **Requirements review** (Eric) — in parallel, skipping DATA-*
3. **IA diagram** (Claude) — after the schema pass; data model informs screen composition
4. **Design export arrives** → DS gates lift → atomic inventory
5. **Requirements v1.0 locked** → GitHub → issues → DAG
