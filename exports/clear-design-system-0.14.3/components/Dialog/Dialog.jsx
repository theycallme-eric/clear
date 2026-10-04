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
  const leaveTimer = React.useRef(0);
  const autoId = React.useId();
  const titleId = `clr-dlg-${autoId}-title`;

  // showModal() gives us the focus trap, Esc handling, inert background and the
  // top layer for free — including initial focus on the first focusable child,
  // which is why the safe action must come first in DOM order. Reimplementing
  // any of it in JS is how dialogs get broken.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reopened mid-close: cancel the pending close and stay open.
    if (open && el.open && el.classList.contains("clr-dialog--closing")) { clearTimeout(leaveTimer.current); el.classList.remove("clr-dialog--closing"); }
    if (open && !el.open) { el.classList.remove("clr-dialog--closing"); el.showModal(); }
    if (!open && el.open) { suppress.current = true; leave(); }
  }, [open]);

  // Leaving plays the backdrop fade and the panel's phosphor decay, then closes.
  // Reduced motion closes at once. Esc goes through the same path (cancel is
  // turned into leave()), so every dismissal still ends in one close event.
  const leave = () => {
    const el = ref.current;
    if (!el || !el.open || el.classList.contains("clr-dialog--closing")) return;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { el.close(); return; }
    el.classList.add("clr-dialog--closing");
    leaveTimer.current = setTimeout(() => { el.classList.remove("clr-dialog--closing"); if (el.open) el.close(); }, 200);
  };
  const onCancel = (ev) => { ev.preventDefault(); leave(); };
  React.useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const handleClose = () => {
    if (suppress.current) { suppress.current = false; return; }
    if (onClose) onClose();
  };

  /* Esc runs leave() so it animates out; the close event that follows is still
     the single place a dismissal is reported. */
  const onBackdropClick = (ev) => {
    if (!dismissOnBackdrop) return;
    // The dialog element fills the viewport; a click landing on it rather than
    // on the panel inside is a backdrop click.
    if (ev.target === ref.current) leave();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={title ? titleId : undefined}
      onClose={handleClose}
      onCancel={onCancel}
      onClick={onBackdropClick}
      className={["clr-dialog", className].filter(Boolean).join(" ")}
      style={style}
      {...props}
    >
      <div className="clr-bleed clr-bleed--block" style={{ "--bleed": "var(--border-card)" }}>
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
        {/* The button-row rule: stacked full width on phones with the primary on top,
            an equal-width row on wider screens with the primary on the right. */}
        {actions && <div className="clr-actions">{actions}</div>}
      </div>
      </div>
    </dialog>
  );
}
