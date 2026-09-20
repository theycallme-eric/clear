// Primitives.jsx — core composed pieces: ChamferedFrame, LeftColumn, Card, CTAButton, Chip, Inputs

const { useEffect, useRef, useState } = React;

// ChamferedFrame — chamfered bottom-right corner via SVG + clip-path.
function ChamferedFrame({
  cornerSize = 'md',
  surfaceColor = 'var(--surface-cta-primary)',
  borderColor = 'var(--border-cta-primary)',
  borderWidth = 2,
  hasLeftBorder = false,
  className = '',
  style = {},
  children,
  ...rest
}) {
  const ref = useRef(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [clipId] = useState(() => `chf-${Math.random().toString(36).slice(2, 9)}`);
  const s = { sm: 8, md: 12, lg: 24 }[cornerSize];

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const el = e.target;
        setDim({ w: el.offsetWidth, h: el.offsetHeight });
      }
    });
    ro.observe(ref.current);
    setDim({ w: ref.current.offsetWidth, h: ref.current.offsetHeight });
    return () => ro.disconnect();
  }, []);

  const { w, h } = dim;
  const shapePath = `M 0 0 L ${w} 0 L ${w} ${h - s} L ${w - s} ${h} L 0 ${h} Z`;
  const strokePath = hasLeftBorder
    ? shapePath
    : `M 0 0 L ${w} 0 L ${w} ${h - s} L ${w - s} ${h} L 0 ${h}`;
  const clipStyle = w > 0 && h > 0
    ? { clipPath: `polygon(0 0, ${w}px 0, ${w}px ${h - s}px, ${w - s}px ${h}px, 0 ${h}px)` }
    : {};

  return (
    <div ref={ref} className={`chamf ${className}`} style={{ ...style, position: 'relative', ...clipStyle }} {...rest}>
      {w > 0 && h > 0 && (
        <svg className="chamf-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <defs>
            <clipPath id={clipId}><path d={shapePath} /></clipPath>
          </defs>
          <path d={shapePath} stroke="none" style={{ fill: surfaceColor, transition: 'fill 1s ease' }} />
          <path
            d={strokePath}
            fill="none"
            strokeWidth={borderWidth * 2}
            strokeLinecap="butt"
            strokeLinejoin="miter"
            clipPath={`url(#${clipId})`}
            style={{ stroke: borderColor, transition: 'stroke 1s ease' }}
          />
        </svg>
      )}
      <div style={{ position: 'relative', zIndex: 10, height: '100%' }}>{children}</div>
    </div>
  );
}

// LeftColumn — animated pulse accent bar
function LeftColumn({ size = 'md', surfaceColor = 'var(--color-orange-alpha-400)', borderColor = 'var(--color-orange-500)', className = '' }) {
  const w = { sm: 6, md: 8, lg: 12 }[size];
  return (
    <div
      className={`left-col pulse-micro ${className}`}
      style={{
        width: w,
        background: surfaceColor,
        border: `2px solid ${borderColor}`,
        borderRight: 'none',
        transition: 'background 1s ease, border-color 1s ease',
      }}
    />
  );
}

// Card — LeftColumn + ChamferedFrame composition
function Card({ children, variant = 'default', cornerSize = 'md', padding = 'md', showLeftColumn = true, className = '' }) {
  const surface = variant === 'accent'
    ? 'var(--surface-card-accent)'
    : 'var(--surface-card)';
  const border = 'var(--border-card)';
  const pad = { sm: '8px 12px', md: '12px 16px', lg: '16px 24px' }[padding];

  return (
    <div className={`card-root ${className}`}>
      {showLeftColumn && (
        <LeftColumn
          size={cornerSize}
          surfaceColor="var(--surface-card-accent)"
          borderColor={border}
        />
      )}
      <ChamferedFrame
        cornerSize={cornerSize}
        surfaceColor={surface}
        borderColor={border}
        hasLeftBorder={!showLeftColumn}
        className="card-body"
        style={{ marginLeft: showLeftColumn ? -2 : 0 }}
      >
        <div style={{ padding: pad, height: '100%' }}>{children}</div>
      </ChamferedFrame>
    </div>
  );
}

// CTAButton — primary/secondary action
function CTAButton({ children, variant = 'primary', size = 'md', disabled = false, iconLeft, iconRight, onClick, fullWidth = false, className = '' }) {
  const isPrim = variant === 'primary';
  const pad = { sm: '8px 12px', md: '10px 14px', lg: '14px 20px' }[size];
  const fontSize = { sm: 14, md: 16, lg: 20 }[size];
  const height = { sm: 40, md: 40, lg: 56 }[size];

  const tokens = disabled
    ? {
        surface: 'var(--surface-disabled)',
        accent: 'var(--surface-disabled)',
        border: 'var(--border-disabled)',
        text: 'var(--text-disabled)',
      }
    : isPrim
      ? {
          surface: 'var(--surface-cta-primary)',
          accent: 'var(--surface-cta-primary-accent)',
          border: 'var(--border-cta-primary)',
          text: 'var(--text-on-cta)',
        }
      : {
          surface: 'var(--surface-cta-secondary)',
          accent: 'var(--surface-cta-secondary)',
          border: 'var(--border-cta-secondary)',
          text: 'var(--color-blue-300)',
        };

  return (
    <button
      className={`cta-btn ${disabled ? 'is-disabled' : ''} ${fullWidth ? 'full' : ''} ${className}`}
      disabled={disabled}
      onClick={onClick}
      style={{ height }}
    >
      <LeftColumn size="md" surfaceColor={tokens.accent} borderColor={tokens.border} />
      <ChamferedFrame
        cornerSize="sm"
        surfaceColor={tokens.surface}
        borderColor={tokens.border}
        hasLeftBorder={false}
        className="cta-body"
        style={{ flex: 1, marginLeft: -2 }}
      >
        <div className="cta-inner" style={{ padding: pad, color: tokens.text, fontSize }}>
          {iconLeft && <span className="cta-icon">{iconLeft}</span>}
          <span className="cta-label">{children}</span>
          {iconRight && <span className="cta-icon">{iconRight}</span>}
        </div>
      </ChamferedFrame>
    </button>
  );
}

// Chip — selectable pill
function Chip({ children, selected = false, variant = 'default', onClick, className = '' }) {
  const cls = `chip ${selected ? 'is-selected' : ''} chip-${variant} ${className}`;
  return <button type="button" className={cls} onClick={onClick}>{children}</button>;
}

// TextInput
function TextInput({ label, value, onChange, placeholder, multi = false }) {
  const Tag = multi ? 'textarea' : 'input';
  return (
    <label className="field">
      {label && <span className="field-label">{label}</span>}
      <Tag
        className={multi ? 'field-input is-multi' : 'field-input'}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange?.(e.target.value)}
      />
    </label>
  );
}

// Checkbox
function Checkbox({ checked, onChange, children }) {
  return (
    <button
      type="button"
      className={`clear-check ${checked ? 'is-checked' : ''}`}
      onClick={() => onChange?.(!checked)}
    >
      <span className="clear-check-box">
        {checked && <window.Icon_Check size={14} />}
      </span>
      <span className="clear-check-label">{children}</span>
    </button>
  );
}

// Slider
function Slider({ value, min = 1, max = 10, onChange }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange?.(+e.target.value)}
        className="slider-input"
      />
      <div className="slider-track" />
      <div className="slider-fill" style={{ width: `${pct}%` }} />
      <div className="slider-thumb" style={{ left: `${pct}%` }} />
    </div>
  );
}

Object.assign(window, {
  ChamferedFrame, LeftColumn, Card, CTAButton, Chip, TextInput, Checkbox, Slider,
});
