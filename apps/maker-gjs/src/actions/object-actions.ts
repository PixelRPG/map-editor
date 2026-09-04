import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { gettext as _ } from 'gettext'

/** What the entity-library actions need from the window. */
export interface ObjectActionsContext {
  hasProject(): boolean
  showToast(message: string): void
  showObjectsView(): void
  createFromTemplate(templateId: string): void
  focusObject(id: string): void
  /** Promote a world object into the Cast roster, or demote it back. */
  toggleCastMember(id: string): void
}

/**
 * Entity-library navigation. The in-view paths are the "New object"
 * template chooser and the Objects detail's "Cast member" switch; these
 * are their driveable forms.
 */
export function installObjectActions(group: Gio.SimpleActionGroup, ctx: ObjectActionsContext): void {
  const newObject = Gio.SimpleAction.new('new-object', GLib.VariantType.new('s'))
  newObject.connect('activate', (_a, parameter) => {
    if (!ctx.hasProject()) {
      ctx.showToast(_('Open a project first'))
      return
    }
    ctx.showObjectsView()
    ctx.createFromTemplate(parameter?.get_string()[0] || 'npc')
  })
  group.add_action(newObject)

  const openObject = Gio.SimpleAction.new('open-object', GLib.VariantType.new('s'))
  openObject.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (!id) return
    ctx.showObjectsView()
    ctx.focusObject(id)
  })
  group.add_action(openObject)

  const toggleObjectCast = Gio.SimpleAction.new('toggle-object-cast', GLib.VariantType.new('s'))
  toggleObjectCast.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (id) ctx.toggleCastMember(id)
  })
  group.add_action(toggleObjectCast)
}
