import type * as React from "react";
export interface EmptyStateProps {
  /** Factual, not apologetic: "No sessions logged" — never "Oops!". */
  title?: React.ReactNode;
  message?: React.ReactNode;
  /** An icon from the CLEAR set, sized by you. */
  icon?: React.ReactNode;
  style?: React.CSSProperties;
}
/** Empty / error state — dimmed structure frame, stenciled heading, one imperative action. No guilt, no mascots. */
export declare function EmptyState(props: EmptyStateProps): React.JSX.Element;
