import type * as React from "react";

export interface AppHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** Left slot, e.g. a framed back or menu button. When set, the title is centred. */
  left?: React.ReactNode;
  /** Terse status on the right, e.g. "Week 04 · Day 2". Never a sentence. */
  meta?: React.ReactNode;
  /** Icon buttons or a menu, right of the meta. */
  actions?: React.ReactNode;
  /** Left slot — normally ClearLogo, sometimes a back action plus a title. */
  children?: React.ReactNode;
}

/** Top bar: brand left, terse status and actions right. Renders a real <header>. */
export declare function AppHeader(props: AppHeaderProps): React.JSX.Element;
