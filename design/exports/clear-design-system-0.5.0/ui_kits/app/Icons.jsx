// Icons.jsx — Custom CLEAR solid geometric icon set
// Imported semantics from _source/icons.tsx, redrawn inline for JSX use.
// All 24x24 viewBox, fill="currentColor". Never use Lucide / emoji.

const makeIcon = (path) => ({ size = 24, className = '', style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={style}
    aria-hidden="true"
  >
    {path}
  </svg>
);

const ChevronRight = makeIcon(<path d="M9.5 6 L15.5 12 L9.5 18 Z" />);
const ChevronLeft  = makeIcon(<path d="M14.5 6 L8.5 12 L14.5 18 Z" />);
const ArrowRight   = makeIcon(<path d="M13 5 L20 12 L13 19 L13 14 L4 14 L4 10 L13 10 Z" />);
const ArrowLeft    = makeIcon(<path d="M11 5 L4 12 L11 19 L11 14 L20 14 L20 10 L11 10 Z" />);
const Menu         = makeIcon(<><rect x="3" y="6" width="18" height="2" /><rect x="3" y="11" width="18" height="2" /><rect x="3" y="16" width="18" height="2" /></>);
const X            = makeIcon(<path d="M19 6.4 L17.6 5 L12 10.6 L6.4 5 L5 6.4 L10.6 12 L5 17.6 L6.4 19 L12 13.4 L17.6 19 L19 17.6 L13.4 12 Z" />);
const Plus         = makeIcon(<path d="M13 4 L13 11 L20 11 L20 13 L13 13 L13 20 L11 20 L11 13 L4 13 L4 11 L11 11 L11 4 Z" />);
const Minus        = makeIcon(<rect x="4" y="11" width="16" height="2" />);
const Check        = makeIcon(<path d="M9 16.17 L4.83 12 L3.41 13.41 L9 19 L21 7 L19.59 5.59 Z" />);
const Zap          = makeIcon(<path d="M13 2 L4 14 L11 14 L9 22 L18 10 L11 10 Z" />);
const Flame        = makeIcon(<path d="M12 2 C13 4, 16 6, 16 10 C16 12, 15 13, 14 13 C14 11, 13 10, 12 10 C12 13, 10 14, 9 15 C8 16, 7 17, 7 19 C7 21, 9 22, 12 22 C15 22, 17 21, 17 19 C17 17, 16 16, 16 15 C17 14, 18 13, 18 11 C18 7, 15 4, 12 2 Z" />);
const Star         = makeIcon(<path d="M12 2 L15 9 L22 9 L16.5 13 L18.5 20 L12 16 L5.5 20 L7.5 13 L2 9 L9 9 Z" />);
const Dumbbell     = makeIcon(<><rect x="2" y="10" width="2" height="4" /><rect x="4" y="8" width="2" height="8" /><rect x="6" y="11" width="12" height="2" /><rect x="18" y="8" width="2" height="8" /><rect x="20" y="10" width="2" height="4" /></>);
const Clock        = makeIcon(<><path d="M12 2 C6.5 2 2 6.5 2 12 C2 17.5 6.5 22 12 22 C17.5 22 22 17.5 22 12 C22 6.5 17.5 2 12 2 Z M12 20 C7.6 20 4 16.4 4 12 C4 7.6 7.6 4 12 4 C16.4 4 20 7.6 20 12 C20 16.4 16.4 20 12 20 Z" /><rect x="11" y="6" width="2" height="7" /><rect x="11" y="11" width="6" height="2" /></>);
const Gauge        = makeIcon(<><path d="M12 3 C6.5 3 2 7.5 2 13 L4 13 C4 8.6 7.6 5 12 5 C16.4 5 20 8.6 20 13 L22 13 C22 7.5 17.5 3 12 3 Z" /><path d="M14 11 L18 8 L15 13 C15 14.1 14.1 15 13 15 C11.9 15 11 14.1 11 13 C11 11.9 11.9 11 13 11 Z" /></>);
const Target       = makeIcon(<><path d="M12 2 C6.5 2 2 6.5 2 12 C2 17.5 6.5 22 12 22 C17.5 22 22 17.5 22 12 C22 6.5 17.5 2 12 2 Z M12 20 C7.6 20 4 16.4 4 12 C4 7.6 7.6 4 12 4 C16.4 4 20 7.6 20 12 C20 16.4 16.4 20 12 20 Z" /><path d="M12 7 C9.2 7 7 9.2 7 12 C7 14.8 9.2 17 12 17 C14.8 17 17 14.8 17 12 C17 9.2 14.8 7 12 7 Z M12 15 C10.3 15 9 13.7 9 12 C9 10.3 10.3 9 12 9 C13.7 9 15 10.3 15 12 C15 13.7 13.7 15 12 15 Z" /><circle cx="12" cy="12" r="2" /></>);
const Crosshair    = makeIcon(<><path d="M12 2 C6.5 2 2 6.5 2 12 C2 17.5 6.5 22 12 22 C17.5 22 22 17.5 22 12 C22 6.5 17.5 2 12 2 Z M12 20 C7.6 20 4 16.4 4 12 C4 7.6 7.6 4 12 4 C16.4 4 20 7.6 20 12 C20 16.4 16.4 20 12 20 Z" /><rect x="11" y="0" width="2" height="5" /><rect x="11" y="19" width="2" height="5" /><rect x="0" y="11" width="5" height="2" /><rect x="19" y="11" width="5" height="2" /></>);
const Refresh      = makeIcon(<path d="M12 4 L12 1 L8 5 L12 9 L12 6 C15.3 6 18 8.7 18 12 C18 13 17.7 13.9 17.3 14.7 L18.8 16.2 C19.5 15 20 13.6 20 12 C20 7.6 16.4 4 12 4 Z M12 18 C8.7 18 6 15.3 6 12 C6 11 6.3 10.1 6.7 9.3 L5.2 7.8 C4.5 9 4 10.4 4 12 C4 16.4 7.6 20 12 20 L12 23 L16 19 L12 15 Z" />);
const AlertCircle  = makeIcon(<><circle cx="12" cy="12" r="10" /><rect x="11" y="7" width="2" height="6" fill="#171717" /><rect x="11" y="14" width="2" height="2" fill="#171717" /></>);

// Mood icons (4 levels)
const moodBase = (mouth, eyes = true) => (
  <>
    <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
    {eyes && <><circle cx="9" cy="10" r="1" /><circle cx="15" cy="10" r="1" /></>}
    {mouth}
  </>
);
const Frown     = makeIcon(moodBase(<path d="M8 16 Q12 12, 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />));
const Meh       = makeIcon(moodBase(<path d="M8 15 L16 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />));
const Smile     = makeIcon(moodBase(<path d="M8 14 Q12 18, 16 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />));
const SmilePlus = makeIcon(moodBase(<path d="M7.5 13 Q12 19, 16.5 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />));

Object.assign(window, {
  Icon_ChevronRight: ChevronRight, Icon_ChevronLeft: ChevronLeft,
  Icon_ArrowRight: ArrowRight, Icon_ArrowLeft: ArrowLeft,
  Icon_Menu: Menu, Icon_X: X, Icon_Plus: Plus, Icon_Minus: Minus, Icon_Check: Check,
  Icon_Zap: Zap, Icon_Flame: Flame, Icon_Star: Star, Icon_Dumbbell: Dumbbell,
  Icon_Clock: Clock, Icon_Gauge: Gauge, Icon_Target: Target, Icon_Crosshair: Crosshair,
  Icon_Refresh: Refresh, Icon_AlertCircle: AlertCircle,
  Icon_Frown: Frown, Icon_Meh: Meh, Icon_Smile: Smile, Icon_SmilePlus: SmilePlus,
});
