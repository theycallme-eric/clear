import React from "react";

/**
 * AppHeader: a pinned layer, not a frame. Transparent, full width.
 * Without `left`: title or logo on the left, meta and actions on the right.
 * With `left` (e.g. a framed back button): three columns, the title centred.
 */
export function AppHeader({ left, meta, actions, children, className = "", style, ...props }) {
  const right = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "var(--spacing-300)", flex: "0 0 auto", minWidth: left !== undefined ? "var(--control-height)" : undefined }}>
      {meta && (
        <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--label-xs-size)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-data)", textTransform: "uppercase", color: "var(--text-card-label)", whiteSpace: "nowrap" }}>
          {meta}
        </span>
      )}
      {actions}
    </div>
  );
  if (left !== undefined) {
    return (
      <header className={className} {...props}
        style={{ display: "grid", gridTemplateColumns: "minmax(var(--control-height), auto) minmax(0, 1fr) minmax(var(--control-height), auto)", alignItems: "center", gap: "var(--spacing-300)", minHeight: "var(--control-height)", ...style }}>
        <div style={{ display: "flex", alignItems: "center" }}>{left}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0 }}>{children}</div>
        {right}
      </header>
    );
  }
  return (
    <header className={className} {...props}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--spacing-400)", minHeight: "var(--control-height)", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-300)", minWidth: 0 }}>{children}</div>
      {right}
    </header>
  );
}
