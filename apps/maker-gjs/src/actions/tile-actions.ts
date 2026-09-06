import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { gettext as _ } from 'gettext'
import { addAction } from './action-registry.ts'

/** What the Graphics (tilesets + appearances) actions need from the window. */
export interface TileActionsContext {
  hasProject(): boolean
  showToast(message: string): void
  /** Show the Library on its Graphics chip. */
  showGraphics(): void
  presentAppearanceImport(): void
  presentTilesetImport(): void
  focusTileset(id: string): void
  focusAppearance(id: string): void
  /** Re-point the Tiles-tab palette at another of the scene's tilesets. */
  switchTileset(): void
}

/**
 * Graphics actions. Tilesets and appearances (character sprite sheets)
 * are both raw sprite-set assets and share this one page; animation
 * authoring for an appearance lives in the Characters matrix.
 */
export function installTileActions(group: Gio.SimpleActionGroup, ctx: TileActionsContext): void {
  const newSpriteSet = new Gio.SimpleAction({ name: 'new-spriteset' })
  newSpriteSet.connect('activate', () => {
    if (!ctx.hasProject()) {
      ctx.showToast(_('Open a project first'))
      return
    }
    ctx.showGraphics()
    ctx.presentAppearanceImport()
  })
  addAction(group, newSpriteSet)

  const newTileset = new Gio.SimpleAction({ name: 'new-tileset' })
  newTileset.connect('activate', () => {
    if (!ctx.hasProject()) {
      ctx.showToast(_('Open a project first'))
      return
    }
    ctx.presentTilesetImport()
  })
  addAction(group, newTileset)

  const openTileset = Gio.SimpleAction.new('open-tileset', GLib.VariantType.new('s'))
  openTileset.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (id) ctx.focusTileset(id)
  })
  addAction(group, openTileset)

  // The asset-management counterpart of `win.edit-appearance`: select the
  // appearance's card and show its glance.
  const openAppearance = Gio.SimpleAction.new('open-appearance', GLib.VariantType.new('s'))
  openAppearance.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (!id) return
    ctx.showGraphics()
    ctx.focusAppearance(id)
  })
  addAction(group, openAppearance)

  const switchTileset = new Gio.SimpleAction({ name: 'switch-tileset' })
  switchTileset.connect('activate', () => ctx.switchTileset())
  addAction(group, switchTileset)
}
