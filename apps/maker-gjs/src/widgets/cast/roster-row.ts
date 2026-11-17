import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { CharacterDefinition } from '@pixelrpg/engine'
import { CharacterPreview, type GdkSpriteSetResource, type PeerMarker, PeerDots } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import Template from './roster-row.blp'

// Force registration so the blueprint's `$PixelRpgCharacterPreview` ref
// resolves when this template is parsed.
GObject.type_ensure(CharacterPreview.$gtype)

/**
 * One row of the Cast roster. Carries the character id the list selection
 * resolves back to; it has no affordances of its own — the view attaches
 * a right-click / long-press context menu with `win.delete-character`.
 */
export class CastRosterRow extends Gtk.ListBoxRow {
  declare _avatar: CharacterPreview
  declare _peers_slot: Gtk.Box

  /** Built on the first non-empty {@link setPeers} — see there. */
  private _peerDots: PeerDots | null = null
  private _characterId = ''
  private _characterName = ''
  private _roleLabel = ''
  private _player = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'CastRosterRow',
        Template,
        InternalChildren: ['avatar', 'peers_slot'],
        Properties: {
          'character-id': GObject.ParamSpec.string(
            'character-id',
            'Character Id',
            'Stable id of the character this row stands for',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'character-name': GObject.ParamSpec.string(
            'character-name',
            'Character Name',
            'Display name shown as the row heading',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'role-label': GObject.ParamSpec.string(
            'role-label',
            'Role Label',
            'Translated hero / NPC caption under the name',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          player: GObject.ParamSpec.boolean(
            'player',
            'Player',
            'Whether this character is the project’s player character',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      CastRosterRow,
    )
  }

  constructor(character: CharacterDefinition, spriteSet: GdkSpriteSetResource | null) {
    super()
    this.characterId = character.id
    this.characterName = character.name
    this.roleLabel = character.kind === 'hero' ? _('Hero') : _('NPC')
    this.player = character.isPlayer === true
    this._avatar.setCharacter(character, spriteSet)
  }

  /**
   * Show who is editing this character, as dots before the Player
   * badge. Built on first use so a solo cast allocates nothing per row.
   */
  setPeers(peers: readonly PeerMarker[]): void {
    if (!this._peerDots) {
      if (peers.length === 0) return
      this._peerDots = new PeerDots()
      this._peers_slot.append(this._peerDots)
    }
    this._peerDots.setPeers(peers)
  }

  get characterId(): string {
    return this._characterId ?? ''
  }

  set characterId(value: string) {
    if (this._characterId === value) return
    this._characterId = value
    this.notify('character-id')
  }

  get characterName(): string {
    return this._characterName ?? ''
  }

  set characterName(value: string) {
    if (this._characterName === value) return
    this._characterName = value
    this.notify('character-name')
  }

  get roleLabel(): string {
    return this._roleLabel ?? ''
  }

  set roleLabel(value: string) {
    if (this._roleLabel === value) return
    this._roleLabel = value
    this.notify('role-label')
  }

  get player(): boolean {
    return this._player ?? false
  }

  set player(value: boolean) {
    if (this._player === value) return
    this._player = value
    this.notify('player')
  }
}

GObject.type_ensure(CastRosterRow.$gtype)
