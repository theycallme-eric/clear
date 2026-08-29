import React from "react";

export function AppHeader({ meta, actions, children, className = "", style, ...props }) {
  return (
    <header
      className={className}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--spacing-400)", minHeight: 40, ...style }}
      {...props}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-300)", minWidth: 0 }}>{children}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-300)", flex: "0 0 auto" }}>
        {meta && (
          <span style={{ fontFamily: "var(--font-data)", fontSize: "var(--label-xs-size)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-data-wide)", textTransform: "uppercase", color: "var(--text-card-label)", whiteSpace: "nowrap" }}>
            {meta}
          </span>
        )}
        {actions}
      </div>
    </header>
  );
}
