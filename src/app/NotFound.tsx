import { Link } from 'react-router-dom'

import { Screen } from './Screen'

export function NotFound() {
  return (
    <Screen title="Page not found">
      <Link to="/">Return to CLEAR</Link>
    </Screen>
  )
}
