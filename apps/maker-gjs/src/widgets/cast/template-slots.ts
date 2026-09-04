import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

/** NPC archetypes offered as "Add from template" quick-create slots. */
export const NPC_TEMPLATES = ['Villager', 'Guard', 'Merchant', 'Child'] as const

/**
 * Fill the roster's "Add from template" flow box with one quick-create
 * button per archetype. `onPick` receives the translated archetype name,
 * which seeds the new-character dialog.
 */
export function attachTemplateSlots(flowBox: Gtk.FlowBox, onPick: (name: string) => void): void {
  for (const name of NPC_TEMPLATES) {
    const label = _(name)
    const button = new Gtk.Button({ cssClasses: ['flat', 'card', 'cast-template-slot'] })
    const inner = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 8,
      marginTop: 8,
      marginBottom: 8,
      marginStart: 10,
      marginEnd: 10,
    })
    inner.append(new Gtk.Image({ iconName: 'list-add-symbolic' }))
    inner.append(new Gtk.Label({ label, halign: Gtk.Align.START, hexpand: true }))
    button.set_child(inner)
    button.connect('clicked', () => {
      onPick(label)
    })
    flowBox.append(button)
  }
}
