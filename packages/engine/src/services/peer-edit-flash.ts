import type { EventEmitter } from 'excalibur'
import type { Command } from '../commands/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { parseAwarenessColour } from '../sync/index.ts'
import { EngineEvent, type EngineEventMap } from '../types/index.ts'
import { type FlashCell, flashTiles } from './edit-flash.ts'
import { findTileMapForLayer } from './tile-paint.service.ts'

/**
 * Receive-side edit attribution: when a remote op arrives carrying an
 * `origin`, outline the tiles it touched in that actor's colour
 * (REDESIGN §8.3).
 *
 * The machine an AI collaborator runs on already sees its edits flash —
 * that path goes through `EditOperations` and the local assistant. Its
 * PEERS saw nothing: `Operation.origin` rode the wire and arrived, but
 * nothing rendered it, so on the other side of a shared session the AI's
 * work appeared out of nowhere, indistinguishable from its host's own.
 *
 * Scope today is the AI — the only actor `origin` is ever set for — but
 * the mechanism is actor-generic: the colour arrives through an injected
 * {@link PeerEditFlashOptions.colourFor}, so "Mia painted here" would be
 * a lookup, not a second controller.
 */

/** What the controller needs from the engine — injected so it tests without one. */
export interface PeerEditFlashHost {
  getActiveScene(): MapScene | null
}

/**
 * The colour to flash an `origin` in, or `null` to not flash it at all.
 * An unknown actor gets no outline rather than a neutral one that claims
 * an attribution nobody can read.
 */
export type OriginColourResolver = (origin: string) => string | null

export interface PeerEditFlashOptions {
  events: EventEmitter<EngineEventMap>
  host: PeerEditFlashHost
  colourFor: OriginColourResolver
}

/** Where to draw an attributed edit, and in whose colour. */
export interface EditFlashRequest {
  layerId: string
  tiles: readonly FlashCell[]
  colour: string
}

/**
 * Whether a remote op should flash, and what to draw — the whole
 * decision, free of Excalibur and of the scene, so every branch is
 * reachable from a unit test.
 *
 * Both directions flash: an AI undo is as much "the AI changed this" as
 * its paint was, and the tiles it restores are the tiles it had touched.
 */
export function resolveEditFlash(
  command: Command,
  origin: string | undefined,
  colourFor: OriginColourResolver,
): EditFlashRequest | null {
  if (!origin) return null // the peer's own human edit — their cursor already says where they are
  const colour = colourFor(origin)
  if (!colour) return null
  // No footprint is a legitimate answer, not a gap: renaming a layer or
  // reordering planes changes no tiles, so there is nothing to point at.
  const footprint = command.footprint?.()
  if (!footprint || footprint.tiles.length === 0) return null
  return { layerId: footprint.layerId, tiles: footprint.tiles, colour }
}

/**
 * Subscribe to `REMOTE_COMMAND_APPLIED` and flash attributed ops.
 * Returns the unsubscribe function (engine stop).
 */
export function attachPeerEditFlash(options: PeerEditFlashOptions): () => void {
  const subscription = options.events.on(EngineEvent.REMOTE_COMMAND_APPLIED, ({ command, origin }) => {
    const request = resolveEditFlash(command, origin, options.colourFor)
    if (!request) return
    const scene = options.host.getActiveScene()
    if (!scene) return
    // No tilemap for the layer means the op landed somewhere this peer is
    // not looking at — a map it has not opened, a layer it has not
    // loaded. The edit still applied; there is just nothing on screen to
    // point at.
    const target = findTileMapForLayer(scene, request.layerId)
    if (!target) return
    flashTiles(scene, target.tileMap, request.tiles, parseAwarenessColour(request.colour))
  })
  return () => subscription.close()
}
