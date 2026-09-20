import type * as React from "react";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Toggle state. Exposed as aria-pressed and marked with a tick, not colour alone. */
  selected?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * Chip — a toggle. Chamfered, stenciled uppercase, interlace-flickers when
 * toggled. Selection carries two cues: the green surface and a solid tick.
 * Visible height stays compact; the hit area is at least 40px.
 */
export declare function Chip(props: ChipProps): React.JSX.Element;
