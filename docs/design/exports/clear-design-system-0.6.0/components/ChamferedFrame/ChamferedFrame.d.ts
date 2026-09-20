import type * as React from "react";

export type ChamferCornerSize = "sm" | "md" | "lg" | "xl";

/** The five frame roles. Structure builds · interaction acts · selection confirms
 *  · urgency demands · info tells. */
export type ChamferRole =
  | "structure"
  | "interaction"
  | "selection"
  | "urgency"
  | "info";

export interface ChamferedFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size of the bottom-right cut. sm 8px · md 12px · lg 24px · xl 32px. Default "md". */
  cornerSize?: ChamferCornerSize;
  /**
   * Resolves BOTH layers from one role — border at full strength, surface at the
   * 10% rung of the same role. Prefer this over the two colour props: a frame
   * whose surface and border come from different roles reads as two competing
   * signals. Default `structure`.
   */
  role?: ChamferRole;
  /** Escape hatch. Fill of the panel; any CSS colour or token. Overrides `role`. */
  surfaceColor?: string;
  /**
   * Escape hatch. Border colour; overrides `role`. Passed alone, the surface is
   * derived as a 10% tint of this colour rather than falling back to structure.
   */
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
