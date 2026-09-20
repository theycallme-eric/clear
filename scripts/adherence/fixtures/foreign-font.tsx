// VIOLATION: a font the design system does not ship.
const HEADING = 'font-family: Inter, sans-serif'

export function ForeignFont() {
  return <style>{`h1 { ${HEADING} }`}</style>
}
