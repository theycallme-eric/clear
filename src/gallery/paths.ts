/** Match a route segment, never a similar product path such as /gallery-settings. */
export function isPublicGalleryPath(pathname: string): boolean {
  return pathname === '/gallery' || pathname.startsWith('/gallery/')
}
