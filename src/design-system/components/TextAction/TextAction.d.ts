import type * as React from "react";

export interface TextActionProps extends React.HTMLAttributes<HTMLElement> {
  /** Renders a link when set; otherwise a button. */
  href?: string;
  /** Full width, centred: for under a primary in a footer. */
  block?: boolean;
  disabled?: boolean;
  onClick?: (ev: React.MouseEvent) => void;
  children?: React.ReactNode;
}

/**
 * The quietest action: a label in the action colour ending in ›, no frame.
 * For "View all" on a card or "Skip for now" under a primary.
 */
export declare function TextAction(props: TextActionProps): React.JSX.Element;
