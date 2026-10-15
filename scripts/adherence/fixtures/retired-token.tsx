// VIOLATION: a hue alias CLEAR 0.14.3 removed. It named a colour, so it stayed CLEAR-orange
// in every other skin; the role token follows the skin.
export function RetiredToken() {
  return <p style={{ color: 'var(--color-orange-500)' }}>Ready</p>
}
