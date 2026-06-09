import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterDefinition } from '@pixelrpg/engine'

import Template from './cast-inspector.blp'

/** A sprite sheet the character can be assigned to. */
export interface CastSheetChoice {
  id: string
  name: string
}

/**
 * Right-pane inspector for the Cast view. Shows the selected
 * character's metadata + the selected animation's duration. Edits
 * are emitted as signals — the host applies the mutation against
 * the project data, then calls `setCharacter` / `setAnimation`
 * again to re-render.
 *
 * Phase-3 minimum: name, isPlayer toggle, speed (tiles/sec) for the
 * character; per-animation duration for the selected animation.
 * Frame editing + custom-animation creation come in subsequent
 * polish passes.
 */
export class CastInspector extends Adw.Bin {
  declare _props_group: Adw.PreferencesGroup
  declare _duration_group: Adw.PreferencesGroup
  declare _name_row: Adw.EntryRow
  declare _sheet_row: Adw.ComboRow
  declare _player_row: Adw.SwitchRow
  declare _speed_row: Adw.SpinRow
  declare _selected_anim_row: Adw.ActionRow
  declare _duration_row: Adw.SpinRow

  private _character: CharacterDefinition | null = null
  private _animation: CharacterAnimation | null = null
  /** Set during host-driven refresh so input changes don't loop back. */
  private _silentUpdate = false
  private _sheetIds: string[] = []
  private _sheetModel = new Gtk.StringList()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgCastInspector',
        Template,
        InternalChildren: [
          'props_group',
          'duration_group',
          'name_row',
          'sheet_row',
          'player_row',
          'speed_row',
          'selected_anim_row',
          'duration_row',
        ],
        Signals: {
          'name-changed': { param_types: [GObject.TYPE_STRING] },
          'player-changed': { param_types: [GObject.TYPE_BOOLEAN] },
          'speed-changed': { param_types: [GObject.TYPE_INT] },
          'duration-changed': { param_types: [GObject.TYPE_INT] },
          'sheet-changed': { param_types: [GObject.TYPE_STRING] },
        },
      },
      CastInspector,
    )
  }

  constructor() {
    super()
    this._sheet_row.set_model(this._sheetModel)
    this._wire()
  }

  /**
   * `'character'` shows the identity group (name/sheet/player/speed) +
   * hides the animation-duration group; `'sheet'` does the inverse. Lets
   * the one widget serve both the Character detail and the Sprite-sheet
   * detail.
   */
  setMode(mode: 'character' | 'sheet'): void {
    this._props_group.set_visible(mode === 'character')
    this._duration_group.set_visible(mode === 'sheet')
  }

  /** Populate the sheet picker + select the character's current sheet. */
  setSheets(choices: CastSheetChoice[], selectedId: string | null): void {
    this._sheetIds = choices.map((c) => c.id)
    this._silentUpdate = true
    try {
      this._sheetModel.splice(
        0,
        this._sheetModel.get_n_items(),
        choices.map((c) => c.name),
      )
      const idx = selectedId ? this._sheetIds.indexOf(selectedId) : -1
      if (idx >= 0) this._sheet_row.set_selected(idx)
    } finally {
      this._silentUpdate = false
    }
  }

  setCharacter(character: CharacterDefinition | null): void {
    this._character = character
    this._silentUpdate = true
    try {
      if (character) {
        this._name_row.set_text(character.name)
        this._player_row.set_active(character.isPlayer === true)
        this._speed_row.set_value(character.speedTilesPerSec ?? 6)
      } else {
        this._name_row.set_text('')
        this._player_row.set_active(false)
        this._speed_row.set_value(6)
      }
    } finally {
      this._silentUpdate = false
    }
  }

  setAnimation(animation: CharacterAnimation | null): void {
    this._animation = animation
    this._silentUpdate = true
    try {
      if (animation) {
        this._selected_anim_row.set_subtitle(animation.id)
        this._duration_row.set_value(animation.durationMs)
        this._duration_row.set_sensitive(true)
      } else {
        this._selected_anim_row.set_subtitle('(none selected)')
        this._duration_row.set_value(200)
        this._duration_row.set_sensitive(false)
      }
    } finally {
      this._silentUpdate = false
    }
  }

  private _wire(): void {
    this._name_row.connect('changed', () => {
      if (this._silentUpdate) return
      this.emit('name-changed', this._name_row.get_text())
    })
    this._player_row.connect('notify::active', () => {
      if (this._silentUpdate) return
      this.emit('player-changed', this._player_row.get_active())
    })
    this._speed_row.connect('notify::value', () => {
      if (this._silentUpdate) return
      this.emit('speed-changed', Math.round(this._speed_row.get_value()))
    })
    this._sheet_row.connect('notify::selected', () => {
      if (this._silentUpdate) return
      const idx = this._sheet_row.get_selected()
      const id = idx >= 0 && idx < this._sheetIds.length ? this._sheetIds[idx] : null
      if (id) this.emit('sheet-changed', id)
    })
    this._duration_row.connect('notify::value', () => {
      if (this._silentUpdate) return
      this.emit('duration-changed', Math.round(this._duration_row.get_value()))
    })
    // Initial — no character yet means duration row is disabled.
    this._duration_row.set_sensitive(false)
  }
}

GObject.type_ensure(CastInspector.$gtype)
