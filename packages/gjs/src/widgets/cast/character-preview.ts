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

/** Auto-cycle dwell time per direction (ms) — ~2 walk loops before turning. */
const DIRECTION_CYCLE_MS = 1600

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
  /**
   * When non-null, the preview plays this animation id directly
   * instead of deriving one from direction + paused. Set by
   * `setActiveAnimation` when handed an id outside the
   * walk-/idle- × direction matrix (custom user-defined animations
   * like `sword-swing`). Any direction-pad / pause-toggle click
   * exits custom mode and resumes the walk/idle lookup.
   */
  private _customAnimationId: string | null = null
  private _frameIndex = 0
  private _timeoutId = 0
  private _cycleTimeoutId = 0
  private _roleLabel = ''
  private _frameSize = 160
  private _showControls = true
  private _autoCycle = false
  private _highlighted = true

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
          // "Showcase" knobs — let the SAME widget serve the detail-page
          // editor (controls on, manual) and the overview cards +
          // quick-view (controls off, auto-cycling, animate-when-active).
          'show-controls': GObject.ParamSpec.boolean(
            'show-controls',
            'Show Controls',
            'Whether the direction pad + pause + role label are shown',
            GObject.ParamFlags.READWRITE,
            true,
          ),
          'auto-cycle': GObject.ParamSpec.boolean(
            'auto-cycle',
            'Auto-cycle',
            'Rotate the walk direction over time (down → left → up → right) while highlighted',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          // Gates whether the preview animates at all. When false it
          // shows a single static frame (no timers); the gallery sets it
          // true for the selected / hovered card so only that one moves.
          highlighted: GObject.ParamSpec.boolean(
            'highlighted',
            'Highlighted',
            'Whether the preview animates (vs. shows a static frame)',
            GObject.ParamFlags.READWRITE,
            true,
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

  get showControls(): boolean {
    return this._showControls ?? true
  }

  set showControls(value: boolean) {
    if (this._showControls === value) return
    this._showControls = value
    this.notify('show-controls')
  }

  get autoCycle(): boolean {
    return this._autoCycle ?? false
  }

  set autoCycle(value: boolean) {
    if (this._autoCycle === value) return
    this._autoCycle = value
    this.notify('auto-cycle')
    this._restart()
  }

  get highlighted(): boolean {
    return this._highlighted ?? true
  }

  set highlighted(value: boolean) {
    if (this._highlighted === value) return
    this._highlighted = value
    // Going static resets to a consistent facing-down pose so idle cards
    // line up; going active restarts the walk (+ auto-cycle) from there.
    if (!value) {
      this._activeDirection = 'down'
      this._frameIndex = 0
    }
    this.notify('highlighted')
    this._restart()
  }

  /** Imperative alias for the `highlighted` property (gallery contract). */
  setHighlighted(highlighted: boolean): void {
    this.highlighted = highlighted
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

  /**
   * Derived id of whatever the preview is currently playing. In
   * normal mode that's `${kind}-${direction}` (walk-down,
   * idle-left, …); in custom mode it's the user-defined animation
   * id picked from the animation list (`sword-swing`, etc.).
   */
  get activeAnimationId(): string {
    if (this._customAnimationId !== null) return this._customAnimationId
    const kind: AnimationKind = this._paused ? 'idle' : 'walk'
    return `${kind}-${this._activeDirection}`
  }

  /**
   * Show this character. Restarts playback from frame 0 of the
   * current direction's active animation. Pass `null` to clear.
   *
   * Drops custom-animation mode — the previous character's custom
   * ids aren't guaranteed to exist on the new one, so reverting to
   * walk-/idle- on the active direction gives a sane preview on
   * any character.
   */
  setCharacter(character: CharacterDefinition | null, spriteSet: GdkSpriteSetResource | null): void {
    this._character = character
    this._spriteSet = spriteSet
    this._frameIndex = 0
    if (this._customAnimationId !== null) {
      this._customAnimationId = null
      this._publishAnimationState()
    }
    this._restart()
  }

  /** Force a specific direction (down/up/left/right). */
  setDirection(dir: DirectionRole): void {
    this._setActive(dir, false)
  }

  /**
   * Drive the preview from an animation id. Two routes:
   *
   * - **Required role** (matches `walk-/idle- × up/down/left/right`)
   *   — exits custom mode if active, updates direction + paused so
   *   the button states stay in sync, and the walk/idle lookup in
   *   `_activeAnimation` picks the right sequence.
   * - **Custom animation** (anything else — `sword-swing`, `wave`,
   *   etc.) — enters custom mode: `_customAnimationId` is the new
   *   id, the four direction toggles clear, the pause toggle
   *   clears, and `_activeAnimation` returns the matched custom
   *   animation directly.
   *
   * Idempotent: no notify / restart when the parsed state already
   * matches. This is what keeps the
   * `list-selected → preview-notify → list-highlight` round trip
   * from looping; the second pass sees no change and exits early.
   */
  setActiveAnimation(animId: string): void {
    const match = ANIMATION_ID_PATTERN.exec(animId)
    if (match) {
      const [, kind, dir] = match as unknown as [string, AnimationKind, DirectionRole]
      const wantPaused = kind === 'idle'
      const wasCustom = this._customAnimationId !== null
      const directionChanged = this._activeDirection !== dir
      const pausedChanged = this._paused !== wantPaused
      if (!wasCustom && !directionChanged && !pausedChanged) return

      this._customAnimationId = null
      if (pausedChanged) {
        this._paused = wantPaused
        this._btn_pause?.set_active(wantPaused)
        this._refreshDirectionTooltips()
      }
      if (directionChanged || wasCustom) {
        // `_setActive` handles button toggles + frame reset + restart +
        // animation-id publish. We also route here on `wasCustom` so
        // the direction toggles re-light after leaving custom mode.
        this._setActive(dir, false)
      } else {
        this._frameIndex = 0
        this._publishAnimationState()
        this._restart()
      }
      return
    }

    // Custom animation — play by id, clear the walk/idle UI state
    // so it's visually obvious the direction pad isn't driving the
    // current sequence.
    if (this._customAnimationId === animId) return
    this._customAnimationId = animId
    this._frameIndex = 0
    this._btn_up.set_active(false)
    this._btn_down.set_active(false)
    this._btn_left.set_active(false)
    this._btn_right.set_active(false)
    this._btn_pause?.set_active(false)
    this._paused = false
    this._refreshDirectionTooltips()
    this._publishAnimationState()
    this._restart()
  }

  vfunc_unmap(): void {
    this._stopTimer()
    this._stopCycleTimer()
    super.vfunc_unmap()
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._restart()
  }

  private _wireDirectionPad(): void {
    // Any direction click leaves custom mode behind and resumes the
    // walk-/idle- × direction lookup so the buttons are always the
    // canonical way back from a custom-animation selection.
    this._btn_up.connect('toggled', () => {
      if (this._btn_up.active) {
        this._customAnimationId = null
        this._setActive('up', false)
      }
    })
    this._btn_down.connect('toggled', () => {
      if (this._btn_down.active) {
        this._customAnimationId = null
        this._setActive('down', false)
      }
    })
    this._btn_left.connect('toggled', () => {
      if (this._btn_left.active) {
        this._customAnimationId = null
        this._setActive('left', false)
      }
    })
    this._btn_right.connect('toggled', () => {
      if (this._btn_right.active) {
        this._customAnimationId = null
        this._setActive('right', false)
      }
    })
  }

  private _wirePauseToggle(): void {
    // Pause clears custom mode too — see the direction-pad rationale.
    this._btn_pause.connect('toggled', () => {
      this._customAnimationId = null
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
    this._stopCycleTimer()
    this._applyFrame()
    // Static when not highlighted (idle gallery cards) — show one frame,
    // no timers. Highlighted → run the walk cycle, and if auto-cycling,
    // also rotate the facing over time so the character circles.
    if (!this._highlighted) return
    this._scheduleNext()
    if (this._autoCycle) this._scheduleDirectionCycle()
  }

  private _stopTimer(): void {
    if (this._timeoutId !== 0) {
      GLib.Source.remove(this._timeoutId)
      this._timeoutId = 0
    }
  }

  private _stopCycleTimer(): void {
    if (this._cycleTimeoutId !== 0) {
      GLib.Source.remove(this._cycleTimeoutId)
      this._cycleTimeoutId = 0
    }
  }

  /**
   * Rotate the facing every {@link DIRECTION_CYCLE_MS} (down → left →
   * up → right → …) so an auto-cycling preview walks a full circle.
   * `_setActive` reschedules both timers, so this source removes itself.
   */
  private _scheduleDirectionCycle(): void {
    this._cycleTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DIRECTION_CYCLE_MS, () => {
      this._cycleTimeoutId = 0
      const order: DirectionRole[] = ['down', 'left', 'up', 'right']
      const next = order[(order.indexOf(this._activeDirection) + 1) % order.length]
      this._customAnimationId = null
      this._setActive(next, false)
      return GLib.SOURCE_REMOVE
    })
  }

  /**
   * Resolve the animation to play. Two routes:
   *
   * - **Custom mode**: lookup by `_customAnimationId` directly.
   *   Returns `null` (and the picture clears) if the id no longer
   *   exists — e.g. the user deleted it elsewhere.
   * - **Normal mode**: walk-/idle- × direction with cross-kind
   *   fallback so a character with only walk frames (no idle, or
   *   vice versa) still previews — better to show something than
   *   blank the picture.
   */
  private _activeAnimation(): CharacterAnimation | null {
    if (!this._character) return null
    // Animations are owned by the sheet now (shared across characters);
    // fall back to the deprecated per-character list.
    const anims = this._spriteSet?.data?.characterAnimations ?? this._character.animations ?? []
    if (this._customAnimationId !== null) {
      return anims.find((a) => a.id === this._customAnimationId) ?? null
    }
    const primaryKind: AnimationKind = this._paused ? 'idle' : 'walk'
    const fallbackKind: AnimationKind = primaryKind === 'idle' ? 'walk' : 'idle'
    const primary = `${primaryKind}-${this._activeDirection}` as CharacterAnimationRole
    const fallback = `${fallbackKind}-${this._activeDirection}` as CharacterAnimationRole
    return anims.find((a) => a.id === primary) ?? anims.find((a) => a.id === fallback) ?? null
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
