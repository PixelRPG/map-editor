import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { type Engine as ExcaliburEngine, GraphicsComponent, TileMap } from 'excalibur'

/**
 * Per-frame measurement probe, off unless `PIXELRPG_FRAME_PROBE` names a
 * file to append JSON lines to.
 *
 * It exists because "the editor does not feel smooth" is not a bug report
 * anyone can act on: the frame budget is split across four owners (our
 * code, Excalibur's update/draw, the `@gjsify/webgl` GLArea bridge, and
 * GTK's own frame clock + compositor), and only the middle one is visible
 * in Excalibur's `engine.stats`. So each record carries BOTH sides:
 *
 * - `el`      the clock's elapsed time for the frame — the PACING number.
 *             What the eye reads as stutter is the spread of this, not the
 *             mean: 16.7 ms every frame looks smooth, alternating 8/25 ms
 *             does not, and both average the same.
 * - `u` / `d` how long Excalibur's update and draw actually took.
 * - `gap`     wall time between the END of the previous frame and the START
 *             of this one — everything that is NOT Excalibur: the GLArea
 *             render signal, GTK widget relayout, GJS garbage collection,
 *             and whatever else sits on the main loop. A pacing problem
 *             with a small `u + d` and a large, erratic `gap` is NOT an
 *             Excalibur problem, and that distinction is the whole point.
 * - `raf`     how many times `requestAnimationFrame` was called since the
 *             previous frame. Excalibur's `StandardClock` requests exactly
 *             one per frame, so anything above 1 is a second scheduler
 *             driving the same canvas.
 *
 * Records are appended as JSON lines with a wall-clock `t` (epoch ms) so an
 * external driver can slice the stream into scenarios by its own timestamps
 * without the app needing to know what is being measured.
 */
interface FrameRecord {
  t: number
  id: number
  el: number
  u: number
  d: number
  gap: number
  raf: number
  dc: number
  di: number
  rs: number
  /** Collision: broadphase ms, narrowphase ms, candidate pairs, real collisions. */
  bp: number
  np: number
  pairs: number
  col: number
  /** Entities alive in the scene — the number the collision cost scales with. */
  alive: number
  /**
   * Colliders the scene's collision processor tracks. NOT the same as
   * `alive`: one tilemap entity flattens into one box collider per solid
   * tile, so this is the number the broadphase really walks.
   */
  cc: number
  /**
   * Draw-side culling: graphics entities in the scene, how many of those
   * carry Excalibur's `ex.offscreen` tag (skipped by `GraphicsSystem`), the
   * tiles the tilemaps would draw this frame, and the camera zoom.
   */
  ge: number
  eo: number
  vt: number
  zoom: number
  sys?: Record<string, number>
}

/** Flush every N frames — a crash mid-run still leaves the frames before it. */
const FLUSH_EVERY = 120

/**
 * Start sampling into the file named by `PIXELRPG_FRAME_PROBE`, if set.
 * Returns a stop function, or `null` when the probe is off (the normal case).
 */
export function installFrameProbe(excalibur: ExcaliburEngine): (() => void) | null {
  const path = GLib.getenv('PIXELRPG_FRAME_PROBE')
  if (!path) return null

  const file = Gio.File.new_for_path(path)
  const stream = file.append_to(Gio.FileCreateFlags.NONE, null)
  const pending: FrameRecord[] = []
  const now = () => performance.now()

  // Count rAF requests between frames: the bridge's `add_tick_callback`
  // queues a render whenever a callback is pending AND `requestAnimationFrame`
  // queues one itself, so a frame driven twice shows up here before it shows
  // up as a timing anomaly.
  let rafCount = 0
  const host = globalThis as unknown as { requestAnimationFrame: (cb: (t: number) => void) => number }
  const originalRaf = host.requestAnimationFrame
  host.requestAnimationFrame = (cb) => {
    rafCount++
    return originalRaf(cb)
  }

  let frameStart = now()
  let lastFrameEnd = now()
  let sampled = 0

  const flush = () => {
    if (pending.length === 0) return
    const payload = `${pending.map((record) => JSON.stringify(record)).join('\n')}\n`
    pending.length = 0
    stream.write_all(new TextEncoder().encode(payload), null)
    stream.flush(null)
  }

  const onPreFrame = () => {
    frameStart = now()
  }

  const onPostFrame = () => {
    const end = now()
    const frame = excalibur.stats.currFrame
    pending.push({
      t: Date.now(),
      id: frame.id,
      el: round(frame.elapsed),
      u: round(frame.duration.update),
      d: round(frame.duration.draw),
      gap: round(frameStart - lastFrameEnd),
      raf: rafCount,
      dc: frame.graphics.drawCalls,
      di: frame.graphics.drawnImages,
      rs: frame.graphics.rendererSwaps,
      bp: round(frame.physics.broadphase),
      np: round(frame.physics.narrowphase),
      pairs: frame.physics.pairs,
      col: frame.physics.collisions,
      alive: frame.actors.alive,
      cc: colliderCount(excalibur),
      ...cullCounts(excalibur),
      // The per-system breakdown is the same ~20 keys every frame; one in
      // sixty is enough to attribute a hot system without tripling the log.
      ...(sampled % 60 === 0 ? { sys: roundAll(frame.systemDuration) } : {}),
    })
    rafCount = 0
    lastFrameEnd = end
    sampled++
    if (pending.length >= FLUSH_EVERY) flush()
  }

  excalibur.on('preframe', onPreFrame)
  excalibur.on('postframe', onPostFrame)

  return () => {
    excalibur.off('preframe', onPreFrame)
    excalibur.off('postframe', onPostFrame)
    host.requestAnimationFrame = originalRaf
    flush()
    stream.close(null)
  }
}

/**
 * How many colliders the active scene's collision processor tracks.
 *
 * `scene.physics` and `CollisionProcessor.getColliders()` are public API but
 * not in the typings this repo pins, hence the casts; a shape change just
 * reports 0 instead of breaking a measurement run.
 */
function colliderCount(excalibur: ExcaliburEngine): number {
  try {
    const scene = excalibur.currentScene as unknown as {
      physics?: { collisionProcessor?: { getColliders?: () => unknown[] } }
    }
    return scene?.physics?.collisionProcessor?.getColliders?.().length ?? 0
  } catch {
    return 0
  }
}

/**
 * What the draw pass has to look at. Only evaluated while the probe is on;
 * the casts are for `getOnScreenTiles`, which is not in the pinned typings.
 */
function cullCounts(excalibur: ExcaliburEngine): { ge: number; eo: number; vt: number; zoom: number } {
  const counts = { ge: 0, eo: 0, vt: 0, zoom: 0 }
  try {
    const scene = excalibur.currentScene
    counts.zoom = round(scene.camera.zoom)
    for (const entity of scene.world.entityManager.entities) {
      if (entity.has(GraphicsComponent)) {
        counts.ge++
        if (entity.hasTag('ex.offscreen')) counts.eo++
      }
      const tilemap = entity as unknown as { getOnScreenTiles?: () => unknown[] }
      if (entity instanceof TileMap) counts.vt += tilemap.getOnScreenTiles?.().length ?? 0
    }
  } catch {
    // a shape change just reports zeros instead of breaking a measurement run
  }
  return counts
}

/** Three decimals: sub-microsecond noise in a 16 ms budget is not signal. */
function round(value: number): number {
  return Math.round((value ?? 0) * 1000) / 1000
}

function roundAll(values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value > 0.01) out[key] = round(value)
  }
  return out
}
