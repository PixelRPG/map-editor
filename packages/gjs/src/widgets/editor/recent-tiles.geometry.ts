// The GTK-free half of `PixelRpgRecentTiles`: its sizes, the recency
// list, and how many swatches fit the bar WHOLE. Kept apart from the
// widget so "six 44 px tiles on a 48 px pitch fit a 288 px strip and a
// seventh does not" is a unit test under the node target rather than a
// screenshot — the widget module pulls `gi://Adw` in and cannot load
// there.

/** Side of one swatch picture. */
export const RECENT_SWATCH_PX = 40
/**
 * Side of the button around it — the swatch plus 2 px of padding a side,
 * which is the 44 px touch target. `scene-editor.css` pins the button to
 * exactly this; the phone-chrome probe reads it back.
 */
export const RECENT_BUTTON_PX = 44
/** The pitch swatches sit on, so `RECENT_PITCH_PX − RECENT_BUTTON_PX` is the gap. */
export const RECENT_PITCH_PX = 48

/** Most recently used tiles the strip remembers. */
export const RECENT_TILES_MAX = 8

/**
 * Keep an LRU of tile ids with `id` at the front, capped at
 * {@link RECENT_TILES_MAX}. Pure, so the "painting a meadow alternates
 * two or three tiles and none of them falls off" claim is a unit test.
 */
export function pushRecent(recent: readonly number[], id: number): number[] {
  return [id, ...recent.filter((other) => other !== id)].slice(0, RECENT_TILES_MAX)
}

/**
 * How many of `widths`, laid left to right with `spacing` between them,
 * fit inside `available` px without cutting one. The strip shows exactly
 * this many and hides the rest: a tile sliced by the edge of the bar is
 * not an affordance, and the "⌃" beside the strip is the way to the
 * rest.
 */
export function wholeCount(widths: readonly number[], spacing: number, available: number): number {
  let used = 0
  let count = 0
  for (const width of widths) {
    const next = count === 0 ? width : used + spacing + width
    if (next > available) break
    used = next
    count++
  }
  return count
}
