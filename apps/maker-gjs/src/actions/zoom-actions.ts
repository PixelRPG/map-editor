import Gio from '@girs/gio-2.0'

/** One click of the zoom pill. */
const ZOOM_STEP = 0.2

/** What the zoom actions need from the window. */
export interface ZoomActionsContext {
  /** The atlas reuses the scene editor's zoom pill for its card previews. */
  targetsAtlas(): boolean
  stepAtlasZoom(delta: number): void
  resetAtlasZoom(): void
  fitAtlas(): void
  stepEngineZoom(delta: number): void
  resetEngineZoom(): void
}

/**
 * View-contextual zoom: on the atlas these drive the global card-preview
 * zoom, everywhere else the engine camera.
 */
export function installZoomActions(group: Gio.SimpleActionGroup, ctx: ZoomActionsContext): void {
  const zoomIn = new Gio.SimpleAction({ name: 'zoom-in' })
  zoomIn.connect('activate', () =>
    ctx.targetsAtlas() ? ctx.stepAtlasZoom(+ZOOM_STEP) : ctx.stepEngineZoom(+ZOOM_STEP),
  )
  group.add_action(zoomIn)

  const zoomOut = new Gio.SimpleAction({ name: 'zoom-out' })
  zoomOut.connect('activate', () =>
    ctx.targetsAtlas() ? ctx.stepAtlasZoom(-ZOOM_STEP) : ctx.stepEngineZoom(-ZOOM_STEP),
  )
  group.add_action(zoomOut)

  const zoomReset = new Gio.SimpleAction({ name: 'zoom-reset' })
  zoomReset.connect('activate', () => (ctx.targetsAtlas() ? ctx.resetAtlasZoom() : ctx.resetEngineZoom()))
  group.add_action(zoomReset)

  // Only meaningful on the atlas; the guard keeps the shared bare-`0`
  // accelerator harmless everywhere else.
  const atlasFit = new Gio.SimpleAction({ name: 'atlas-fit' })
  atlasFit.connect('activate', () => {
    if (ctx.targetsAtlas()) ctx.fitAtlas()
  })
  group.add_action(atlasFit)
}
