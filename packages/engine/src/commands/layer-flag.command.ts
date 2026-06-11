import { Actor, type Scene, TileMap } from 'excalibur'
import { TileMapTierComponent, TileTransformComponent } from '../components/index.ts'
import { MapScene } from '../scenes/map.scene.ts'
import { areObjectsVisible } from '../services/editor-view.ts'
import { refreshAllTileGraphics } from '../services/tile-graphics.manager.ts'
import { DEFAULT_LAYER_TIER } from '../types/data/LayerData.ts'
import type { Command } from './types.ts'

/**
 * Payload of {@link SetLayerVisibilityCommand}. `layerId` is the
 * stable `LayerData.id` — survives save/load + cross-peer transport.
 */
export interface SetLayerVisibilityPayload {
  layerId: string
  /** Target value `apply` writes. */
  visible: boolean
  /**
   * Value before the toggle, captured by the caller at dispatch time
   * (same contract as `PaintTilePayload.previousSprites`). `revert`
   * restores it.
   */
  previousVisible: boolean
}

/**
 * Payload of {@link SetLayerLockedCommand}. Same shape + capture
 * contract as {@link SetLayerVisibilityPayload}, for the `locked` flag.
 */
export interface SetLayerLockedPayload {
  layerId: string
  /** Target value `apply` writes. */
  locked: boolean
  /** Value before the toggle, captured by the caller at dispatch time. */
  previousLocked: boolean
}

/**
 * Resolve the command's target `LayerData` on the scene's loaded map.
 * Returns `null` (silently) when the scene isn't a realised `MapScene`
 * — commands may legitimately arrive before/after a map is live. An
 * unknown layer id is warned and skipped: a remote peer can toggle a
 * layer the local map no longer has, which is non-critical.
 */
function resolveLayer(scene: Scene, layerId: string) {
  if (!(scene instanceof MapScene)) return null
  const layer = scene.mapResource?.mapData?.layers.find((l) => l.id === layerId) ?? null
  if (!layer) {
    console.warn(`[LayerFlag] no layer resolves for id "${layerId}" — command skipped`)
    return null
  }
  return layer
}

/**
 * Write the `visible` flag onto `MapData` and refresh everything that
 * renders from the layer (the in-engine half that used to live in
 * `Engine.setLayerVisible` before the flag became a Command):
 *
 * - **Tile graphics** on the layer's tier tilemap — sprites rebuild
 *   via `refreshAllTileGraphics`, which already filters hidden
 *   layers. Only the hosting tier needs the filter re-applied; the
 *   other tier tilemaps don't carry this layer's sprites.
 * - **Object placements** — actors spawned for
 *   `MapData.objectPlacements` get their `graphics.visible` flipped.
 *   A single layer can carry both, so both surfaces flip together.
 *   Combined with the global objects toggle (Layers tab "Objects"
 *   row): a placement renders only when BOTH are on.
 *
 * Living in the command (not the Engine) means the remote-apply path
 * (`Engine.applyRemoteCommand` → `command.apply`) refreshes the live
 * canvas exactly like a local toggle — peers see the layer disappear,
 * not just a silent data write.
 *
 * O(columns × rows × sprites-per-tile + placements) — only runs on
 * explicit toggles / undo / inbound peer ops, not per frame.
 */
function applyLayerVisibility(scene: Scene, layerId: string, visible: boolean): void {
  const layer = resolveLayer(scene, layerId)
  if (!layer || !(scene instanceof MapScene)) return
  layer.visible = visible
  const targetTier = layer.tier ?? DEFAULT_LAYER_TIER
  for (const entity of scene.world.entityManager.entities) {
    if (entity instanceof TileMap) {
      if (entity.get(TileMapTierComponent)?.tier === targetTier) {
        refreshAllTileGraphics(entity, scene.mapResource)
      }
      continue
    }
    // Placement actors carry the canonical `layerId` on
    // `TileTransformComponent` — the visibility flip is tier-independent.
    const transform = entity.get(TileTransformComponent)
    if (transform?.layerId === layerId && entity instanceof Actor) {
      entity.graphics.visible = visible && areObjectsVisible(scene)
    }
  }
}

/** Write the `locked` flag onto `MapData`. Pure editor state — no graphics refresh. */
function applyLayerLocked(scene: Scene, layerId: string, locked: boolean): void {
  const layer = resolveLayer(scene, layerId)
  if (!layer) return
  layer.locked = locked
}

/**
 * Toggle a layer's `visible` flag. `visible`/`locked` are PERSISTED
 * document state on `MapData` (saved into the shared map JSON), so
 * per AGENTS.md [Transport-ready primitives] rule 2 they must ride a
 * registered Command — peers + undo + wire, one vocabulary. Before
 * this command existed the flags were direct field writes: they
 * worked solo but a peer's toggle never reached the other side, whose
 * next map save silently overwrote it.
 *
 * Undo semantics (deliberate): being a Command puts layer toggles on
 * the undo stack — Ctrl+Z after hiding a layer un-hides it. That is
 * the intended consequence of the flags being document state, not a
 * per-user view preference (contrast `EditorViewModeComponent`'s
 * grid / objects toggles, which are session-local and undo-free).
 */
export class SetLayerVisibilityCommand implements Command<SetLayerVisibilityPayload> {
  static readonly KIND = 'layer.set-visibility'
  readonly kind = SetLayerVisibilityCommand.KIND

  constructor(readonly payload: SetLayerVisibilityPayload) {}

  get label(): string {
    return `${this.payload.visible ? 'Show' : 'Hide'} layer "${this.payload.layerId}"`
  }

  apply(scene: Scene): void {
    applyLayerVisibility(scene, this.payload.layerId, this.payload.visible)
  }

  revert(scene: Scene): void {
    applyLayerVisibility(scene, this.payload.layerId, this.payload.previousVisible)
  }
}

/**
 * Toggle a layer's `locked` flag. Same Command rationale + undo
 * semantics as {@link SetLayerVisibilityCommand} — `locked` is
 * persisted map state, so it syncs to peers and rides the undo stack.
 * Lock is checked at the edit-input paths (`TileEditorSystem`,
 * `Engine.paintTileAt` / `placeObjectAt`); syncing it means BOTH
 * peers' input paths block once either toggles the padlock. The
 * remote-apply path itself doesn't re-check (in-flight ops from the
 * moment before the lock landed still apply — see TODO.md).
 */
export class SetLayerLockedCommand implements Command<SetLayerLockedPayload> {
  static readonly KIND = 'layer.set-locked'
  readonly kind = SetLayerLockedCommand.KIND

  constructor(readonly payload: SetLayerLockedPayload) {}

  get label(): string {
    return `${this.payload.locked ? 'Lock' : 'Unlock'} layer "${this.payload.layerId}"`
  }

  apply(scene: Scene): void {
    applyLayerLocked(scene, this.payload.layerId, this.payload.locked)
  }

  revert(scene: Scene): void {
    applyLayerLocked(scene, this.payload.layerId, this.payload.previousLocked)
  }
}
