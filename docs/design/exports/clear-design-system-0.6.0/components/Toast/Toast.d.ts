import type * as React from "react";

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  /**
   * info = structure frame · positive = selection green · negative = urgency.
   * Each variant also carries a distinct glyph, so severity survives the mono
   * skin and red-green deficiency — border hue alone never carried it.
   * Only `negative` announces assertively (role="alert"); the others are polite
   * status updates, so routine confirmations do not interrupt.
   */
  variant?: "info" | "positive" | "negative";
  /** Terse and imperative: "Undo", "Retry" — never a sentence. */
  actionLabel?: React.ReactNode;
  onAction?: () => void;
  /** Renders the dismiss control when provided. Labelled, with a 40px hit area. */
  onDismiss?: () => void;
}

/** Chamfered toast — phosphor-glows in on mount. Add .clr-phosphor-out before removal. */
export declare function Toast(props: ToastProps): React.JSX.Element;
