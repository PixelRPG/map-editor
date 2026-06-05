import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterAnimationRole, CharacterDefinition } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import type { GdkSpriteSetResource } from '../../sprite/index.ts'

import Template from './character-preview.blp'

type DirectionRole = 'up' | 'down' | 'left' | 'right'
type AnimationKind = 'walk' | 'idle'

const ANIMATION_ID_PATTERN = /^(walk|idle)-(up|down|left|right)$/

/**
 * Animated preview of a {@link CharacterDefinition}'s sprite. Plays the
 * `<kind>-<direction>` animation for the currently-selected direction
 * (default: `walk-down`), driven by a JS interval keyed off
 * `durationMs`. Four direction-pad buttons set the facing, a fifth
 * Pause toggle flips the kind between `walk` and `idle` — so the same
 * arrow stays selected while the character switches from walking to
 * standing still.
 *
 * Two-way state binding with the surrounding cast view:
 *
 * - User input on the pad / pause writes through to the read-only
 *   `active-animation-id` GObject property; the cast view's
 *   `notify::active-animation-id` listener highlights the matching
 *   row in `AnimationList` and updates the inspector.
 * - The cast view can drive the preview the other way via
 *   {@link setActiveAnimation} (called when the user picks a row in
 *   the animation list). The method parses the id back into
 *   direction + kind and synchronises the buttons; idempotent on
 *   no-change to keep the round-trip loop-free.
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
  declare _btn_pause: Gtk.ToggleButton

  private _character: CharacterDefinition | null = null
  private _spriteSet: GdkSpriteSetResource | null = null
  private _activeDirection: DirectionRole = 'down'
  private _paused = false
  private _frameIndex = 0
  private _timeoutId = 0
  private _roleLabel = ''
  private _frameSize = 160

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgCharacterPreview',
        Template,
        InternalChildren: ['picture', 'frame', 'btn_up', 'btn_down', 'btn_left', 'btn_right', 'btn_pause'],
        Properties: {
          'role-label': GObject.ParamSpec.string(
            'role-label',
            'Role Label',
            'Caption shown under the preview (mirrors `active-animation-id`)',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          // Inner-frame edge length in pixels. Bound from the
          // template so cast-view's BreakpointBin can grow the
          // preview at desktop widths (160 mobile, 240 desktop).
          'frame-size': GObject.ParamSpec.int(
            'frame-size',
            'Frame size',
            'Width + height of the square preview frame in pixels',
            GObject.ParamFlags.READWRITE,
            64,
            512,
            160,
          ),
          // Pause flips the active animation kind between `walk-<dir>`
          // (moving) and `idle-<dir>` (still). Direction stays the
          // same — same arrow stays toggled. Read-write so the
          // bound BLP button can sync, and so callers can force the
          // state programmatically without going through
          // `setActiveAnimation`.
          paused: GObject.ParamSpec.boolean(
            'paused',
            'Paused',
            'Whether the preview shows the idle pose (vs. the walk cycle) for the active direction',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          // Derived read-only string: `${kind}-${direction}` where
          // kind ∈ {walk, idle} and direction ∈ {up, down, left, right}.
          // Notify fires on every direction or paused mutation, so
          // listeners can drive a single signal subscription
          // regardless of which input changed.
          'active-animation-id': GObject.ParamSpec.string(
            'active-animation-id',
            'Active Animation ID',
            'Computed `${kind}-${direction}` id of the currently-previewed animation',
            GObject.ParamFlags.READABLE,
            'walk-down',
          ),
        },
      },
      CharacterPreview,
    )
  }

  constructor() {
    super()
    this._wireDirectionPad()
    this._wirePauseToggle()
    this._setActive('down', /* skipRestart */ true)
  }

  get roleLabel(): string {
    // Defensive `?? ''`: GTK4 calls this getter during template
    // `_instance_init` (before the TS constructor body runs class
    // field initialisers), so `_roleLabel` is briefly `undefined` —
    // GObject then refuses the value because the ParamSpec is typed
    // as string ("Wrong type undefined; string expected"). Matches
    // the pattern in `mode-rail.ts` / `floating-top-bar.ts`.
    return this._roleLabel ?? ''
  }

  set roleLabel(value: string) {
    if (this._roleLabel === value) return
    this._roleLabel = value
    this.notify('role-label')
  }

  get frameSize(): number {
    return this._frameSize ?? 160
  }

  set frameSize(value: number) {
    if (this._frameSize === value) return
    this._frameSize = value
    this.notify('frame-size')
  }

  get paused(): boolean {
    return this._paused ?? false
  }

  set paused(value: boolean) {
    if (this._paused === value) return
    this._paused = value
    this._btn_pause?.set_active(value)
    this._refreshDirectionTooltips()
    this._frameIndex = 0
    this._publishAnimationState()
    this._restart()
  }

  /** Derived `${kind}-${direction}` id, kept in sync via the property notify. */
  get activeAnimationId(): string {
    const kind: AnimationKind = this._paused ? 'idle' : 'walk'
    return `${kind}-${this._activeDirection}`
  }

  /**
   * Show this character. Restarts playback from frame 0 of the
   * current direction's active animation. Pass `null` to clear.
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

  /**
   * Drive the preview from an animation id (`walk-up`, `idle-down`,
   * …) — used by the cast view when the animation-list row is
   * activated. Silently no-ops on unrecognised ids (e.g. custom
   * animations not in the walk/idle × direction matrix) so the
   * preview keeps its existing state rather than blanking.
   *
   * Idempotent: no notify / restart when the parsed direction +
   * kind already match the current state. This is what keeps the
   * `list-selected → preview-notify → list-highlight` round trip
   * from looping; the second pass sees no change and exits early.
   */
  setActiveAnimation(animId: string): void {
    const match = ANIMATION_ID_PATTERN.exec(animId)
    if (!match) return
    const [, kind, dir] = match as unknown as [string, AnimationKind, DirectionRole]
    const wantPaused = kind === 'idle'
    const directionChanged = this._activeDirection !== dir
    const pausedChanged = this._paused !== wantPaused
    if (!directionChanged && !pausedChanged) return

    if (pausedChanged) {
      this._paused = wantPaused
      this._btn_pause?.set_active(wantPaused)
      this._refreshDirectionTooltips()
    }
    if (directionChanged) {
      // `_setActive` handles button toggles + frame reset + restart +
      // animation-id publish. When only the kind changed, fall back
      // to `_publishAnimationState` + `_restart` ourselves.
      this._setActive(dir, false)
    } else {
      this._frameIndex = 0
      this._publishAnimationState()
      this._restart()
    }
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

  private _wirePauseToggle(): void {
    this._btn_pause.connect('toggled', () => {
      this.paused = this._btn_pause.get_active()
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
    this._refreshDirectionTooltips()
    this._publishAnimationState()
    if (!skipRestart) this._restart()
  }

  private _publishAnimationState(): void {
    this.roleLabel = this.activeAnimationId
    this.notify('active-animation-id')
    this.notify('paused')
  }

  /**
   * Swap the four direction tooltips between "Walk <dir>" and
   * "Idle <dir>" so the visible affordance matches whatever the
   * paused state will produce when the user clicks an arrow.
   */
  private _refreshDirectionTooltips(): void {
    if (this._paused) {
      this._btn_up.set_tooltip_text(_('Idle up'))
      this._btn_down.set_tooltip_text(_('Idle down'))
      this._btn_left.set_tooltip_text(_('Idle left'))
      this._btn_right.set_tooltip_text(_('Idle right'))
    } else {
      this._btn_up.set_tooltip_text(_('Walk up'))
      this._btn_down.set_tooltip_text(_('Walk down'))
      this._btn_left.set_tooltip_text(_('Walk left'))
      this._btn_right.set_tooltip_text(_('Walk right'))
    }
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

  /**
   * Resolve the animation to play for the current direction + paused
   * state. Falls back across the kind boundary so a character with
   * only walk frames (no idle, or vice versa) still previews — better
   * to show something than blank the picture.
   */
  private _activeAnimation(): CharacterAnimation | null {
    if (!this._character) return null
    const primaryKind: AnimationKind = this._paused ? 'idle' : 'walk'
    const fallbackKind: AnimationKind = primaryKind === 'idle' ? 'walk' : 'idle'
    const primary = `${primaryKind}-${this._activeDirection}` as CharacterAnimationRole
    const fallback = `${fallbackKind}-${this._activeDirection}` as CharacterAnimationRole
    return (
      this._character.animations.find((a) => a.id === primary) ??
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
    // Single-sprite display → opt in to aspect-preserving snapshot. The
    // sprite-set's character cells are tall (e.g. scientist is 16×32),
    // but the frame is square — without this the snapshot stretches
    // the sprite horizontally and the character looks squashed (see
    // the `keepAspectRatio` note on `GdkSpritePaintable`).
    const paintable = sprite?.createPaintable({ keepAspectRatio: true }) ?? null
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
