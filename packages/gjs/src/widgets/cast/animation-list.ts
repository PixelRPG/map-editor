import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { type CharacterAnimation, type CharacterDefinition, REQUIRED_ROLES } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import Template from './animation-list.blp'

/**
 * Rendered list of a character's {@link CharacterAnimation}s. Each row
 * shows the animation id (e.g. `walk-down`), a frame-count + duration
 * suffix, and a status icon — checkmark for required-and-filled, alert
 * for required-and-empty, star for custom.
 *
 * Activating a row emits `animation-selected::<id>`. Adding a new
 * custom animation emits `add-animation-requested`. The host handles
 * the actual mutation; this widget is presentational.
 */
export class AnimationList extends Adw.Bin {
  declare _group: Adw.PreferencesGroup
  declare _add_button: Gtk.Button

  private _character: CharacterDefinition | null = null
  private _rowsById = new Map<string, Adw.ActionRow>()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgAnimationList',
        Template,
        InternalChildren: ['group', 'add_button'],
        Signals: {
          'animation-selected': { param_types: [GObject.TYPE_STRING] },
          'add-animation-requested': {},
        },
      },
      AnimationList,
    )
  }

  constructor() {
    super()
    this._add_button.connect('clicked', () => {
      this.emit('add-animation-requested')
    })
  }

  setCharacter(character: CharacterDefinition | null): void {
    this._character = character
    this._rebuild()
  }

  /** Refresh after the host mutated the underlying character (frames, duration changed). */
  refresh(): void {
    this._rebuild()
  }

  private _rebuild(): void {
    // Remove all existing rows. Adw.PreferencesGroup exposes a remove() on each
    // child via the standard GTK4 child management.
    for (const row of this._rowsById.values()) {
      this._group.remove(row)
    }
    this._rowsById.clear()

    if (!this._character) return

    // Required roles first (sorted by canonical order), then custom anims
    // alphabetically.
    const present = new Map(this._character.animations.map((a) => [a.id, a]))
    const requiredOrdered = REQUIRED_ROLES.map((role) => ({
      role,
      anim: present.get(role) ?? null,
    }))
    const customAnims = this._character.animations
      .filter((a) => !REQUIRED_ROLES.includes(a.id as (typeof REQUIRED_ROLES)[number]))
      .sort((a, b) => a.id.localeCompare(b.id))

    for (const { role, anim } of requiredOrdered) {
      const row = this._buildRow(role, anim, /* isCustom */ false)
      this._group.add(row)
      this._rowsById.set(role, row)
    }
    for (const anim of customAnims) {
      const row = this._buildRow(anim.id, anim, /* isCustom */ true)
      this._group.add(row)
      this._rowsById.set(anim.id, row)
    }
  }

  private _buildRow(id: string, anim: CharacterAnimation | null, isCustom: boolean): Adw.ActionRow {
    const row = new Adw.ActionRow({
      title: id,
      activatable: true,
    })

    let iconName: string
    let iconClass: string
    if (anim && anim.frames.length > 0) {
      iconName = isCustom ? 'starred-symbolic' : 'object-select-symbolic'
      iconClass = isCustom ? 'accent' : 'success'
    } else {
      iconName = 'dialog-warning-symbolic'
      iconClass = 'warning'
    }

    const prefix = new Gtk.Image({ iconName, pixelSize: 16 })
    prefix.add_css_class(iconClass)
    row.add_prefix(prefix)

    if (anim) {
      const subtitle =
        anim.frames.length === 0
          ? _('No frames')
          : `${anim.frames.length} ${anim.frames.length === 1 ? _('frame') : _('frames')} · ${anim.durationMs} ms`
      row.set_subtitle(subtitle)
    } else {
      row.set_subtitle(_('Not configured'))
    }

    // No `go-next-symbolic` chevron on the row suffix. The chevron
    // reads as "navigate to a sub-page" but activating a row here
    // only selects the animation for inline editing in the right
    // inspector — there's no sub-page to navigate to. Removing it
    // until a real frame / timeline editor lands (tracked in
    // `TODO.md` under "Cast / Character editor polish") avoids
    // promising an affordance the UI doesn't deliver.

    row.connect('activated', () => {
      this.emit('animation-selected', id)
    })

    return row
  }
}

GObject.type_ensure(AnimationList.$gtype)
