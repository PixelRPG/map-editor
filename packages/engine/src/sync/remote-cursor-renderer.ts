import { Actor, Circle, Color, Font, GraphicsGroup, Text, Vector } from 'excalibur'

import type { Engine } from '../engine.ts'
import type { AwarenessManager, AwarenessPeerState } from './awareness.ts'

/**
 * In-canvas renderer for remote peers' cursors.
 *
 * Why an in-canvas Excalibur actor (and not a GTK overlay)? The
 * canvas is the world-coordinate surface — its transform already
 * tracks camera + zoom. A GTK overlay would have to mirror that
 * transform on every camera tick (re-computing world→screen for
 * each peer), which is solvable but error-prone at zoom
 * boundaries and during smooth-pan animations. An Excalibur actor
 * just *is* at its world position; the scene graph handles the
 * rest, including hi-DPI scaling and the editor view-mode's grid
 * overlay z-order.
 *
 * One {@link Actor} per tracked peer:
 *
 *   - A {@link Circle} graphic (6 px radius, peer's colour) sits
 *     at the cursor position.
 *   - A {@link Text} graphic placed slightly above renders the
 *     display name in the same colour.
 *
 * Lifetime:
 *
 *   - Subscribes to `awareness.on('peer-changed' / 'peer-left')`
 *     in the constructor; calling {@link close} disposes both.
 *   - On `peer-changed` for a peer whose cursor is null (peer
 *     announced presence but hasn't moved yet) — actor stays
 *     hidden until the first cursor arrives.
 *   - On `peer-changed` whose `cursor.sceneId` differs from the
 *     engine's active map — actor is removed; the peer is editing
 *     somewhere else and we don't want a stale dot left behind.
 *   - On `peer-left` — actor is removed.
 *
 * Re-binds across `MAP_LOADED` so the renderer keeps working
 * after the user opens a different scene mid-session.
 */
export class RemoteCursorRenderer {
  private readonly actors = new Map<string, Actor>()
  private readonly disposers: Array<() => void> = []
  private closed = false

  constructor(
    private readonly engine: Engine,
    private readonly awareness: AwarenessManager,
  ) {
    this.disposers.push(awareness.on('peer-changed', (peer) => this.applyPeer(peer)))
    this.disposers.push(awareness.on('peer-left', ({ peerId }) => this.removeActor(peerId)))
    // Re-paint every existing peer when the map changes — actors
    // were attached to the OLD scene and went away with it.
    this.disposers.push(
      (() => {
        const sub = this.engine.events.on('map-loaded', () => {
          // The old actors are torn down with the previous scene
          // graph. Re-create from the awareness snapshot for the
          // new map.
          this.actors.clear()
          for (const peer of awareness.getPeers()) this.applyPeer(peer)
        })
        return () => sub.close()
      })(),
    )
  }

  /** Drop every actor + subscription. Idempotent. */
  close(): void {
    if (this.closed) return
    this.closed = true
    for (const dispose of this.disposers) {
      try {
        dispose()
      } catch {
        /* listener map may already be gone */
      }
    }
    this.disposers.length = 0
    for (const actor of this.actors.values()) actor.kill()
    this.actors.clear()
  }

  private applyPeer(peer: AwarenessPeerState): void {
    if (this.closed) return
    const scene = this.engine.excalibur?.currentScene
    if (!scene) return
    // No cursor yet OR peer is editing a different scene — make
    // sure we don't have a stale actor lying around.
    const activeMapId = (scene as { mapResource?: { mapData?: { id?: string } } }).mapResource?.mapData?.id
    if (!peer.cursor || peer.cursor.sceneId !== activeMapId) {
      this.removeActor(peer.peerId)
      return
    }
    const existing = this.actors.get(peer.peerId)
    if (existing) {
      existing.pos = new Vector(peer.cursor.x, peer.cursor.y)
      // Colour / name may have changed via `presence` — refresh
      // the graphics in place.
      this.applyGraphics(existing, peer)
      return
    }
    const actor = new Actor({
      pos: new Vector(peer.cursor.x, peer.cursor.y),
      // Z above any tilemap (max layer z is typically < 1000) so
      // the cursor floats on top of every editor surface.
      z: 10_000,
    })
    this.applyGraphics(actor, peer)
    scene.add(actor)
    this.actors.set(peer.peerId, actor)
  }

  private applyGraphics(actor: Actor, peer: AwarenessPeerState): void {
    const colour = parseColour(peer.info.color)
    const dot = new Circle({ radius: 6, color: colour })
    const label = new Text({
      text: peer.info.displayName,
      font: new Font({ family: 'Adwaita Sans, sans-serif', size: 11, color: colour }),
    })
    // Compose dot + label into a GraphicsGroup so both render
    // every frame. Label sits slightly above + right of the dot so
    // it doesn't occlude the click target.
    const group = new GraphicsGroup({
      members: [
        { graphic: dot, offset: Vector.Zero },
        { graphic: label, offset: new Vector(10, -14) },
      ],
    })
    actor.graphics.use(group)
  }

  private removeActor(peerId: string): void {
    const actor = this.actors.get(peerId)
    if (!actor) return
    actor.kill()
    this.actors.delete(peerId)
  }
}

/**
 * Parse a CSS-style colour token (`#rgb` / `#rrggbb`) into an
 * Excalibur Color. Falls back to mid-grey on parse failure so a
 * peer with a bogus colour still renders.
 */
function parseColour(token: string): Color {
  try {
    return Color.fromHex(token)
  } catch {
    return Color.fromHex('#888888')
  }
}
