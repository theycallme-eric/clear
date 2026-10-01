# Generation reliability — Requirements Builder prevention rules

**Requirement:** REQ-029 · **Task:** TASK-029 (issue #316) · **Recovery workstream:** GR-08
**Implementation target:** `/Users/eric/Documents/Projects/support-tooling/requirements-builder`

This is a handoff, not an implementation. It specifies five default rules for the separate
Requirements Builder project so that the process gaps behind the generation-reliability defect are
caught when requirements are drafted, not after an athlete presses Generate. This task changes no
product code and no support-tooling code; it commits this document and the test that guards it
(`src/test/generation-reliability/process-prevention.test.ts`).

Everything a Requirements Builder task graph needs is in this file: the rules, the checks, the
fixtures and the replay. That graph should not need to read CLEAR's product requirements, and must
not reinterpret them — the CLEAR facts it needs are quoted here as fixture data.

## Evidence

Findings are cited by section of the recovery brief. Source names are those of the approved
evidence package for this task.

| Cited as | Source | What it holds |
| --- | --- | --- |
| Recovery brief | `sources/source-01-CLEAR-GENERATION-RELIABILITY-RECOVERY.md` | "Why this recovery exists", "How the original gates missed it", the eight guardrails, GR-01–GR-08, release exit criteria |
| Frozen baseline | `sources/source-02-REQUIREMENTS.md` | GEN-02a as originally written |
| GEN-02a issue | `sources/source-03-GEN-02a.md` | The acceptance checklist the implementation was held to |

## Scope

In scope: the five Requirements Builder rules GR-08 lists — vocabulary cross-reference, legal-state
matrix, universal quantifiers, traceability, and the customized-user fixture.

Not in scope, and not specified here: GR-08's two Agent Runner rules (promoting a discovered
acceptance or dependency violation to a blocking recovery item, and inspecting unresolved journal
findings before a task closes). They belong to Agent Runner and need their own handoff.

Not verified: the Requirements Builder project could not be read from the workspace this task ran
in. Its language, command-line interface, internal layout and existing rule mechanism are therefore
unknown to this document. Paths beneath the target and the replay entry point below are
specifications for that project's graph to create, not descriptions of what exists there.

## Terms

- **Selectable vocabulary** — any closed set of values a user can choose and the product then acts
  on: an enum, a preset list, a tier list.
- **Backing data** — the committed data a selectable value depends on to do anything: here, catalog
  rows tagged with a section.
- **Configuration-heavy feature** — a feature whose behaviour depends on two or more independent
  selectable vocabularies, or on one vocabulary plus saved per-user customization.
- **Legal state** — one combination of values the product permits a user to save.
- **Universal quantifier** — "every", "each", "all", "any" applied to a vocabulary in evidence.

## The rules

Each rule is a default: Requirements Builder applies it to every package without being asked, and a
violation blocks graph emission rather than producing a warning.

### RB-RULE-01 — Selectable vocabulary is cross-referenced against backing data

For every selectable vocabulary the evidence names, Requirements Builder resolves each member
against the backing data that member depends on, and records the count. A member with no backing
data is a finding that must be dispositioned — backed, or made non-selectable — in the graph before
any task that exposes the vocabulary can be emitted.

**Gap closed:** The requirements proved that section values were valid enum members. Nothing proved
that each selectable member had anything behind it, so three of ten sections were offered in
onboarding and Settings with no exercise tagged for them.

**Derived from:** Recovery brief, "Why this recovery exists" items 1–2 (`section_type` declares ten
sections and all ten are exposed; the 140-exercise catalog has no rows tagged `skill_power`,
`carries` or `stability_balance`); the "Catalog seed" row of "How the original gates missed it";
GR-03 ("any new enum value must either ship with catalog support and tests or be explicitly
non-selectable"); GR-08 bullet 1.

**Detecting check:** `vocabulary-backing`. For each declared vocabulary, join its members to the
declared backing-data source and count. The check fails, naming the member, when any member that is
not marked non-selectable has a count of zero, and fails when a vocabulary is declared selectable
with no backing-data source at all. Against fixture `vocabulary-unbacked` it must report exactly
`skill_power`, `carries` and `stability_balance`.

### RB-RULE-02 — Configuration-heavy features get a legal-state matrix

When a feature is configuration-heavy, Requirements Builder emits a machine-readable matrix with one
row per legal state, each classified as supported, supported with a recorded relaxation, a
legitimate constraint refusal, or an unsupported product state. The matrix is a graph input: tasks
and criteria that concern the feature reference it.

**Gap closed:** No artefact enumerated what the UI permitted. The states that failed — an optional
section enabled, or the Minimal tier with a preset that requires `primary_lift` — were never listed,
so no criterion or test was written for them.

**Derived from:** Recovery brief, "Why this recovery exists" item 3 (Minimal has no `primary_lift`
candidate while Strength, Hypertrophy and Balanced enable it); the "Requirements" and "Retrieval
tests" rows of "How the original gates missed it"; GR-01 ("one machine-readable matrix accounts for
every legal state; no state is categorized as 'other' or left implicit"); guardrail 5; GR-08
bullet 1.

**Detecting check:** `legal-state-matrix`. The check fails when a feature meets the
configuration-heavy definition and has no matrix; when the matrix row count differs from the product
of its dimensions' sizes; when any row is unclassified or classified "other"; and when a row
classified as an unsupported product state has no task that either supports it or prevents it from
being saved. Against fixture `matrix-incomplete` it must report 40 expected section × tier rows, 8
present.

### RB-RULE-03 — Acceptance criteria preserve universal quantifiers

When evidence quantifies universally over a vocabulary, the criterion derived from it keeps that
quantifier over the same vocabulary. Requirements Builder may not narrow "every" to one
representative, and may not replace an enumerable vocabulary with an unenumerable qualifier such as
"realistic", "typical", "reasonable", "common" or "representative". The canonical form is
"every selectable section at every supported tier" — not "a goal returns something at a realistic
location".

**Gap closed:** The criterion that governed candidate retrieval quantified over goals only and
collapsed equipment to one unspecified location, so a single populated fixture satisfied it while
most of the permitted space was untested.

**Derived from:** Recovery brief, the "Requirements" row of "How the original gates missed it"
(proved "every goal has a non-empty candidate set at one realistically equipped location"; failed
to prove every selectable section and advertised tier); guardrail 3 ("no aggregate-only proof");
GR-08 bullet 2.

**Detecting check:** `quantifier-preserved`. For each criterion, list the vocabularies the feature
depends on (from RB-RULE-01) and the quantifier the criterion applies to each. The check fails when
a dependent vocabulary is absent from the criterion, is bound by an existential or singular
("a", "one", "some", "at least one") where evidence is universal, or is replaced by a term on the
unenumerable-qualifier list. It also fails when a universally quantified criterion's verification
enumerates fewer members than the vocabulary holds. Against fixture `gen-02a-original` it must
reject the criterion and name `section` and `tier`.

### RB-RULE-04 — Traceability runs evidence → criterion → task → verification

Every acceptance criterion cites the evidence it derives from; every criterion is owned by at least
one task; every task names a verification that exercises that criterion; and every finding in
evidence is either carried by a criterion or explicitly dispositioned. The chain is recorded in the
graph, in both directions.

**Gap closed:** The empty sections were found and written down during implementation, but nothing
linked that finding to a criterion, a task or a check. It was recorded as out of scope and
dependents completed on top of it.

**Derived from:** Recovery brief, "Why this recovery exists" closing paragraph (the TASK-032 journal
recorded all three optional sections as empty and called the finding out of scope); the "Runner
completion" row of "How the original gates missed it"; guardrail 7 ("no partial closure"); GR-08
bullet 3.

**Detecting check:** `trace-complete`. Walk the graph from each end. The check fails on any evidence
finding with no criterion and no disposition, any criterion with no evidence citation, any criterion
with no owning task, any task with no verification, and any verification that maps to no criterion.
Against fixture `trace-broken` it must report one orphan finding (`F-2`) and one criterion with no
verification (`C-2`).

### RB-RULE-05 — Release planning includes a stateful customized-user fixture

A release plan for a feature with saved per-user configuration includes at least one fixture that is
stateful — it exists before the journey starts and persists across it — and customized — at least
one saved value differs from every default preset. A fresh default user alone does not satisfy the
plan.

**Gap closed:** Every model-backed and browser journey used a fresh user on a default preset with a
full gym. The profile that actually failed was a saved, customized one, and no fixture resembled it.

**Derived from:** Recovery brief, "Why this recovery exists" item 5 (journey fixtures use only
populated default sections); the "Browser journey" row of "How the original gates missed it";
guardrail 5 ("no fixture-only success"); GR-07 (verify a returning user and a customized profile);
GR-08 bullet 6.

**Detecting check:** `customized-fixture-present`. For each release-planning task, list its
fixtures with their declared state. The check fails when no fixture is both pre-existing and
different from every default preset in at least one saved value, and fails when the customized
fixture is declared but no verification consumes it. Against fixture `release-fresh-only` it must
fail; against `release-with-customized` it must pass.

## Worked example — the GEN-02a criterion

GEN-02a's fourth acceptance criterion, as written in the frozen baseline and the issue:

> Every goal preset produces a non-empty candidate set for a realistically-equipped location, and an
> empty set is a typed error rather than an empty workout

**Verdict:** rejected. Under these rules Requirements Builder would not emit it.

| Rule | Why the original fails it |
| --- | --- |
| RB-RULE-01 | Candidate retrieval runs per section, so the criterion depends on the section vocabulary. Cross-referencing it gives ten members, three with zero backing rows. The criterion is drafted over a vocabulary with unbacked selectable members and no disposition for them. |
| RB-RULE-02 | Retrieval depends on section, tier, goal and focus, so the feature is configuration-heavy. No matrix exists, and "a realistically-equipped location" is not a row in one. |
| RB-RULE-03 | "Every" binds goal only. Tier is replaced by the unenumerable qualifier "realistically-equipped" and bound singular ("a … location"). Section is absent: "a non-empty candidate set" is an aggregate over the request, where the evidence — retrieval "runs per section" — is per section. Focus is absent. |
| RB-RULE-04 | With section and tier unbound, no verification can be traced to the states that failed; one populated fixture discharges the criterion. |

The second clause — an empty set is a typed error rather than an empty workout — is sound and is
kept. It is the clause that made the defect visible instead of silent.

### Rewrite

The single criterion becomes four, each quantified over an enumerated vocabulary and each traceable
to a row set in the legal-state matrix:

- [ ] Every selectable section has at least one catalog row; a section with none is either backed
      or made non-selectable before this task can close.
- [ ] Candidate retrieval returns a non-empty candidate set for
      every selectable section at every supported tier, verified per row of the section × tier
      matrix rather than in aggregate.
- [ ] Every supported Goal × Focus × tier combination returns non-empty candidates for every section
      that goal's preset requires; a combination that cannot is classified in the matrix and
      prevented from being saved, with the incompatible choice named.
- [ ] An empty candidate set for any required section is a typed error naming that section, never an
      empty workout and never a silently omitted section.

And the release plan that carries these gains, under RB-RULE-05, one saved profile whose enabled
sections differ from every goal preset.

What changed, in the terms of the check: `section` and `tier` are now bound universally, `focus` is
bound, the qualifier is gone, and each criterion names the matrix rows its verification must
enumerate.

## Implementation target

`/Users/eric/Documents/Projects/support-tooling/requirements-builder`

The work there is a separate task graph in that project, approved through that project's own
boundary. It is not part of this CLEAR graph and no CLEAR task depends on it.

Suggested task shape for that graph, one independently verifiable task per row:

| Task | Delivers | Verified by |
| --- | --- | --- |
| Fixtures and replay entry point | The fixtures below committed under `fixtures/prevention/`; a replay entry point that runs named checks against a fixture | Replay runs and reports "check not implemented" for all five |
| `vocabulary-backing` | RB-RULE-01 | Replay of `vocabulary-unbacked` |
| `legal-state-matrix` | RB-RULE-02 | Replay of `matrix-incomplete` |
| `quantifier-preserved` | RB-RULE-03 | Replay of `gen-02a-original` and `gen-02a-rewrite` |
| `trace-complete` | RB-RULE-04 | Replay of `trace-broken` |
| `customized-fixture-present` | RB-RULE-05 | Replay of `release-fresh-only` and `release-with-customized` |
| Default enablement | All five run on every package and block graph emission on failure | Full replay below |

If that project already has a rule or validator mechanism, the checks go there under these names;
the names and expected results are the contract, the file layout is not.

## Fixtures

Each fixture is self-contained data. The CLEAR values in them are quoted from the recovery brief and
are fixed test inputs, not a description of CLEAR's current state — CLEAR's catalog is being
repaired under GR-02 and these fixtures must not be regenerated from it.

Commit each beneath the target as `fixtures/prevention/<name>.json`.

**`vocabulary-unbacked`** — RB-RULE-01, must fail naming three members.

```json
{
  "vocabulary": "section",
  "selectable": true,
  "backingSource": "catalog rows by section tag",
  "members": [
    { "value": "warmup", "selectable": true, "backingCount": 12 },
    { "value": "mobility", "selectable": true, "backingCount": 10 },
    { "value": "primary_lift", "selectable": true, "backingCount": 20 },
    { "value": "accessory", "selectable": true, "backingCount": 50 },
    { "value": "skill_power", "selectable": true, "backingCount": 0 },
    { "value": "carries", "selectable": true, "backingCount": 0 },
    { "value": "core", "selectable": true, "backingCount": 18 },
    { "value": "stability_balance", "selectable": true, "backingCount": 0 },
    { "value": "conditioning", "selectable": true, "backingCount": 24 },
    { "value": "cooldown", "selectable": true, "backingCount": 6 }
  ],
  "expect": {
    "check": "vocabulary-backing",
    "result": "fail",
    "members": ["skill_power", "carries", "stability_balance"]
  }
}
```

The three zero counts and the total of ten members are the recovery finding. The non-zero counts
are illustrative; the check may depend only on whether a count is zero.

**`matrix-incomplete`** — RB-RULE-02, must fail on row count.

```json
{
  "feature": "candidate retrieval",
  "dimensions": {
    "section": [
      "warmup", "mobility", "primary_lift", "accessory", "skill_power",
      "carries", "core", "stability_balance", "conditioning", "cooldown"
    ],
    "tier": ["minimal", "home", "building", "full"]
  },
  "matrix": {
    "rows": [
      { "section": "warmup", "tier": "full", "class": "supported" },
      { "section": "mobility", "tier": "full", "class": "supported" },
      { "section": "primary_lift", "tier": "full", "class": "supported" },
      { "section": "accessory", "tier": "full", "class": "supported" },
      { "section": "core", "tier": "full", "class": "supported" },
      { "section": "conditioning", "tier": "full", "class": "supported" },
      { "section": "cooldown", "tier": "full", "class": "supported" },
      { "section": "primary_lift", "tier": "minimal", "class": "other" }
    ]
  },
  "expect": {
    "check": "legal-state-matrix",
    "result": "fail",
    "expectedRows": 40,
    "presentRows": 8,
    "unclassified": [{ "section": "primary_lift", "tier": "minimal" }]
  }
}
```

**`gen-02a-original`** — RB-RULE-03, must be rejected. This is the worked example as input.

```json
{
  "criterion": "Every goal preset produces a non-empty candidate set for a realistically-equipped location, and an empty set is a typed error rather than an empty workout",
  "evidence": [
    "Candidate retrieval runs per section: focus to pattern join, equipment intersection with the resolved location, user exclusions, section eligibility"
  ],
  "dependsOn": ["goal", "section", "tier", "focus"],
  "expect": {
    "check": "quantifier-preserved",
    "result": "fail",
    "bound": { "goal": "universal" },
    "unbound": ["section", "focus"],
    "narrowed": [{ "vocabulary": "tier", "by": "realistically-equipped", "binding": "singular" }]
  }
}
```

**`gen-02a-rewrite`** — RB-RULE-03, must pass.

```json
{
  "criteria": [
    "Every selectable section has at least one catalog row; a section with none is either backed or made non-selectable before this task can close.",
    "Candidate retrieval returns a non-empty candidate set for every selectable section at every supported tier, verified per row of the section × tier matrix rather than in aggregate.",
    "Every supported Goal × Focus × tier combination returns non-empty candidates for every section that goal's preset requires; a combination that cannot is classified in the matrix and prevented from being saved, with the incompatible choice named.",
    "An empty candidate set for any required section is a typed error naming that section, never an empty workout and never a silently omitted section."
  ],
  "dependsOn": ["goal", "section", "tier", "focus"],
  "expect": {
    "check": "quantifier-preserved",
    "result": "pass",
    "bound": { "goal": "universal", "section": "universal", "tier": "universal", "focus": "universal" }
  }
}
```

**`trace-broken`** — RB-RULE-04, must fail on one orphan finding and one unverified criterion.

```json
{
  "findings": [
    { "id": "F-1", "text": "Retrieval refuses any request where an enabled section is empty" },
    { "id": "F-2", "text": "The seed tags no exercise for skill_power, carries or stability_balance" }
  ],
  "criteria": [
    { "id": "C-1", "evidence": ["F-1"], "text": "An empty candidate set is a typed error" },
    { "id": "C-2", "evidence": ["F-1"], "text": "Every goal preset produces a non-empty candidate set" }
  ],
  "tasks": [
    { "id": "T-1", "criteria": ["C-1", "C-2"], "verification": [{ "id": "V-1", "criteria": ["C-1"] }] }
  ],
  "dispositions": [],
  "expect": {
    "check": "trace-complete",
    "result": "fail",
    "orphanFindings": ["F-2"],
    "unverifiedCriteria": ["C-2"]
  }
}
```

`F-2` is the TASK-032 finding. Adding a disposition for it that does not also remove the affected
behaviour from dependents must still fail; that half is the Agent Runner rule and is out of scope
here, so this fixture only requires that an undispositioned finding is reported.

**`release-fresh-only`** — RB-RULE-05, must fail.

```json
{
  "feature": "generation",
  "defaultPresets": {
    "strength": ["warmup", "primary_lift", "accessory", "core", "cooldown"]
  },
  "releaseFixtures": [
    {
      "id": "fresh-strength-full",
      "preExisting": false,
      "goal": "strength",
      "tier": "full",
      "sections": ["warmup", "primary_lift", "accessory", "core", "cooldown"]
    }
  ],
  "verifications": [{ "id": "V-1", "consumes": ["fresh-strength-full"] }],
  "expect": { "check": "customized-fixture-present", "result": "fail" }
}
```

**`release-with-customized`** — RB-RULE-05, must pass.

```json
{
  "feature": "generation",
  "defaultPresets": {
    "strength": ["warmup", "primary_lift", "accessory", "core", "cooldown"]
  },
  "releaseFixtures": [
    {
      "id": "fresh-strength-full",
      "preExisting": false,
      "goal": "strength",
      "tier": "full",
      "sections": ["warmup", "primary_lift", "accessory", "core", "cooldown"]
    },
    {
      "id": "returning-customized",
      "preExisting": true,
      "goal": "strength",
      "tier": "home",
      "sections": ["warmup", "primary_lift", "accessory", "carries", "core", "cooldown"]
    }
  ],
  "verifications": [
    { "id": "V-1", "consumes": ["fresh-strength-full"] },
    { "id": "V-2", "consumes": ["returning-customized"] }
  ],
  "expect": { "check": "customized-fixture-present", "result": "pass" }
}
```

The customized fixture's sections are illustrative of "differs from every default preset". They are
not the owner's saved profile, which is personal data and is not recorded here.

## Replay

The replay is the acceptance test for the Requirements Builder graph: GR-08 is done when replaying
the original finding stops the graph. The entry point does not exist yet — creating it is that
graph's first task. Its contract:

```sh
cd /Users/eric/Documents/Projects/support-tooling/requirements-builder
node scripts/replay-prevention.mjs fixtures/prevention
```

If that project is not a Node project or has its own command convention, the graph substitutes the
equivalent invocation and keeps the rest of this contract unchanged.

- **Input:** a directory of fixtures in the shape above, or one fixture file.
- **Behaviour:** for each fixture, run the check named in `expect.check` on the fixture's data and
  compare the outcome with `expect`. The checks invoked are the same ones Requirements Builder
  applies by default to a real package — not replay-only copies.
- **Output:** one line per fixture — fixture name, check, expected result, actual result — and for
  a failing check, the members, rows or ids it reported.
- **Exit status:** exits 0 only when every fixture's actual outcome equals its `expect`, including
  the reported details. Exits non-zero when any differs, when a named check is not implemented, or
  when the directory holds no fixture.

Expected result once all five checks exist:

| Fixture | Check | Expected |
| --- | --- | --- |
| `vocabulary-unbacked` | `vocabulary-backing` | fail: `skill_power`, `carries`, `stability_balance` |
| `matrix-incomplete` | `legal-state-matrix` | fail: 40 expected, 8 present, 1 unclassified |
| `gen-02a-original` | `quantifier-preserved` | fail: `section`, `focus` unbound; `tier` narrowed |
| `gen-02a-rewrite` | `quantifier-preserved` | pass |
| `trace-broken` | `trace-complete` | fail: orphan `F-2`, unverified `C-2` |
| `release-fresh-only` | `customized-fixture-present` | fail |
| `release-with-customized` | `customized-fixture-present` | pass |

Two further properties the graph must demonstrate, because a replay that only matches fixtures
proves little:

1. **End to end.** Feeding Requirements Builder a package whose only criterion is the
   `gen-02a-original` text, with the `vocabulary-unbacked` data as its backing source, produces no
   emitted graph and a report naming RB-RULE-01, RB-RULE-02 and RB-RULE-03.
2. **Mutation.** Disabling any one check makes the replay exit non-zero.

## Traceability of this document

| Rule | Finding | Criterion (REQ-029) | Task | Verification |
| --- | --- | --- | --- | --- |
| RB-RULE-01 | Ten sections exposed, three unbacked | Rule stated with gap, finding, check | TASK-029 | `process-prevention.test.ts` |
| RB-RULE-02 | Minimal × `primary_lift`; no state inventory | Rule stated with gap, finding, check | TASK-029 | `process-prevention.test.ts` |
| RB-RULE-03 | GEN-02a quantified over goal only | Rule stated; worked rejection and rewrite | TASK-029 | `process-prevention.test.ts`; `grep` for the quantifier |
| RB-RULE-04 | TASK-032 finding left out of scope | Rule stated with gap, finding, check | TASK-029 | `process-prevention.test.ts` |
| RB-RULE-05 | Fixtures were fresh default users only | Rule stated with gap, finding, check | TASK-029 | `process-prevention.test.ts` |

```sh
npx vitest run src/test/generation-reliability/process-prevention.test.ts
grep -q "every selectable section at every supported tier" docs/process/generation-reliability/requirements-builder-prevention.md
```

The test fails if any of the five rules is removed, loses its gap, finding or detecting check, or if
the worked example, target path, fixtures or replay contract goes missing. It checks that this
document is complete; it cannot check that Requirements Builder obeys it. That is what the replay is
for.
