// Primitives.jsx: the kit's building blocks, drawn with the system's own CSS
// classes (.clr-chamfer, .clr-btn, .clr-chip, .clr-check, .clr-slider,
// .clr-field). Nothing here restyles them; the system owns the look.

const { useRef } = React;

// A framed panel. `role` sets border and surface from one role.
function ChamferedFrame({ cornerSize = 'md', role, className = '', style = {}, children, ...rest }) {
  return (
    <div className="clr-bleed clr-bleed--block">
      <div className={`clr-chamfer clr-chamfer--${cornerSize} ${role ? 'clr-chamfer--' + role : ''} ${className}`} style={style} {...rest}>
        {children}
      </div>
    </div>
  );
}

// Card: a closed frame with its title inside, plus the optional 8px accent
// column. The column reads the card's own colours.
function Card({ children, cornerSize = 'md', padding = 'md', accent = true, role, className = '' }) {
  const pad = { sm: 'var(--spacing-200) var(--spacing-300)', md: 'var(--spacing-300)', lg: 'var(--spacing-400)' }[padding];
  const body = (
    <div className={`clr-chamfer clr-chamfer--${cornerSize} ${role ? 'clr-chamfer--' + role : ''} clr-card__body ${className}`} style={{ padding: pad }}>
      {children}
    </div>
  );
  return (
    <div className="clr-bleed clr-bleed--block">
      {accent ? <div className="clr-card"><span className="clr-card__bar" aria-hidden="true"></span>{body}</div> : body}
    </div>
  );
}

// Button. Only the primary glows. Icons are 16px.
function CTAButton({ children, variant = 'primary', disabled = false, loading = false, iconLeft, iconRight, onClick, fullWidth = true, className = '' }) {
  const prim = variant === 'primary';
  return (
    <span className={`clr-bleed ${prim ? 'clr-glow' : ''}`} style={{ display: fullWidth ? 'flex' : 'inline-flex', '--bleed': disabled ? 'var(--border-disabled)' : 'var(--border-cta-primary)' }}>
      <button
        type="button"
        className={`clr-chamfer clr-chamfer--sm clr-btn ${prim ? 'clr-btn--primary' : ''} ${className}`}
        disabled={disabled}
        aria-busy={loading || undefined}
        onClick={onClick}
        style={{ width: fullWidth ? '100%' : undefined, minHeight: 'var(--control-height)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-200)' }}
      >
        {iconLeft}
        <span>{children}</span>
        {iconRight}
      </button>
    </span>
  );
}

// Icon-only button: always framed.
function IconButton({ label, onClick, children }) {
  return (
    <span className="clr-bleed" style={{ '--bleed': 'var(--border-cta-primary)' }}>
      <button type="button" aria-label={label} onClick={onClick} className="clr-chamfer clr-chamfer--sm clr-btn"
        style={{ width: 'var(--control-height)', height: 'var(--control-height)', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </button>
    </span>
  );
}

// Toggle chip: tick when selected, interlace flicker on toggle.
function Chip({ children, selected = false, onClick, tick = true, className = '' }) {
  const ref = useRef(null);
  const toggle = (e) => {
    const el = ref.current;
    if (el) { el.classList.remove('clr-interlace'); void el.offsetWidth; el.classList.add('clr-interlace'); }
    onClick?.(e);
  };
  return (
    <span className="clr-bleed" style={{ '--bleed': selected ? 'var(--border-selected)' : 'var(--border-unselected)' }}>
      <button ref={ref} type="button" aria-pressed={selected} onClick={toggle} className={`clr-chamfer clr-chamfer--sm clr-chip ${className}`}>
        {selected && tick && <span className="chip-tick"><window.Icon_Check size={12} /></span>}
        {children}
      </button>
    </span>
  );
}

// Text field: label above, fully framed.
let _fid = 0;
function TextInput({ label, value, onChange, placeholder, multi = false, unit }) {
  const id = useRef('kit-field-' + (++_fid)).current;
  const Tag = multi ? 'textarea' : 'input';
  return (
    <div className="field">
      {label && <label htmlFor={id} className="field-label">{label}</label>}
      <div className="clr-field">
        <Tag id={id} className="clr-input" value={value} placeholder={placeholder} rows={multi ? 3 : undefined}
          onChange={e => onChange?.(e.target.value)} />
        {unit && <span className="clr-field__unit">{unit}</span>}
      </div>
    </div>
  );
}

// Checkbox: outlined square, solid block when checked.
function Checkbox({ checked, onChange, children }) {
  return (
    <label className="clr-check">
      <input type="checkbox" checked={!!checked} onChange={e => onChange?.(e.target.checked)} />
      <span className="clr-check__box" aria-hidden="true"></span>
      <span className="clr-check__label">{children}</span>
    </label>
  );
}

// Slider: the system's square handle.
function Slider({ value, min = 1, max = 10, onChange, label = 'Intensity' }) {
  return (
    <input type="range" className="clr-slider" aria-label={label} min={min} max={max} value={value}
      onChange={e => onChange?.(+e.target.value)} />
  );
}

// Segmented progress: 20 segments, never a continuous fill.
function Segments({ value, total = 20 }) {
  const on = Math.round((value / 100) * total);
  return (
    <div className="segments" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < on ? 'on' : ''}></i>)}
    </div>
  );
}

Object.assign(window, { ChamferedFrame, Card, CTAButton, IconButton, Chip, TextInput, Checkbox, Slider, Segments });
