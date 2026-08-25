# DAG — the build order

**Generated** by `scripts/gen-dag.py` from `requirements/REQUIREMENTS.md`. Hand edits are meaningless; the next run overwrites them.

_Structural view — run with `--live` once issues exist to overlay open/closed._


| | |
|---|---|
| Requirements | **71** |
| Dependencies | **136** |
| Ready at t=0 | **ENV-01** |
| Critical path | **15 steps** |
| Widest parallelism | **13 issues at once** (wave 3) |


## Critical path

The longest chain in the graph. Nothing makes the build shorter than this, however many agents run in parallel — so a delay here is the only kind that costs calendar time.

`ENV-01 → DATA-01a → DATA-01b → DATA-01c → DATA-01d → DATA-03 → AUTH-01 → AUTH-03 → SES-01a → EXE-01 → EXE-02 → OVR-01a → OVR-01b → OVR-02 → OVR-04`


> **A longer critical path is not automatically worse.** Splitting `DATA-01` into four domain migrations added three steps to this chain, but those migrations were always sequential — foreign keys decide that, not the tickets. What the split bought is that `DATA-02` starts after `DATA-01a` instead of after all four. Count steps to find the chain that matters; do not treat the number as a score.


## Waves

What becomes available as the previous wave closes. This is not a schedule — it is the *shape* of the available parallelism.

| Wave | Count | Issues |
|---|---|---|
| 1 | 1 | ENV-01 |
| 2 | 6 | CORE-01, DATA-01a, DS-01, ENV-02, ENV-03, ENV-06 |
| 3 | 13 | CORE-02, CORE-04, CORE-05, DATA-01b, DATA-02, DS-02, DS-04a, DS-04b, DS-04c, DS-05, DS-06, DS-08, ENV-05 |
| 4 | 5 | DATA-01c, DATA-05, DS-07, ENV-04, PWA-01 |
| 5 | 1 | DATA-01d |
| 6 | 1 | DATA-03 |
| 7 | 3 | AUTH-01, CORE-03, GEN-02a |
| 8 | 4 | AUTH-02, AUTH-03, ENV-07, GEN-01 |
| 9 | 5 | GEN-02b, HIST-01, ONB-01, SES-01a, SET-01 |
| 10 | 6 | EXE-01, GEN-02c, SES-01b, SES-01c, SET-02, SUM-01 |
| 11 | 9 | EXE-02, EXE-03, EXE-04a, EXE-04b, EXE-04c, EXE-05, GEN-03, GEN-06, REV-02 |
| 12 | 7 | EXE-06, EXE-07, GEN-04, GEN-05, HOME-01, OVR-01a, REV-01 |
| 13 | 5 | FAV-01, HOME-02, HOME-03, OVR-01b, REV-03 |
| 14 | 4 | FAV-02, OVR-01c, OVR-02, OVR-03 |
| 15 | 1 | OVR-04 |


## Highest leverage

When several issues are ready, the one unblocking the most is usually the one to take.

| Issue | Unblocks |
|---|---|
| **ENV-01** — Repository scaffold | 12 |
| **DS-01** — Vendor and mount the design system | 10 |
| **DS-04a** — Card | 8 |
| **EXE-01** — Workout shell | 7 |
| **DATA-03** — Generated types + typed client | 6 |
| **CORE-03** — Boundary schemas (zod) | 6 |
| **AUTH-03** — Route guards + profile/locations queries | 6 |
| **SES-01a** — Session lifecycle + atomic persistence | 5 |


## M0 — 28 issues

Rounded nodes are dependencies from an earlier milestone.

```mermaid
graph LR
  ENV_01["ENV-01<br/>Repository scaffold"]
  ENV_02["ENV-02<br/>CI pipeline"]
  ENV_03["ENV-03<br/>Deploy pipeline"]
  ENV_04["ENV-04<br/>Dev environment: one command, legi"]
  ENV_05["ENV-05<br/>Supabase keep-alive"]
  ENV_06["ENV-06<br/>Test harness"]
  ENV_07["ENV-07<br/>E2E harness + test data lifecycle"]
  DATA_01a["DATA-01a<br/>Schema: catalog domain"]
  DATA_01b["DATA-01b<br/>Schema: user baseline domain"]
  DATA_01c["DATA-01c<br/>Schema: workout domain"]
  DATA_01d["DATA-01d<br/>Schema: execution domain"]
  DATA_02["DATA-02<br/>Exercise library seed + taxonomy v"]
  DATA_03["DATA-03<br/>Generated types + typed client"]
  DATA_05["DATA-05<br/>User-authored constraints"]
  CORE_01["CORE-01<br/>Error taxonomy + request IDs"]
  CORE_02["CORE-02<br/>Structured logger with redaction"]
  CORE_03["CORE-03<br/>Boundary schemas (zod)"]
  CORE_04["CORE-04<br/>App-wide state contract"]
  CORE_05["CORE-05<br/>Accessibility contract"]
  AUTH_01["AUTH-01<br/>Session context"]
  AUTH_02["AUTH-02<br/>Welcome + OTP login screens"]
  AUTH_03["AUTH-03<br/>Route guards + profile/locations q"]
  DS_01["DS-01<br/>Vendor and mount the design system"]
  DS_02["DS-02<br/>Self-host the three font families"]
  DS_04a["DS-04a<br/>Card"]
  DS_04b["DS-04b<br/>Select"]
  DS_04c["DS-04c<br/>CollapsibleSection"]
  DS_08["DS-08<br/>Adherence gate in CI"]
  ENV_01 --> ENV_02
  ENV_01 --> ENV_03
  ENV_01 --> ENV_04
  DATA_01b --> ENV_04
  ENV_02 --> ENV_05
  DATA_01a --> ENV_05
  ENV_01 --> ENV_06
  ENV_06 --> ENV_07
  ENV_02 --> ENV_07
  DATA_02 --> ENV_07
  AUTH_01 --> ENV_07
  ENV_01 --> DATA_01a
  DATA_01a --> DATA_01b
  DATA_01b --> DATA_01c
  DATA_01c --> DATA_01d
  DATA_01a --> DATA_02
  ENV_01 --> DATA_03
  DATA_01d --> DATA_03
  DATA_01b --> DATA_05
  ENV_01 --> CORE_01
  ENV_01 --> CORE_02
  CORE_01 --> CORE_02
  ENV_01 --> CORE_03
  DATA_03 --> CORE_03
  CORE_01 --> CORE_04
  ENV_01 --> CORE_05
  DS_01 --> CORE_05
  ENV_01 --> AUTH_01
  DATA_03 --> AUTH_01
  AUTH_01 --> AUTH_02
  DS_01 --> AUTH_02
  AUTH_01 --> AUTH_03
  DATA_03 --> AUTH_03
  CORE_01 --> AUTH_03
  CORE_03 --> AUTH_03
  ENV_01 --> DS_01
  DS_01 --> DS_02
  DS_01 --> DS_04a
  DS_01 --> DS_04b
  DS_01 --> DS_04c
  DS_01 --> DS_08
  classDef infra fill:#0E442922,stroke:#0E4429,color:#ddd
  class ENV_01,ENV_02,ENV_03,ENV_04,ENV_05,ENV_06,ENV_07 infra
  classDef data fill:#1F6FEB22,stroke:#1F6FEB,color:#ddd
  class DATA_01a,DATA_01b,DATA_01c,DATA_01d,DATA_02,DATA_03,DATA_05 data
  classDef state fill:#BF870022,stroke:#BF8700,color:#ddd
  class CORE_01,CORE_02,CORE_03,CORE_04,CORE_05,AUTH_01,AUTH_03 state
  classDef ui fill:#F8782322,stroke:#F87823,color:#ddd
  class AUTH_02 ui
  classDef design fill:#DB61A222,stroke:#DB61A2,color:#ddd
  class DS_01,DS_02,DS_04a,DS_04b,DS_04c,DS_08 design
```


## M1 — 28 issues

Rounded nodes are dependencies from an earlier milestone.

```mermaid
graph LR
  DS_04c(["DS-04c"])
  DS_04b(["DS-04b"])
  DS_04a(["DS-04a"])
  DS_01(["DS-01"])
  DATA_03(["DATA-03"])
  DATA_02(["DATA-02"])
  DATA_01d(["DATA-01d"])
  DATA_01c(["DATA-01c"])
  CORE_03(["CORE-03"])
  CORE_01(["CORE-01"])
  AUTH_03(["AUTH-03"])
  DS_05["DS-05<br/>Toast host and error surfaces"]
  DS_06["DS-06<br/>Atmosphere assignment"]
  DS_07["DS-07<br/>Gallery"]
  GEN_01["GEN-01<br/>Edge function envelope"]
  GEN_02a["GEN-02a<br/>Candidate resolution + retrieval"]
  GEN_02b["GEN-02b<br/>Prompt composition + model call"]
  GEN_02c["GEN-02c<br/>Validation, hydration, persistence"]
  GEN_03["GEN-03<br/>Generation client state"]
  GEN_04["GEN-04<br/>Generation screen"]
  GEN_05["GEN-05<br/>Loading screen"]
  GEN_06["GEN-06<br/>Duration plausibility check"]
  SES_01a["SES-01a<br/>Session lifecycle + atomic persist"]
  SES_01b["SES-01b<br/>Three-state reconstruction + the D"]
  SES_01c["SES-01c<br/>Streak derivation"]
  REV_01["REV-01<br/>Review screen"]
  REV_02["REV-02<br/>Section/exercise swap function"]
  REV_03["REV-03<br/>Swap UI: history, undo, nudge"]
  EXE_01["EXE-01<br/>Workout shell"]
  EXE_02["EXE-02<br/>Standard + superset renderers, set"]
  EXE_03["EXE-03<br/>Circuit + EMOM renderers"]
  EXE_04a["EXE-04a<br/>Ladder renderer + rung selection"]
  EXE_04b["EXE-04b<br/>For Time renderer"]
  EXE_04c["EXE-04c<br/>AMRAP renderer"]
  EXE_05["EXE-05<br/>Rest timer + coaching panel"]
  EXE_07["EXE-07<br/>Durable set logging"]
  SUM_01["SUM-01<br/>Post-workout summary"]
  HIST_01["HIST-01<br/>History list + detail"]
  HOME_01["HOME-01<br/>Home screen v1"]
  DS_01 --> DS_05
  DS_01 --> DS_06
  DS_04a --> DS_07
  DS_04b --> DS_07
  DS_04c --> DS_07
  DATA_01c --> GEN_01
  CORE_01 --> GEN_01
  CORE_03 --> GEN_01
  DATA_02 --> GEN_02a
  DATA_03 --> GEN_02a
  GEN_02a --> GEN_02b
  GEN_01 --> GEN_02b
  CORE_03 --> GEN_02b
  GEN_02b --> GEN_02c
  DATA_01d --> GEN_02c
  GEN_02c --> GEN_03
  CORE_03 --> GEN_03
  AUTH_03 --> GEN_03
  GEN_03 --> GEN_04
  DS_04c --> GEN_04
  AUTH_03 --> GEN_04
  GEN_03 --> GEN_05
  DS_06 --> GEN_05
  GEN_02c --> GEN_06
  CORE_03 --> GEN_06
  DATA_01d --> SES_01a
  DATA_03 --> SES_01a
  CORE_03 --> SES_01a
  AUTH_03 --> SES_01a
  SES_01a --> SES_01b
  SES_01a --> SES_01c
  GEN_03 --> REV_01
  DS_04a --> REV_01
  DS_05 --> REV_01
  GEN_02c --> REV_02
  REV_01 --> REV_03
  REV_02 --> REV_03
  SES_01a --> EXE_01
  DS_04a --> EXE_01
  DS_05 --> EXE_01
  EXE_01 --> EXE_02
  DS_04a --> EXE_02
  EXE_01 --> EXE_03
  EXE_01 --> EXE_04a
  EXE_01 --> EXE_04b
  EXE_01 --> EXE_04c
  EXE_01 --> EXE_05
  DS_05 --> EXE_05
  EXE_02 --> EXE_07
  SES_01a --> EXE_07
  SES_01a --> SUM_01
  DS_04a --> SUM_01
  DS_05 --> SUM_01
  DATA_03 --> HIST_01
  AUTH_03 --> HIST_01
  DS_04a --> HIST_01
  HIST_01 --> HOME_01
  SES_01c --> HOME_01
  GEN_03 --> HOME_01
  DS_04a --> HOME_01
  classDef design fill:#DB61A222,stroke:#DB61A2,color:#ddd
  class DS_05,DS_06,DS_07 design
  classDef api fill:#8250DF22,stroke:#8250DF,color:#ddd
  class GEN_01,GEN_02a,GEN_02b,GEN_02c,GEN_06,REV_02 api
  classDef state fill:#BF870022,stroke:#BF8700,color:#ddd
  class GEN_03,SES_01a,SES_01b,SES_01c,EXE_07 state
  classDef ui fill:#F8782322,stroke:#F87823,color:#ddd
  class GEN_04,GEN_05,REV_01,REV_03,EXE_01,EXE_02,EXE_03,EXE_04a,EXE_04b,EXE_04c,EXE_05,SUM_01,HIST_01,HOME_01 ui
```


## M2 — 8 issues

Rounded nodes are dependencies from an earlier milestone.

```mermaid
graph LR
  SUM_01(["SUM-01"])
  SES_01c(["SES-01c"])
  SES_01b(["SES-01b"])
  HOME_01(["HOME-01"])
  GEN_04(["GEN-04"])
  EXE_04c(["EXE-04c"])
  EXE_04b(["EXE-04b"])
  EXE_04a(["EXE-04a"])
  ENV_03(["ENV-03"])
  DS_04a(["DS-04a"])
  DS_02(["DS-02"])
  DS_01(["DS-01"])
  AUTH_03(["AUTH-03"])
  ONB_01["ONB-01<br/>Onboarding flow"]
  FAV_01["FAV-01<br/>Favorites core"]
  FAV_02["FAV-02<br/>Favorites v2: progression + person"]
  HOME_02["HOME-02<br/>Streak engine + rest days"]
  HOME_03["HOME-03<br/>Suggested anchor + intensity"]
  SET_01["SET-01<br/>Settings hub + preferences"]
  SET_02["SET-02<br/>Locations + equipment management"]
  PWA_01["PWA-01<br/>Installable PWA"]
  AUTH_03 --> ONB_01
  DS_01 --> ONB_01
  SUM_01 --> FAV_01
  SES_01b --> FAV_01
  HOME_01 --> FAV_01
  FAV_01 --> FAV_02
  EXE_04a --> FAV_02
  EXE_04b --> FAV_02
  EXE_04c --> FAV_02
  HOME_01 --> HOME_02
  SES_01c --> HOME_02
  HOME_01 --> HOME_03
  GEN_04 --> HOME_03
  AUTH_03 --> SET_01
  DS_04a --> SET_01
  SET_01 --> SET_02
  ENV_03 --> PWA_01
  DS_02 --> PWA_01
  classDef ui fill:#F8782322,stroke:#F87823,color:#ddd
  class ONB_01,FAV_01,FAV_02,SET_01,SET_02 ui
  classDef state fill:#BF870022,stroke:#BF8700,color:#ddd
  class HOME_02,HOME_03 state
  classDef infra fill:#0E442922,stroke:#0E4429,color:#ddd
  class PWA_01 infra
```


## M3 — 7 issues

Rounded nodes are dependencies from an earlier milestone.

```mermaid
graph LR
  SES_01b(["SES-01b"])
  REV_02(["REV-02"])
  REV_01(["REV-01"])
  GEN_04(["GEN-04"])
  GEN_02b(["GEN-02b"])
  EXE_04c(["EXE-04c"])
  EXE_04b(["EXE-04b"])
  EXE_04a(["EXE-04a"])
  EXE_02(["EXE-02"])
  EXE_01(["EXE-01"])
  DS_05(["DS-05"])
  OVR_01a["OVR-01a<br/>Load anchors"]
  OVR_01b["OVR-01b<br/>Progression rules"]
  OVR_01c["OVR-01c<br/>Review surface: suggestion + "why "]
  OVR_02["OVR-02<br/>Generation integration (prompt bum"]
  OVR_03["OVR-03<br/>Timed-format progression"]
  OVR_04["OVR-04<br/>Deload detection + override"]
  EXE_06["EXE-06<br/>Mid-workout exercise swap"]
  EXE_02 --> OVR_01a
  SES_01b --> OVR_01a
  OVR_01a --> OVR_01b
  OVR_01b --> OVR_01c
  REV_01 --> OVR_01c
  DS_05 --> OVR_01c
  OVR_01b --> OVR_02
  GEN_02b --> OVR_02
  OVR_01b --> OVR_03
  EXE_04a --> OVR_03
  EXE_04b --> OVR_03
  EXE_04c --> OVR_03
  OVR_01a --> OVR_04
  OVR_02 --> OVR_04
  GEN_04 --> OVR_04
  EXE_01 --> EXE_06
  REV_02 --> EXE_06
  classDef state fill:#BF870022,stroke:#BF8700,color:#ddd
  class OVR_01a,OVR_01b,OVR_04 state
  classDef ui fill:#F8782322,stroke:#F87823,color:#ddd
  class OVR_01c,OVR_03,EXE_06 ui
  classDef api fill:#8250DF22,stroke:#8250DF,color:#ddd
  class OVR_02 api
```
