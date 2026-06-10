import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'

import Template from './props-tab.blp'

/**
 * Plain-data description of a scene's properties, fed into
 * {@link PropsTab.setScene}.
 */
export interface ScenePropsDescriptor {
  name?: string
  cols?: number
  rows?: number
  tilePx?: number
  music?: string
  battleBg?: string
  encounters?: string
  onEnter?: string
}

/**
 * The placement shown in the "Selected object" group, fed into
 * {@link PropsTab.setSelectedObject}.
 */
export interface SelectedObjectDescriptor {
  /** Placement id (unique within the map). */
  placementId: string
  /** Resolved definition display name. */
  name: string
  /** Library definition id — `null` for an inline definition. */
  defId: string | null
  tileX: number
  tileY: number
  layerId: string
}

/**
 * Inspector's "Props" tab — a vertical list of `Adw.EntryRow` /
 * `Adw.ActionRow`s for the active scene's metadata, topped by a
 * "Selected object" group (visible while a placement is selected via
 * the select tool or the Objects tab) offering per-placement actions:
 * edit-in-library + remove-from-map.
 *
 * Writes are emitted as `prop-changed::<key, value>` for the parent
 * inspector to relay into the project model; object actions as
 * `object-open-requested::<defId>` / `object-remove-requested::<id>`.
 */
export class PropsTab extends Adw.Bin {
  declare _name_row: Adw.EntryRow
  declare _size_row: Adw.ActionRow
  declare _tile_size_row: Adw.ActionRow
  declare _music_row: Adw.EntryRow
  declare _battle_bg_row: Adw.EntryRow
  declare _encounters_row: Adw.ActionRow
  declare _on_enter_row: Adw.ActionRow
  declare _object_group: Adw.PreferencesGroup
  declare _object_def_row: Adw.ActionRow
  declare _object_position_row: Adw.ActionRow
  declare _object_remove_row: Adw.ActionRow
  declare _object_open_button: Gtk.Button

  private _scene: ScenePropsDescriptor = {}
  private _selectedObject: SelectedObjectDescriptor | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgPropsTab',
        Template,
        InternalChildren: [
          'name_row',
          'size_row',
          'tile_size_row',
          'music_row',
          'battle_bg_row',
          'encounters_row',
          'on_enter_row',
          'object_group',
          'object_def_row',
          'object_position_row',
          'object_remove_row',
          'object_open_button',
        ],
        Properties: {
          'size-text': GObject.ParamSpec.string(
            'size-text',
            'Size Text',
            'Formatted size subtitle',
            GObject.ParamFlags.READABLE,
            '',
          ),
          'tile-size-text': GObject.ParamSpec.string(
            'tile-size-text',
            'Tile Size Text',
            'Formatted tile-size subtitle',
            GObject.ParamFlags.READABLE,
            '',
          ),
          'encounters-text': GObject.ParamSpec.string(
            'encounters-text',
            'Encounters Text',
            'Encounters subtitle',
            GObject.ParamFlags.READABLE,
            '',
          ),
          'on-enter-text': GObject.ParamSpec.string(
            'on-enter-text',
            'On Enter Text',
            'On-enter subtitle',
            GObject.ParamFlags.READABLE,
            '',
          ),
        },
        Signals: {
          'prop-changed': { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING] },
          // "Edit in library" on the selected object (defId).
          'object-open-requested': { param_types: [GObject.TYPE_STRING] },
          // "Remove from map" on the selected object (placementId).
          'object-remove-requested': { param_types: [GObject.TYPE_STRING] },
        },
      },
      PropsTab,
    )
  }

  constructor() {
    super()
    this._name_row.connect('changed', () => this.emit('prop-changed', 'name', this._name_row.get_text()))
    this._music_row.connect('changed', () => this.emit('prop-changed', 'music', this._music_row.get_text()))
    this._battle_bg_row.connect('changed', () => this.emit('prop-changed', 'battleBg', this._battle_bg_row.get_text()))
    this._object_open_button.connect('clicked', () => {
      if (this._selectedObject?.defId) this.emit('object-open-requested', this._selectedObject.defId)
    })
    this._object_remove_row.connect('activated', () => {
      if (this._selectedObject) this.emit('object-remove-requested', this._selectedObject.placementId)
    })
  }

  /**
   * Show (descriptor) or hide (`null`) the "Selected object" group.
   * Driven by the host from the engine's `PLACEMENT_SELECTED` event +
   * the Objects-tab row selection.
   */
  setSelectedObject(desc: SelectedObjectDescriptor | null): void {
    this._selectedObject = desc
    this._object_group.set_visible(!!desc)
    if (!desc) return
    this._object_def_row.set_title(desc.name)
    this._object_def_row.set_subtitle(desc.defId ?? 'inline')
    this._object_open_button.set_visible(!!desc.defId)
    this._object_position_row.set_subtitle(`(${desc.tileX}, ${desc.tileY}) · ${desc.layerId}`)
  }

  setScene(scene: ScenePropsDescriptor): void {
    this._scene = { ...scene }
    this._name_row.set_text(scene.name ?? '')
    this._music_row.set_text(scene.music ?? '')
    this._battle_bg_row.set_text(scene.battleBg ?? '')
    this.notify('size-text')
    this.notify('tile-size-text')
    this.notify('encounters-text')
    this.notify('on-enter-text')
  }

  get sizeText(): string {
    const cols = this._scene?.cols
    const rows = this._scene?.rows
    return cols && rows ? `${cols} × ${rows} tiles` : '—'
  }

  get tileSizeText(): string {
    const tilePx = this._scene?.tilePx
    return tilePx ? `${tilePx}px` : '—'
  }

  get encountersText(): string {
    return this._scene?.encounters || '—'
  }

  get onEnterText(): string {
    return this._scene?.onEnter || '—'
  }
}

GObject.type_ensure(PropsTab.$gtype)
