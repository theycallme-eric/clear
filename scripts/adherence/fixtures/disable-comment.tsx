// VIOLATION: a raw hex that tries to talk its way past the gate. Inline configuration is
// off, so the comment changes nothing.
export function DisableComment() {
  // eslint-disable-next-line no-restricted-syntax
  return <span style={{ color: '#00A9F4' }}>GO</span>
}
