/**
 * Shared review surface: public `/gallery` and legacy `/dev/gallery`.
 *
 * Screens get approved rendered, not drawn, so this is where they are looked
 * at. Two sections, both reachable from the chrome that stays mounted across
 * them: `/dev/gallery/ds` serves the export's specimen cards unmodified, and
 * `/dev/gallery/app` frames registered app-composed parts and states.
 *
 * PublicGalleryApp reaches the same renderer outside account clients and
 * BootGate. The legacy product-router entry remains development-only.
 * fonts.test.ts verifies account/test-code isolation alongside the actual
 * compiled style/font contract; archive delivery stays development-only.
 *
 * Motion (IA.md §4): a specimen stays still until a reviewer triggers it. That
 * is why a toast, a dialog and the `slow` loading state are behind controls
 * rather than playing at once.
 */
import { useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import { resolveAtmosphere, type AtmosphereLevel } from '../app/atmosphere'
import { Screen } from '../app/Screen'
import { ChoiceGroup } from '../design-system/index'
// The skin initialiser is a public entry of the export alongside index.js, and
// it owns skin persistence — the list of skins is never written out by hand.
import { currentSkin, setSkin, SKINS } from '../design-system/skin'
import { Heading } from '../ui/Heading'
import { Nav } from '../ui/Nav'
import { AppComposedParts } from './gallery-app'
import { ATMOSPHERE_LABELS, ATMOSPHERE_LEVELS } from './gallery-atmosphere'
import { DesignSystemSpecimens } from './gallery-ds'
import { SPECIMENS } from './specimens'

import './gallery.css'

/** ChoiceGroup reports `string | string[]`; every group here is single-select. */
function single(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? '') : value
}

/**
 * All four skins, live. `setSkin` owns the contract, so the gallery neither
 * writes the attribute itself nor keeps its own list — but it does pass
 * `persist: false`: reviewing four skins in a row must not overwrite the
 * reviewer's own stored preference, which is SET-02's to set.
 */
function SkinSwitcher() {
  const [skin, setActiveSkin] = useState<string>(() => currentSkin())

  return (
    <ChoiceGroup
      legend="Skin"
      options={SKINS}
      value={skin}
      onChange={(value) => {
        const next = single(value)
        setSkin(next, { persist: false })
        setActiveSkin(next)
      }}
    />
  )
}

/**
 * The package still defines all three atmosphere levels for comparison even
 * though production always uses Full. This dev-only override survives gallery
 * navigation and hands the production default back when the gallery unmounts.
 */
function AtmosphereSwitcher() {
  const { pathname } = useLocation()
  const routeLevel = resolveAtmosphere(pathname)
  const [level, setLevel] = useState<AtmosphereLevel>(routeLevel)

  useEffect(() => {
    document.documentElement.dataset.atmosphere = level
  }, [level])

  useEffect(
    () => () => {
      document.documentElement.dataset.atmosphere = routeLevel
    },
    [routeLevel],
  )

  return (
    <ChoiceGroup
      legend="Atmosphere"
      options={ATMOSPHERE_LEVELS.map((candidate) => ({
        value: candidate,
        label: ATMOSPHERE_LABELS[candidate],
      }))}
      value={level}
      onChange={(value) => {
        const next = single(value)
        if (ATMOSPHERE_LEVELS.includes(next as AtmosphereLevel)) {
          setLevel(next as AtmosphereLevel)
        }
      }}
    />
  )
}

const SECTIONS = [
  { to: '.', end: true, label: 'Overview' },
  { to: 'ds', end: false, label: 'Design system' },
  { to: 'app', end: false, label: 'App-composed' },
]

function GalleryNav({ publicView }: { publicView: boolean }) {
  return (
    <Nav label="Gallery sections">
      <ul className="clr-dev-gallery__nav-list">
        {SECTIONS.filter((section) => !publicView || section.to === 'app').map((section) => (
          <li key={section.label}>
            <NavLink to={section.to} end={section.end}>
              {section.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </Nav>
  )
}

/**
 * The chrome, and the screen around it. One `Screen` for the whole gallery:
 * IA.md §4 lists it as one screen with two sections, and keeping the switchers
 * above the `Outlet` is what lets a skin chosen in one section still be the
 * skin in the other.
 */
function GalleryLayout({ publicView }: { publicView: boolean }) {
  const { pathname } = useLocation()
  const previousPath = useRef(pathname)
  useEffect(() => {
    if (publicView && previousPath.current !== pathname) {
      document.querySelector<HTMLElement>('main h1')?.focus()
    }
    previousPath.current = pathname
  }, [pathname, publicView])
  return (
    <Screen title="Component Gallery">
      <div className="clr-dev-gallery">
        <div className="clr-dev-gallery__chrome">
          <SkinSwitcher />
          <AtmosphereSwitcher />
          <GalleryNav publicView={publicView} />
        </div>
        {publicView && (
          <p className="clr-dev-gallery__meta" role="status">
            App source snapshot · synthetic examples · no account required.
            Visual approvals tracked separately.
          </p>
        )}
        <Outlet />
      </div>
    </Screen>
  )
}

function GalleryOverview() {
  return (
    <div className="clr-dev-gallery__section">
      <Heading>Two sections</Heading>
      <p>
        <strong>Design system</strong> — {SPECIMENS.length} original
        specimen pages, displayed unmodified from the 0.14.3 archive.
      </p>
      <p>
        <strong>App-composed</strong> renders the registered components CLEAR
        builds on top of the export, using the same implementation as the app.
        Session-dependent surfaces have documented coverage gaps and are being added.
      </p>
      <p className="clr-dev-gallery__meta">
        Development reference
      </p>
    </div>
  )
}

/**
 * Descendant routes shared by the public and development entry points. The
 * registry and renderer have one owner, rather than one copy per URL.
 */
export function GalleryRoute({ publicView = false }: { publicView?: boolean }) {
  return (
    <Routes>
      <Route element={<GalleryLayout publicView={publicView} />}>
        <Route index element={publicView ? <AppComposedParts /> : <GalleryOverview />} />
        <Route path="ds" element={publicView ? <Navigate to="/gallery/app" replace /> : <DesignSystemSpecimens />} />
        <Route path="app" element={<AppComposedParts />} />
        {/* A mistyped section is the overview, not a 404 inside a dev tool. */}
        <Route path="*" element={publicView ? <Navigate to="/gallery/app" replace /> : <GalleryOverview />} />
      </Route>
    </Routes>
  )
}
