# CLEAR

AI-powered workout generator. React 19 + TypeScript + Vite · Supabase · Anthropic API · Vercel.
**No Tailwind, no component library** — the design system is vendored at `src/design-system/`.

---

## How work is chosen

**Read `docs/process/AGENT_PLAYBOOK.md` before starting.** It is the operating manual, not
background reading.

Work comes from the ready queue, never from scrolling the issue list:

```sh
python3 scripts/dag-ready.py
```

The command cross-checks GitHub's native ready search, excludes issues already in an open PR, and
ranks what remains. Take its recommendation unless Eric named another available ready issue.

When Eric asks to run the DAG, automate the build, work unattended, or run for a while, use the
project skill `clear-dag-runner`. Its canonical loop is `docs/process/DAG_RUNNER.md`.

**Never work an issue that is not in the ready queue.** If it looks ready but the queue
disagrees, the graph is right — go read what it is blocked by.

---

## What to read, in this order

1. **The issue body and comments.** Its acceptance checklist is the definition of done; comments
   can contain later owner decisions — neither is a suggestion.
2. **Its `Spec:` references.** All under `docs/`. Nothing points outside this repo.
3. **`PROJECT_MAP.md`** — how the codebase is arranged, so a new file lands where this
   project puts that kind of file.
4. **`docs/specs/design/ATOMIC.md`** — for *any* UI work, always. It lists every token,
   component, prop and icon that already exists, and the only three that legitimately need
   building. Check it before writing a component.
5. **`docs/specs/IA.md`** — for a screen: route, guard, states, composition, atmosphere.

Do **not** read `docs/requirements/REQUIREMENTS.md` to work an issue. It is the frozen
baseline; the issue body already contains what it said.

---

## Non-negotiables

- **One issue, one branch, one PR.** Never fix something adjacent "while we're here" — that
  is how a 71-node graph stops being true.
- **No hardcoded hex, px value, or font name.** Tokens only. CI fails the build on it.
- **Corner radius is 0.** No spinner — use `ScanLoader`. No emoji, ever. No Lucide.
- **Import design-system components from the public entry**, never an internal path.
- **Every data-driven view implements all four states** — loading, empty, error, populated.
  A view that can render nothing is incomplete regardless of its own criteria.
- **Colour is never the only cue.** Selection carries a tick, severity carries a glyph.
- **No secrets client-side.** Only the Supabase anon key ships to the browser.

---

## When the requirement is wrong

It will happen, and it is useful information — not a reason to improvise.

**Do:** comment on the issue saying what is wrong and what you would do instead, then move to
the next ready issue. Nothing else is blocked while it waits.

**Do not:** widen the scope to cover the gap · edit `docs/requirements/REQUIREMENTS.md` ·
close the issue partially done · write code that depends on another issue's output.

If you find yourself needing another issue's output, the graph is wrong, and **that is the
finding.** Report it.

---

## Done

**Every acceptance box checked AND CI green.** Both. A checked box with red CI is not done;
green CI with unchecked boxes means the criteria were not the criteria.

Update `PROJECT_MAP.md` when the architecture changes — a new directory, a new boundary, a new
data flow. Not for every file.

## Process journal

For every material work session, update `docs/journal/YYYY-MM-DD.md` at meaningful checkpoints
and before handoff. Record failures and causes, corrections, exact verification results, unresolved
questions, and the next safe action—not only the successful final state. Follow the always-loaded
rule in `.claude/rules/process-journal.md` and the full policy in the agent playbook §10. Never put
secrets, tokens, one-time codes, private email contents, or personal data in the journal.
