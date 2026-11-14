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
  selectPlane(plane: LayerPlane): void
  /** The "choose a layer" row leads to the Layers page, wherever it is hosted. */
  openLayersPage(): void
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
  page.connect('object-brush-selected', (_p: BrushPage, defId: string) => ctx.armObjectBrush(defId))
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
  toggleObjectsVisibility(): void
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
  // The pinned "Objects" pseudo-row is pure view state like grid/dim —
  // not persisted. Activating the stateful action with no parameter
  // toggles it, matching the row's already-flipped state.
  page.connect('objects-visibility-toggled', (_l: LayersPage, _visible: boolean) => ctx.toggleObjectsVisibility())
}

/** What the Selected page's actions drive. */
export interface SelectedPageWiring {
  openObjectDefinition(defId: string): void
  /** Dispatch the undoable RemoveObjectCommand and refresh the placement list. */
  removePlacement(placementId: string): void
}

export function wireSelectedPage(page: SelectedPage, ctx: SelectedPageWiring): void {
  page.connect('object-open-requested', (_p: SelectedPage, defId: string) => ctx.openObjectDefinition(defId))
  page.connect('object-remove-requested', (_p: SelectedPage, placementId: string) => ctx.removePlacement(placementId))
}
