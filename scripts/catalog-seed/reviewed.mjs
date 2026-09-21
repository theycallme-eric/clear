/**
 * DATA-02 — the reviewed state of the transformation.
 *
 * REQ-013 asks the verification to "fail loudly on orphaned, duplicated,
 * dropped, or invented references". Most of that is structural and needs no
 * constants: a weight with no source link is invented whatever the numbers say.
 * But two of the four cannot be judged structurally.
 *
 * *Dropped* needs a list of what was knowingly dropped, or every deliberate
 * drop reads as data loss. *Invented* needs a list of what the new taxonomy
 * knowingly adds, or `unilateral` — real new information, derived from
 * `single-leg-stability`, with no counterpart in the retired `anchor_type` —
 * reads as fabrication.
 *
 * So this file is the review, written down. Every number and every id below was
 * produced by the transform, read, and accepted, with the reason recorded next
 * to it. The verifier compares against these *exactly*: not "at most", not "no
 * worse than". A drift of one row in either direction fails the seed, which is
 * the only way a recorded review stays worth anything.
 *
 * Changing a value here is a review decision, not a fix. The regenerated report
 * at `docs/backend/taxonomy-equivalence.md` is the artifact to read first.
 */

/**
 * Row counts. `sources/source-24-LIVE_BACKEND_AUDIT_2026-09-18.md` §2 is the
 * authority; the 173-row expectation it retires must never reappear.
 */
export const COUNTS = Object.freeze({
  definitions: 140,
  anchors: 150,
  muscles: 488,
  legacyPatterns: 27,
  anatomyTags: 140,
})

/**
 * The count the audit retired. Named so a regression is impossible to mistake
 * for a coincidence: REQ-013 says the unsupported expectation "must not be
 * regenerated", and the verifier refuses any of the five counts landing on it.
 */
export const RETIRED_EXERCISE_COUNT = 173

/**
 * What became of the 150 anchor links.
 *
 * `dropped_region` is zero and that is worth stating: DATA-01a's migration
 * anticipated `upper_body`/`lower_body`/`full_body` anchors and explained why
 * it would drop them, but the live capture carries none. The expectation stays
 * pinned at 0 so a future capture that does contain them fails rather than
 * quietly discarding rows the comment already blessed.
 */
export const ANCHOR_DISPOSITIONS = Object.freeze({
  weighted: 102,
  dropped_region: 0,
  dropped_non_pattern: 48,
})

/** Of the 102 preserved links, how the authored ranking splits. */
export const WEIGHT_RANKING = Object.freeze({ primary: 92, secondary: 10 })

/**
 * Component vocabulary and its frequency across the 140 reviewed tags.
 *
 * This table is the independent check on migration `00031`. `DATA_MODEL.md` §3
 * lists the same counts for the nine pattern-bearing components and for
 * `brace`, written from the live catalog before this seed existed. They agree
 * exactly, which is what makes an undeployed migration usable as evidence.
 */
export const COMPONENT_FREQUENCY = Object.freeze({
  brace: 61,
  'knee-flexion': 27,
  'scapular-control': 25,
  'posterior-chain-activation': 25,
  grip: 25,
  'hip-mobility': 22,
  'hip-hinge': 20,
  'vertical-press': 18,
  'triple-extension': 17,
  'shoulder-mobility': 14,
  'horizontal-press': 13,
  'cardio-output': 12,
  'single-leg-stability': 11,
  'ankle-mobility': 8,
  'horizontal-pull': 7,
  'anti-rotation': 7,
  'vertical-pull': 5,
  'landing-mechanics': 3,
  'thoracic-mobility': 3,
  'anti-lateral-flexion': 2,
})

/** `exercise_role` across the 140 reviewed tags. Sums to 140. */
export const ROLE_FREQUENCY = Object.freeze({
  accessory: 70,
  compound_lift: 30,
  mobility: 11,
  activation: 10,
  conditioning: 9,
  stability: 7,
  cardio: 3,
})

/** `exercise_muscle_groups.role` across the 488 preserved mappings. */
export const MUSCLE_ROLE_FREQUENCY = Object.freeze({
  primary: 214,
  synergist: 173,
  stabilizer: 101,
})

/** Distinct `muscle_group` values in the preserved mappings. */
export const MUSCLE_GROUP_COUNT = 18

/**
 * Legacy `movement_patterns` rows no exercise points at. The table is retired
 * rather than rebuilt — patterns derive from components now — so an unused row
 * carries nothing, but it still has to be named rather than silently absent.
 */
export const UNREFERENCED_LEGACY_PATTERNS = Object.freeze(['pull-isolation'])

/**
 * Legacy `movement_patterns.category` values with no `session_focus`
 * counterpart. `core` is a section in the new model, never a focus — the other
 * three category names are `session_focus` values unchanged.
 */
export const LEGACY_CATEGORIES_WITHOUT_FOCUS = Object.freeze(['core'])

/**
 * The 19 preserved weights whose pattern the component vocabulary does not
 * derive — DATA_MODEL §3 step 4, "any lost primary/secondary distinctions",
 * enumerated.
 *
 * They are seeded, not dropped: the audit's disposition is Transform, and the
 * weights table exists precisely to keep the authored ranking. But
 * `exercise_pattern_ranked` starts from `exercise_patterns`, so until the
 * component tags or `component_pattern_map` say otherwise these rows are
 * carried in the database and invisible to candidate retrieval.
 *
 * Two kinds, and the distinction is the whole finding:
 *
 *   * **Isolation work the component vocabulary declines to pattern** — the
 *     curls, shrugs, rotator-cuff and hip-thrust family. Their tags are quality
 *     components only (`grip`, `scapular-control`, `posterior-chain-activation`,
 *     `shoulder-mobility`), which `DATA_MODEL.md` §3 says describe demands
 *     rather than patterns. The old anchor called them `pull` or `hinge`
 *     because `anchor_type` had nowhere else to put them.
 *   * **Composite lifts the derivation reads more narrowly** — `deadlift` and
 *     `single-leg-rdl` were secondary `pull`; `snatch-grip-deadlift` and
 *     `sotts-press` were primary `power`; `curl-to-press` and `high-pulls`
 *     derive one half of what they were anchored to.
 *
 * Neither is fixable here. Re-tagging an exercise would be inventing taxonomy
 * in a seed, which REQ-013 forbids; this list is the finding, and the report
 * carries it to whoever owns the next taxonomy decision.
 */
export const WEIGHTS_OUTSIDE_DERIVATION = Object.freeze([
  'bb-hip-thrust:hinge',
  'bicep-curls:pull',
  'curl-to-press:pull',
  'deadlift:pull',
  'external-rotation:pull',
  'face-pulls:pull',
  'hammer-curls:pull',
  'high-pulls:pull',
  'hip-thrust:hinge',
  'internal-rotation:pull',
  'leg-curl:hinge',
  'nordic-curl:hinge',
  'preacher-curls:pull',
  'rear-delt-flys:pull',
  'shrugs:pull',
  'single-leg-glute-bridge:hinge',
  'single-leg-rdl:pull',
  'snatch-grip-deadlift:power',
  'sotts-press:power',
])

/**
 * DATA_MODEL §3 step 3: "Compare candidate sets … derived versus original,
 * across all four focuses."
 *
 * Both sides apply the role exemption, so the delta is the taxonomy change and
 * nothing else. `legacyWithContrast` is the size the previous Edge Function
 * actually prompted with, including its `CONTRASTING_ANCHORS` widening; it is
 * reported for context and is deliberately not the comparison basis, because
 * contrast is a programming heuristic that `focus_pattern_map` does not
 * replace (DATA_MODEL §3 cascade item 8).
 *
 * `lost` is read as: was a candidate under the old anchors, is not under the
 * derived patterns. Every entry traces to `WEIGHTS_OUTSIDE_DERIVATION`.
 * `gained` is new coverage, and every entry is explainable:
 *
 *   * the Olympic lifts (`power-clean`, `snatch`, `hang-*`, `squat-clean`,
 *     `clean-pull`) and the rows (`barbell-row`, `pendlay-row`) gain
 *     `lower_body` because their tags carry `hip-hinge`, which the single old
 *     anchor could not say alongside `power` or `pull`;
 *   * the jerks and `sotts-press` gain `upper_body`/`full_body` through
 *     `vertical-press`, for the same reason;
 *   * `high-pulls` and `swing` gain `power` through `triple-extension`.
 *
 * That asymmetry is the point of the change: an exercise now carries every
 * pattern it contains, not the one an author had to choose.
 */
export const FOCUS_EQUIVALENCE = Object.freeze({
  upper_body: Object.freeze({
    legacy: 87,
    legacyWithContrast: 87,
    derived: 79,
    lost: Object.freeze([
      'bicep-curls',
      'deadlift',
      'external-rotation',
      'face-pulls',
      'hammer-curls',
      'high-pulls',
      'internal-rotation',
      'preacher-curls',
      'rear-delt-flys',
      'shrugs',
      'single-leg-rdl',
    ]),
    gained: Object.freeze(['push-jerk', 'sotts-press', 'split-jerk']),
  }),
  lower_body: Object.freeze({
    legacy: 75,
    legacyWithContrast: 118,
    derived: 82,
    lost: Object.freeze(['bb-hip-thrust', 'hip-thrust', 'leg-curl', 'nordic-curl']),
    gained: Object.freeze([
      'barbell-row',
      'clean-pull',
      'hang-clean',
      'hang-snatch',
      'pendlay-row',
      'power-clean',
      'snatch',
      'snatch-grip-deadlift',
      'sotts-press',
      'split-jerk',
      'squat-clean',
    ]),
  }),
  full_body: Object.freeze({
    legacy: 118,
    legacyWithContrast: 118,
    derived: 115,
    lost: Object.freeze([
      'bb-hip-thrust',
      'bicep-curls',
      'external-rotation',
      'face-pulls',
      'hammer-curls',
      'high-pulls',
      'hip-thrust',
      'internal-rotation',
      'leg-curl',
      'nordic-curl',
      'preacher-curls',
      'rear-delt-flys',
      'shrugs',
    ]),
    gained: Object.freeze([
      'clean-pull',
      'hang-clean',
      'hang-snatch',
      'power-clean',
      'push-jerk',
      'snatch',
      'snatch-grip-deadlift',
      'sotts-press',
      'split-jerk',
      'squat-clean',
    ]),
  }),
  power: Object.freeze({
    legacy: 54,
    legacyWithContrast: 54,
    derived: 54,
    lost: Object.freeze(['snatch-grip-deadlift', 'sotts-press']),
    gained: Object.freeze(['high-pulls', 'swing']),
  }),
})
