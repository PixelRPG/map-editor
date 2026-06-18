import { Actor, type Camera, Color, Rectangle, TileMap, Vector } from 'excalibur'
import type { MapScene } from '../scenes/map.scene.ts'
import { AwarenessManager, type AwarenessMessage, type AwarenessPeerInfo, parseAwarenessColour } from '../sync/index.ts'
import { tileToWorldCenter } from './tile-geometry.ts'

/** Stable peer id for the in-process AI assistant collaborator. */
export const ASSISTANT_PEER_ID = 'ai-assistant'

/**
 * Default display identity of the AI assistant collaborator. Single
 * definition — the maker's `AssistantStateService` imports it (re-exported
 * from the engine index) instead of duplicating the literals.
 */
export const DEFAULT_ASSISTANT_INFO: AwarenessPeerInfo = { displayName: 'AI Assistant', color: '#9141ac' }

/** Minimal handle the controller needs from the cursor renderer (create + close). */
export interface CursorRendererHandle {
  close(): void
}

/**
 * Engine-side access the controller needs: the active map scene (cursor
 * target + flash host) and the current camera (follow easing). Injected so
 * the controller is unit-testable without a real {@link Engine}.
 */
export interface AssistantPresenceHost {
  getActiveScene(): MapScene | null
  getCamera(): Camera | null
}

export interface AssistantPresenceOptions {
  host: AssistantPresenceHost
  /**
   * Builds the cursor renderer for a given awareness channel. Production
   * passes `(aware) => new RemoteCursorRenderer(engine, aware)`; tests pass
   * a fake so the engine-bound renderer isn't needed.
   */
  createRenderer: (awareness: AwarenessManager) => CursorRendererHandle
}

/**
 * The in-process AI-assistant presence subsystem, extracted out of
 * {@link Engine} (see docs/concepts/ai-collaborator.md). Owns the assistant's
 * session-less awareness channel + cursor renderer, its presence/pause/follow
 * state, the smooth camera-follow easing, and the edit-attribution tile flash.
 *
 * The assistant is modelled as a *remote* peer on a local, wire-less
 * {@link AwarenessManager} so the very same {@link RemoteCursorRenderer} that
 * paints a networked human's cursor paints the AI's — no CollabSession/WebRTC.
 */
export class AssistantPresenceController {
  private readonly host: AssistantPresenceHost
  private readonly createRenderer: (awareness: AwarenessManager) => CursorRendererHandle

  private awareness: AwarenessManager | null = null
  private renderer: CursorRendererHandle | null = null
  private info: AwarenessPeerInfo = { ...DEFAULT_ASSISTANT_INFO }
  // Present (cursor/info set, not hidden) — gates the edit-attribution flash
  // so plain paintTileAt callers (tests) don't grow stray highlight actors.
  private active = false
  // User-controlled pause: cursor + paints are rejected while paused.
  private paused = false
  // Opt-in camera follow of the assistant cursor.
  private follow = false
  // Smooth camera-follow target (world space) or null when not following.
  private followTarget: Vector | null = null
  // Set by the app to the live CollabSession's awareness so the AI's
  // presence/cursor reach networked human peers too (edits already ride the
  // op-log). No-op when no session is wired.
  private frameRelay: ((message: AwarenessMessage) => void) | null = null

  constructor(opts: AssistantPresenceOptions) {
    this.host = opts.host
    this.createRenderer = opts.createRenderer
  }

  /** Whether the assistant is currently present. */
  isActive(): boolean {
    return this.active
  }

  /** Whether the user has paused the assistant. */
  isPaused(): boolean {
    return this.paused
  }

  setPaused(paused: boolean): void {
    this.paused = paused
  }

  setFollow(follow: boolean): void {
    this.follow = follow
  }

  setFrameRelay(relay: ((message: AwarenessMessage) => void) | null): void {
    this.frameRelay = relay
  }

  /**
   * Show (or move) the assistant's cursor at tile `(tileX, tileY)` on the
   * active map. Returns `false` if paused or no map/scene is active.
   */
  setCursor(tileX: number, tileY: number): boolean {
    if (this.paused) return false
    const scene = this.host.getActiveScene()
    const mapId = scene?.mapResource?.mapData?.id
    if (!scene || !mapId) return false
    const tm = this.anyTileMap(scene)
    if (!tm) return false
    const { x: worldX, y: worldY } = tileToWorldCenter(tm.pos, tm.tileWidth, tm.tileHeight, tileX, tileY)
    const aware = this.ensure()
    this.active = true
    const presence: AwarenessMessage = { type: 'presence', peerId: ASSISTANT_PEER_ID, info: this.info }
    const cursor: AwarenessMessage = {
      type: 'cursor',
      peerId: ASSISTANT_PEER_ID,
      cursor: { sceneId: mapId, x: worldX, y: worldY },
    }
    aware.handleInbound(presence)
    aware.handleInbound(cursor)
    this.frameRelay?.(presence)
    this.frameRelay?.(cursor)
    if (this.follow) this.panCameraTo(worldX, worldY)
    return true
  }

  /** Update the assistant's display name + colour (re-announced immediately). */
  setInfo(displayName: string, color: string): void {
    this.info = { displayName, color }
    this.active = true
    const presence: AwarenessMessage = { type: 'presence', peerId: ASSISTANT_PEER_ID, info: this.info }
    this.ensure().handleInbound(presence)
    this.frameRelay?.(presence)
  }

  /** Remove the assistant's cursor/presence from the canvas. */
  hide(): void {
    this.active = false
    const leave: AwarenessMessage = { type: 'leave', peerId: ASSISTANT_PEER_ID }
    this.awareness?.handleInbound(leave)
    this.frameRelay?.(leave)
  }

  /** Set the smooth camera-follow target to world point `(x, y)`. */
  panCameraTo(worldX: number, worldY: number): void {
    this.followTarget = new Vector(worldX, worldY)
  }

  /** Stop following — the camera stays put and responds to the user again. */
  stopCameraFollow(): void {
    this.followTarget = null
  }

  /**
   * Per-frame easing toward the follow target. Frame-rate independent:
   * the lerp factor scales with elapsed time. Snaps + stops once within a
   * sub-pixel of the target. Call from the engine's post-update.
   */
  tickCameraFollow(elapsedMs: number): void {
    if (!this.followTarget) return
    const camera = this.host.getCamera()
    if (!camera) return
    const dx = this.followTarget.x - camera.pos.x
    const dy = this.followTarget.y - camera.pos.y
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      camera.pos = this.followTarget.clone()
      return
    }
    // Exponential smoothing; ~120ms time constant reads as a gentle glide.
    const factor = Math.min(1, elapsedMs / 120)
    camera.pos = new Vector(camera.pos.x + dx * factor, camera.pos.y + dy * factor)
  }

  /**
   * Brief fading outline in the assistant's colour on a tile it just
   * painted — visible "the AI did this" attribution. Self-disposing via
   * `onPostUpdate`, so no external timer. No-op without an active scene.
   */
  flashTile(tm: TileMap, tileX: number, tileY: number): void {
    const scene = this.host.getActiveScene()
    if (!scene) return
    const centre = tileToWorldCenter(tm.pos, tm.tileWidth, tm.tileHeight, tileX, tileY)
    const actor = new Actor({
      pos: new Vector(centre.x, centre.y),
      z: 9_000, // below the cursor (10_000), above the tilemap
    })
    const colour = parseAwarenessColour(this.info.color)
    // Outline (not a fill) so the painted tile content stays visible.
    actor.graphics.use(
      new Rectangle({
        width: tm.tileWidth,
        height: tm.tileHeight,
        color: Color.Transparent,
        strokeColor: colour,
        lineWidth: 2,
      }),
    )
    const peakOpacity = 0.95
    const fadeMs = 700
    let elapsed = 0
    actor.graphics.opacity = peakOpacity
    actor.onPostUpdate = (_engine, elapsedMs: number) => {
      elapsed += elapsedMs
      if (elapsed >= fadeMs) {
        actor.kill()
        return
      }
      actor.graphics.opacity = peakOpacity * (1 - elapsed / fadeMs)
    }
    scene.add(actor)
  }

  /** Tear down the renderer + awareness channel (engine stop). */
  dispose(): void {
    this.renderer?.close()
    this.renderer = null
    this.awareness = null
    this.frameRelay = null
  }

  private ensure(): AwarenessManager {
    if (!this.awareness) {
      // localPeerId is a sentinel that never matches the assistant peer, so
      // handleInbound treats the assistant as a "remote" peer and the
      // renderer draws it. `send` is a no-op — purely local, no wire.
      this.awareness = new AwarenessManager({
        localPeerId: '__local_viewer__',
        localInfo: { displayName: 'viewer', color: '#000000' },
        send: () => {},
      })
      this.renderer = this.createRenderer(this.awareness)
    }
    return this.awareness
  }

  private anyTileMap(scene: MapScene): TileMap | null {
    for (const entity of scene.world.entityManager.entities) {
      if (entity instanceof TileMap) return entity
    }
    return null
  }
}
