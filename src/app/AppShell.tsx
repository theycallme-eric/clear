import { Link } from 'react-router-dom'

import { ResumableSession } from './ResumableSession'
import { Screen } from './Screen'

export function AppShell() {
  return (
    <Screen title="CLEAR">
      {/* EXE-01: a workout the user left the app in the middle of is the first
          thing Home has to answer for. HOME-01 builds the rest of this screen
          around it. */}
      <ResumableSession />
      <p>Workout generation is being rebuilt.</p>
      {/* SET-01: IA.md §4 gives Settings one way in, and it is here. HOME-01
          owns how this reads once the rest of Home exists. */}
      <Link to="/settings">Settings</Link>
    </Screen>
  )
}
