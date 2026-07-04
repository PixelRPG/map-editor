// Pure timeline geometry for the animation editor's ruler + playhead.
// GTK-free so it can be unit-tested (the widget in `animation-timeline.ts`
// subclasses `Gtk.Widget` and can't be imported under `gjsify test`).
//
// The model is a flat list of per-frame durations (ms). Time flows left→
// right; a frame occupies `[start, end)` on the axis, and the track's full
// pixel width maps linearly onto `[0, total]`.

/** A frame's placement on the timeline: the half-open span `[start, end)` in ms. */
export interface FrameSpan {
  index: number
  start: number
  end: number
  duration: number
}

/**
 * Total sequence duration in ms. Clamped to a floor of 1 so callers can
 * divide by it without guarding against an empty / zero-length sequence.
 * Negative per-frame values are treated as 0.
 */
export function totalDuration(durations: readonly number[]): number {
  let sum = 0
  for (const d of durations) sum += Math.max(0, d)
  return Math.max(1, sum)
}

/** Per-frame `[start, end)` spans across the whole sequence, in order. */
export function frameSpans(durations: readonly number[]): FrameSpan[] {
  const spans: FrameSpan[] = []
  let t = 0
  for (let i = 0; i < durations.length; i++) {
    const duration = Math.max(0, durations[i])
    spans.push({ index: i, start: t, end: t + duration, duration })
    t += duration
  }
  return spans
}

/**
 * Index of the frame playing at time `t` (ms). `t` is clamped to the
 * sequence, so the last frame is returned at/after the end. Returns -1
 * for an empty sequence.
 */
export function frameAtTime(durations: readonly number[], t: number): number {
  if (durations.length === 0) return -1
  const clamped = Math.max(0, Math.min(t, totalDuration(durations)))
  let acc = 0
  for (let i = 0; i < durations.length; i++) {
    acc += Math.max(0, durations[i])
    if (clamped < acc) return i
  }
  return durations.length - 1
}

/** Start time (ms) of frame `index` — the sum of all earlier durations. */
export function frameStartTime(durations: readonly number[], index: number): number {
  let acc = 0
  for (let i = 0; i < index && i < durations.length; i++) acc += Math.max(0, durations[i])
  return acc
}

/** Map a time (ms) to an x pixel across a track `width` px wide. */
export function xForTime(t: number, durations: readonly number[], width: number): number {
  const total = totalDuration(durations)
  return (Math.max(0, Math.min(t, total)) / total) * width
}

/** Map an x pixel to a time (ms), clamped to `[0, total]`. */
export function timeForX(x: number, durations: readonly number[], width: number): number {
  if (width <= 0) return 0
  const total = totalDuration(durations)
  return Math.max(0, Math.min((x / width) * total, total))
}
