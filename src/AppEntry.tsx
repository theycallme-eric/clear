import { lazy, Suspense } from 'react'

import { ContainedShell } from './app/RootLayout'
import { Screen } from './app/Screen'
import { isPublicGalleryPath } from './gallery/paths'
import { LoadingView } from './ui/view-state'

const Product = lazy(() => import('./app/AppRuntime'))
const Gallery = lazy(() => import('./gallery/PublicGalleryApp'))

/** Real clients and BootGate are in the product chunk, never the public gallery bootstrap. */
export function AppEntry({ pathname }: { pathname: string }) {
  const gallery = isPublicGalleryPath(pathname)
  return (
    <Suspense
      fallback={
        <ContainedShell>
          <Screen title={gallery ? 'Component Gallery' : 'CLEAR'}>
            <LoadingView label={gallery ? 'Loading component library' : 'Loading CLEAR'} />
          </Screen>
        </ContainedShell>
      }
    >
      {gallery ? <Gallery /> : <Product />}
    </Suspense>
  )
}
