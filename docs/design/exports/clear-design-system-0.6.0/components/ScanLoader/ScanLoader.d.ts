import type * as React from "react";

export interface ScanLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Terse and factual: "Scanning", "Generating" — the ellipsis is added for you. */
  label?: React.ReactNode;
  /** Boot-sequence rows revealed with the stagger. Decorative; not announced. */
  lines?: React.ReactNode[];
  /** Supply with `max` for a real progress bar. Omit both for indeterminate. */
  value?: number;
  max?: number;
  /** `slow` and `failed` are for honest status, not decoration. */
  status?: "ok" | "slow" | "failed";
}

/**
 * Loading panel — a scanline sweeps the frame while boot rows stagger in.
 * Motion is the content; there is no spinner in this system. The region is a
 * polite live region with aria-busy, and progress is announced only when it is
 * real. Under reduced motion the sweep and stagger drop to a static state.
 */
export declare function ScanLoader(props: ScanLoaderProps): React.JSX.Element;
