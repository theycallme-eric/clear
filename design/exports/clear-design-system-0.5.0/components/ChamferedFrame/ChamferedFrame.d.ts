import type * as React from "react";

export type ChamferCornerSize = "sm" | "md" | "lg" | "xl";

export interface ChamferedFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size of the bottom-right cut. sm 8px · md 12px · lg 24px · xl 32px. Default "md". */
  cornerSize?: ChamferCornerSize;
  /** Fill of the panel. Any CSS colour or token. Default `var(--surface-card)`. */
  surfaceColor?: string;
  /** Border colour. Default `var(--border-card)`. */
  borderColor?: string;
  /** Border thickness in px. Default 2 — the system width. */
  borderWidth?: number;
  /** Draw the left border. Default false, so a Card's accent bar can own that edge. */
  hasLeftBorder?: boolean;
  /** Draw only the bottom edge + chamfer. Overrides hasLeftBorder. */
  bottomBorderOnly?: boolean;
  /** Run a continuous scanline sweep across the panel. Default false. */
  scan?: boolean;
  /** Trace the border on when the frame mounts. Default true. */
  trace?: boolean;
  /** Emissive outer glow in the border colour. Default false. */
  glow?: boolean;
  children?: React.ReactNode;
}

/**
 * The signature CLEAR container — bottom-right corner cut at 45°, border
 * following the diagonal. Pixel-perfect borders via SVG double-width stroke
 * and clip. For a markup-only equivalent use the `.clr-chamfer` CSS class.
 */
export declare function ChamferedFrame(props: ChamferedFrameProps): React.JSX.Element;
