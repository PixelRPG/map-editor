import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterAnimationRole, CharacterDefinition } from '@pixelrpg/engine'
import type { GdkSpriteSetResource } from '../../sprite/index.ts'

import Template from './character-preview.blp'

type DirectionRole = 'up' | 'down' | 'left' | 'right'

/**
 * Animated preview of a {@link CharacterDefinition}'s sprite. Plays the
 * `walk-<dir>` animation for the currently-selected direction (default:
 * `down`), driven by a JS interval keyed off `durationMs`. Direction-pad
 * buttons switch which role is showing.
 *
 * Drives a `Gtk.Picture` by swapping its paintable on each frame tick.
 * The sprite source is a {@link GdkSpriteSetResource} — passed in by
 * the host (`CastView`) once the project has loaded.
 */
export class CharacterPreview extends Adw.Bin {
  declare _picture: Gtk.Picture
  declare _frame: Gtk.Frame
  declare _btn_up: Gtk.ToggleButton
  declare _btn_down: Gtk.ToggleButton
  declare _btn_left: Gtk.ToggleButton
  declare _btn_right: Gtk.ToggleButton

  private _character: CharacterDefinition | null = null
  private _spriteSet: GdkSpriteSetResource | null = null
  private _activeDirection: DirectionRole = 'down'
  private _frameIndex = 0
  private _timeoutId = 0
  private _roleLabel = ''

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgCharacterPreview',
        Template,
        InternalChildren: ['picture', 'frame', 'btn_up', 'btn_down', 'btn_left', 'btn_right'],
        Properties: {
          'role-label': GObject.ParamSpec.string(
            'role-label',
            'Role Label',
            'Caption shown under the preview',
            GObject.ParamFlags.READWRITE,
            '',
          ),
        },
      },
      CharacterPreview,
    )
  }

  constructor() {
    super()
    this._wireDirectionPad()
    this._setActive('down', /* skipRestart */ true)
  }

  get roleLabel(): string {
    // Defensive `?? ''`: GTK4 calls this getter during template
    // `_instance_init` (before the TS constructor body runs class
    // field initialisers), so `_roleLabel` is briefly `undefined` —
    // GObject then refuses the value because the ParamSpec is typed
    // as string ("Wrong type undefined; string expected"). Matches
    // the pattern in `mode-rail.ts` / `context-chip.ts`.
    return this._roleLabel ?? ''
  }

  set roleLabel(value: string) {
    if (this._roleLabel === value) return
    this._roleLabel = value
    this.notify('role-label')
  }

  /**
   * Show this character. Restarts playback from frame 0 of the
   * current direction's walk animation. Pass `null` to clear.
   */
  setCharacter(character: CharacterDefinition | null, spriteSet: GdkSpriteSetResource | null): void {
    this._character = character
    this._spriteSet = spriteSet
    this._frameIndex = 0
    this._restart()
  }

  /** Force a specific direction (down/up/left/right). */
  setDirection(dir: DirectionRole): void {
    this._setActive(dir, false)
  }

  vfunc_unmap(): void {
    this._stopTimer()
    super.vfunc_unmap()
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._restart()
  }

  private _wireDirectionPad(): void {
    this._btn_up.connect('toggled', () => {
      if (this._btn_up.active) this._setActive('up', false)
    })
    this._btn_down.connect('toggled', () => {
      if (this._btn_down.active) this._setActive('down', false)
    })
    this._btn_left.connect('toggled', () => {
      if (this._btn_left.active) this._setActive('left', false)
    })
    this._btn_right.connect('toggled', () => {
      if (this._btn_right.active) this._setActive('right', false)
    })
  }

  private _setActive(dir: DirectionRole, skipRestart: boolean): void {
    this._activeDirection = dir
    this._frameIndex = 0
    // Manage toggle states so only one is shown active. Block signals
    // during the bulk update so we don't loop back into `_setActive`.
    this._btn_up.set_active(dir === 'up')
    this._btn_down.set_active(dir === 'down')
    this._btn_left.set_active(dir === 'left')
    this._btn_right.set_active(dir === 'right')
    this.roleLabel = `walk-${dir}`
    if (!skipRestart) this._restart()
  }

  private _restart(): void {
    this._stopTimer()
    this._applyFrame()
    this._scheduleNext()
  }

  private _stopTimer(): void {
    if (this._timeoutId !== 0) {
      GLib.Source.remove(this._timeoutId)
      this._timeoutId = 0
    }
  }

  private _activeAnimation(): CharacterAnimation | null {
    if (!this._character) return null
    const role = `walk-${this._activeDirection}` as CharacterAnimationRole
    const fallback = `idle-${this._activeDirection}` as CharacterAnimationRole
    return (
      this._character.animations.find((a) => a.id === role) ??
      this._character.animations.find((a) => a.id === fallback) ??
      null
    )
  }

  private _applyFrame(): void {
    const anim = this._activeAnimation()
    if (!anim || anim.frames.length === 0 || !this._spriteSet) {
      this._picture.set_paintable(null)
      return
    }
    const spriteId = anim.frames[this._frameIndex % anim.frames.length]
    const sprite = this._spriteSet.getSprite(spriteId)
    const paintable = sprite?.createPaintable() ?? null
    this._picture.set_paintable(paintable)
  }

  private _scheduleNext(): void {
    const anim = this._activeAnimation()
    if (!anim || anim.frames.length <= 1) return
    const duration = Math.max(50, anim.durationMs)
    this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
      this._frameIndex = (this._frameIndex + 1) % anim.frames.length
      this._applyFrame()
      // Keep firing as long as we have frames.
      return GLib.SOURCE_CONTINUE
    })
  }
}

GObject.type_ensure(CharacterPreview.$gtype)
