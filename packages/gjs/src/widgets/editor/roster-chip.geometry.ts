// Pure geometry behind the roster chip's avatar stack: where each
// participant's disc sits and how wide the stack ends up. GTK-free,
// because GTK forbids negative margins — overlapping `Adw.Avatar`s
// would need a `Gtk.Fixed` — so the stack is drawn, and "the discs
// overlap by a third and the width still fits the pill" is a unit test.

/** Diameter of one participant disc. */
export const AVATAR_PX = 22

/** Distance between two neighbouring disc centres — less than the diameter, so they overlap. */
export const AVATAR_PITCH = 14

/** Discs drawn before the "+N" caption takes over. */
export const AVATAR_MAX = 3

/** Height of the whole stack, leaving a hairline for the outline. */
export const AVATAR_STACK_HEIGHT = AVATAR_PX + 2

/** Where one disc lands, left to right. */
export interface AvatarSlot {
  index: number
  x: number
  y: number
  size: number
}

/** The discs to draw for `count` participants, capped at {@link AVATAR_MAX}. */
export function avatarSlots(count: number): AvatarSlot[] {
  const shown = Math.min(Math.max(count, 0), AVATAR_MAX)
  return Array.from({ length: shown }, (_, index) => ({
    index,
    x: index * AVATAR_PITCH,
    y: 1,
    size: AVATAR_PX,
  }))
}

/** How many participants the "+N" caption stands for (0 = no caption). */
export function overflowCount(count: number): number {
  return Math.max(0, count - AVATAR_MAX)
}

/** Width of the drawn stack, excluding the "+N" caption. */
export function avatarStackWidth(count: number): number {
  const shown = Math.min(Math.max(count, 0), AVATAR_MAX)
  if (shown === 0) return 0
  return AVATAR_PX + AVATAR_PITCH * (shown - 1)
}

/**
 * The pause glyph over the AI disc while the assistant is paused —
 * two bars, centred on the first disc.
 */
export function pauseBars(slot: AvatarSlot): { x: number; y: number; w: number; h: number }[] {
  const barW = Math.round(slot.size * 0.09)
  const barH = Math.round(slot.size * 0.36)
  const gap = Math.round(slot.size * 0.11)
  const cx = slot.x + slot.size / 2
  const cy = slot.y + slot.size / 2
  return [
    { x: cx - gap / 2 - barW, y: cy - barH / 2, w: barW, h: barH },
    { x: cx + gap / 2, y: cy - barH / 2, w: barW, h: barH },
  ]
}
