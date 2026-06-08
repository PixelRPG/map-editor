import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterDefinition } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import type { GdkSpriteSetResource } from '../../sprite/index.ts'

type DirectionRole = 'up' | 'down' | 'left' | 'right'

/** Default per-card preview edge length (px). */
const DEFAULT_SIZE = 88

const ARROWS: ReadonlyArray<{ dir: DirectionRole; icon: string; halign: Gtk.Align; valign: Gtk.Align; tip: string }> = [
  { dir: 'up', icon: 'go-up-symbolic', halign: Gtk.Align.CENTER, valign: Gtk.Align.START, tip: _('Face up') },
  { dir: 'down', icon: 'go-down-symbolic', halign: Gtk.Align.CENTER, valign: Gtk.Align.END, tip: _('Face down') },
  { dir: 'left', icon: 'go-previous-symbolic', halign: Gtk.Align.START, valign: Gtk.Align.CENTER, tip: _('Face left') },
  { dir: 'right', icon: 'go-next-symbolic', halign: Gtk.Align.END, valign: Gtk.Align.CENTER, tip: _('Face right') },
]

/**
 * Compact, self-animating character preview for a gallery card. Plays
 * the character's `walk-<direction>` cycle continuously (default: down)
 * so the cast overview shows characters already in motion. On
 * pointer-hover, four directional arrows fade in over the sprite; each
 * sets the walk direction so the user can spin the character on the
 * card without opening the detail page.
 *
 * Distinct from {@link CharacterPreview} (the detail-page widget with an
 * always-visible direction pad + pause): this is a small, pad-free,
 * hover-driven variant tuned for a dense card grid.
 */
export class CharacterCardPreview extends Adw.Bin {
  private _picture: Gtk.Picture
  private _arrows = new Map<DirectionRole, Gtk.Button>()
  private _character: CharacterDefinition | null = null
  private _spriteSet: GdkSpriteSetResource | null = null
  private _direction: DirectionRole = 'down'
  private _frameIndex = 0
  private _timeoutId = 0
  private _size = DEFAULT_SIZE

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgCharacterCardPreview',
        Properties: {
          'preview-size': GObject.ParamSpec.int(
            'preview-size',
            'Preview size',
            'Edge length of the square preview in pixels',
            GObject.ParamFlags.READWRITE,
            32,
            256,
            DEFAULT_SIZE,
          ),
        },
      },
      CharacterCardPreview,
    )
  }

  constructor() {
    super()
    this.add_css_class('card-gallery-preview')
    this.add_css_class('character-card-preview')

    const overlay = new Gtk.Overlay()
    this._picture = new Gtk.Picture({
      contentFit: Gtk.ContentFit.CONTAIN,
      canShrink: true,
      hexpand: true,
      vexpand: true,
    })
    overlay.set_child(this._picture)

    for (const spec of ARROWS) {
      const button = new Gtk.Button({
        iconName: spec.icon,
        tooltipText: spec.tip,
        cssClasses: ['osd', 'circular', 'card-arrow'],
        halign: spec.halign,
        valign: spec.valign,
        // Hidden until hover; can't be tabbed/clicked while invisible.
        opacity: 0,
        canTarget: false,
        canFocus: false,
      })
      button.connect('clicked', () => this._setDirection(spec.dir))
      this._arrows.set(spec.dir, button)
      overlay.add_overlay(button)
    }
    this.set_child(overlay)
    this._applySize()

    // Reveal the arrows on hover. A motion controller toggles their
    // opacity + targetability so they don't intercept clicks (or steal
    // the card's hit area) while hidden.
    const motion = new Gtk.EventControllerMotion()
    motion.connect('enter', () => this._setArrowsRevealed(true))
    motion.connect('leave', () => this._setArrowsRevealed(false))
    this.add_controller(motion)
  }

  get previewSize(): number {
    return this._size ?? DEFAULT_SIZE
  }

  set previewSize(value: number) {
    if (this._size === value) return
    this._size = value
    this._applySize()
    this.notify('preview-size')
  }

  /** Show this character. Resets to the default (down) walk + restarts playback. */
  setCharacter(character: CharacterDefinition | null, spriteSet: GdkSpriteSetResource | null): void {
    this._character = character
    this._spriteSet = spriteSet
    this._direction = 'down'
    this._frameIndex = 0
    this._restart()
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._restart()
  }

  vfunc_unmap(): void {
    this._stopTimer()
    super.vfunc_unmap()
  }

  private _applySize(): void {
    this.set_size_request(this._size, this._size)
  }

  private _setArrowsRevealed(revealed: boolean): void {
    for (const button of this._arrows.values()) {
      button.opacity = revealed ? 1 : 0
      button.set_can_target(revealed)
    }
  }

  private _setDirection(dir: DirectionRole): void {
    if (this._direction === dir) return
    this._direction = dir
    this._frameIndex = 0
    this._restart()
  }

  /**
   * Resolve the animation to play: `walk-<dir>` with an `idle-<dir>`
   * fallback (a character with only idle frames still previews), then
   * any first animation. Null clears the picture.
   */
  private _activeAnimation(): CharacterAnimation | null {
    const character = this._character
    if (!character) return null
    return (
      character.animations.find((a) => a.id === `walk-${this._direction}`) ??
      character.animations.find((a) => a.id === `idle-${this._direction}`) ??
      character.animations.find((a) => a.frames.length > 0) ??
      null
    )
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

  private _applyFrame(): void {
    const anim = this._activeAnimation()
    if (!anim || anim.frames.length === 0 || !this._spriteSet) {
      this._picture.set_paintable(null)
      return
    }
    const spriteId = anim.frames[this._frameIndex % anim.frames.length]
    const sprite = this._spriteSet.getSprite(spriteId)
    this._picture.set_paintable(sprite?.createPaintable({ keepAspectRatio: true }) ?? null)
  }

  private _scheduleNext(): void {
    const anim = this._activeAnimation()
    if (!anim || anim.frames.length <= 1) return
    const duration = Math.max(50, anim.durationMs)
    this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
      this._frameIndex = (this._frameIndex + 1) % anim.frames.length
      this._applyFrame()
      return GLib.SOURCE_CONTINUE
    })
  }
}

GObject.type_ensure(CharacterCardPreview.$gtype)
