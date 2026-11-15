import type { LayerPlane } from '@pixelrpg/engine'
import type { BrushPage, LayersPage, SelectedPage } from '@pixelrpg/gjs'

/**
 * Inspector → top-bar + engine wiring, one function per page.
 *
 * These connect once per view lifetime: the pages persist across scene
 * switches AND across the wide↔phone re-host (`EditorPages.host`), so
 * re-connecting in `vfunc_map` would double-fire.
 */

/** What the Brush page's picks drive. */
export interface BrushPageWiring {
  /** Whether the Object tool is armed — a tile pick then falls back to pencil. */
  isObjectToolActive(): boolean
  armPencilTool(): void
  setActiveTile(tileId: number): void
  armObjectBrush(defId: string): void
  /** Re-point the sheet at another of the map's tilesets. */
  selectTileset(spriteSetId: string): void
  selectPlane(plane: LayerPlane): void
  /** The "choose a layer" row leads to the Layers page, wherever it is hosted. */
  openLayersPage(): void
  /**
   * Get the sheet out of the way once a Thing is armed: on a phone the
   * page fills the sheet, and the next gesture belongs to the canvas.
   * A no-op in the wide inspector, which never covers the map.
   */
  collapseSheet(): void
}

export function wireBrushPage(page: BrushPage, ctx: BrushPageWiring): void {
  page.connect('tile-selected', (_p: BrushPage, tileId: number) => {
    // Picking a tile while the Object tool is armed means "paint this
    // tile" — switch back to the pencil, the mirror of an object pick
    // arming the Object tool.
    if (ctx.isObjectToolActive()) ctx.armPencilTool()
    ctx.setActiveTile(tileId)
  })
  // Picking what to place arms the brush AND the Object tool in one step,
  // just like picking a tile arms the pencil's active tile.
  page.connect('object-brush-selected', (_p: BrushPage, defId: string) => {
    ctx.armObjectBrush(defId)
    ctx.collapseSheet()
  })
  page.connect('tileset-selected', (_p: BrushPage, spriteSetId: string) => ctx.selectTileset(spriteSetId))
  page.connect('plane-selected', (_p: BrushPage, plane: string) => ctx.selectPlane(plane as LayerPlane))
  page.connect('layers-requested', () => ctx.openLayersPage())
}

/** What the Layers page's toggles drive. */
export interface LayersPageWiring {
  setActiveLayer(layerId: string): void
  setLayerVisible(layerId: string, visible: boolean): void
  setLayerLocked(layerId: string, locked: boolean): void
  /**
   * A row was dropped in section `plane` at array position `index`.
   * The engine decides whether that is a reorder or a change of plane.
   */
  moveLayer(layerId: string, plane: LayerPlane, index: number): void
  persistMapData(): void
  /** Undoable rename — the new name is already non-empty and changed. */
  renameLayer(layerId: string, name: string): void
  /** Copy the layer with its tiles and placements, right above it. */
  duplicateLayer(layerId: string): void
  /** Drop the layer; offers an undo instead of asking first. */
  deleteLayer(layerId: string): void
}

/**
 * The flag toggles only dispatch + persist: the engine turns them into
 * undoable, collab-synced commands and echoes `LAYER_FLAG_CHANGED` back,
 * which is the single owner of the view's layer cache. Writing the cache
 * here too would be the parallel state AGENTS.md forbids.
 */
export function wireLayersPage(page: LayersPage, ctx: LayersPageWiring): void {
  page.connect('layer-selected', (_l: LayersPage, id: string) => ctx.setActiveLayer(id))
  page.connect('layer-visibility-toggled', (_l: LayersPage, layerId: string, visible: boolean) => {
    ctx.setLayerVisible(layerId, visible)
    ctx.persistMapData()
  })
  page.connect('layer-lock-toggled', (_l: LayersPage, layerId: string, locked: boolean) => {
    ctx.setLayerLocked(layerId, locked)
    ctx.persistMapData()
  })
  page.connect('layer-move-requested', (_l: LayersPage, layerId: string, plane: string, index: number) => {
    ctx.moveLayer(layerId, plane as LayerPlane, index)
    ctx.persistMapData()
  })
  // The three row commands are engine commands: they persist through
  // the op-log, so nothing here writes the view's layer cache and
  // nothing calls persistMapData twice.
  page.connect('layer-rename-requested', (_l: LayersPage, layerId: string, name: string) =>
    ctx.renameLayer(layerId, name),
  )
  page.connect('layer-duplicate-requested', (_l: LayersPage, layerId: string) => ctx.duplicateLayer(layerId))
  page.connect('layer-delete-requested', (_l: LayersPage, layerId: string) => ctx.deleteLayer(layerId))
}

/** What the Selected page's actions drive. */
export interface SelectedPageWiring {
  openObjectDefinition(defId: string): void
  /** Dispatch the undoable RemoveObjectCommand and refresh the placement list. */
  removePlacement(placementId: string): void
  /** Lay a copy of the placement on a free neighbouring tile and select it. */
  duplicatePlacement(placementId: string): void
  /**
   * A committed edit of the placement's definition. `entityJson` is the
   * WHOLE definition as the user now sees it; the host diffs it against
   * the base to produce the per-instance overrides.
   */
  applyPlacementEdit(placementId: string, entityJson: string): void
}

export function wireSelectedPage(page: SelectedPage, ctx: SelectedPageWiring): void {
  page.connect('object-open-requested', (_p: SelectedPage, defId: string) => ctx.openObjectDefinition(defId))
  page.connect('object-remove-requested', (_p: SelectedPage, placementId: string) => ctx.removePlacement(placementId))
  page.connect('object-duplicate-requested', (_p: SelectedPage, placementId: string) =>
    ctx.duplicatePlacement(placementId),
  )
  page.connect('overrides-changed', (_p: SelectedPage, placementId: string, entityJson: string) =>
    ctx.applyPlacementEdit(placementId, entityJson),
  )
}
