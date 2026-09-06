/**
 * The view tier persisted in GSettings (`ui-tier` key).
 *
 * Two tiers, named after what is on screen rather than after the person:
 * **Simple view** (`simple`) and **Full view** (`full`). The nicks match
 * the `org.pixelrpg.maker.UiTier` enum in `data/org.pixelrpg.maker.gschema.xml`.
 * The tier is a fact about the person at the keyboard — it follows them
 * across projects like `theme` does, and it never rides the wire: a
 * collaborator's tier is their own. Default is Simple, silently, with no
 * first-run question: a child cannot judge that question and the expert
 * pays one menu click.
 *
 * Kept free of GTK imports so the guard/coercion logic is unit-testable
 * on any runtime.
 */
export type UiTier = 'simple' | 'full'

/** All valid tier nicks, Simple first. */
export const UI_TIERS: readonly UiTier[] = ['simple', 'full']

/** The tier every account starts in. */
export const DEFAULT_UI_TIER: UiTier = 'simple'

/** Type guard for {@link UiTier}. */
export function isUiTier(value: unknown): value is UiTier {
  return typeof value === 'string' && (UI_TIERS as readonly string[]).includes(value)
}

/**
 * Coerce an untrusted value (GSettings nick, action state, …) to a valid
 * tier, falling back to Simple — the tier that hides nothing a child
 * needs and reveals nothing they cannot judge.
 */
export function coerceUiTier(value: unknown): UiTier {
  return isUiTier(value) ? value : DEFAULT_UI_TIER
}

/** The boolean the UI binds to (`app.full-view`, the switches) for a tier. */
export function isFullView(tier: UiTier): boolean {
  return tier === 'full'
}

/** The tier a "Full view" switch state stands for. */
export function tierForFullView(fullView: boolean): UiTier {
  return fullView ? 'full' : 'simple'
}
