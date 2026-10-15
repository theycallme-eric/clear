// VIOLATION: a class CLEAR 0.14.3 removed — the large accent bar is gone; one width is the rule.
export function RetiredClass() {
  return (
    <span className="clr-card">
      <span className="clr-card__bar clr-card__bar--lg" aria-hidden="true" />
    </span>
  )
}
