import type * as React from "react";

export interface OverflowRailProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Index of the item to keep visible. When it changes, the rail scrolls the
   * matching child into view (instantly on mount, smoothly after, and instantly
   * under `prefers-reduced-motion`). Omit if nothing is "active".
   */
  activeIndex?: number;
  /** Gap between items. Any spacing token. Default `var(--spacing-600)`. */
  gap?: string;
  /** Space left between a revealed item and the rail edge, in px. Default 24. */
  revealPadding?: number;
  /**
   * Props for the element that directly contains the items — this is where
   * semantics go (`role`, `aria-label`, `onKeyDown`), so a `role="tablist"` keeps
   * its `role="tab"` children as immediate descendants. The rail itself declares
   * no role.
   */
  trackProps?: React.HTMLAttributes<HTMLDivElement>;
}

/**
 * Keeps a row of peer items reachable when the available width cannot contain
 * them: contained horizontal scrolling, directional edge cues, and active-item
 * reveal. Behaviour only — it imposes no tab or navigation meaning.
 *
 * Always on. Inert while the content fits, engaged automatically under width
 * pressure; there is no prop to enable it. The rail never causes page-level
 * horizontal overflow, and adds no tab stop of its own — its focusable items are
 * reached in normal focus order and scroll into view natively when focused.
 *
 * `TabBar` composes it. For route navigation, wrap it in your own `<nav>` and
 * pass link semantics through `trackProps`.
 */
export declare function OverflowRail(props: OverflowRailProps): React.JSX.Element;
