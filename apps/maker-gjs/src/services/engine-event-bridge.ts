import type { EngineController } from './engine-controller.ts'

/** Where each engine event lands in the window's UI. */
export interface EngineEventBridgeContext {
  showToast(message: string): void
  /** Mirror engine-driven zoom (scroll-wheel, Ctrl+= etc.) into the OSD label. */
  setZoom(zoom: number): void
  /** The `12, 7`-style tile readout next to the zoom buttons. */
  setCursorTile(tileX: number | null, tileY: number | null): void
  setHistoryEnabled(canUndo: boolean, canRedo: boolean): void
  /**
   * Adopt an eyedropper pick: route the global tile id back through the
   * palette so highlight + context chip + `ActiveTileComponent` stay in
   * lock-step, then arm the pencil for a Tiled-style "pick → paint".
   *
   * `terrainId` is set when the cell was laid by a terrain brush. The
   * engine reports both and the host decides (TERRAIN.md § 7.1): picking
   * grass that a brush drew should hand back the BRUSH, because the one
   * sprite under the finger is an edge piece — painting with it alone is
   * never what the person meant.
   */
  adoptPickedTile(globalTileId: number, terrainId?: string): void
  /**
   * Mirror a canvas selection into the inspector's Selected page. A hit
   * also reveals the inspector (project-wide policy in
   * `docs/concepts/responsive-chrome.md`); an empty-tile click leaves it
   * alone, since there is nothing to show.
   */
  selectPlacement(placementId: string | null): void
  /**
   * Open the placement context menu at a canvas position (widget-local
   * pixels), after a long press. The selection the menu acts on is
   * already set by the preceding `selectPlacement`.
   */
  requestPlacementContext(screenX: number, screenY: number): void
  /**
   * A one-shot move resolved. `moved: false` means the guard chain
   * refused it (padlocked layer, off-map tile, same tile) — the arming
   * is spent either way, so the user has to be told rather than left
   * tapping.
   */
  placementMoved(placementId: string, moved: boolean): void
  /**
   * A tap answered § 6.2's pick mode: `coords` on `targetMapId` is
   * where the door `doorPlacementId` on `sourceMapId` arrives. The
   * window hands it to `DoorTargetFlow`, which owns both edits and the
   * trip back to the door's own map.
   */
  arrivalPicked(request: {
    sourceMapId: string
    doorPlacementId: string
    targetMapId: string
    coords: { x: number; y: number }
  }): void
  setLayerFlag(layerId: string, flag: 'visible' | 'locked', value: boolean): void
  /** Re-read the active map's layer list into the Layers page (add / reorder / change of plane, any path). */
  refreshLayers(): void
  /**
   * The engine is now showing a different map than the window thinks.
   * Only a mid-run teleport gets here — every other map switch starts
   * in the window, which has already told the engine.
   */
  mapLoaded(mapId: string): void
  /**
   * The person touched the canvas themselves. The window stops
   * following whoever it was following — taking the wheel back is how
   * you leave a mode you never explicitly entered the way out of.
   */
  pointerInput(): void
  /** A flag changed during a run — the shared live state re-reads. */
  flagSet(): void
}

/**
 * Forward the {@link EngineController}'s events into the window's UI.
 *
 * The runtime event-script effects (`item-picked-up`, `flag-set`,
 * `play-sfx`) surface as toasts so the user can verify their events
 * without a console; they fire in runtime mode only. `show-text` is not
 * among them: the engine draws its own in-game text box. An inventory /
 * audio layer is future work (see TODO.md).
 */
export function wireEngineEvents(engine: EngineController, ctx: EngineEventBridgeContext): void {
  engine.on('zoom-changed', (zoom) => ctx.setZoom(zoom))
  engine.on('pointer-tile-changed', ({ tileX, tileY }) => ctx.setCursorTile(tileX, tileY))
  engine.on('undo-changed', ({ canUndo, canRedo }) => ctx.setHistoryEnabled(canUndo, canRedo))
  engine.on('tile-picked', ({ globalTileId, terrainId }) => ctx.adoptPickedTile(globalTileId, terrainId))
  engine.on('placement-selected', ({ placementId }) => ctx.selectPlacement(placementId))
  engine.on('placement-context', ({ screenPos }) => ctx.requestPlacementContext(screenPos.x, screenPos.y))
  engine.on('placement-moved', ({ placementId, moved }) => ctx.placementMoved(placementId, moved))
  engine.on('arrival-picked', (request) => ctx.arrivalPicked(request))
  engine.on('layer-flag-changed', ({ layerId, flag, value }) => ctx.setLayerFlag(layerId, flag, value))
  engine.on('layer-list-changed', () => ctx.refreshLayers())
  engine.on('map-loaded', ({ mapId }) => ctx.mapLoaded(mapId))
  engine.on('item-picked-up', ({ itemId, qty }) => ctx.showToast(qty > 1 ? `Got ${qty}× ${itemId}` : `Got ${itemId}`))
  engine.on('flag-set', ({ flag, value }) => {
    ctx.showToast(`Flag "${flag}" = ${String(value)}`)
    ctx.flagSet()
  })
  engine.on('play-sfx', ({ sound }) => ctx.showToast(`Play sound: ${sound}`))
  engine.on('pointer-input', () => ctx.pointerInput())
}
