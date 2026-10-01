/**
 * Resolve the approved History entry behavior at activation time.
 *
 * Completed sessions try their stored intended-at-start prescription first.
 * When that prescription is valid under a contract this build supports, Review
 * opens directly. Nothing is generated and nothing is written. Incomplete,
 * legacy, invalid, or unreadable records keep their durable Session Detail
 * fallback so history never becomes inaccessible because it cannot restart.
 */
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { isErr } from '../state/errors'
import { todayLocal } from '../state/favorites'
import type { HistorySessionEntry } from '../state/history'
import { sessionDetailPath } from '../state/home'
import { reviewHandoff } from '../state/review-handoff'
import { restartAcceptance } from '../state/session-restart'
import { useWorkoutClients } from '../state/workout-queries'
import { REVIEW_PATH } from './ReviewRoute'

export function useOpenHistorySession() {
  const navigate = useNavigate()
  const { sessions } = useWorkoutClients()
  const [openingId, setOpeningId] = useState<string | null>(null)

  const open = useCallback(
    async (entry: HistorySessionEntry) => {
      const detail = sessionDetailPath(entry.id)
      if (entry.status !== 'completed') {
        await navigate(detail)
        return
      }

      setOpeningId(entry.id)
      const intended = await sessions.asIntendedAtStart(entry.id)
      if (isErr(intended)) {
        setOpeningId(null)
        await navigate(detail)
        return
      }

      const acceptance = restartAcceptance(intended.value, todayLocal())
      if (isErr(acceptance)) {
        setOpeningId(null)
        await navigate(detail)
        return
      }

      await navigate(REVIEW_PATH, { state: reviewHandoff(acceptance.value) })
    },
    [navigate, sessions],
  )

  return { open, openingId }
}

