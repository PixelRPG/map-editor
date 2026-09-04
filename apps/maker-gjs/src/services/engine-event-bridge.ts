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
   */
  adoptPickedTile(globalTileId: number): void
  /**
   * Mirror a canvas selection into the inspector's Objects tab. A hit
   * also reveals the inspector (project-wide policy in
   * `docs/concepts/responsive-chrome.md`); an empty-tile click leaves it
   * alone, since there is nothing to show.
   */
  selectPlacement(placementId: string | null): void
  setLayerFlag(layerId: string, flag: 'visible' | 'locked', value: boolean): void
}

/**
 * Forward the {@link EngineController}'s events into the window's UI.
 *
 * The runtime event-script effects (`show-text`, `item-picked-up`,
 * `flag-set`, `play-sfx`) surface as toasts so the user can verify their
 * events without a console; they fire in runtime mode only. A real
 * dialogue box / inventory / audio layer is future work (see TODO.md).
 */
export function wireEngineEvents(engine: EngineController, ctx: EngineEventBridgeContext): void {
  engine.on('zoom-changed', (zoom) => ctx.setZoom(zoom))
  engine.on('pointer-tile-changed', ({ tileX, tileY }) => ctx.setCursorTile(tileX, tileY))
  engine.on('undo-changed', ({ canUndo, canRedo }) => ctx.setHistoryEnabled(canUndo, canRedo))
  engine.on('tile-picked', ({ globalTileId }) => ctx.adoptPickedTile(globalTileId))
  engine.on('placement-selected', ({ placementId }) => ctx.selectPlacement(placementId))
  engine.on('layer-flag-changed', ({ layerId, flag, value }) => ctx.setLayerFlag(layerId, flag, value))
  engine.on('show-text', ({ text, speaker }) => ctx.showToast(speaker ? `${speaker}: ${text}` : text))
  engine.on('item-picked-up', ({ itemId, qty }) => ctx.showToast(qty > 1 ? `Got ${qty}× ${itemId}` : `Got ${itemId}`))
  engine.on('flag-set', ({ flag, value }) => ctx.showToast(`Flag "${flag}" = ${String(value)}`))
  engine.on('play-sfx', ({ sound }) => ctx.showToast(`Play sound: ${sound}`))
}
