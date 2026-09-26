/**
 * HOME-02 — the streak rules, in full.
 *
 * SES-01c derived a streak and said where the rest of it would attach: the two
 * questions in `StreakPolicy` — *does this session count* and *does this empty
 * day still leave the run intact* — with `defaultStreakPolicy` answering the
 * second one for today alone. This module answers it for every day a rest mark
 * speaks for, and it does so by **passing a different policy to the same
 * function**. There is no second derivation here: `deriveStreak` still walks the
 * days, still buckets them in the user's zone, and still holds the count
 * nowhere.
 *
 * The rules, and where each one came from:
 *
 *   1. **A marked rest day bridges; an unmarked empty day does not.** This is
 *      the allowance. The old app's rule, from its backend planning note, was
 *      *reset if one day is missed; preserve if a rest day is marked* — and the
 *      distinction is the reason `rest_days` exists at all. Two identical empty
 *      Tuesdays are a broken streak and an intact one, and the only thing that
 *      separates them is that the user said which.
 *
 *   2. **The allowance runs out at seven in a row.** Six consecutive marked
 *      rest days keep a streak; the seventh ends it. Also the old app's number
 *      (`MAX_CONSECUTIVE_REST_DAYS`), and the reason it has a ceiling at all is
 *      that a streak which survives an unbounded run of rest days is not
 *      measuring anything.
 *
 *   3. **A pause is not a rest day, and has no ceiling.** `injury`, `sick` and
 *      `vacation` were the old `profiles.streak_pause_reason` values, and they
 *      mean training was interrupted rather than rationed. A fortnight of
 *      influenza is not a lapse of discipline, so a pause day bridges however
 *      many of them there are — and it does not spend the rest allowance, so
 *      coming back from three weeks off sick with one rest day still has six.
 *
 *   4. **Resuming is not an event.** Nothing records the end of a pause: the
 *      run simply continues into the next counting session, because every day
 *      between is bridged. There is no resume to forget to call, which is the
 *      half of the old design that drifted.
 *
 *   5. **Today is still not a missed day.** `defaultStreakPolicy`'s one rule is
 *      kept rather than restated: a day still being lived bridges whether or
 *      not it is marked.
 *
 * Every function here is pure and takes its marks as an argument. Reading them
 * is `src/data/rest-days.ts`; writing one is `mark_rest_day`.
 */

import { Constants } from '../data/database.types'
import type { RestDayReason, RestDayRow } from './schemas'
import {
  defaultStreakPolicy,
  previousDay,
  type LocalDay,
  type Streak,
  type StreakPolicy,
} from './streak'

export type { RestDayReason } from './schemas'

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** Every reason a day can be marked with, in the order the enum declares. */
export const REST_DAY_REASONS: readonly RestDayReason[] =
  Constants.public.Enums.rest_day_reason

/**
 * The three that pause a streak rather than spending its allowance. Derived
 * from the one list above, so a reason added to the enum has to be classified
 * here before it can be marked — the alternative is a new value silently
 * behaving like `rest`.
 */
export const PAUSE_REASONS: readonly RestDayReason[] = REST_DAY_REASONS.filter(
  (reason) => reason !== 'rest',
)

export function isPauseReason(reason: RestDayReason): boolean {
  return reason !== 'rest'
}

/** What each reason is called. Never a colour, never an icon alone. */
export const REST_DAY_REASON_LABELS: Readonly<Record<RestDayReason, string>> = {
  rest: 'Rest day',
  injury: 'Injured',
  sick: 'Unwell',
  vacation: 'Away',
}

/**
 * Consecutive marked rest days a streak survives. The seventh breaks it — the
 * old app's rule, kept because its shape is right: an allowance with no ceiling
 * is not an allowance.
 */
export const MAX_CONSECUTIVE_REST_DAYS = 6

/**
 * What each reason does to the streak, said before the user commits to it.
 * The engine's rules and this copy are the same sentence twice, so the number
 * is read from the constant rather than typed into the prose.
 */
export const REST_DAY_REASON_EFFECTS: Readonly<Record<RestDayReason, string>> = {
  rest: `Keeps your streak, up to ${MAX_CONSECUTIVE_REST_DAYS} days in a row.`,
  injury: 'Pauses your streak for as long as it lasts.',
  sick: 'Pauses your streak for as long as it lasts.',
  vacation: 'Pauses your streak for as long as it lasts.',
}

/**
 * The marks, indexed by day. One reason per day is guaranteed by
 * `rest_days_one_per_day`, so this is a lookup rather than a reduction, and a
 * duplicate that reached it anyway would be the last one read rather than an
 * error nobody could act on.
 */
export type RestDayIndex = ReadonlyMap<LocalDay, RestDayReason>

/** What the engine needs of a stored row: the day, and why. */
export type MarkedDay = Pick<RestDayRow, 'day' | 'reason'>

export function restDayIndex(marks: readonly MarkedDay[]): RestDayIndex {
  return new Map(marks.map((mark) => [mark.day, mark.reason]))
}

// ─────────────────────────────────────────────────────────────────────────────
// The policy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HOME-02's rules, as the policy `deriveStreak` already accepts.
 *
 * `countsForStreak` is unchanged and is deliberately taken from
 * `defaultStreakPolicy` rather than restated: which *sessions* count is
 * SES-01a's flag, and a second copy of that predicate here would be a second
 * answer to a settled question. What this adds is the second rule only.
 */
export function restDayStreakPolicy(marks: RestDayIndex): StreakPolicy {
  return {
    countsForStreak: defaultStreakPolicy.countsForStreak,

    bridgesDay: (day, context) => {
      // Rule 5: a day still being lived was never missed.
      if (defaultStreakPolicy.bridgesDay(day, context)) return true

      const reason = marks.get(day)
      if (reason === undefined) return false

      // Rule 3: a pause bridges however long it lasts.
      if (isPauseReason(reason)) return true

      // Rules 1 and 2: the allowance, and its ceiling. The run is measured from
      // the marks themselves rather than from anything the walk accumulated,
      // which is what keeps this a function of `(day, marks)` — the same answer
      // whatever order it is asked in.
      return consecutiveRestDaysThrough(marks, day) <= MAX_CONSECUTIVE_REST_DAYS
    },
  }
}

/**
 * How long the unbroken run of ordinary rest days ending on `day` is, counting
 * `day` itself.
 *
 * Backwards, because that is the direction the block is bounded in: the newest
 * day of a block sees the whole of it, so a block of seven or more trips the
 * ceiling at its newest end and no day inside it bridges. A pause day is not a
 * rest day and ends the run — which is rule 3's other half, stated as an
 * absence rather than as a special case.
 */
export function consecutiveRestDaysThrough(marks: RestDayIndex, day: LocalDay): number {
  let count = 0
  let cursor = day

  while (marks.get(cursor) === 'rest') {
    count += 1
    cursor = previousDay(cursor)
  }

  return count
}

// ─────────────────────────────────────────────────────────────────────────────
// What the screen says about it
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The pause in force, or `null` when the streak is running under its own steam.
 *
 * Read from the two days that can still be answered — today, and yesterday —
 * because a pause is a fact about the present. A marked injury three weeks ago
 * with nothing since is not a paused streak; it is a streak that ended, and
 * `deriveStreak` has already said so by not counting the unmarked days between.
 *
 * Training today ends a pause without anything having to record that it did:
 * rule 4, as a read rather than as a write.
 */
export function pauseInForce(streak: Streak, marks: RestDayIndex): RestDayReason | null {
  if (streak.includesToday) return null

  const today = marks.get(streak.today)
  // Today's own mark is the more recent statement, whichever way it reads: a
  // user who rested today by choice is not paused, even if yesterday was sick.
  if (today !== undefined) return isPauseReason(today) ? today : null

  const yesterday = previousDay(streak.today)
  if (streak.trainingDays.includes(yesterday)) return null

  const mark = marks.get(yesterday)
  return mark !== undefined && isPauseReason(mark) ? mark : null
}
