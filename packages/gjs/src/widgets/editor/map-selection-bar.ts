import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'

import { mapCaption } from './map-caption.ts'
import { buildMapContextMenu } from './map-menu.ts'
import type { MapSelectionFacts } from './map-summary.model.ts'

import Template from './map-selection-bar.blp'

function sameFacts(a: MapSelectionFacts | null, b: MapSelectionFacts | null): boolean {
  if (a === null || b === null) return a === b
  return a.cols === b.cols && a.rows === b.rows && a.doors === b.doors && a.things === b.things
}

/**
 * The selected map's name, its facts and what can be done with it —
 * the OSD bar that replaced the atlas's right-hand scene inspector
 * (REDESIGN.md § 4.2 / § 5.4).
 *
 * Two instances share this class: the atlas overlay's own (bottom
 * centre, `floating`) and the one in the window's bottom bar on phone
 * widths, where an OSD pill inside a bar would be a pill in a pill.
 * Both are fed by {@link setMap} from the same selection, and every
 * verb is a stateless `win.*` action reading the current selection —
 * so the bar carries no state beyond what it displays.
 *
 * The facts come in pre-counted from the GTK-free
 * `map-summary.model.ts`; the formatting lives here because plural
 * forms need gettext, which that model must stay free of.
 */
export class MapSelectionBar extends Adw.Bin {
  private _name = ''
  private _facts: MapSelectionFacts | null = null
  private _floating = true
  private _fullView = false

  declare _bar_box: Gtk.Box
  declare _menu_button: Gtk.MenuButton

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgMapSelectionBar',
        Template,
        Properties: {
          'map-name': GObject.ParamSpec.string(
            'map-name',
            'Map Name',
            'Display name of the selected map',
            GObject.ParamFlags.READABLE,
            '',
          ),
          'map-details': GObject.ParamSpec.string(
            'map-details',
            'Map Details',
            'Formatted size, door and thing counts of the selected map',
            GObject.ParamFlags.READABLE,
            '',
          ),
          'has-details': GObject.ParamSpec.boolean(
            'has-details',
            'Has Details',
            'Whether the detail caption has anything to say',
            GObject.ParamFlags.READABLE,
            false,
          ),
          revealed: GObject.ParamSpec.boolean(
            'revealed',
            'Revealed',
            'Whether a map is selected and the bar has content',
            GObject.ParamFlags.READABLE,
            false,
          ),
          floating: GObject.ParamSpec.boolean(
            'floating',
            'Floating',
            'Draw as an OSD pill (canvas overlay) rather than plain (bottom bar)',
            GObject.ParamFlags.READWRITE,
            true,
          ),
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Whether the caption may mention the thing count (Full view only)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        InternalChildren: ['bar_box', 'menu_button'],
      },
      MapSelectionBar,
    )
  }

  constructor() {
    super()
    this._menu_button.set_menu_model(buildMapContextMenu())
  }

  /**
   * Show a map, or hide the bar when `facts` is `null`. Clicking the
   * atlas backdrop pans and does not deselect, so in practice the bar
   * goes up on the first selection and stays up until the project
   * changes.
   */
  setMap(name: string | null, facts: MapSelectionFacts | null): void {
    const nextName = name ?? ''
    // Compared field by field, not by reference: every caller builds a
    // fresh facts object, so an identity check would never dedupe and
    // each selection refresh would re-measure the labels.
    if (this._name === nextName && sameFacts(this._facts, facts)) return
    const wasRevealed = this.revealed
    this._name = nextName
    this._facts = facts
    this.notify('map-name')
    this._notifyDetails()
    if (this.revealed !== wasRevealed) this.notify('revealed')
  }

  get mapName(): string {
    return this._name
  }

  get mapDetails(): string {
    return this._facts ? mapCaption(this._facts, { things: this._fullView }) : ''
  }

  get hasDetails(): boolean {
    return this.mapDetails.length > 0
  }

  get revealed(): boolean {
    return this._facts !== null
  }

  get floating(): boolean {
    return this._floating ?? true
  }

  /**
   * The pill classes live on the box, not the template, so the phone
   * instance can drop them — mirrors `FloatingZoom.compact`.
   */
  set floating(value: boolean) {
    if (this._floating === value) return
    this._floating = value
    for (const cls of ['toolbar', 'osd']) {
      if (value) this._bar_box.add_css_class(cls)
      else this._bar_box.remove_css_class(cls)
    }
    this.notify('floating')
  }

  get fullView(): boolean {
    return this._fullView ?? false
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this.notify('full-view')
    this._notifyDetails()
  }

  private _notifyDetails(): void {
    this.notify('map-details')
    this.notify('has-details')
  }
}

GObject.type_ensure(MapSelectionBar.$gtype)
