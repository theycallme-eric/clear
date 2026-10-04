import type * as React from "react";

export type CardRole = "structure" | "interaction" | "selection" | "urgency" | "info" | "timer" | "timer-low";

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "role"> {
  /** The card's label, inside it at the top. Every card should have one. */
  heading?: React.ReactNode;
  /** Secondary text on the heading row, right-aligned (e.g. "Week 4"). */
  meta?: React.ReactNode;
  /** Sets border, surface and accent bar from one role. Default structure. */
  role?: CardRole;
  /** "auto" (default) picks 8 / 12 / 24px from the card's height. */
  cornerSize?: "auto" | "sm" | "md" | "lg";
  /** Inner padding. sm 8×12 · md 12 · lg 16. Default "md". */
  padding?: "sm" | "md" | "lg";
  children?: React.ReactNode;
}

/**
 * A frame with the 12px accent bar and a heading inside it. Every group, list,
 * form and readout on a screen sits in one. Never nest a card in a card.
 */
export declare function Card(props: CardProps): React.JSX.Element;
