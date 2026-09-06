import Adw from '@girs/adw-1'
import Gtk from '@girs/gtk-4.0'
import { type EntityDefinition, isCharacterEntity } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'
import type { EntityTemplate } from '../../services/entity-templates.ts'

/**
 * One gallery row. Things is the GENERAL lens, so it lists characters
 * too — flagged with a person icon + a "Character" badge to make clear
 * they are also on the Characters page (edited nicely over there).
 */
export function buildObjectRow(object: EntityDefinition, onActivate: () => void): Adw.ActionRow {
  const isCharacter = isCharacterEntity(object)
  const row = new Adw.ActionRow({ title: object.name || object.id, activatable: true })
  const icon = isCharacter ? 'avatar-default-symbolic' : (object.editorData?.icon ?? 'view-grid-symbolic')
  row.add_prefix(new Gtk.Image({ iconName: icon }))
  if (isCharacter) {
    row.add_suffix(
      new Gtk.Label({ label: _('Character'), valign: Gtk.Align.CENTER, cssClasses: ['caption', 'accent'] }),
    )
  }
  row.add_suffix(new Gtk.Image({ iconName: 'go-next-symbolic', cssClasses: ['dim-label'] }))
  row.connect('activated', onActivate)
  return row
}

/** The template archetypes the empty state offers as one-click tiles. */
const EMPTY_STATE_TEMPLATE_IDS = ['chest', 'sign', 'door', 'trigger']

/** Fill the empty state's relationship diagram: Graphics → Characters → Things. */
export function buildRelationshipDiagram(slot: Gtk.Box): void {
  // msgids stay literal here so extraction sees them.
  const chips: Array<[string, string, boolean]> = [
    [_('Graphics'), _('art'), false],
    [_('Characters'), _('who'), false],
    [_('Things'), _('placed on maps'), true],
  ]
  chips.forEach(([title, sub, accent], i) => {
    if (i > 0) {
      slot.append(
        new Gtk.Image({
          iconName: 'go-next-symbolic',
          cssClasses: ['dim-label'],
          valign: Gtk.Align.CENTER,
          marginStart: 8,
          marginEnd: 8,
        }),
      )
    }
    const chip = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      cssClasses: accent ? ['card', 'objects-rel-chip', 'objects-rel-accent'] : ['card', 'objects-rel-chip'],
    })
    chip.append(new Gtk.Label({ label: title, cssClasses: accent ? ['heading', 'accent'] : ['heading'] }))
    chip.append(new Gtk.Label({ label: sub, cssClasses: ['caption', 'dim-label'] }))
    slot.append(chip)
  })
}

/**
 * Fill the empty state's template tiles. They reuse the same creation
 * path as the "+" template chooser.
 */
export function buildTemplateTiles(
  slot: Gtk.FlowBox,
  templates: readonly EntityTemplate[],
  onPick: (templateId: string) => void,
): void {
  for (const id of EMPTY_STATE_TEMPLATE_IDS) {
    const template = templates.find((t) => t.id === id)
    if (!template) continue
    const button = new Gtk.Button({ cssClasses: ['flat', 'objects-template-tile'] })
    const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 })
    row.append(new Gtk.Image({ iconName: template.icon }))
    row.append(new Gtk.Label({ label: template.label }))
    button.set_child(row)
    button.connect('clicked', () => onPick(template.id))
    slot.append(button)
  }
}
