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
import { PUBLIC_SPECIMEN_BASE } from './specimen-url'
import {
  DESCRIBED_SPECIMENS,
  SPECIMEN_GROUPS,
  SPECIMENS,
  type Specimen,
} from './specimens'

function SpecimenCard({ specimen, publicView }: { specimen: Specimen; publicView: boolean }) {
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
      <OverflowRail trackProps={{
        tabIndex: 0,
        role: 'group',
        'aria-label': `${specimen.group} — ${specimen.name} reference viewport`,
      }}>
        <iframe
          className="clr-dev-gallery__frame"
          src={publicView ? PUBLIC_SPECIMEN_BASE + specimen.file : specimen.url}
          title={`${specimen.group} — ${specimen.name}`}
          width={specimen.width}
          height={specimen.height}
          loading="lazy"
          sandbox={publicView ? 'allow-scripts' : undefined}
        />
      </OverflowRail>
    </HeadingSection>
  )
}

export function DesignSystemSpecimens({ publicView = false }: { publicView?: boolean }) {
  return (
    <div className="clr-dev-gallery__section">
      <Heading>{publicView ? 'Upstream references' : 'Design system'}</Heading>
      <p>
        {SPECIMENS.length} specimen files from the vendored export,{' '}
        {DESCRIBED_SPECIMENS.length} of them carrying a <code>@dsCard</code>{' '}
        descriptor. Served unmodified — each frame is the file itself.
      </p>
      {publicView && (
        <p>
          Upstream 0.14.3 archive styling and illustrative content. These references
          are separate from the app-styled components and their visual approvals.
        </p>
      )}
      {SPECIMEN_GROUPS.map(({ group, specimens }) => (
        <HeadingSection key={group} className="clr-dev-gallery__group">
          <Heading>{group}</Heading>
          <div className="clr-dev-gallery__cards">
            {specimens.map((specimen) => (
              <SpecimenCard key={specimen.file} specimen={specimen} publicView={publicView} />
            ))}
          </div>
        </HeadingSection>
      ))}
    </div>
  )
}
