/** The pinned Motion Lab's vocabulary, with meanings and verified current consumers. */
export const MOTION_PATTERNS = [
  { id: 'scan', label: 'Scan sweep', className: 'clr-scan', meaning: 'Reading or loading; retain a written busy state.', use: 'LoadingView and GenerationLoading', source: 'src/ui/view-state.tsx; src/app/GenerationLoading.tsx', status: 'In use' },
  { id: 'glitch', label: 'Glitch', className: 'clr-glitch', meaning: 'A failure, once, alongside an error message.', use: 'ErrorView and failed ScanLoader', source: 'src/ui/view-state.tsx; public ScanLoader', status: 'In use' },
  { id: 'signal', label: 'Signal loss', className: 'clr-signal-loss', meaning: 'Loss of signal; reserve this stronger disruption for that meaning.', use: 'Available vocabulary; no current app consumer found.', source: '0.14.3 motion.css', status: 'Reference only' },
  { id: 'boot', label: 'Boot stagger', className: 'clr-boot', meaning: 'A collection arriving once. Inline updates do not replay the entrance.', use: 'Home and location lists through useArrivalStagger', source: 'src/ui/motion.ts; src/app/Home.tsx; src/app/LocationSettings.tsx', status: 'In use' },
  { id: 'tumble', label: 'Tumble', className: 'clr-tumble', meaning: 'A changing numeric reading.', use: 'Timer readouts and IntensitySlider', source: 'src/ui/workout-chrome.tsx; public TimerDisplay and IntensitySlider', status: 'In use' },
  { id: 'phosphor', label: 'Phosphor decay', className: 'clr-phosphor-out', meaning: 'Something leaving. The lab restores the sample after the exit.', use: 'Toast and dialog dismissal', source: 'src/ui/toast-host.tsx; src/ui/app-dialog.tsx', status: 'In use' },
  { id: 'crtoff', label: 'CRT off', className: 'clr-crt-off', meaning: 'Something explicitly switched off; not a general navigation exit.', use: 'Available vocabulary; no current app consumer found.', source: '0.14.3 motion.css', status: 'Reference only' },
  { id: 'interlace', label: 'Interlace', className: 'clr-interlace', meaning: 'A state re-sync. New state interrupts an unfinished entrance.', use: 'Login steps, interruptMotion and public selection controls', source: 'src/app/Login.tsx; src/ui/motion.ts; public Chip', status: 'In use' },
  { id: 'trace', label: 'Trace', className: 'clr-trace', meaning: 'A frame arriving. Chamfered components retain their corner geometry.', use: 'The app dialog entrance traces its border layer.', source: 'src/styles/app-motion.css', status: 'In use' },
] as const

export type MotionPattern = typeof MOTION_PATTERNS[number]
