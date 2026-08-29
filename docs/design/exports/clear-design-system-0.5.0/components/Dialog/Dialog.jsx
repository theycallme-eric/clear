import React from "react";

export function Dialog({
  open = false,
  onClose,
  title,
  children,
  actions,
  critical = false,
  dismissOnBackdrop = false,
  className = "",
  style,
  ...props
}) {
  const ref = React.useRef(null);
  // True while WE are closing the element, so the resulting native close event
  // does not report back as a user dismissal.
  const suppress = React.useRef(false);
  const autoId = React.useId();
  const titleId = `clr-dlg-${autoId}-title`;

  // showModal() gives us the focus trap, Esc handling, inert background and the
  // top layer for free — including initial focus on the first focusable child,
  // which is why the safe action must come first in DOM order. Reimplementing
  // any of it in JS is how dialogs get broken.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) { suppress.current = true; el.close(); }
  }, [open]);

  const handleClose = () => {
    if (suppress.current) { suppress.current = false; return; }
    if (onClose) onClose();
  };

  /* Esc is deliberately NOT intercepted. Letting the platform's cancel run
     means the close event is the single place a dismissal is reported, so Esc,
     a form submit and a backdrop click all take one path. */
  const onBackdropClick = (ev) => {
    if (!dismissOnBackdrop) return;
    // The dialog element fills the viewport; a click landing on it rather than
    // on the panel inside is a backdrop click.
    if (ev.target === ref.current && onClose) onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={title ? titleId : undefined}
      onClose={handleClose}
      onClick={onBackdropClick}
      className={["clr-dialog", className].filter(Boolean).join(" ")}
      style={style}
      {...props}
    >
      <div
        className="clr-chamfer clr-chamfer--lg"
        style={{
          "--surface": "var(--surface-card)",
          "--brd": critical ? "var(--border-toast-negative)" : "var(--border-card)",
          padding: "var(--spacing-600)",
          display: "flex", flexDirection: "column", gap: "var(--spacing-400)",
          minWidth: 280, maxWidth: 440,
        }}
      >
        {title && (
          <h2 id={titleId} style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--heading-h5-size)", lineHeight: "var(--heading-h5-line-height)", fontWeight: "var(--font-weight-bold)", textTransform: "uppercase", color: critical ? "var(--text-negative)" : "var(--text-card-header)" }}>
            {title}
          </h2>
        )}
        <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--paragraph-sm-size)", lineHeight: "var(--paragraph-sm-line-height)", color: "var(--text-empty-body)" }}>
          {children}
        </div>
        {actions && <div style={{ display: "flex", gap: "var(--spacing-200)", justifyContent: "flex-end", flexWrap: "wrap" }}>{actions}</div>}
      </div>
    </dialog>
  );
}
