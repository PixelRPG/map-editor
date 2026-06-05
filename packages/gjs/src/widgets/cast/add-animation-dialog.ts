import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterDefinition } from '@pixelrpg/engine'
import { REQUIRED_ROLES } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import type { GdkSpriteSetResource } from '../../sprite/index.ts'
import { TilePalette } from '../editor/tile-palette.ts'

import Template from './add-animation-dialog.blp'

GObject.type_ensure(TilePalette.$gtype)

const SEQUENCE_THUMB_SIZE = 40
const DEFAULT_DURATION_MS = 200

/**
 * Discrete zoom levels: paired preview frame size + picker
 * tile-size. Both surfaces grow together so the user keeps a
 * consistent sense of scale between "the preview" and "what I'm
 * picking". Index 2 (the middle row) is the default.
 */
const ZOOM_LEVELS: ReadonlyArray<{ preview: number; picker: number }> = [
  { preview: 120, picker: 24 },
  { preview: 144, picker: 32 },
  { preview: 168, picker: 48 },
  { preview: 200, picker: 64 },
  { preview: 240, picker: 80 },
]
const DEFAULT_ZOOM_LEVEL = 2

/**
 * Modal dialog for creating a custom `CharacterAnimation`. Three
 * editable surfaces inside the dialog drive one piece of state:
 *
 * - Name (`Adw.EntryRow`) — becomes the animation id. Validated
 *   non-empty, not already used by an existing animation on the
 *   character, and not a reserved required-role name (the
 *   walk-/idle- prefixes paired with each of four directions).
 * - Duration (`Adw.SpinRow`) — milliseconds per frame; uniform
 *   across the animation per the spec.
 * - Frame sequence — built by clicking sprites in the frame picker
 *   (`TilePalette` reused as a sprite-sheet grid). Each click
 *   appends a frame; clicking a thumbnail in the sequence strip
 *   removes it.
 *
 * The dialog adapts to its host:
 *
 * - ≥ 720sp content width → settings column on the left
 *   (name / duration / preview / sequence) + picker grid on the
 *   right.
 * - Below the breakpoint → vertical stack of the same children;
 *   libadwaita additionally switches the dialog itself to a
 *   bottom-sheet presentation on narrow windows.
 *
 * Emits `animation-created` with the assembled
 * {@link CharacterAnimation} on Save. The host (cast view) wires
 * that into its existing controller callback so the new animation
 * lands on the character + persists to `game-project.json`.
 */
export class AddAnimationDialog extends Adw.Dialog {
  declare _cancel_button: Gtk.Button
  declare _save_button: Gtk.Button
  declare _zoom_out_button: Gtk.Button
  declare _zoom_in_button: Gtk.Button
  declare _name_row: Adw.EntryRow
  declare _duration_row: Adw.SpinRow
  declare _preview_picture: Gtk.Picture
  declare _sequence_stack: Gtk.Stack
  declare _sequence_strip: Gtk.Box
  declare _palette: TilePalette

  private _character: CharacterDefinition | null = null
  private _spriteSet: GdkSpriteSetResource | null = null
  private _frames: number[] = []
  private _sequenceState = 'empty'
  private _previewIndex = 0
  private _previewTimeoutId = 0
  private _zoomLevel = DEFAULT_ZOOM_LEVEL
  private _previewSize = ZOOM_LEVELS[DEFAULT_ZOOM_LEVEL].preview

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgAddAnimationDialog',
        Template,
        InternalChildren: [
          'cancel_button',
          'save_button',
          'zoom_out_button',
          'zoom_in_button',
          'name_row',
          'duration_row',
          'preview_picture',
          'sequence_stack',
          'sequence_strip',
          'palette',
        ],
        Properties: {
          // Drives the Gtk.Stack between the "no frames yet" hint
          // and the populated thumbnail strip. Exposed as a property
          // so the BLP bind is the single source of truth — TS just
          // flips the value, no manual `set_visible_child_name`
          // calls scattered around mutation paths.
          'sequence-state': GObject.ParamSpec.string(
            'sequence-state',
            'Sequence state',
            'Stack page name shown in the frame sequence section (empty | populated)',
            GObject.ParamFlags.READWRITE,
            'empty',
          ),
          // Preview frame edge length in pixels — bound from the BLP
          // template so the zoom buttons can resize the frame without
          // touching the picture/paintable. Always matches whichever
          // `ZOOM_LEVELS[i].preview` corresponds to the current
          // `_zoomLevel`.
          'preview-size': GObject.ParamSpec.int(
            'preview-size',
            'Preview size',
            'Width + height of the preview frame in pixels',
            GObject.ParamFlags.READWRITE,
            64,
            512,
            ZOOM_LEVELS[DEFAULT_ZOOM_LEVEL].preview,
          ),
        },
        Signals: {
          'animation-created': { param_types: [GObject.TYPE_JSOBJECT] },
        },
      },
      AddAnimationDialog,
    )
  }

  constructor() {
    super()
    this._wireButtons()
    this._wireZoom()
    this._wireInputs()
    this._wirePalette()
    this._refreshValidity()
    this._applyZoom()
  }

  get sequenceState(): string {
    return this._sequenceState ?? 'empty'
  }

  set sequenceState(value: string) {
    if (this._sequenceState === value) return
    this._sequenceState = value
    this.notify('sequence-state')
  }

  get previewSize(): number {
    return this._previewSize ?? ZOOM_LEVELS[DEFAULT_ZOOM_LEVEL].preview
  }

  set previewSize(value: number) {
    if (this._previewSize === value) return
    this._previewSize = value
    this.notify('preview-size')
  }

  /**
   * Wire the dialog to a specific character + sprite-set. Called by
   * the cast view before `present()`. The character drives name-
   * uniqueness validation; the sprite-set populates the picker grid
   * and renders sequence thumbnails + the preview.
   */
  setContext(character: CharacterDefinition, spriteSet: GdkSpriteSetResource | null): void {
    this._character = character
    this._spriteSet = spriteSet
    this._frames = []
    this._previewIndex = 0
    this._name_row.set_text('')
    this._duration_row.set_value(DEFAULT_DURATION_MS)
    this._rebuildSequenceStrip()
    this._refreshPreview()
    this._refreshValidity()
    this._populatePalette()
  }

  // Lifecycle hooks — stop the preview timer when the dialog goes
  // away so the timeout source doesn't outlive the Picture it
  // updates.
  vfunc_closed(): void {
    this._stopPreviewTimer()
    super.vfunc_closed?.()
  }

  private _wireButtons(): void {
    this._cancel_button.connect('clicked', () => {
      this.close()
    })
    this._save_button.connect('clicked', () => {
      const animation = this._buildAnimation()
      if (!animation) return
      this.emit('animation-created', animation)
      this.close()
    })
  }

  private _wireZoom(): void {
    this._zoom_out_button.connect('clicked', () => {
      if (this._zoomLevel > 0) {
        this._zoomLevel -= 1
        this._applyZoom()
      }
    })
    this._zoom_in_button.connect('clicked', () => {
      if (this._zoomLevel < ZOOM_LEVELS.length - 1) {
        this._zoomLevel += 1
        this._applyZoom()
      }
    })
  }

  /**
   * Push the current `_zoomLevel`'s sizes through to the preview
   * frame (via the `preview-size` property the BLP binds) and the
   * picker tile-size. Sensitivity on the zoom buttons clamps at
   * either endpoint so the user can't push past the array.
   */
  private _applyZoom(): void {
    const level = ZOOM_LEVELS[this._zoomLevel]
    this.previewSize = level.preview
    this._palette.tileSize = level.picker
    this._zoom_out_button.set_sensitive(this._zoomLevel > 0)
    this._zoom_in_button.set_sensitive(this._zoomLevel < ZOOM_LEVELS.length - 1)
  }

  private _wireInputs(): void {
    this._name_row.connect('changed', () => {
      this._refreshValidity()
    })
    this._duration_row.connect('notify::value', () => {
      // A duration change retimes the preview without resetting
      // the frame index — keeps the loop running smoothly while
      // the user drags the spinner.
      this._restartPreviewTimer()
    })
  }

  private _wirePalette(): void {
    this._palette.connect('tile-selected', (_p: TilePalette, spriteId: number) => {
      this._frames = [...this._frames, spriteId]
      this._previewIndex = 0
      this._rebuildSequenceStrip()
      this._refreshPreview()
      this._refreshValidity()
    })
  }

  private _populatePalette(): void {
    const sheet = this._spriteSet?.spriteSheet
    if (!sheet) {
      this._palette.setTiles([])
      return
    }
    this._palette.setFromSpriteSheet(sheet)
  }

  private _rebuildSequenceStrip(): void {
    // Drop existing thumbnails before re-adding so removal +
    // append produce the same DOM shape (no append-only growth).
    let child = this._sequence_strip.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._sequence_strip.remove(child)
      child = next
    }

    for (let i = 0; i < this._frames.length; i++) {
      const spriteId = this._frames[i]
      const index = i
      const button = this._buildSequenceThumbnail(spriteId, index)
      this._sequence_strip.append(button)
    }

    this.sequenceState = this._frames.length === 0 ? 'empty' : 'populated'
  }

  /**
   * Build one thumbnail button for the sequence strip. Each button
   * carries its frame's sprite plus a tooltip that explains the
   * click affordance (`tap to remove`). Single-click removes for
   * now — drag-reorder is tracked in TODO.md.
   */
  private _buildSequenceThumbnail(spriteId: number, indexInSequence: number): Gtk.Button {
    const button = new Gtk.Button({
      tooltipText: _('Click to remove from sequence'),
      cssClasses: ['flat'],
    })
    const sprite = this._spriteSet?.getSprite(spriteId)
    const paintable = sprite?.createPaintable({ keepAspectRatio: true }) ?? null
    const picture = new Gtk.Picture({
      contentFit: Gtk.ContentFit.CONTAIN,
      canShrink: true,
      widthRequest: SEQUENCE_THUMB_SIZE,
      heightRequest: SEQUENCE_THUMB_SIZE,
    })
    picture.set_paintable(paintable)
    button.set_child(picture)
    button.connect('clicked', () => {
      this._frames = this._frames.filter((_v, i) => i !== indexInSequence)
      this._previewIndex = 0
      this._rebuildSequenceStrip()
      this._refreshPreview()
      this._refreshValidity()
    })
    return button
  }

  private _refreshPreview(): void {
    this._stopPreviewTimer()
    this._applyPreviewFrame()
    this._restartPreviewTimer()
  }

  private _restartPreviewTimer(): void {
    this._stopPreviewTimer()
    if (this._frames.length <= 1) return
    const duration = Math.max(50, this._duration_row.get_value())
    this._previewTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
      this._previewIndex = (this._previewIndex + 1) % Math.max(1, this._frames.length)
      this._applyPreviewFrame()
      return GLib.SOURCE_CONTINUE
    })
  }

  private _stopPreviewTimer(): void {
    if (this._previewTimeoutId !== 0) {
      GLib.Source.remove(this._previewTimeoutId)
      this._previewTimeoutId = 0
    }
  }

  private _applyPreviewFrame(): void {
    if (this._frames.length === 0 || !this._spriteSet) {
      this._preview_picture.set_paintable(null)
      return
    }
    const spriteId = this._frames[this._previewIndex % this._frames.length]
    const sprite = this._spriteSet.getSprite(spriteId)
    const paintable = sprite?.createPaintable({ keepAspectRatio: true }) ?? null
    this._preview_picture.set_paintable(paintable)
  }

  /**
   * Recompute Save-button sensitivity from the current name +
   * frames state. Three rules need to hold:
   *
   * 1. Name is non-empty.
   * 2. Name doesn't collide with an existing animation on the
   *    character — required role OR previously-added custom anim.
   * 3. At least one frame is in the sequence.
   */
  private _refreshValidity(): void {
    const name = this._name_row.get_text().trim()
    const existingIds = new Set<string>(REQUIRED_ROLES)
    for (const anim of this._character?.animations ?? []) existingIds.add(anim.id)
    const isValid = name.length > 0 && !existingIds.has(name) && this._frames.length > 0
    this._save_button.set_sensitive(isValid)
  }

  private _buildAnimation(): CharacterAnimation | null {
    const name = this._name_row.get_text().trim()
    if (!name || this._frames.length === 0) return null
    return {
      id: name,
      frames: [...this._frames],
      durationMs: Math.round(this._duration_row.get_value()),
    }
  }
}

GObject.type_ensure(AddAnimationDialog.$gtype)
