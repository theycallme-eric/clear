/**
 * DS-07 — `/dev/gallery/app`: every app-composed part, in every state.
 *
 * The parts and their states come from `gallery-registry.tsx`; this file only
 * frames them. Each state is labelled with the prop that produces it, so a
 * review comment can name what it is about.
 */
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
  const stateCount = GALLERY_ENTRIES.reduce(
    (total, entry) => total + entry.specimens.length,
    0,
  )

  return (
    <div className="clr-dev-gallery__section">
      <Heading>App-composed</Heading>
      <p>
        {GALLERY_ENTRIES.length} parts, {stateCount} states. Everything CLEAR
        builds on top of the export: DS-04's card, select and disclosure, DS-05's
        toast host and error surfaces, and DS-06's atmosphere at each of its
        three levels.
      </p>
      {GALLERY_ENTRIES.map((entry) => (
        <EntrySection key={`${entry.component}-${entry.module}`} entry={entry} />
      ))}
    </div>
  )
}
