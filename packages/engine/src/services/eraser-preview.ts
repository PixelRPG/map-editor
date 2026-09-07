import { Actor, Color, type Scene, type TileMap, Vector, vec } from 'excalibur'
import { ActiveLayerComponent, ActiveToolComponent, type MapEditorComponent, zFor } from '../components/index.ts'
import type { MapScene } from '../scenes/map.scene.ts'
import { EDITOR_CONSTANTS } from '../utils/constants.ts'
import { SessionState } from '../utils/session-state.ts'
import { cameraView } from './fill-preview.ts'
import { getSpritesAt } from './map-editor-shadow.service.ts'
import { RegionGraphic } from './region-graphic.ts'
import { findTileMapForLayer } from './tile-paint.service.ts'

/**
 * Eraser-tool hover preview — the cell an eraser click would clear.
 *
 * What the eraser removes is exact and narrow: `EraseTileCommand`
 * clears every sprite on the ACTIVE layer at that tile
 * (`removeSpritesFromTileForLayer`) and nothing else — other layers'
 * sprites at the same tile stay, and object placements are untouched.
 * The preview says exactly that, in two states:
 *
 * - the cell holds sprites on the active layer → red tint + outline:
 *   "this goes away";
 * - it holds none → grey outline only: the click would leave the map
 *   as it is, so the preview marks the tool's position without
 *   promising a change.
 *
 * A locked layer hides the preview, because the click is refused
 * before it reaches the command (`TileEditorSystem.applyClick`).
 *
 * Owner contract mirrors `pencil-preview.ts`.
 */

/** Hover context the caller hands to {@link refreshEraserPreview}. */
export interface EraserPreviewHover {
  tileMap: TileMap
  coords: { x: number; y: number }
}

/** What an eraser click reads: the active layer's plane tilemap + shadow. */
interface EraserTarget {
  readonly tileMap: TileMap
  readonly editor: MapEditorComponent
  readonly layerId: string
}

/** The two one-cell graphics, built once per tile size and swapped by content. */
interface EraserGraphics {
  readonly tileWidth: number
  readonly tileHeight: number
  readonly erasing: RegionGraphic
  readonly nothingToErase: RegionGraphic
}

const graphicsByActor = new WeakMap<Actor, EraserGraphics>()

/** Construct the preview actor — top-left anchored, z-level with the other hover overlays. */
export function createEraserPreviewActor(): Actor {
  const actor = new Actor({ name: 'eraser-preview', anchor: vec(0, 0) })
  actor.z = zFor('overlay') + 50
  actor.graphics.anchor = vec(0, 0)
  actor.graphics.visible = false
  return actor
}

/**
 * Reconcile the preview actor with the scene's current editor state.
 * Pass `hover = null` to hide (pointer off the map). Hidden as well
 * when the tool isn't `'eraser'` or the active layer is locked or
 * gone. Idempotent.
 */
export function refreshEraserPreview(actor: Actor, scene: Scene, hover: EraserPreviewHover | null): void {
  const target = hover ? resolveEraserTarget(scene) : null
  if (!target || !hover) {
    actor.graphics.visible = false
    return
  }

  const { x, y } = hover.coords
  const graphics = ensureGraphics(actor, target.tileMap, scene)
  const erasing = getSpritesAt(target.editor, x, y, target.layerId).length > 0
  actor.graphics.use(erasing ? graphics.erasing : graphics.nothingToErase)
  actor.pos = new Vector(
    target.tileMap.pos.x + x * target.tileMap.tileWidth,
    target.tileMap.pos.y + y * target.tileMap.tileHeight,
  )
  actor.graphics.visible = true
}

/** Whether the preview currently promises a removal (`true`), marks an empty cell (`false`), or is hidden (`null`). */
export function previewedErase(actor: Actor): boolean | null {
  if (!actor.graphics.visible) return null
  return actor.graphics.current === graphicsByActor.get(actor)?.erasing
}

function resolveEraserTarget(scene: Scene): EraserTarget | null {
  const tool = SessionState.get(scene, ActiveToolComponent)?.tool
  if (tool !== 'eraser') return null

  const mapScene = scene as MapScene
  const mapResource = mapScene.mapResource
  if (!mapResource) return null

  const layerId = SessionState.get(scene, ActiveLayerComponent)?.layerId ?? mapResource.getFirstLayerId?.()
  if (!layerId) return null
  const layer = mapResource.mapData?.layers.find((l) => l.id === layerId)
  if (layer?.locked) return null

  // Resolved from the active layer, not the hover's tilemap — the
  // user may have switched layers since the pointer last moved.
  const found = findTileMapForLayer(mapScene, layerId)
  if (!found) return null
  return { tileMap: found.tileMap, editor: found.editor, layerId }
}

function ensureGraphics(actor: Actor, tileMap: TileMap, scene: Scene): EraserGraphics {
  const cached = graphicsByActor.get(actor)
  if (cached && cached.tileWidth === tileMap.tileWidth && cached.tileHeight === tileMap.tileHeight) return cached

  const tint = Color.fromHex(EDITOR_CONSTANTS.ERASE_PREVIEW_COLOR)
  tint.a = EDITOR_CONSTANTS.ERASE_PREVIEW_TINT_ALPHA
  const cell = { cells: [{ x: 0, y: 0 }], tileWidth: tileMap.tileWidth, tileHeight: tileMap.tileHeight }
  // A single cell needs no viewport culling, but the stroke still
  // follows the zoom.
  const view = () => {
    const camera = cameraView(scene)
    return camera ? { bounds: null, zoom: camera.zoom } : null
  }
  const built: EraserGraphics = {
    tileWidth: tileMap.tileWidth,
    tileHeight: tileMap.tileHeight,
    erasing: new RegionGraphic({
      ...cell,
      tintColor: tint,
      strokeColor: Color.fromHex(EDITOR_CONSTANTS.ERASE_PREVIEW_COLOR),
      lineWidth: EDITOR_CONSTANTS.HOVER_BORDER_LINE_WIDTH,
      view,
    }),
    nothingToErase: new RegionGraphic({
      ...cell,
      tintColor: null,
      strokeColor: Color.fromHex(EDITOR_CONSTANTS.ERASE_PREVIEW_EMPTY_COLOR),
      lineWidth: EDITOR_CONSTANTS.HOVER_BORDER_LINE_WIDTH,
      view,
    }),
  }
  graphicsByActor.set(actor, built)
  return built
}
