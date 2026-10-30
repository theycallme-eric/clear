/**
 * Registered app-component examples shared by both gallery entry points.
 *
 * The parts and their states come from `gallery-registry.tsx`; this file only
 * frames them. Each state is labelled with the prop that produces it, so a
 * review comment can name what it is about.
 */
import { useSearchParams } from 'react-router-dom'

import { Heading, HeadingSection } from '../ui/Heading'
import { GALLERY_ENTRIES, type GalleryEntry } from './gallery-registry'

function EntrySection({ entry }: { entry: GalleryEntry }) {
  return (
    <HeadingSection className="clr-dev-gallery__group">
      <Heading>{entry.component}</Heading>
      <p className="clr-dev-gallery__meta">
        {entry.requirement} · {entry.module}
      </p>
      <p>{entry.summary}</p>
      <div className="clr-dev-gallery__cards">
        {entry.specimens.map((specimen) => (
          <HeadingSection
            key={specimen.state}
            className="clr-dev-gallery__card clr-dev-gallery__specimen"
          >
            <Heading>{specimen.state}</Heading>
            {specimen.note !== undefined && (
              <p className="clr-dev-gallery__meta">{specimen.note}</p>
            )}
            <div className="clr-dev-gallery__stage">
              <specimen.Render />
            </div>
          </HeadingSection>
        ))}
      </div>
    </HeadingSection>
  )
}

export function AppComposedParts() {
  const [searchParams] = useSearchParams()
  const component = searchParams.get('component')
  const selectedEntries = GALLERY_ENTRIES.filter((entry) => entry.component === component)
  // Unknown or empty selections keep the complete review surface visible.
  const entries = selectedEntries.length > 0 ? selectedEntries : GALLERY_ENTRIES
  const stateCount = entries.reduce(
    (total, entry) => total + entry.specimens.length,
    0,
  )

  return (
    <div className="clr-dev-gallery__section">
      <Heading>App-composed</Heading>
      <p>
        {entries.length} {entries.length === 1 ? 'part' : 'parts'}, {stateCount} states.
        {selectedEntries.length > 0
          ? ` Showing ${component}.`
          : ' Registered app components and states. Session-dependent surfaces have documented coverage gaps.'}
      </p>
      {entries.map((entry) => (
        <EntrySection key={`${entry.component}-${entry.module}`} entry={entry} />
      ))}
    </div>
  )
}
