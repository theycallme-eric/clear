export const TAU = Math.PI * 2;
export const MOTION_DEFAULTS = Object.freeze({animate:true,grainAnimate:false,cycleSeconds:60,grainRate:2});
export const initialClock = () => ({phase: .5, grainElapsed: 0, grainIndex: 0});

// Advance by elapsed seconds, independent of rendering rate. Pauses supply no time.
export function advanceClock(clock, seconds, settings) {
  const next = {...clock};
  if (settings.animate && settings.lineWidth > 0 && settings.lineContrast > 0) {
    next.phase = (next.phase + seconds * TAU / settings.cycleSeconds) % TAU;
  }
  if (settings.grainAnimate && settings.noise > 0) {
    next.grainElapsed += seconds;
    const steps = Math.floor(next.grainElapsed * settings.grainRate + 1e-8);
    next.grainIndex += steps;
    next.grainElapsed -= steps / settings.grainRate;
  } else {
    next.grainElapsed = 0;
  }
  return next;
}

export function grainSeed(clock) {
  return (.57 + clock.grainIndex * .1732050808) % 1;
}
