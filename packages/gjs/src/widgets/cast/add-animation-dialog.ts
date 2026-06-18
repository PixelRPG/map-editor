import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
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
 * Discrete tile-size stops for the bottom-right zoom OSD. Both the
 * picker cells AND the preview frame use this — the on-screen sprite
 * size matches the picker cells the user is selecting from. Index 2
 * is the default; the OSD label shows the percentage relative to it.
 */
const ZOOM_LEVELS: ReadonlyArray<number> = [24, 36, 48, 72, 96]
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
  declare _zoom_reset_button: Gtk.Button
  declare _zoom_in_button: Gtk.Button
  declare _name_row: Adw.EntryRow
  declare _duration_row: Adw.SpinRow
  declare _preview_picture: Gtk.Picture
  declare _sequence_stack: Gtk.Stack
  declare _sequence_strip: Gtk.Box
  declare _palette: TilePalette
  declare _add_frame_button: Gtk.MenuButton
  declare _frame_picker: TilePalette

  private _character: CharacterDefinition | null = null
  private _spriteSet: GdkSpriteSetResource | null = null
  private _frames: number[] = []
  /** Source index of an in-progress sequence-strip drag-to-reorder. */
  private _dragFromIndex: number | null = null
  private _sequenceState = 'empty'
  private _previewIndex = 0
  private _previewTimeoutId = 0
  private _zoomLevel = DEFAULT_ZOOM_LEVEL
  private _zoomLabel = ''
  private _cellAspect: number | null = null
  /**
   * Non-null when the dialog was opened to edit an existing
   * animation rather than create a new one. Holds the original id
   * so the save handler can emit the right signal +
   * `_refreshValidity` knows to allow the unchanged name through
   * its uniqueness check.
   */
  private _editingId: string | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgAddAnimationDialog',
        Template,
        InternalChildren: [
          'cancel_button',
          'save_button',
          'zoom_out_button',
          'zoom_reset_button',
          'zoom_in_button',
          'name_row',
          'duration_row',
          'preview_picture',
          'sequence_stack',
          'sequence_strip',
          'palette',
          'add_frame_button',
          'frame_picker',
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
          // Bound to the OSD zoom pill's middle button so the user
          // sees the current zoom as a percentage relative to the
          // default tile-size. TS updates this on every zoom change.
          'zoom-label': GObject.ParamSpec.string(
            'zoom-label',
            'Zoom Label',
            'Percentage caption shown in the centre zoom button (e.g. `100%`)',
            GObject.ParamFlags.READWRITE,
            '100%',
          ),
        },
        Signals: {
          'animation-created': { param_types: [GObject.TYPE_JSOBJECT] },
          // Fires on Save when the dialog was opened in edit mode.
          // First arg is the ORIGINAL id (so the controller can find
          // the existing entry to replace even when the name was
          // edited); second is the updated `CharacterAnimation`.
          'animation-edited': { param_types: [GObject.TYPE_STRING, GObject.TYPE_JSOBJECT] },
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

  get zoomLabel(): string {
    return this._zoomLabel ?? '100%'
  }

  set zoomLabel(value: string) {
    if (this._zoomLabel === value) return
    this._zoomLabel = value
    this.notify('zoom-label')
  }

  /**
   * Wire the dialog to a specific character + sprite-set. Called by
   * the cast view before `present()`. The character drives name-
   * uniqueness validation; the sprite-set populates the picker grid
   * and renders sequence thumbnails + the preview.
   *
   * Pass `existingAnimation` to open the dialog in EDIT mode — name,
   * duration, and frames pre-populate from the existing entry; the
   * title swaps from "New animation" to "Edit animation"; required-
   * role names are locked (renaming `walk-up` to anything else would
   * break the role binding); and Save emits `animation-edited`
   * instead of `animation-created`. Without `existingAnimation` the
   * dialog opens fresh in CREATE mode.
   */
  setContext(
    character: CharacterDefinition,
    spriteSet: GdkSpriteSetResource | null,
    existingAnimation?: CharacterAnimation,
  ): void {
    this._character = character
    this._spriteSet = spriteSet
    this._editingId = existingAnimation?.id ?? null

    if (existingAnimation) {
      this._frames = [...existingAnimation.frames]
      this._name_row.set_text(existingAnimation.id)
      this._duration_row.set_value(existingAnimation.durationMs)
      const isRequiredRole = (REQUIRED_ROLES as readonly string[]).includes(existingAnimation.id)
      this._name_row.set_sensitive(!isRequiredRole)
      this.set_title(_('Edit animation'))
    } else {
      this._frames = []
      this._name_row.set_text('')
      this._duration_row.set_value(DEFAULT_DURATION_MS)
      this._name_row.set_sensitive(true)
      this.set_title(_('New animation'))
    }

    this._previewIndex = 0
    this._rebuildSequenceStrip()
    this._refreshPreview()
    this._refreshValidity()
    this._populatePalette()
  }

  // Lifecycle hooks — keep the preview timer scoped to "mapped". A
  // dialog can be unmapped without a full close (host flows), and the
  // timeout would otherwise keep churning the hidden Picture's
  // paintable. Stop on unmap, resume on (re)map — matches
  // CharacterPreview. vfunc_closed stays the final teardown.
  vfunc_map(): void {
    super.vfunc_map?.()
    this._restartPreviewTimer()
  }

  vfunc_unmap(): void {
    this._stopPreviewTimer()
    super.vfunc_unmap?.()
  }

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
      if (this._editingId !== null) {
        this.emit('animation-edited', this._editingId, animation)
      } else {
        this.emit('animation-created', animation)
      }
      this.close()
    })
  }

  /**
   * Bottom-right OSD zoom pill — mirrors the scene editor's
   * `FloatingZoom` pattern: `[-] [N%] [+]`, flat buttons inside a
   * `toolbar.osd` Box. Clamps at the endpoints; reset jumps back to
   * the default level.
   */
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
    this._zoom_reset_button.connect('clicked', () => {
      if (this._zoomLevel === DEFAULT_ZOOM_LEVEL) return
      this._zoomLevel = DEFAULT_ZOOM_LEVEL
      this._applyZoom()
    })
  }

  /**
   * Push the current zoom level to the picker (tile-size) + the
   * preview frame (via `_refreshPreviewSize`) so the rendered sprite
   * size is identical in both surfaces. Updates the OSD label as a
   * percentage relative to the default level and re-greys the
   * endpoint buttons.
   */
  private _applyZoom(): void {
    const tileSize = ZOOM_LEVELS[this._zoomLevel]
    this._palette.tileSize = tileSize
    this._refreshPreviewSize()
    const percent = Math.round((tileSize / ZOOM_LEVELS[DEFAULT_ZOOM_LEVEL]) * 100)
    this.zoomLabel = `${percent}%`
    this._zoom_out_button.set_sensitive(this._zoomLevel > 0)
    this._zoom_in_button.set_sensitive(this._zoomLevel < ZOOM_LEVELS.length - 1)
  }

  /**
   * Resize the preview picture so its render rect matches the
   * picker's swatch dimensions: `tileSize` for the longer axis and
   * `tileSize × aspect` (or `tileSize / aspect`) for the shorter.
   * The frame wraps to fit the picture + its 8px margins, so the
   * on-screen character ends up at the SAME pixel size as in the
   * picker cells the user is selecting from.
   */
  private _refreshPreviewSize(): void {
    const aspect = this._cellAspect ?? 1
    const tileSize = this._palette.tileSize
    let w: number
    let h: number
    if (aspect >= 1) {
      w = tileSize
      h = Math.max(1, Math.round(tileSize / aspect))
    } else {
      w = Math.max(1, Math.round(tileSize * aspect))
      h = tileSize
    }
    this._preview_picture.set_size_request(w, h)
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
    // Both pickers (the big side grid + the compact header popover) append
    // the clicked sprite to the end of the sequence. The popover also
    // pops down so the user lands back on the timeline.
    this._palette.connect('tile-selected', (_p: TilePalette, spriteId: number) => {
      this._appendFrame(spriteId)
    })
    this._frame_picker.connect('tile-selected', (_p: TilePalette, spriteId: number) => {
      this._appendFrame(spriteId)
      this._add_frame_button.popdown()
    })
  }

  /** Append a sprite to the frame sequence + refresh the dependent surfaces. */
  private _appendFrame(spriteId: number): void {
    this._frames = [...this._frames, spriteId]
    this._previewIndex = 0
    this._rebuildSequenceStrip()
    this._refreshPreview()
    this._refreshValidity()
  }

  private _populatePalette(): void {
    const sheet = this._spriteSet?.spriteSheet
    if (!sheet) {
      this._palette.setTiles([])
      this._frame_picker.setTiles([])
      this._cellAspect = null
      this._refreshPreviewSize()
      return
    }
    this._palette.setFromSpriteSheet(sheet)
    this._frame_picker.setFromSpriteSheet(sheet)
    // Capture the per-cell aspect from the first sprite — character
    // sprite-sheets are uniform so it's representative for the whole
    // set. Drives `_refreshPreviewSize` so the preview frame matches
    // the picker's swatch dimensions.
    const first = sheet.sprites[0]
    this._cellAspect = first && first.height > 0 ? first.width / first.height : 1
    this._refreshPreviewSize()
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
   * carries its frame's sprite. Click removes the frame; dragging it
   * onto another thumbnail reorders the sequence (a `Gtk.DragSource` +
   * `Gtk.DropTarget` pair carrying the frame's index). Click and drag
   * coexist — GTK suppresses the click once a press turns into a drag.
   */
  private _buildSequenceThumbnail(spriteId: number, indexInSequence: number): Gtk.Button {
    const button = new Gtk.Button({
      tooltipText: _('Drag to reorder · click to remove'),
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

    // Drag source — carries this frame's index (an int) so the drop
    // target can reorder. The dragged sprite shows as the drag icon.
    const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE })
    dragSource.connect('prepare', () => {
      this._dragFromIndex = indexInSequence
      const value = new GObject.Value()
      value.init(GObject.TYPE_INT)
      value.set_int(indexInSequence)
      return Gdk.ContentProvider.new_for_value(value)
    })
    if (paintable) {
      dragSource.connect('drag-begin', () => {
        dragSource.set_icon(paintable, Math.round(SEQUENCE_THUMB_SIZE / 2), Math.round(SEQUENCE_THUMB_SIZE / 2))
      })
    }
    dragSource.connect('drag-end', () => {
      this._dragFromIndex = null
    })
    button.add_controller(dragSource)

    // Drop target — accepts a dragged frame index and reorders so the
    // dragged frame lands at this thumbnail's slot.
    const dropTarget = Gtk.DropTarget.new(GObject.TYPE_INT, Gdk.DragAction.MOVE)
    dropTarget.connect('drop', () => {
      const from = this._dragFromIndex
      if (from === null) return false
      this._reorderFrame(from, indexInSequence)
      return true
    })
    button.add_controller(dropTarget)

    return button
  }

  /**
   * Move the frame at `from` to `to` in the sequence + refresh the
   * dependent surfaces. No-op for an out-of-range or unchanged move.
   */
  private _reorderFrame(from: number, to: number): void {
    if (from === to || from < 0 || from >= this._frames.length || to < 0 || to >= this._frames.length) return
    const next = [...this._frames]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    this._frames = next
    this._previewIndex = 0
    this._rebuildSequenceStrip()
    this._refreshPreview()
    this._refreshValidity()
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
   * 2. Name doesn't collide with another animation on the
   *    character — required role OR previously-added custom anim.
   *    In edit mode the entry being edited is excluded so the user
   *    can keep the same name.
   * 3. At least one frame is in the sequence.
   */
  private _refreshValidity(): void {
    const name = this._name_row.get_text().trim()
    const reserved = new Set<string>(REQUIRED_ROLES)
    for (const anim of this._character?.animations ?? []) reserved.add(anim.id)
    if (this._editingId !== null) reserved.delete(this._editingId)
    const isValid = name.length > 0 && !reserved.has(name) && this._frames.length > 0
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
