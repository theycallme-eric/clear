// One shared ghost-only effect. The source is the complete foreground footprint.
// Sharp foreground paint is separate; the echo cannot show through its footprint.
export const EFFECT_ID = 'screen-echo';
export const EFFECT_DEFAULTS = Object.freeze({opacity: .29, blur: 3.2, x: -4.7, y: 5.64});
export const PART_DEFAULTS = Object.freeze({heading: true, back: true, frame: true, cta: true});
export function initialState() {
  return {mode: 'echo', ...EFFECT_DEFAULTS, parts: {...PART_DEFAULTS}, outline: false};
}
export function installEcho(defs) {
  defs.innerHTML = `<filter id="${EFFECT_ID}" x="-80%" y="-80%" width="260%" height="260%" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" result="soft-copy"/><feOffset in="soft-copy" result="offset-copy"/><feComponentTransfer in="offset-copy" result="translucent-copy"><feFuncA type="linear"/></feComponentTransfer><feComposite in="translucent-copy" in2="SourceAlpha" operator="out" result="exposed-copy"/></filter>`;
  const filter = defs.querySelector('filter');
  updateEcho(filter, EFFECT_DEFAULTS);
  return filter;
}
export function updateEcho(filter, values) {
  filter.querySelector('feGaussianBlur').setAttribute('stdDeviation', values.blur);
  filter.querySelector('feOffset').setAttribute('dx', values.x);
  filter.querySelector('feOffset').setAttribute('dy', values.y);
  filter.querySelector('feFuncA').setAttribute('slope', values.opacity);
}
