/**
 * CLEAR Design System — public type entry. Mirrors index.js exactly.
 * Version 0.5.0 · peer dependency react >= 18
 */
import type * as React from 'react';

export type { ChamferedFrameProps } from './components/ChamferedFrame/ChamferedFrame';
export { ChamferedFrame } from './components/ChamferedFrame/ChamferedFrame';
export type { ChipProps } from './components/Chip/Chip';
export { Chip } from './components/Chip/Chip';
export type { CheckboxProps } from './components/Selection/Checkbox';
export { Checkbox } from './components/Selection/Checkbox';
export type { RadioButtonProps } from './components/Selection/RadioButton';
export { RadioButton } from './components/Selection/RadioButton';
export type { IntensitySliderProps } from './components/Slider/IntensitySlider';
export { IntensitySlider } from './components/Slider/IntensitySlider';
export type { InputProps } from './components/Input/Input';
export { Input } from './components/Input/Input';
export type { TabBarProps, TabPanelProps, TabItem } from './components/TabBar/TabBar';
export { TabBar, TabPanel } from './components/TabBar/TabBar';
export type { TimerDisplayProps } from './components/TimerDisplay/TimerDisplay';
export { TimerDisplay } from './components/TimerDisplay/TimerDisplay';
export type { ToastProps } from './components/Toast/Toast';
export { Toast } from './components/Toast/Toast';
export type { ScanLoaderProps } from './components/ScanLoader/ScanLoader';
export { ScanLoader } from './components/ScanLoader/ScanLoader';
export type { EmptyStateProps } from './components/EmptyState/EmptyState';
export { EmptyState } from './components/EmptyState/EmptyState';
export type { ButtonProps, IconButtonProps } from './components/Button/Button';
export { Button, IconButton } from './components/Button/Button';
export type { FormFieldProps, FormFieldRenderArgs } from './components/FormField/FormField';
export { FormField } from './components/FormField/FormField';
export type { ChoiceGroupProps, ChoiceOption } from './components/ChoiceGroup/ChoiceGroup';
export { ChoiceGroup } from './components/ChoiceGroup/ChoiceGroup';
export type { DialogProps } from './components/Dialog/Dialog';
export { Dialog } from './components/Dialog/Dialog';
export type { AppHeaderProps } from './components/AppHeader/AppHeader';
export { AppHeader } from './components/AppHeader/AppHeader';
export type { ProgressProps } from './components/Progress/Progress';
export { Progress } from './components/Progress/Progress';

export { ClearLogo } from './assets/ClearLogo';

/** Shared icon signature. Every glyph in the set accepts exactly these props. */
export interface IconProps {
  /** Rendered width and height in px. Default 24. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export type IconName =
  | 'ChevronRight'
  | 'ChevronLeft'
  | 'ChevronDown'
  | 'ChevronUp'
  | 'ArrowRight'
  | 'ArrowLeft'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'SortAsc'
  | 'SortDesc'
  | 'Menu'
  | 'X'
  | 'Plus'
  | 'Minus'
  | 'Check'
  | 'Search'
  | 'Filter'
  | 'Sliders'
  | 'Trash'
  | 'Copy'
  | 'Download'
  | 'Upload'
  | 'Share'
  | 'Play'
  | 'Pause'
  | 'Stop'
  | 'Skip'
  | 'Pencil'
  | 'Maximize2'
  | 'Lock'
  | 'Unlock'
  | 'Key'
  | 'LogIn'
  | 'LogOut'
  | 'Calendar'
  | 'CalendarCheck'
  | 'Clock'
  | 'Stopwatch'
  | 'Rest'
  | 'RefreshCw'
  | 'Loader2'
  | 'CircleCheck'
  | 'CircleX'
  | 'CircleAlert'
  | 'AlertCircle'
  | 'AlertTriangle'
  | 'HelpCircle'
  | 'Info'
  | 'Eye'
  | 'EyeOff'
  | 'Bell'
  | 'BellOff'
  | 'Zap'
  | 'Flame'
  | 'Star'
  | 'Trophy'
  | 'Dumbbell'
  | 'WeightPlate'
  | 'Pulse'
  | 'Streak'
  | 'Circuit'
  | 'Ladder'
  | 'Superset'
  | 'Log'
  | 'FileText'
  | 'Gauge'
  | 'Target'
  | 'Crosshair'
  | 'User'
  | 'Frown'
  | 'Meh'
  | 'Smile'
  | 'SmilePlus'
  | 'ThumbsDown'
  | 'ThumbsUp';

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

export declare const VERSION: '0.5.0';
