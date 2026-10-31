import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { RootLayout } from '../app/RootLayout'
import { GalleryRoute } from '../dev/GalleryRoute'
import { SkipLink } from '../ui/SkipLink'
import { ToastHost } from '../ui/toast-host'

/** A public review surface with real presentation and no account/session providers. */
export default function PublicGalleryApp() {
  return (
    <BrowserRouter>
      <SkipLink />
      <Routes>
        <Route element={<RootLayout />}>
          <Route path="/gallery/*" element={<GalleryRoute publicView />} />
        </Route>
      </Routes>
      <ToastHost />
    </BrowserRouter>
  )
}
