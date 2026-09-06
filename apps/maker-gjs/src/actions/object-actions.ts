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
  createFromTemplate(templateId: string): void
  focusObject(id: string): void
  /** Promote a world object into the Cast roster, or demote it back. */
  toggleCastMember(id: string): void
}

/**
 * Entity-library navigation. The in-view paths are the "+" template
 * chooser and the Things detail's "Character" switch; these are their
 * driveable forms. Each one lands on the Library's Things chip first.
 */
export function installObjectActions(group: Gio.SimpleActionGroup, ctx: ObjectActionsContext): void {
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
}
