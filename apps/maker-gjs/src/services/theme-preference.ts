/**
 * Color-scheme preference persisted in GSettings (`theme` key).
 *
 * The nicks match the `org.pixelrpg.maker.Theme` enum in
 * `data/org.pixelrpg.maker.gschema.xml`: `default` follows the OS color
 * scheme, the `force-*` values override it. Kept free of GTK imports so
 * the guard/coercion logic is unit-testable on any runtime.
 */
export type ThemePreference = 'default' | 'force-light' | 'force-dark'

/** All valid preference nicks, ordered as presented in preference UIs (Auto · Light · Dark). */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['default', 'force-light', 'force-dark']

/** Type guard for {@link ThemePreference}. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

/**
 * Coerce an untrusted value (GSettings nick, GAction target, …) to a
 * valid preference, falling back to following the OS.
 */
export function coerceThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : 'default'
}
