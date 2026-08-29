/**
 * CLEAR Design System — public entry point.
 *
 * THIS FILE IS THE PUBLIC CONTRACT. If a component is not exported here it is
 * not public, regardless of what exists in the tree.
 *
 * Version: 0.5.0
 * Peer dependency: react >= 18 (react-dom for anything that renders)
 *
 * The version here, in package.json and in CHANGELOG.md must agree. They did not
 * at 0.3/0.4 — a consumer reading VERSION was told the wrong thing.
 *
 * Two supported consumption paths:
 *
 *   1. With a bundler (the normal case) — import from this entry:
 *
 *        import { Chip, TimerDisplay, Dumbbell } from 'clear-design-system';
 *        import 'clear-design-system/styles.css';
 *
 *   2. Browser, no build step — load the compiled bundle and read the global:
 *
 *        <link rel="stylesheet" href="styles.css">
 *        <script src="_ds_bundle.js"></script>
 *        <script>const { Chip } = window.CLEARDesignSystem_4ee044;</script>
 *
 * Path 2 is what the specimen cards in preview/ use, because they run straight
 * from the filesystem. Both paths serve the same implementations from
 * components/ — there is no second copy.
 *
 * NOT public, and deliberately not re-exported here:
 *   _source/    read-only reference pasted from the app repo. Never edit.
 *   ui_kits/    a worked example app, not a library surface.
 */

export { ChamferedFrame } from './components/ChamferedFrame/ChamferedFrame';
export { Chip } from './components/Chip/Chip';
export { Checkbox } from './components/Selection/Checkbox';
export { RadioButton } from './components/Selection/RadioButton';
export { IntensitySlider } from './components/Slider/IntensitySlider';
export { Input } from './components/Input/Input';
export { TabBar, TabPanel } from './components/TabBar/TabBar';
export { TimerDisplay } from './components/TimerDisplay/TimerDisplay';
export { Toast } from './components/Toast/Toast';
export { ScanLoader } from './components/ScanLoader/ScanLoader';
export { EmptyState } from './components/EmptyState/EmptyState';
export { Button, IconButton } from './components/Button/Button';
export { FormField } from './components/FormField/FormField';
export { ChoiceGroup } from './components/ChoiceGroup/ChoiceGroup';
export { Dialog } from './components/Dialog/Dialog';
export { AppHeader } from './components/AppHeader/AppHeader';
export { Progress } from './components/Progress/Progress';
export { ClearLogo } from './assets/ClearLogo';

// Icons — 75 glyphs. 24×24, fill="currentColor", zero curves.
export {
  ChevronRight, ChevronLeft, ChevronDown, ChevronUp, ArrowRight, ArrowLeft,
  ArrowUp, ArrowDown, SortAsc, SortDesc, Menu, X,
  Plus, Minus, Check, Search, Filter, Sliders,
  Trash, Copy, Download, Upload, Share, Play,
  Pause, Stop, Skip, Pencil, Maximize2, Lock,
  Unlock, Key, LogIn, LogOut, Calendar, CalendarCheck,
  Clock, Stopwatch, Rest, RefreshCw, Loader2, CircleCheck,
  CircleX, CircleAlert, AlertCircle, AlertTriangle, HelpCircle, Info,
  Eye, EyeOff, Bell, BellOff, Zap, Flame,
  Star, Trophy, Dumbbell, WeightPlate, Pulse, Streak,
  Circuit, Ladder, Superset, Log, FileText, Gauge,
  Target, Crosshair, User, Frown, Meh, Smile,
  SmilePlus, ThumbsDown, ThumbsUp,
} from './assets/icons';

export const VERSION = '0.5.0';
