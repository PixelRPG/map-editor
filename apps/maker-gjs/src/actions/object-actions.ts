import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { gettext as _ } from 'gettext'
import { addAction } from './action-registry.ts'

/** What the entity-library actions need from the window. */
export interface ObjectActionsContext {
  hasProject(): boolean
  showToast(message: string): void
  /** Show the Library on its Things chip. */
  showThings(): void
  /** Open the two-page "New thing" dialog. */
  presentNewThing(): void
  createFromTemplate(templateId: string): void
  focusObject(id: string): void
  /** Promote a world object into the Cast roster, or demote it back. */
  toggleCastMember(id: string): void
  /** Delete a thing; empty id means the selected one. Undo rides the toast. */
  deleteThing(id?: string): void
  /** The scene the editor is on, or `null` when none is open. */
  currentSceneId(): string | null
  openScene(sceneId: string): void
  /** Arm an entity as the object brush (via `win.set-object-brush`). */
  armObjectBrush(defId: string): void
}

/**
 * Entity-library navigation. The in-view paths are the "New thing"
 * dialog, the detail's "Place on map" pill and its "Character" switch;
 * these are their driveable forms. Each one lands on the Library's
 * Things chip first.
 */
export function installObjectActions(group: Gio.SimpleActionGroup, ctx: ObjectActionsContext): void {
  // The "New thing" row's action: opens the template chooser. The
  // parameterless mirror of `win.new-character`; `new-object` below is
  // the one that skips the dialog and seeds a template straight away.
  const newThing = new Gio.SimpleAction({ name: 'new-thing' })
  newThing.connect('activate', () => {
    if (!ctx.hasProject()) {
      ctx.showToast(_('Open a project first'))
      return
    }
    ctx.showThings()
    ctx.presentNewThing()
  })
  addAction(group, newThing)

  const newObject = Gio.SimpleAction.new('new-object', GLib.VariantType.new('s'))
  newObject.connect('activate', (_a, parameter) => {
    if (!ctx.hasProject()) {
      ctx.showToast(_('Open a project first'))
      return
    }
    ctx.showThings()
    ctx.createFromTemplate(parameter?.get_string()[0] || 'npc')
  })
  addAction(group, newObject)

  const openObject = Gio.SimpleAction.new('open-object', GLib.VariantType.new('s'))
  openObject.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (!id) return
    ctx.showThings()
    ctx.focusObject(id)
  })
  addAction(group, openObject)

  const toggleObjectCast = Gio.SimpleAction.new('toggle-object-cast', GLib.VariantType.new('s'))
  toggleObjectCast.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (id) ctx.toggleCastMember(id)
  })
  addAction(group, toggleObjectCast)

  // "Place on map" from the Things detail — the mirror of
  // `place-character`: things live in the entity library too, so the
  // thing's id IS the brush id.
  const placeThing = Gio.SimpleAction.new('place-thing', GLib.VariantType.new('s'))
  placeThing.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (!id) return
    const sceneId = ctx.currentSceneId()
    if (!sceneId) {
      ctx.showToast(_('Open a map first to place a thing'))
      return
    }
    ctx.openScene(sceneId)
    ctx.armObjectBrush(id)
  })
  addAction(group, placeThing)

  // Empty target deletes the selected thing, so one menu model serves both
  // the detail "⋯" and a row's context menu. No confirmation dialog: the
  // toast's Undo is the way back.
  const deleteThing = Gio.SimpleAction.new('delete-thing', GLib.VariantType.new('s'))
  deleteThing.connect('activate', (_a, parameter) => {
    if (!ctx.hasProject()) {
      ctx.showToast(_('Open a project first'))
      return
    }
    ctx.showThings()
    ctx.deleteThing(parameter?.get_string()[0] || undefined)
  })
  addAction(group, deleteThing)
}
