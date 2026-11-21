import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { gettext as _ } from 'gettext'
import { addAction } from './action-registry.ts'

/** What the Characters actions need from the window. */
export interface CastActionsContext {
  hasProject(): boolean
  showToast(message: string): void
  /** Show the Library on its Characters chip. */
  showCharacters(): void
  presentNewCharacter(): void
  focusCharacter(id: string): void
  /** Select the first character wearing `sheetId`; `false` when none does. */
  focusCharacterBySheet(sheetId: string): boolean
  /** Open the Add-animation dialog; `false` when there is no target character. */
  presentNewAnimation(sheetId?: string): boolean
  /** Open an animation cell's "⋯" menu on the active character; `false` when it has none. */
  showAnimationMenu(animId: string): boolean
  /** Delete a character; empty id means the selected one. Undo rides the toast. */
  deleteCharacter(id?: string): void
  /** The scene the editor is on, or `null` when none is open. */
  currentSceneId(): string | null
  openScene(sceneId: string): void
  /** Arm an entity as the object brush (via `win.set-object-brush`). */
  armObjectBrush(defId: string): void
}

/**
 * Characters actions. The in-UI paths are the row clicks; these are
 * their driveable equivalents so the MCP bridge and scripts reach the
 * same flows. Each one lands on the Library's Characters chip first.
 */
export function installCastActions(group: Gio.SimpleActionGroup, ctx: CastActionsContext): void {
  const newCharacter = new Gio.SimpleAction({ name: 'new-character' })
  newCharacter.connect('activate', () => {
    if (!ctx.hasProject()) {
      ctx.showToast(_('Open a project first'))
      return
    }
    ctx.presentNewCharacter()
  })
  addAction(group, newCharacter)

  const openCharacter = Gio.SimpleAction.new('open-character', GLib.VariantType.new('s'))
  openCharacter.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (!id) return
    ctx.showCharacters()
    ctx.focusCharacter(id)
  })
  addAction(group, openCharacter)

  // "Place on map" from the Cast detail: characters live in the entity
  // library, so the character id IS the brush id.
  const placeCharacter = Gio.SimpleAction.new('place-character', GLib.VariantType.new('s'))
  placeCharacter.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (!id) return
    const sceneId = ctx.currentSceneId()
    if (!sceneId) {
      ctx.showToast(_('Open a map first to place a character'))
      return
    }
    ctx.openScene(sceneId)
    ctx.armObjectBrush(id)
  })
  addAction(group, placeCharacter)

  // The Characters matrix is where animations are authored; Graphics only
  // manages appearances as raw assets and links here.
  const editAppearance = Gio.SimpleAction.new('edit-appearance', GLib.VariantType.new('s'))
  editAppearance.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (!id) return
    ctx.showCharacters()
    if (!ctx.focusCharacterBySheet(id)) {
      ctx.showToast(_('No character wears this appearance yet — give it to a character to edit its animations'))
    }
  })
  addAction(group, editAppearance)

  // Optional string id targets the character wearing that appearance;
  // empty targets the active one.
  const newAnimation = Gio.SimpleAction.new('new-animation', GLib.VariantType.new('s'))
  newAnimation.connect('activate', (_a, parameter) => {
    if (!ctx.hasProject()) {
      ctx.showToast(_('Open a project first'))
      return
    }
    ctx.showCharacters()
    if (!ctx.presentNewAnimation(parameter?.get_string()[0] || undefined)) {
      ctx.showToast(_('Select or create a character first to add an animation'))
    }
  })
  addAction(group, newAnimation)

  // Driveable twin of tapping a cell's "⋯": scripts and the MCP bridge reach
  // the menu without a pointer.
  const showAnimationMenu = Gio.SimpleAction.new('show-animation-menu', GLib.VariantType.new('s'))
  showAnimationMenu.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (!id) return
    ctx.showCharacters()
    if (!ctx.showAnimationMenu(id)) ctx.showToast(_('That animation has no pictures yet'))
  })
  addAction(group, showAnimationMenu)

  // Empty target deletes the selected character, so one menu model serves
  // both the detail "⋯" and a row's context menu. No confirmation dialog:
  // the toast's Undo is the way back.
  const deleteCharacter = Gio.SimpleAction.new('delete-character', GLib.VariantType.new('s'))
  deleteCharacter.connect('activate', (_a, parameter) => {
    if (!ctx.hasProject()) {
      ctx.showToast(_('Open a project first'))
      return
    }
    ctx.showCharacters()
    ctx.deleteCharacter(parameter?.get_string()[0] || undefined)
  })
  addAction(group, deleteCharacter)
}
