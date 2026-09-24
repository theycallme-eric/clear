/**
 * History — `/history` (HIST-01). The chronology.
 *
 * IA.md §4: atmosphere `quiet`, guard protected, and all four states — with the
 * empty one splitting two ways, which is the part this screen is careful about.
 * *No workouts yet* and *no results for these filters* are different facts and
 * they get different copy: the first is a user who has not trained, the second
 * is a user whose history is fine and whose filter is narrow. Telling the
 * second they have no workouts would be the screen lying about their data.
 *
 * **Where the filtering happens, and why here.** The page is read from the
 * database; the filter is applied to what was read. Status is not a column —
 * it is derived from three timestamps (SES-01a) — and a rest day is not a row
 * at all, so neither is a predicate PostgREST could be asked for. Filtering the
 * loaded window keeps one ordering, one page boundary and one derivation, and
 * "load more" widens the window rather than the filter.
 *
 * What is deliberately not here: the link into `/history/:id`. The Session
 * Detail screen is the other half of HIST-01 and is not routed yet, and a list
 * that linked to it today would navigate every row into Not Found. The entry's
 * `id` is already carried by `HistoryEntry`, so the link is an anchor and a
 * route when that screen lands — not a second derivation.
 */
import { useMemo, useState } from 'react'

import { Button, EmptyState } from '../design-system/index'
import {
  filterHistory,
  historyEntries,
  historyFilterOf,
  HISTORY_FILTERS,
  type HistoryEntry,
  type HistoryFilter,
} from '../state/history'
import { useHistoryQuery } from '../state/history-queries'
import {
  viewError,
  viewEmpty,
  viewLoading,
  viewReady,
  type ViewState,
} from '../state/view-state'
import { HistoryList } from '../ui/history-list'
import { Select } from '../ui/select'
import { ViewStateSwitch } from '../ui/view-state'
import { Screen } from './Screen'

const SCREEN_TITLE = 'History'

export const HISTORY_LIST_LABEL = 'Workout history'
export const HISTORY_FILTER_LABEL = 'Show'
export const HISTORY_LOADING_LABEL = 'Reading history'
export const HISTORY_ERROR_TITLE = 'History didn’t load'

/** What the two empties say. Factual, never apologetic (ATOMIC.md §5). */
export const HISTORY_EMPTY_TITLE = 'No workouts yet'
export const HISTORY_EMPTY_MESSAGE =
  'Workouts you generate appear here, with the rest days between them.'
export const HISTORY_NO_MATCH_TITLE = 'Nothing matches this filter'
export const HISTORY_NO_MATCH_MESSAGE =
  'The history is there — this filter just does not reach it.'
export const HISTORY_NO_MATCH_ACTION = 'Show all entries'

export function History() {
  const query = useHistoryQuery()
  const [filter, setFilter] = useState<HistoryFilter>('all')

  const sessions = query.state.status === 'ready' ? query.state.data.sessions : null

  // Derived once per answer rather than per render: the chronology is a walk
  // over the calendar, and the filter is the cheap half.
  const entries = useMemo(
    () => (sessions === null ? [] : historyEntries(sessions)),
    [sessions],
  )
  const visible = useMemo(() => filterHistory(entries, filter), [entries, filter])

  const state = resolveHistoryState(query.state.status, query.state, entries, visible)
  const filtered = state.status === 'empty' && entries.length > 0

  return (
    <Screen title={SCREEN_TITLE}>
      {/* The control belongs to a history that exists. With none, there is
          nothing to narrow, and an inert dropdown above "No workouts yet"
          would be the screen offering an action that cannot do anything. */}
      {entries.length > 0 && (
        <Select
          label={HISTORY_FILTER_LABEL}
          value={filter}
          options={[...HISTORY_FILTERS]}
          onChange={(value) => setFilter(historyFilterOf(value))}
        />
      )}

      <ViewStateSwitch
        state={state}
        loadingLabel={HISTORY_LOADING_LABEL}
        errorTitle={HISTORY_ERROR_TITLE}
        onRetry={query.refetch}
        empty={
          filtered ? (
            <EmptyState
              title={HISTORY_NO_MATCH_TITLE}
              message={HISTORY_NO_MATCH_MESSAGE}
              actionLabel={HISTORY_NO_MATCH_ACTION}
              onAction={() => setFilter('all')}
            />
          ) : (
            <EmptyState title={HISTORY_EMPTY_TITLE} message={HISTORY_EMPTY_MESSAGE} />
          )
        }
      >
        {(data) => (
          <>
            <HistoryList entries={data} label={HISTORY_LIST_LABEL} />
            {query.canLoadMore && (
              <Button variant="secondary" onClick={query.loadMore}>
                Load older workouts
              </Button>
            )}
          </>
        )}
      </ViewStateSwitch>
    </Screen>
  )
}

/**
 * The query's three states onto the contract's four. The judgement the query
 * cannot make is which kind of empty this is — it knows the rows, not the
 * filter — so the split is made here, where both are in hand.
 */
function resolveHistoryState(
  status: 'loading' | 'error' | 'ready',
  state: ReturnType<typeof useHistoryQuery>['state'],
  entries: readonly HistoryEntry[],
  visible: readonly HistoryEntry[],
): ViewState<HistoryEntry[]> {
  if (status === 'loading') return viewLoading()
  if (state.status === 'error') return viewError(state.error)
  if (entries.length === 0 || visible.length === 0) return viewEmpty()

  return viewReady([...visible])
}
