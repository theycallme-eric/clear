/**
 * CLEAR — skin selection and persistence.
 *
 * Four skins with no persistence contract means every consuming app invents
 * one, and they diverge. This is the contract, small enough to read in full.
 *
 * Precedence, highest first:
 *
 *   1. An explicit user choice, stored in localStorage under `clear.skin`.
 *   2. An OS contrast preference — `prefers-contrast: more` resolves to `mono`.
 *   3. The app's default (whatever you pass to `initSkin`), else CLEAR.
 *
 * A user choice always wins, including a deliberate choice of a colour skin
 * while the OS asks for more contrast. Overriding that would be deciding on
 * someone's behalf about their own eyes.
 *
 * The attribute goes on <html>, never a subtree: the ramps and alpha ladders are
 * derived at :root, so a subtree attribute overrides the hues but leaves every
 * derived token inherited from the root. (`data-atmosphere` IS per-subtree —
 * different mechanism, different scope.)
 *
 * No framework, no dependencies, no build step. Import it or paste it.
 */

export const SKINS = ['clear', 'vapour', 'signal', 'mono'];

const KEY = 'clear.skin';

const root = () => document.documentElement;

/** The stored explicit choice, or null. Unknown values are ignored, not thrown. */
export function storedSkin() {
  try {
    const v = localStorage.getItem(KEY);
    return SKINS.includes(v) ? v : null;
  } catch {
    return null; // private mode, blocked storage — fall through to preference
  }
}

/** True when the OS asks for more contrast. */
export function prefersMoreContrast() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-contrast: more)').matches;
}

/** Resolve the skin that should be active right now, without applying it. */
export function resolveSkin(fallback = 'clear') {
  return storedSkin() ?? (prefersMoreContrast() ? 'mono' : fallback);
}

/** Apply a skin. Pass null to clear the stored choice and fall back. */
export function setSkin(skin, { persist = true } = {}) {
  if (skin !== null && !SKINS.includes(skin)) {
    throw new Error(`setSkin: unknown skin "${skin}". Known: ${SKINS.join(', ')}`);
  }
  if (persist) {
    try {
      if (skin === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, skin);
    } catch { /* storage unavailable; the attribute still applies for this session */ }
  }
  const active = skin ?? resolveSkin();
  root().setAttribute('data-skin', active);
  return active;
}

/** The active skin, as the DOM currently has it. */
export function currentSkin() {
  return root().getAttribute('data-skin') || 'clear';
}

/**
 * Call once, as early as possible — ideally from a blocking inline script in
 * <head>, so the first paint is already correct and nothing flashes.
 *
 *   <script type="module">
 *     import { initSkin } from './skin.js';
 *     initSkin();
 *   </script>
 *
 * Returns the active skin. Also starts following the OS contrast preference for
 * users who have not made an explicit choice.
 */
export function initSkin(fallback = 'clear') {
  const active = setSkin(resolveSkin(fallback), { persist: false });

  if (typeof matchMedia === 'function') {
    const mq = matchMedia('(prefers-contrast: more)');
    const follow = () => {
      // Only track the OS while the user has expressed no preference of their own.
      if (!storedSkin()) setSkin(resolveSkin(fallback), { persist: false });
    };
    mq.addEventListener ? mq.addEventListener('change', follow) : mq.addListener(follow);
  }
  return active;
}
