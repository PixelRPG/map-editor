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
  /** Re-point the Brush page's sheet at another of the scene's tilesets. */
  selectTileset(spriteSetId: string): void
  /**
   * Open the ground-brush dialog on the tileset the Graphics detail
   * shows. `''` lands on the brush list, `'new'` on the preset picker,
   * any other string on that brush id.
   */
  editTerrains(target: string): void
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

  // The Brush page's tileset chips activate this; the window owns the
  // project and resolves the set's `firstGid` from the map's references.
  const selectTileset = Gio.SimpleAction.new('select-tileset', GLib.VariantType.new('s'))
  selectTileset.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (id) ctx.selectTileset(id)
  })
  addAction(group, selectTileset)

  // The "Ground brushes" row activates this rather than calling the
  // view directly, so the dialog has the same reach as every other
  // Graphics surface: a keyboard path, and a Control caller (the
  // in-app assistant, the screenshot driver) that can open it without
  // a pointer. The parameter is a deep link into the dialog's pages —
  // "make me a ground brush" should not land the asker on a list they
  // then have to tap through. It always acts on the tileset the detail
  // pane already shows, and does nothing when that is none.
  const editTerrains = Gio.SimpleAction.new('edit-terrains', GLib.VariantType.new('s'))
  editTerrains.connect('activate', (_a, parameter) => {
    if (!ctx.hasProject()) {
      ctx.showToast(_('Open a project first'))
      return
    }
    ctx.editTerrains(parameter?.get_string()[0] ?? '')
  })
  addAction(group, editTerrains)
}
