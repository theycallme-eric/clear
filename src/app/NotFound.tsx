import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <Link to="/">Return to CLEAR</Link>
    </main>
  )
}
