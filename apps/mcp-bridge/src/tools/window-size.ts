/**
 * Device-size presets (logical px) for exercising the responsive layout
 * breakpoints. Portrait phone/tablet trip the adaptive (mobile) layout;
 * the landscape + desktop sizes cover the wider arrangements.
 */
export const SIZE_PRESETS: Record<string, [number, number]> = {
  phone: [400, 880],
  'phone-landscape': [880, 400],
  tablet: [768, 1024],
  'tablet-landscape': [1024, 768],
  desktop: [1280, 800],
  'desktop-large': [1920, 1080],
}

/**
 * Pixel size a resize request resolves to. An explicit `width`/`height`
 * overrides the preset's value for THAT dimension only, so
 * `{ preset: 'phone', width: 500 }` keeps the preset's height. Answers
 * `null` when a dimension has no source at all — the caller reports that
 * as a usage error rather than guessing one.
 */
export function resolveWindowSize(
  preset: string | undefined,
  width: number | undefined,
  height: number | undefined,
): [number, number] | null {
  const base = preset ? SIZE_PRESETS[preset] : undefined
  const w = width ?? base?.[0]
  const h = height ?? base?.[1]
  if (w === undefined || h === undefined) return null
  return [w, h]
}
