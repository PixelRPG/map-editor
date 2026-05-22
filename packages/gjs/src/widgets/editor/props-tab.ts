import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'

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
 * Inspector's "Props" tab — a vertical list of `Adw.EntryRow` /
 * `Adw.ActionRow`s for the active scene's metadata.
 *
 * Writes are emitted as `prop-changed::<key, value>` for the parent
 * inspector to relay into the project model.
 */
export class PropsTab extends Adw.Bin {
  declare _name_row: Adw.EntryRow
  declare _size_row: Adw.ActionRow
  declare _tile_size_row: Adw.ActionRow
  declare _music_row: Adw.EntryRow
  declare _battle_bg_row: Adw.EntryRow
  declare _encounters_row: Adw.ActionRow
  declare _on_enter_row: Adw.ActionRow

  private _scene: ScenePropsDescriptor = {}

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
