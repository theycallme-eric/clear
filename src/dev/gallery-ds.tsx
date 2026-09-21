/**
 * DS-07 — `/dev/gallery/ds`: the export's specimen cards, served.
 *
 * Each card is an iframe onto the vendored file itself, at the viewport the card
 * declares, fetched through the dev middleware in `specimen-server.ts` which
 * writes the file's bytes unchanged. Nothing on this page renders a specimen's
 * contents, and nothing rewrites one — that is the whole point of the criterion.
 *
 * The component cards load React's UMD build from unpkg, as the export wrote
 * them; offline they show the export's own "bundle compiling" fallback. That is
 * the card's behaviour, not something to patch out of it.
 */
import { OverflowRail } from '../design-system/index'
import { Heading, HeadingSection } from '../ui/Heading'
import {
  DESCRIBED_SPECIMENS,
  SPECIMEN_GROUPS,
  SPECIMENS,
  type Specimen,
} from './specimens'

function SpecimenCard({ specimen }: { specimen: Specimen }) {
  return (
    <HeadingSection className="clr-dev-gallery__card">
      <Heading>{specimen.name}</Heading>
      {specimen.descriptor?.subtitle !== undefined &&
        specimen.descriptor?.subtitle !== null && (
          <p>{specimen.descriptor.subtitle}</p>
        )}
      <p className="clr-dev-gallery__meta">{specimen.file}</p>
      {/* The card declares its own viewport; the rail is what keeps it reachable
          when the column is narrower, without scaling it or overflowing the page. */}
      <OverflowRail>
        <iframe
          className="clr-dev-gallery__frame"
          src={specimen.url}
          title={`${specimen.group} — ${specimen.name}`}
          width={specimen.width}
          height={specimen.height}
          loading="lazy"
        />
      </OverflowRail>
    </HeadingSection>
  )
}

export function DesignSystemSpecimens() {
  return (
    <div className="clr-dev-gallery__section">
      <Heading>Design system</Heading>
      <p>
        {SPECIMENS.length} specimen files from the vendored export,{' '}
        {DESCRIBED_SPECIMENS.length} of them carrying a <code>@dsCard</code>{' '}
        descriptor. Served unmodified — each frame is the file itself.
      </p>
      {SPECIMEN_GROUPS.map(({ group, specimens }) => (
        <HeadingSection key={group} className="clr-dev-gallery__group">
          <Heading>{group}</Heading>
          <div className="clr-dev-gallery__cards">
            {specimens.map((specimen) => (
              <SpecimenCard key={specimen.file} specimen={specimen} />
            ))}
          </div>
        </HeadingSection>
      ))}
    </div>
  )
}
