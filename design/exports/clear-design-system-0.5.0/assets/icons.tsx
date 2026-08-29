/**
 * CLEAR Icon Set — solid, geometric, angular.
 * Drop-in replacements for lucide-react icons.
 *
 * Design language:
 * - Solid fills (not stroked outlines)
 * - Angular/geometric construction: orthogonal + 45° edges only
 * - ZERO circles and zero curves — anything round in the real object
 *   (clock face, eye, person's head) is squared, octagonal, or chamfered
 * - Chamfered tips on directional icons (signature CLEAR detail)
 * - Chunky proportions — 3–5 units of 24, reads like a stamped HUD glyph
 * - Detail cut OUT of a solid silhouette rather than drawn as line-work
 *
 * All icons use a 24x24 viewBox and accept size/className/style props
 * matching the lucide-react API for easy migration.
 *
 * The Circle*-prefixed names are kept for drop-in compatibility with the
 * lucide names the app imports; the glyphs themselves are square badges.
 */

export interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const Svg = ({
  size = 24,
  className,
  style,
  children,
}: IconProps & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={style}
    aria-hidden="true"
  >
    {children}
  </svg>
);

// ─── Directional (chamfered tips) ───

export const ChevronRight = (props: IconProps) => (
  <Svg {...props}>
    <path d="M7 3L17 10.5V13.5L7 21V16L13 12L7 8V3Z" />
  </Svg>
);

export const ChevronLeft = (props: IconProps) => (
  <Svg {...props}>
    <path d="M17 3L7 10.5V13.5L17 21V16L11 12L17 8V3Z" />
  </Svg>
);

export const ChevronDown = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 7L10.5 17H13.5L21 7H16L12 12L8 7H3Z" />
  </Svg>
);

export const ChevronUp = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 17L10.5 7H13.5L21 17H16L12 12L8 17H3Z" />
  </Svg>
);

export const ArrowRight = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 9H13V4L21 10.5V13.5L13 20V15H3V9Z" />
  </Svg>
);

export const ArrowLeft = (props: IconProps) => (
  <Svg {...props}>
    <path d="M21 9H11V4L3 10.5V13.5L11 20V15H21V9Z" />
  </Svg>
);

export const ArrowUp = (props: IconProps) => (
  <Svg {...props}>
    <path d="M9 21V11H4L10.5 3H13.5L20 11H15V21H9Z" />
  </Svg>
);

export const ArrowDown = (props: IconProps) => (
  <Svg {...props}>
    <path d="M9 3V13H4L10.5 21H13.5L20 13H15V3H9Z" />
  </Svg>
);

export const SortAsc = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 4H14V7H3V4ZM3 10.5H11V13.5H3V10.5ZM3 17H8V20H3V17ZM18 3.5L22 8.5H19.5V20.5H16.5V8.5H14L18 3.5Z" />
  </Svg>
);

export const SortDesc = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 4H8V7H3V4ZM3 10.5H11V13.5H3V10.5ZM3 17H14V20H3V17ZM18 20.5L14 15.5H16.5V3.5H19.5V15.5H22L18 20.5Z" />
  </Svg>
);

// ─── Actions ───

export const Menu = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 4H21V7H3V4Z M3 10.5H21V13.5H3V10.5Z M3 17H21V20H3V17Z" />
  </Svg>
);

export const X = (props: IconProps) => (
  <Svg {...props}>
    <path d="M6 3L12 9L18 3L21 6L15 12L21 18L18 21L12 15L6 21L3 18L9 12L3 6Z" />
  </Svg>
);

export const Plus = (props: IconProps) => (
  <Svg {...props}>
    <path d="M10 3H14V10H21V14H14V21H10V14H3V10H10V3Z" />
  </Svg>
);

export const Minus = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 10H21V14H3V10Z" />
  </Svg>
);

export const Check = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 12L6.5 9L11 14L18 5L20.5 7.5L11 20L4 12Z" />
  </Svg>
);

export const Search = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M5 2H13L16 5V13L13 16H5L2 13V5L5 2ZM6 5L5 6V12L6 13H12L13 12V6L12 5H6Z" />
    <path d="M14 16L16 14L22.5 20.5L20.5 22.5L14 16Z" />
  </Svg>
);

export const Filter = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 3H22V6.5L15 13.5V22L9 18V13.5L2 6.5V3Z" />
  </Svg>
);

export const Sliders = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 5H22V7.5H2V5ZM14 2.5H18.5V10H14V2.5ZM2 11.25H22V13.75H2V11.25ZM5.5 8.75H10V16.25H5.5V8.75ZM2 17.5H22V20H2V17.5ZM13 15H17.5V22.5H13V15Z" />
  </Svg>
);

export const Trash = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M9 2H15L16.5 4H21V7H3V4H7.5L9 2ZM4.5 8.5H19.5V22H4.5V8.5ZM8 11V19.5H10V11H8ZM14 11V19.5H16V11H14Z" />
  </Svg>
);

export const Copy = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M3 3H15V7H12.5V5.5H5.5V14.5H7V17H3V3ZM9 9H21V21H9V9ZM11.5 11.5V18.5H18.5V11.5H11.5Z" />
  </Svg>
);

export const Download = (props: IconProps) => (
  <Svg {...props}>
    <path d="M10 2H14V11H18L12 18L6 11H10V2ZM3 19H21V22H3V19Z" />
  </Svg>
);

export const Upload = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 2L18 9H14V18H10V9H6L12 2ZM3 19H21V22H3V19Z" />
  </Svg>
);

export const Share = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 9H7V15H2V9ZM7 10.75H11.5V13.25H7V10.75ZM11 3.5H13.5V20.5H11V3.5ZM13.5 3.5H17V6H13.5V3.5ZM13.5 18H17V20.5H13.5V18ZM17 1.5H22V8H17V1.5ZM17 16H22V22.5H17V16Z" />
  </Svg>
);

export const Play = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 3L20 10.5V13.5L5 21V3Z" />
  </Svg>
);

export const Pause = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 3H10V21H5V3ZM14 3H19V21H14V3Z" />
  </Svg>
);

export const Stop = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 4H20V20H4V4Z" />
  </Svg>
);

export const Skip = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 4L12 10.5V13.5L3 20V4ZM12 4L21 10.5V13.5L12 20V4Z" />
  </Svg>
);

export const Pencil = (props: IconProps) => (
  <Svg {...props}>
    <path d="M16.5 3.5L20.5 7.5L8 20H4V16L16.5 3.5Z" />
  </Svg>
);

export const Maximize2 = (props: IconProps) => (
  <Svg {...props}>
    <path d="M15 3H21V9H19V5H15V3Z M3 15H5V19H9V21H3V15Z" />
  </Svg>
);

// ─── Access ───

export const Lock = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M9.5 3H14.5L17 5.5V10H19V21H5V10H7V5.5L9.5 3ZM10 5.5L9.5 6V10H14.5V6L14 5.5H10ZM10.5 14H13.5V18H10.5V14Z" />
  </Svg>
);

export const Unlock = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M9.5 2H14.5L17 4.5V8H14.5V5L14 4.5H10L9.5 5V10H19V21H5V10H7V4.5L9.5 2ZM10.5 14H13.5V18H10.5V14Z" />
  </Svg>
);

export const Key = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M5 5.5H8.5L12 9V15L8.5 18.5H5L1.5 15V9L5 5.5ZM5.5 10.5V13.5H8.5V10.5H5.5Z" />
    <path d="M10.5 10.5H22.5V13.5H10.5V10.5ZM14 13.5H16.5V18H14V13.5ZM18.5 13.5H21V18H18.5V13.5Z" />
  </Svg>
);

export const LogIn = (props: IconProps) => (
  <Svg {...props}>
    <path d="M11 3H21V21H11V18H18V6H11V3ZM7 6.6L11.4 11V13L7 17.4L5.3 15.7L7.5 13.5H2V10.5H7.5L5.3 8.3L7 6.6Z" />
  </Svg>
);

export const LogOut = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 3H13V6H6V18H13V21H3V3ZM17 6.6L21.4 11V13L17 17.4L15.3 15.7L17.5 13.5H9V10.5H17.5L15.3 8.3L17 6.6Z" />
  </Svg>
);

// ─── Time & schedule ───

export const Calendar = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M7 2H10V4H14V2H17V4H21V22H3V4H7V2ZM5.5 8.5V19.5H18.5V8.5H5.5ZM7.5 10.5H11.5V14H7.5V10.5ZM12.5 10.5H16.5V14H12.5V10.5ZM7.5 15H11.5V18.5H7.5V15ZM12.5 15H16.5V18.5H12.5V15Z" />
  </Svg>
);

export const CalendarCheck = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M7 2H10V4H14V2H17V4H21V22H3V4H7V2ZM5.5 8.5V19.5H18.5V8.5H5.5ZM16.6 11.4L11 17L7.4 13.4L9 11.8L11 13.8L15 9.8L16.6 11.4Z" />
  </Svg>
);

export const Clock = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M5 2H19L22 5V19L19 22H5L2 19V5L5 2ZM11 6V13.5H17.5V11H13.5V6H11Z" />
  </Svg>
);

export const Stopwatch = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M9 1H15V3.5H9V1ZM10.5 4.5H13.5V6H10.5V4.5ZM6 7H18L21 10V20L18 23H6L3 20V10L6 7ZM11 11V16.5H16.5V14H13.5V11H11Z" />
  </Svg>
);

export const Rest = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 4H22V20H2V4ZM5 7V17H19V7H5ZM8.5 9.5H10.5V14.5H8.5V9.5ZM13.5 9.5H15.5V14.5H13.5V9.5Z" />
  </Svg>
);

// ─── Status / Feedback ───

export const RefreshCw = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 3H15.5L19.5 7L15.5 11V8.5H5V12H2V3ZM22 21H8.5L4.5 17L8.5 13V15.5H19V12H22V21Z" />
  </Svg>
);

export const Loader2 = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 2H14V6H12V2Z" opacity="1" />
    <path d="M17.5 4.5L19 6L16 9L14.5 7.5L17.5 4.5Z" opacity="0.8" />
    <path d="M18 11H22V13H18V11Z" opacity="0.6" />
    <path d="M16 15L19 18L17.5 19.5L14.5 16.5L16 15Z" opacity="0.45" />
    <path d="M10 18H12V22H10V18Z" opacity="0.3" />
    <path d="M5 18L8 15L9.5 16.5L6.5 19.5L5 18Z" opacity="0.2" />
    <path d="M2 11H6V13H2V11Z" opacity="0.15" />
    <path d="M6.5 4.5L9.5 7.5L8 9L5 6L6.5 4.5Z" opacity="0.1" />
  </Svg>
);

export const CircleCheck = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 2H22V22H2V2ZM16.9 8L11.1 14L8.2 11.3L6.2 13.2L11 18L18.9 9.9L16.9 8Z" />
  </Svg>
);

export const CircleX = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 2H22V22H2V2ZM8.5 6.5L6 9L9.5 12.5L6 16L8.5 18.5L12 15L15.5 18.5L18 16L14.5 12.5L18 9L15.5 6.5L12 10L8.5 6.5Z" />
  </Svg>
);

export const CircleAlert = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 2H22V22H2V2ZM10.5 6V14.5H13.5V6H10.5ZM10.5 16.5V19.5H13.5V16.5H10.5Z" />
  </Svg>
);

export const AlertCircle = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 2H22V22H2V2ZM10.5 6V14.5H13.5V6H10.5ZM10.5 16.5V19.5H13.5V16.5H10.5Z" />
  </Svg>
);

export const AlertTriangle = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M12 2.5L23 21.5H1L12 2.5ZM10.7 9.5L11.1 15.5H12.9L13.3 9.5H10.7ZM10.75 17V19.5H13.25V17H10.75Z" />
  </Svg>
);

export const HelpCircle = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 2H22V22H2V2ZM8.5 6H15L17 8V11.5L13.5 14V15H10.5V12.5L14 10V9H11.5V10.5H8.5V6ZM10.5 17H13.5V19.5H10.5V17Z" />
  </Svg>
);

export const Info = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 2H22V22H2V2ZM10.5 5H13.5V8H10.5V5ZM10.5 10H13.5V19H10.5V10Z" />
  </Svg>
);

export const Eye = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 12L7 6.5H17L22 12L17 17.5H7L2 12ZM5.5 12L8 9.5H16L18.5 12L16 14.5H8L5.5 12ZM10 10H14V14H10V10Z" />
  </Svg>
);

export const EyeOff = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 12L7 6.5H17L22 12L17 17.5H7L2 12ZM5.5 12L8 9.5H16L18.5 12L16 14.5H8L5.5 12ZM10 10H14V14H10V10Z" />
    <path d="M3.5 1.5L22.5 20.5L20.5 22.5L1.5 3.5L3.5 1.5Z" />
  </Svg>
);

export const Bell = (props: IconProps) => (
  <Svg {...props}>
    <path d="M10.5 2.5H13.5V4L16.5 7V13L19 15.5V17.5H5V15.5L7.5 13V7L10.5 4V2.5ZM9.5 19.5H14.5V22H9.5V19.5Z" />
  </Svg>
);

export const BellOff = (props: IconProps) => (
  <Svg {...props}>
    <path d="M10.5 2.5H13.5V4L16.5 7V13L19 15.5V17.5H5V15.5L7.5 13V7L10.5 4V2.5ZM9.5 19.5H14.5V22H9.5V19.5Z" />
    <path d="M3.5 1.5L22.5 20.5L20.5 22.5L1.5 3.5L3.5 1.5Z" />
  </Svg>
);

// ─── Semantic / Content ───

export const Zap = (props: IconProps) => (
  <Svg {...props}>
    <path d="M13 2L4 13H11L10 22L20 11H13L13 2Z" />
  </Svg>
);

export const Flame = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14 1.5L17.5 7.5L16 10.5L19 14.5L17 19.5L12 22.5L6.5 19.5L5 14L8.5 10.5L8 5.5L11 8.5L14 1.5Z" />
  </Svg>
);

export const Star = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 2L14.5 8.5H21L16 13L18 20L12 16L6 20L8 13L3 8.5H9.5L12 2Z" />
  </Svg>
);

export const Trophy = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 2H22V6L18 10H16V13H13.5V17H17V20H7V17H10.5V13H8V10H6L2 6V2ZM5 5V4.8L7.5 7H16.5L19 4.8V5H5ZM10.5 5V7H13.5V5H10.5Z" />
  </Svg>
);

export const Dumbbell = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 9H4.5V15H2V9ZM4.5 5H9V19H4.5V5ZM9 10.5H15V13.5H9V10.5ZM15 5H19.5V19H15V5ZM19.5 9H22V15H19.5V9Z" />
  </Svg>
);

export const WeightPlate = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M8 3H16L21 8V16L16 21H8L3 16V8L8 3ZM9 6L6 9V15L9 18H15L18 15V9L15 6H9ZM10.5 10.5H13.5V13.5H10.5V10.5Z" />
  </Svg>
);

export const Pulse = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 10.5H6L8 4L11 20L14 10.5H16L17.5 13.5H22V16.5H15.5L14.5 14.5L11.5 22L8.5 8L7.5 13.5H2V10.5Z" />
  </Svg>
);

export const Streak = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 15H5.5V21H2V15ZM7 11H10.5V21H7V11ZM12 13H15.5V21H12V13ZM17 5H20.5V21H17V5Z" />
  </Svg>
);

export const Circuit = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 2H10V6.5H14V2H22V10H17.5V14H22V22H14V17.5H10V22H2V14H6.5V10H2V2ZM4.5 4.5V7.5H7.5V4.5H4.5ZM16.5 4.5V7.5H19.5V4.5H16.5ZM9 9V15H15V9H9ZM4.5 16.5V19.5H7.5V16.5H4.5ZM16.5 16.5V19.5H19.5V16.5H16.5Z" />
  </Svg>
);

export const Ladder = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 2H7V22H4V2ZM17 2H20V22H17V2ZM8 5H16V8H8V5ZM8 10.5H16V13.5H8V10.5ZM8 16H16V19H8V16Z" />
  </Svg>
);

export const Superset = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 4H5.5V20H2V4ZM5.5 5.5H22V10H5.5V5.5ZM5.5 14H22V18.5H5.5V14Z" />
  </Svg>
);

export const Log = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3 4H6V7H3V4ZM8 4.5H21V6.5H8V4.5ZM3 10.5H6V13.5H3V10.5ZM8 11H21V13H8V11ZM3 17H6V20H3V17ZM8 17.5H21V19.5H8V17.5Z" />
  </Svg>
);

export const FileText = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M4 2H15L20 7V22H4V2ZM14 3H5V21H19V8H14V3ZM7 11H17V13H7V11ZM7 15H14V17H7V15Z" />
  </Svg>
);

export const Gauge = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M7 3H17L22 12L20 21H4L2 12L7 3ZM13 7.5L9.5 15L11.7 16.3L15.2 8.8L13 7.5Z" />
  </Svg>
);

export const Target = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 2H22V22H2V2ZM5 5V19H19V5H5ZM8 8H16V16H8V8Z" />
  </Svg>
);

export const Crosshair = (props: IconProps) => (
  <Svg {...props}>
    <path d="M10.5 2H13.5V7H10.5V2ZM10.5 17H13.5V22H10.5V17ZM2 10.5H7V13.5H2V10.5ZM17 10.5H22V13.5H17V10.5ZM9.5 9.5H14.5V14.5H9.5V9.5Z" />
  </Svg>
);

export const User = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8.5 3H15.5V10.5H8.5V3ZM5 21V17L8 14H16L19 17V21H5Z" />
  </Svg>
);

// ─── Mood (session debrief) ───

export const Frown = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M3 3H21V21H3V3ZM7.5 8V11.5H10.5V8H7.5ZM13.5 8V11.5H16.5V8H13.5ZM7.5 17.5L9.5 14.5H14.5L16.5 17.5H7.5Z" />
  </Svg>
);

export const Meh = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M3 3H21V21H3V3ZM7.5 8V11.5H10.5V8H7.5ZM13.5 8V11.5H16.5V8H13.5ZM7.5 15V17.5H16.5V15H7.5Z" />
  </Svg>
);

export const Smile = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M3 3H21V21H3V3ZM7.5 8V11.5H10.5V8H7.5ZM13.5 8V11.5H16.5V8H13.5ZM7.5 14.5L9.5 17.5H14.5L16.5 14.5H7.5Z" />
  </Svg>
);

export const SmilePlus = (props: IconProps) => (
  <Svg {...props}>
    <path fillRule="evenodd" d="M2 5H18V21H2V5ZM6 9V12H9V9H6ZM11 9V12H14V9H11ZM6 15L8 18H12L14 15H6Z" />
    <path d="M18.5 2H21.5V4.5H24V7.5H21.5V10H18.5V7.5H16V4.5H18.5V2Z" />
  </Svg>
);

export const ThumbsDown = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 3H6V11.5H2V3ZM7.5 3H21.5V11.5H12.5V19.5L10 22.5L7.5 19.5V3Z" />
  </Svg>
);

export const ThumbsUp = (props: IconProps) => (
  <Svg {...props}>
    <path d="M2 14H6V22.5H2V14ZM7.5 22.5H21.5V14H12.5V6L10 3L7.5 6V22.5Z" />
  </Svg>
);
