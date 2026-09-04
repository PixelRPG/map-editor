// Pure sizing + validation rules behind the animation editor dialog.
// GTK-free so it can be unit-tested (the dialog subclasses `Adw.Dialog`
// and can't be imported under `gjsify test`).

/** Base thumbnail edge (px) of a sequence chip at {@link DURATION_REF_MS}. */
export const SEQUENCE_THUMB_SIZE = 40

/** Duration (ms) a brand-new frame starts at. */
export const DEFAULT_DURATION_MS = 200

// Sequence chips scale their WIDTH with the frame's duration so the strip
// reads as a timeline (a 400 ms frame is twice as wide as a 200 ms one).
// `DURATION_REF_MS` maps to the base thumb width; clamped so very short
// frames stay clickable and very long ones don't dominate the strip.
const DURATION_REF_MS = 200
const CHIP_MIN_WIDTH = 28
const CHIP_MAX_WIDTH = 120

/** Bounds the per-frame duration stepper honours (ms). */
const MIN_FRAME_MS = 50
const MAX_FRAME_MS = 2000

/** Step (ms) one press of a chip's −/+ stepper moves the frame duration. */
export const DURATION_STEP_MS = 50

/**
 * Discrete tile-size stops for the bottom-right zoom OSD. Both the
 * picker cells AND the preview frame use this — the on-screen sprite
 * size matches the picker cells the user is selecting from.
 * {@link DEFAULT_ZOOM_LEVEL} is the 100% reference.
 */
export const ZOOM_LEVELS: ReadonlyArray<number> = [24, 36, 48, 72, 96]

export const DEFAULT_ZOOM_LEVEL = 2

/** Sequence-chip width for a frame duration (timeline metaphor; clamped). */
export function chipWidthForDuration(duration: number): number {
  const scaled = Math.round((duration / DURATION_REF_MS) * SEQUENCE_THUMB_SIZE)
  return Math.max(CHIP_MIN_WIDTH, Math.min(CHIP_MAX_WIDTH, scaled))
}

/** Keep a per-frame duration inside the stepper's range. */
export function clampFrameDuration(ms: number): number {
  return Math.max(MIN_FRAME_MS, Math.min(MAX_FRAME_MS, ms))
}

/** Zoom-OSD caption: the level's tile size as a percentage of the default. */
export function zoomPercent(level: number): number {
  return Math.round((ZOOM_LEVELS[level] / ZOOM_LEVELS[DEFAULT_ZOOM_LEVEL]) * 100)
}

/** Move `level` by `delta`, stopping at the ends of {@link ZOOM_LEVELS}. */
export function clampZoomLevel(level: number): number {
  return Math.max(0, Math.min(level, ZOOM_LEVELS.length - 1))
}

/**
 * Animation names the dialog must refuse: every required role plus every
 * animation already on the character. In edit mode the entry being edited
 * is excluded so the user can keep its current name.
 */
export function reservedAnimationNames(
  requiredRoles: readonly string[],
  existing: ReadonlyArray<{ id: string }>,
  editingId: string | null,
): Set<string> {
  const reserved = new Set<string>(requiredRoles)
  for (const anim of existing) reserved.add(anim.id)
  if (editingId !== null) reserved.delete(editingId)
  return reserved
}

/** Save is enabled for a non-empty, unreserved name with at least one frame. */
export function isAnimationNameValid(name: string, reserved: ReadonlySet<string>, frameCount: number): boolean {
  return name.length > 0 && !reserved.has(name) && frameCount > 0
}
