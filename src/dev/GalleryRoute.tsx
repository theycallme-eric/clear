/**
 * DS-07 — `/dev/gallery`, the visual review surface. Dev only.
 *
 * Screens get approved rendered, not drawn, so this is where they are looked
 * at. Two sections, both reachable from the chrome that stays mounted across
 * them: `/dev/gallery/ds` serves the export's specimen cards unmodified, and
 * `/dev/gallery/app` frames every app-composed part in every state.
 *
 * Nothing here ships. The route is reached only through the
 * `import.meta.env.DEV` branch in `src/app/router.tsx`, which folds to an empty
 * list in a build and takes this module's whole chunk with it —
 * `prod-exclusion.test.ts` is the proof.
 *
 * Motion (IA.md §4): a specimen stays still until a reviewer triggers it. That
 * is why a toast, a dialog and the `slow` loading state are behind controls
 * rather than playing at once.
 */
import { useEffect, useState } from 'react'
import { NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import { resolveAtmosphere, type AtmosphereLevel } from '../app/atmosphere'
import { Screen } from '../app/Screen'
import { ChoiceGroup } from '../design-system/index'
// The skin initialiser is a public entry of the export alongside index.js, and
// it owns skin persistence — the list of skins is never written out by hand.
import { currentSkin, setSkin, SKINS } from '../design-system/skin'
import { Heading, HeadingSection } from '../ui/Heading'
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
 * All three atmosphere levels, live, on the attribute ATOMIC.md §7.2 puts them
 * on. `RootLayout` only reapplies the route's level when that level changes, so
 * the override survives navigation inside the gallery — and is handed back on
 * the way out, because an override must not outlive the screen that asked for it.
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

function GalleryNav() {
  return (
    <Nav label="Gallery sections">
      <ul className="clr-dev-gallery__nav-list">
        {SECTIONS.map((section) => (
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
function GalleryLayout() {
  return (
    <Screen title="Component Gallery">
      <div className="clr-dev-gallery">
        <div className="clr-dev-gallery__chrome">
          <SkinSwitcher />
          <AtmosphereSwitcher />
          <GalleryNav />
        </div>
        <Outlet />
      </div>
    </Screen>
  )
}

function GalleryOverview() {
  return (
    <HeadingSection className="clr-dev-gallery__section">
      <Heading>Two sections</Heading>
      <p>
        <strong>Design system</strong> serves the {SPECIMENS.length} specimen
        cards the export ships, unmodified, straight from the vendored folder —
        they are not recreated here and never will be.
      </p>
      <p>
        <strong>App-composed</strong> frames every part CLEAR builds on top of
        the export — DS-04, DS-05 and each atmosphere level — in every state it
        can be in. A part missing from it fails review, and fails the test suite.
      </p>
      <p className="clr-dev-gallery__meta">
        Dev only · excluded from production bundles
      </p>
    </HeadingSection>
  )
}

/**
 * The gallery's own routes, below the `dev/gallery/*` route the app router
 * declares. Descendant routes rather than data routes: the whole subtree is one
 * dev-only chunk, and the app router should know one path, not four.
 */
export function GalleryRoute() {
  return (
    <Routes>
      <Route element={<GalleryLayout />}>
        <Route index element={<GalleryOverview />} />
        <Route path="ds" element={<DesignSystemSpecimens />} />
        <Route path="app" element={<AppComposedParts />} />
        {/* A mistyped section is the overview, not a 404 inside a dev tool. */}
        <Route path="*" element={<GalleryOverview />} />
      </Route>
    </Routes>
  )
}
