import type { LayersTab, ObjectsTab, PropsTab, TilesTab } from '@pixelrpg/gjs'

/**
 * Inspector → top-bar + engine wiring, one function per tab.
 *
 * These connect once per view lifetime: the inspector tabs persist across
 * scene switches, so re-connecting in `vfunc_map` would double-fire.
 */

/** What the Tiles tab's picks drive. */
export interface TilesTabWiring {
  /** Whether the Object tool is armed — a tile pick then falls back to pencil. */
  isObjectToolActive(): boolean
  armPencilTool(): void
  setActiveTile(tileId: number): void
  armObjectBrush(defId: string): void
}

export function wireTilesTab(tab: TilesTab, ctx: TilesTabWiring): void {
  tab.connect('tile-selected', (_t: TilesTab, tileId: number) => {
    // Picking a tile while the Object tool is armed means "paint this
    // tile" — switch back to the pencil, the mirror of an object pick
    // arming the Object tool.
    if (ctx.isObjectToolActive()) ctx.armPencilTool()
    ctx.setActiveTile(tileId)
  })
  // Picking what to place arms the brush AND the Object tool in one step,
  // just like picking a tile arms the pencil's active tile.
  tab.connect('object-brush-selected', (_t: TilesTab, defId: string) => ctx.armObjectBrush(defId))
}

/** What the Layers tab's toggles drive. */
export interface LayersTabWiring {
  setActiveLayer(layerId: string): void
  setLayerVisible(layerId: string, visible: boolean): void
  setLayerLocked(layerId: string, locked: boolean): void
  persistMapData(): void
  toggleObjectsVisibility(): void
}

/**
 * The flag toggles only dispatch + persist: the engine turns them into
 * undoable, collab-synced commands and echoes `LAYER_FLAG_CHANGED` back,
 * which is the single owner of the view's layer cache. Writing the cache
 * here too would be the parallel state AGENTS.md forbids.
 */
export function wireLayersTab(tab: LayersTab, ctx: LayersTabWiring): void {
  tab.connect('layer-selected', (_l: LayersTab, id: string) => ctx.setActiveLayer(id))
  tab.connect('layer-visibility-toggled', (_l: LayersTab, layerId: string, visible: boolean) => {
    ctx.setLayerVisible(layerId, visible)
    ctx.persistMapData()
  })
  tab.connect('layer-lock-toggled', (_l: LayersTab, layerId: string, locked: boolean) => {
    ctx.setLayerLocked(layerId, locked)
    ctx.persistMapData()
  })
  // The pinned "Objects" pseudo-row is pure view state like grid/dim —
  // not persisted. Activating the stateful action with no parameter
  // toggles it, matching the row's already-flipped state.
  tab.connect('objects-visibility-toggled', (_l: LayersTab, _visible: boolean) => ctx.toggleObjectsVisibility())
}

/** What an Objects-tab row selection drives. */
export interface ObjectsTabWiring {
  /**
   * Select the placement in the engine's session singleton, sync the Props
   * tab, and pan the canvas to it. Single-select for now — marquee rides
   * the same component once a selection tool lands.
   */
  selectPlacement(placementId: string): void
}

export function wireObjectsTab(tab: ObjectsTab, ctx: ObjectsTabWiring): void {
  tab.connect('object-selected', (_o: ObjectsTab, placementId: string) => ctx.selectPlacement(placementId))
}

/** What the Props tab's selected-object actions drive. */
export interface PropsTabWiring {
  openObjectDefinition(defId: string): void
  /** Dispatch the undoable RemoveObjectCommand and refresh the placement list. */
  removePlacement(placementId: string): void
}

export function wirePropsTab(tab: PropsTab, ctx: PropsTabWiring): void {
  tab.connect('object-open-requested', (_p: PropsTab, defId: string) => ctx.openObjectDefinition(defId))
  tab.connect('object-remove-requested', (_p: PropsTab, placementId: string) => ctx.removePlacement(placementId))
}
