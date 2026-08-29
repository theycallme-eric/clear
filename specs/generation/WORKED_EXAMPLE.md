# Worked generation and reconstruction example

> **Contracts exercised:** generation `4.1.0`, prompt `5.0.0`, temporal lineage, performed view  
> **Purpose:** one concrete trace from request to candidates to model output to persisted rows and
> the three product reconstructions. UUID-like labels are readable aliases, not production IDs.

## 1. Request and deterministic resolution

```json
{
  "request_id": "req-1042",
  "goal": "strength",
  "focus": "lower_body",
  "requested_intensity": 7,
  "effective_intensity": 7,
  "requested_duration_mins": 35,
  "effective_duration_target_mins": 35,
  "location_id": "loc-home",
  "usable_equipment": ["barbell", "trap_bar", "dumbbell", "bodyweight"]
}
```

`GEN-02a` applies enabled sections, equipment, exclusions, and section eligibility in SQL. The
prompt receives compact section candidates—not the library. This excerpt is sufficient to explain
the later choice:

```text
CANDIDATES — warmup
air-squat | patterns:[squat] | components:[hips,knees,brace] | equipment:[bodyweight]

CANDIDATES — primary_lift
deadlift | patterns:[hinge] | role:compound_lift | components:[posterior-chain,grip,brace]
         | equipment:[barbell] | can_be_primary
trap-bar-deadlift | patterns:[hinge] | role:compound_lift | components:[posterior-chain,grip,brace]
                  | equipment:[trap_bar] | can_be_primary

CANDIDATES — accessory
db-split-squat | patterns:[squat,unilateral] | equipment:[dumbbell]

CANDIDATES — core
dead-bug | patterns:[anti-extension] | equipment:[bodyweight]

CANDIDATES — cooldown
supine-hamstring-stretch | components:[hamstrings] | equipment:[bodyweight]
```

## 2. Claude composition result

The real result contains no exercise names, display strings, cues, regressions, or authoritative
catalog facts. This is the complete structural selection for the example:

```json
{
  "title": "Lower-body strength",
  "overview": "Hinge-led strength work with unilateral support.",
  "sections": [
    {"section_type":"warmup","section_title":"Prepare","section_notes":null,"blocks":[
      {"structure_type":"standard","rounds":null,"timer_type":"none","timer_seconds":null,"round_rest_seconds":null,"rep_scheme":"fixed","block_notes":null,"exercises":[
        {"exercise_id":"air-squat","equipment":"bodyweight","session_function":"prep","anchor_relationship":"complementary","modality":"reps","sets":2,"target_kind":"fixed","target_value":10,"target_min":null,"target_max":null,"target_sequence":null,"per_side":false,"distance_unit":null,"rest_seconds":30,"tempo":null,"load_type":"bodyweight","load_value":null,"is_interval_exercise":false}
      ]}
    ]},
    {"section_type":"primary_lift","section_title":"Primary","section_notes":null,"blocks":[
      {"structure_type":"standard","rounds":null,"timer_type":"none","timer_seconds":null,"round_rest_seconds":null,"rep_scheme":"fixed","block_notes":null,"exercises":[
        {"exercise_id":"deadlift","equipment":"barbell","session_function":"primary","anchor_relationship":"direct","modality":"reps","sets":4,"target_kind":"fixed","target_value":5,"target_min":null,"target_max":null,"target_sequence":null,"per_side":false,"distance_unit":null,"rest_seconds":150,"tempo":"controlled eccentric","load_type":"rir","load_value":3,"is_interval_exercise":false}
      ]}
    ]},
    {"section_type":"accessory","section_title":"Support","section_notes":null,"blocks":[
      {"structure_type":"standard","rounds":null,"timer_type":"none","timer_seconds":null,"round_rest_seconds":null,"rep_scheme":"fixed","block_notes":null,"exercises":[
        {"exercise_id":"db-split-squat","equipment":"dumbbell","session_function":"accessory","anchor_relationship":"complementary","modality":"reps","sets":3,"target_kind":"range","target_value":null,"target_min":8,"target_max":10,"target_sequence":null,"per_side":true,"distance_unit":null,"rest_seconds":90,"tempo":null,"load_type":"rir","load_value":3,"is_interval_exercise":false}
      ]}
    ]},
    {"section_type":"core","section_title":"Brace","section_notes":null,"blocks":[
      {"structure_type":"standard","rounds":null,"timer_type":"none","timer_seconds":null,"round_rest_seconds":null,"rep_scheme":"fixed","block_notes":null,"exercises":[
        {"exercise_id":"dead-bug","equipment":"bodyweight","session_function":"core","anchor_relationship":"complementary","modality":"reps","sets":2,"target_kind":"fixed","target_value":8,"target_min":null,"target_max":null,"target_sequence":null,"per_side":true,"distance_unit":null,"rest_seconds":45,"tempo":null,"load_type":"bodyweight","load_value":null,"is_interval_exercise":false}
      ]}
    ]},
    {"section_type":"cooldown","section_title":"Downshift","section_notes":null,"blocks":[
      {"structure_type":"standard","rounds":null,"timer_type":"none","timer_seconds":null,"round_rest_seconds":null,"rep_scheme":"fixed","block_notes":null,"exercises":[
        {"exercise_id":"supine-hamstring-stretch","equipment":"bodyweight","session_function":"recovery","anchor_relationship":"direct","modality":"time","sets":2,"target_kind":"fixed","target_value":45,"target_min":null,"target_max":null,"target_sequence":null,"per_side":true,"distance_unit":null,"rest_seconds":15,"tempo":null,"load_type":"none","load_value":null,"is_interval_exercise":false}
      ]}
    ]}
  ],
  "estimated_duration_mins": 34
}
```

Validation confirms every ID/equipment pair against its section candidates, validates target and
block shapes, and computes 36 minutes—inside the configured tolerance. Hydration then reads names,
cues, regressions, and display equipment from the catalog. Neither the model's `34` nor a hydrated
fact becomes a validation authority.

## 3. Rows written atomically

The transaction creates one session (`session-1`), five sections (`sec-warm` through `sec-cool`),
five standard blocks (`block-warm` through `block-cool`), and these prescription rows:

| row | block | slot | exercise | origin | revision | execution |
|---|---|---|---|---|---|---|
| `we-warm` | `block-warm` | `slot-warm` | `air-squat` | generated | active | not_started |
| `we-deadlift` | `block-primary` | `slot-primary` | `deadlift` | generated | active | not_started |
| `we-split` | `block-accessory` | `slot-accessory` | `db-split-squat` | generated | active | not_started |
| `we-core` | `block-core` | `slot-core` | `dead-bug` | generated | active | not_started |
| `we-cool` | `block-cool` | `slot-cool` | `supine-hamstring-stretch` | generated | active | not_started |

The session records `requested_duration_mins=35`, `effective_duration_target_mins=35`,
`computed_duration_mins=36`, `prompt_version='5.0.0'`, and `contract_version='4.1.0'`.

## 4. Review swap and execution

At 09:05, before the session starts, the user swaps the primary movement. Code inserts rather than
mutates:

| row | slot | exercise | replaces | origin | revision | superseded_at |
|---|---|---|---|---|---|---|
| `we-deadlift` | `slot-primary` | `deadlift` | — | generated | superseded | 09:05 |
| `we-trap` | `slot-primary` | `trap-bar-deadlift` | `we-deadlift` | revised | active | — |

At 09:10, `session.started_at` is set. The user completes warmup and four trap-bar sets, skips core,
completes cooldown, and finishes at 09:43. Four set-log rows point to `we-trap`, never
`we-deadlift`; `we-core.execution_status='skipped'`; completed active rows are marked completed.

## 5. The three reconstructions

The same stored history answers three different product questions without rewriting any row:

| Reconstruction | Rule | Primary result | Other proof |
|---|---|---|---|
| **As generated** | `origin='generated'` | deadlift, 4×5 | Preserves exactly what composition produced, even though it was superseded. |
| **As intended at start** | active at the 09:10 start timestamp | trap-bar deadlift, 4×5 | The 09:05 review swap is the plan the user accepted. A later swap would not rewrite this view. |
| **As performed** | active prescription rows plus execution and block results | trap-bar deadlift with four logged sets | Core remains visible as skipped with an empty log array; missing values remain `null`, never zero. |

Regression assertions:

1. no set log references `we-deadlift`;
2. the generated view still contains `we-deadlift` and its lineage successor is `we-trap`;
3. intended-at-start contains `we-trap` because it was active at 09:10;
4. performed contains every active exercise, including skipped `we-core` and partially logged rows;
5. changing future preferences or catalog display text does not mutate this session's prescription.
