import type * as React from "react";

export interface ScrollRegionProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Heading in the pinned top layer. It grows and never gives up space to `actions`. */
  title?: React.ReactNode;
  /** Controls at the end of the title row. Fixed size and never shrink. */
  actions?: React.ReactNode;
  /** More content for the pinned top layer, placed below the title row (e.g. a `TabBar`). */
  head?: React.ReactNode;
  /**
   * Draw the top layer's closing rule. Default `true`. Set `false` when the layer
   * already ends in its own underline, e.g. a `TabBar`, so there aren't two rules.
   */
  headRule?: boolean;
  /** Content pinned to the bottom edge. Optional. */
  foot?: React.ReactNode;
  /** Props for the scrolling element (e.g. `aria-label`, `tabIndex`, `onScroll`). */
  scrollerProps?: React.HTMLAttributes<HTMLDivElement>;
}

/**
 * A vertically scrolling area inside a fixed shell, with optional pinned top
 * and bottom layers. The vertical counterpart of `OverflowRail`. Handles
 * behaviour only; carries no navigation or product meaning.
 *
 * The region fills its parent. It does not claim the viewport: put it in a
 * parent with a definite height, e.g. `.clr-shell--fixed`.
 *
 * Content is clipped at a hard rule and never passes under a pinned layer, so
 * the layers carry no surface. A streak on each edge lights up while
 * scrolling and settles when scrolling stops. Layer heights are measured and
 * published as `--head-h` / `--foot-h`; the region stays hidden until the
 * first real measurement.
 */
export declare function ScrollRegion(props: ScrollRegionProps): React.JSX.Element;
