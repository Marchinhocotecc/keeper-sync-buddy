/**
 * Platform detection — synchronous, safe at module load time.
 *
 * Used to short-circuit GPU-heavy behavior on native Android where
 * Capacitor's WebView can OOM the GL layer (BAD ALLOC on
 * `gles_texture_egl_image_get_2d_template`) when Framer Motion runs
 * many parallel compositor animations.
 *
 * Contract:
 * - `IS_NATIVE` : any Capacitor native container (iOS or Android)
 * - `IS_NATIVE_ANDROID` : true only on Android WebView
 * - `SHOULD_DISABLE_ANIMATIONS` : convenience flag — true on native Android
 *
 * Reads Capacitor's globals synchronously, so it's safe to import from
 * anywhere including the app root. Falls back to `false` in web builds.
 */

const g = typeof globalThis !== 'undefined' ? (globalThis as any) : {};
const capacitor = g.Capacitor;

export const IS_NATIVE: boolean = !!capacitor?.isNativePlatform?.();
export const IS_NATIVE_ANDROID: boolean =
  IS_NATIVE && capacitor?.getPlatform?.() === 'android';
export const IS_NATIVE_IOS: boolean =
  IS_NATIVE && capacitor?.getPlatform?.() === 'ios';

/**
 * When true, all Framer Motion transitions collapse to instant renders
 * (via <MotionConfig reducedMotion="always">) and page transitions become
 * pass-through <Fragment>. Do NOT gate other UI on this flag — it's
 * specifically for the animation compositor.
 */
export const SHOULD_DISABLE_ANIMATIONS: boolean = IS_NATIVE_ANDROID;
