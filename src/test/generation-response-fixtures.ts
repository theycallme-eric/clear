/**
 * GEN-02b's recorded responses — one valid, three not.
 *
 * They are strings rather than objects on purpose. What GEN-02b receives is
 * text from an HTTP body, and a fixture written as a typed object would have
 * been checked by the compiler before the test ever ran — which is precisely
 * the check that does not exist at runtime. The malformed three are the shapes
 * a model actually produces: prose where JSON was asked for, a target whose
 * fields disagree with its kind, and a field left blank.
 *
 * Every exercise id and every equipment value in the valid response comes from
 * `generation-prompt-fixtures`' candidate set, because a response referencing
 * something outside it is GEN-02c's rejection and not this module's.
 */

/** The Anthropic `messages` envelope these fixtures arrive inside. */
export function claudeResponse(
  text: string,
  usage: { input?: number; output?: number } = {},
): string {
  return JSON.stringify({
    id: 'msg_01FixtureNotARealMessageId',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: usage.input ?? 3900, output_tokens: usage.output ?? 850 },
  })
}

/**
 * A contract-4.1.0 workout: warmup as a standard block, the primary lift, and
 * an accessory superset. Fenced the way a model fences JSON, so the happy path
 * exercises the fence stripper too.
 */
export const VALID_RESPONSE = `\`\`\`json
{
  "title": "Lower Body Strength",
  "overview": "Squat-led session with unilateral accessory work.",
  "sections": [
    {
      "section_type": "warmup",
      "section_title": "Prepare",
      "section_notes": null,
      "blocks": [
        {
          "structure_type": "standard",
          "rounds": null,
          "timer_type": "none",
          "timer_seconds": null,
          "round_rest_seconds": null,
          "rep_scheme": "fixed",
          "block_notes": null,
          "exercises": [
            {
              "exercise_id": "cat-cow",
              "equipment": "bodyweight",
              "session_function": "prep",
              "anchor_relationship": "neutral",
              "modality": "reps",
              "sets": 2,
              "target_kind": "fixed",
              "target_value": 8,
              "target_min": null,
              "target_max": null,
              "target_sequence": null,
              "per_side": false,
              "distance_unit": null,
              "rest_seconds": 30,
              "tempo": null,
              "load_type": "bodyweight",
              "load_value": null,
              "is_interval_exercise": false
            },
            {
              "exercise_id": "worlds-greatest-stretch",
              "equipment": "bodyweight",
              "session_function": "prep",
              "anchor_relationship": "direct",
              "modality": "reps",
              "sets": 2,
              "target_kind": "fixed",
              "target_value": 5,
              "target_min": null,
              "target_max": null,
              "target_sequence": null,
              "per_side": true,
              "distance_unit": null,
              "rest_seconds": 30,
              "tempo": null,
              "load_type": "bodyweight",
              "load_value": null,
              "is_interval_exercise": false
            }
          ]
        }
      ]
    },
    {
      "section_type": "primary_lift",
      "section_title": "Squat",
      "section_notes": "Build to a heavy set of five.",
      "blocks": [
        {
          "structure_type": "standard",
          "rounds": null,
          "timer_type": "none",
          "timer_seconds": null,
          "round_rest_seconds": null,
          "rep_scheme": "fixed",
          "block_notes": null,
          "exercises": [
            {
              "exercise_id": "back-squat",
              "equipment": "barbell",
              "session_function": "primary",
              "anchor_relationship": "direct",
              "modality": "reps",
              "sets": 5,
              "target_kind": "fixed",
              "target_value": 5,
              "target_min": null,
              "target_max": null,
              "target_sequence": null,
              "per_side": false,
              "distance_unit": null,
              "rest_seconds": 150,
              "tempo": "31X1",
              "load_type": "percent_1rm",
              "load_value": 78,
              "is_interval_exercise": false
            }
          ]
        }
      ]
    },
    {
      "section_type": "accessory",
      "section_title": "Single Leg",
      "section_notes": null,
      "blocks": [
        {
          "structure_type": "superset",
          "rounds": 3,
          "timer_type": "none",
          "timer_seconds": null,
          "round_rest_seconds": 90,
          "rep_scheme": "fixed",
          "block_notes": "Alternate without rest between the pair.",
          "exercises": [
            {
              "exercise_id": "bulgarian-split-squat",
              "equipment": "dumbbells",
              "session_function": "accessory",
              "anchor_relationship": "complementary",
              "modality": "reps",
              "sets": null,
              "target_kind": "range",
              "target_value": null,
              "target_min": 8,
              "target_max": 10,
              "target_sequence": null,
              "per_side": true,
              "distance_unit": null,
              "rest_seconds": null,
              "tempo": null,
              "load_type": "rir",
              "load_value": 2,
              "is_interval_exercise": false
            },
            {
              "exercise_id": "glute-bridge",
              "equipment": "bodyweight",
              "session_function": "accessory",
              "anchor_relationship": "complementary",
              "modality": "reps",
              "sets": null,
              "target_kind": "fixed",
              "target_value": 15,
              "target_min": null,
              "target_max": null,
              "target_sequence": null,
              "per_side": false,
              "distance_unit": null,
              "rest_seconds": null,
              "tempo": null,
              "load_type": "bodyweight",
              "load_value": null,
              "is_interval_exercise": false
            }
          ]
        }
      ]
    }
  ],
  "estimated_duration_mins": 46
}
\`\`\``

/** The model explaining itself instead of answering. */
export const NOT_JSON_RESPONSE = `Happy to help! Here's a lower-body strength session.
I've put the squat first and kept the accessory work unilateral, which should
complement the focus you asked for. Let me know if you'd like it adjusted.`

/**
 * `target_kind: "fixed"` with the range fields populated instead — check 4, and
 * the exact confusion the discriminated target exists to catch.
 */
export const MALFORMED_TARGET_RESPONSE = `{
  "title": "Reverse Lunge Session",
  "overview": null,
  "sections": [
    {
      "section_type": "primary_lift",
      "section_title": "Squat",
      "section_notes": null,
      "blocks": [
        {
          "structure_type": "standard",
          "rounds": null,
          "timer_type": "none",
          "timer_seconds": null,
          "round_rest_seconds": null,
          "rep_scheme": "fixed",
          "block_notes": null,
          "exercises": [
            {
              "exercise_id": "back-squat",
              "equipment": "barbell",
              "session_function": "primary",
              "anchor_relationship": "direct",
              "modality": "reps",
              "sets": 5,
              "target_kind": "fixed",
              "target_value": null,
              "target_min": 4,
              "target_max": 6,
              "target_sequence": null,
              "per_side": false,
              "distance_unit": null,
              "rest_seconds": 150,
              "tempo": null,
              "load_type": "percent_1rm",
              "load_value": 78,
              "is_interval_exercise": false
            }
          ]
        }
      ]
    }
  ],
  "estimated_duration_mins": 40
}`

/**
 * `equipment` left blank, and a timed block with no clock — `btrim(...) <> ''`
 * and `timed_structures_have_a_clock`, the two the database would refuse at the
 * INSERT. Failing at the boundary beats failing there (§6).
 */
export const BLANK_EQUIPMENT_RESPONSE = `{
  "title": "Conditioning",
  "overview": null,
  "sections": [
    {
      "section_type": "conditioning",
      "section_title": "Engine",
      "section_notes": null,
      "blocks": [
        {
          "structure_type": "amrap",
          "rounds": null,
          "timer_type": "countdown",
          "timer_seconds": null,
          "round_rest_seconds": null,
          "rep_scheme": "fixed",
          "block_notes": null,
          "exercises": [
            {
              "exercise_id": "box-jumps",
              "equipment": "",
              "session_function": "conditioning",
              "anchor_relationship": "complementary",
              "modality": "reps",
              "sets": null,
              "target_kind": "fixed",
              "target_value": 10,
              "target_min": null,
              "target_max": null,
              "target_sequence": null,
              "per_side": false,
              "distance_unit": null,
              "rest_seconds": null,
              "tempo": null,
              "load_type": "bodyweight",
              "load_value": null,
              "is_interval_exercise": false
            }
          ]
        }
      ]
    }
  ],
  "estimated_duration_mins": 20
}`
