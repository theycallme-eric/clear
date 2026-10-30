/** Preview compatibility for ScrollRegion's millisecond-only reader (#600).
 * Preserve the shared token's value when production CSS serializes it in seconds.
 * Remove this adapter when a corrected versioned foundation is imported.
 */
export function galleryScrollSettleTime(value: string): string | undefined {
  const time = value.trim().match(/^(\d*\.?\d+)(ms|s)$/)
  if (!time) return undefined
  return String(Number(time[1]) * (time[2] === 's' ? 1000 : 1)) + 'ms'
}
