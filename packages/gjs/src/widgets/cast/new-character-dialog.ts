import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

import type { GdkSpriteSetResource } from '../../sprite/index.ts'

import Template from './new-character-dialog.blp'

/** A sprite set the user can assign to a character. */
export interface SpriteSetChoice {
  id: string
  name: string
}

/** The user's answers, handed to the host on "Create". */
export interface NewCharacterDraft {
  name: string
  kind: 'hero' | 'npc'
  isPlayer: boolean
  spriteSetId: string
  speedTilesPerSec: number
}

/**
 * Dialog for creating a new {@link CharacterDefinition}. Collects the
 * name, type (hero / NPC), whether it's the player, the sprite set, and
 * the movement speed. The sprite set can be one already in the project
 * or freshly imported via {@link SpriteSetImportDialog} (reached through
 * the "+" button — the host opens the import dialog and feeds the result
 * back with {@link addSpriteSet}).
 *
 * Presentation-only: it emits a {@link NewCharacterDraft} on "Create";
 * the host (cast controller) generates the id, seeds the required
 * directional animations, enforces single-player, and persists. The
 * required-animation seeding lives there so id-uniqueness logic stays
 * with the data owner — mirrors how {@link AddAnimationDialog} hands the
 * controller a plain `CharacterAnimation`.
 *
 * `spriteset-activated` fires whenever the selection changes; the host
 * loads a preview asynchronously and pushes it back via {@link setPreview}.
 */
export class NewCharacterDialog extends Adw.Dialog {
  declare _cancel_button: Gtk.Button
  declare _create_button: Gtk.Button
  declare _name_row: Adw.EntryRow
  declare _kind_row: Adw.ComboRow
  declare _player_row: Adw.SwitchRow
  declare _spriteset_row: Adw.ComboRow
  declare _import_button: Gtk.Button
  declare _speed_row: Adw.SpinRow
  declare _preview_picture: Gtk.Picture

  private _spriteSetIds: string[] = []
  private _spriteSetModel = new Gtk.StringList()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgNewCharacterDialog',
        Template,
        InternalChildren: [
          'cancel_button',
          'create_button',
          'name_row',
          'kind_row',
          'player_row',
          'spriteset_row',
          'import_button',
          'speed_row',
          'preview_picture',
        ],
        Signals: {
          'character-created': { param_types: [GObject.TYPE_JSOBJECT] },
          'import-spriteset-requested': {},
          'spriteset-activated': { param_types: [GObject.TYPE_STRING] },
        },
      },
      NewCharacterDialog,
    )
  }

  constructor() {
    super()
    this._spriteset_row.set_model(this._spriteSetModel)
    this._wire()
    this._refreshKindDependants()
    this._refreshValidity()
  }

  /** Replace the list of sprite sets (and select the first). */
  setSpriteSets(choices: SpriteSetChoice[]): void {
    this._spriteSetIds = choices.map((c) => c.id)
    this._spriteSetModel.splice(
      0,
      this._spriteSetModel.get_n_items(),
      choices.map((c) => c.name),
    )
    if (choices.length > 0) this._spriteset_row.set_selected(0)
    this._refreshValidity()
    this._emitActivated()
  }

  /** Append a freshly-imported sprite set and select it. */
  addSpriteSet(choice: SpriteSetChoice): void {
    this._spriteSetIds.push(choice.id)
    this._spriteSetModel.append(choice.name)
    this._spriteset_row.set_selected(this._spriteSetIds.length - 1)
    this._refreshValidity()
    this._emitActivated()
  }

  /** Show the active sprite set's first sprite as the character preview. */
  setPreview(spriteSet: GdkSpriteSetResource | null): void {
    const paintable = spriteSet?.getSprite(0)?.createPaintable({ keepAspectRatio: true }) ?? null
    this._preview_picture.set_paintable(paintable)
  }

  private _wire(): void {
    this._cancel_button.connect('clicked', () => this.close())
    this._create_button.connect('clicked', () => {
      const draft = this._buildDraft()
      if (!draft) return
      this.emit('character-created', draft)
      this.close()
    })
    this._import_button.connect('clicked', () => this.emit('import-spriteset-requested'))
    this._name_row.connect('changed', () => this._refreshValidity())
    this._kind_row.connect('notify::selected', () => this._refreshKindDependants())
    this._spriteset_row.connect('notify::selected', () => {
      this._refreshValidity()
      this._emitActivated()
    })
  }

  /** NPCs can't be the player — force the switch off + disable it for them. */
  private _refreshKindDependants(): void {
    const isHero = this._kind_row.get_selected() === 0
    this._player_row.set_sensitive(isHero)
    if (!isHero) this._player_row.set_active(false)
  }

  private _selectedSpriteSetId(): string | null {
    const idx = this._spriteset_row.get_selected()
    if (idx < 0 || idx >= this._spriteSetIds.length) return null
    return this._spriteSetIds[idx]
  }

  private _emitActivated(): void {
    const id = this._selectedSpriteSetId()
    if (id) this.emit('spriteset-activated', id)
  }

  private _refreshValidity(): void {
    const hasName = this._name_row.get_text().trim().length > 0
    const hasSpriteSet = this._selectedSpriteSetId() !== null
    this._create_button.set_sensitive(hasName && hasSpriteSet)
  }

  private _buildDraft(): NewCharacterDraft | null {
    const name = this._name_row.get_text().trim()
    const spriteSetId = this._selectedSpriteSetId()
    if (!name || !spriteSetId) return null
    const kind = this._kind_row.get_selected() === 0 ? 'hero' : 'npc'
    return {
      name,
      kind,
      isPlayer: kind === 'hero' && this._player_row.get_active(),
      spriteSetId,
      speedTilesPerSec: Math.round(this._speed_row.get_value()),
    }
  }
}

GObject.type_ensure(NewCharacterDialog.$gtype)
