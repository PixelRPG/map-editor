import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { AnimationFrame, CharacterAnimation, CharacterDefinition } from '@pixelrpg/engine'
import { REQUIRED_ROLES } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import type { GdkSpriteSetResource } from '../../sprite/index.ts'
import { TilePalette } from '../editor/tile-palette.ts'
import { insertAt, moveTo } from './animation-sequence.ts'
import { AnimationTimeline } from './animation-timeline.ts'
import { frameAtTime, frameStartTime, totalDuration } from './animation-timeline.geometry.ts'
import { OnionSkinPreview } from './onion-skin-preview.ts'

import Template from './add-animation-dialog.blp'

GObject.type_ensure(TilePalette.$gtype)
GObject.type_ensure(OnionSkinPreview.$gtype)
GObject.type_ensure(AnimationTimeline.$gtype)

const SEQUENCE_THUMB_SIZE = 40
const DEFAULT_DURATION_MS = 200

// Sequence chips scale their WIDTH with the frame's duration so the strip
// reads as a timeline (a 400 ms frame is twice as wide as a 200 ms one).
// `DURATION_REF_MS` maps to the base thumb width; clamped so very short
// frames stay clickable and very long ones don't dominate the strip.
const DURATION_REF_MS = 200
const CHIP_MIN_WIDTH = 28
const CHIP_MAX_WIDTH = 120

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
 * - Default duration (`Adw.SpinRow`) — milliseconds a *new* frame
 *   starts at; "Apply default to all" pushes it across the sequence.
 * - Frame sequence — built by clicking sprites in the frame picker
 *   (`TilePalette` reused as a sprite-sheet grid). Each click appends
 *   a frame; a chip's thumbnail removes it (drag reorders), and each
 *   chip carries its own −/ms/+ duration stepper (per-frame timing).
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
  declare _onion_preview: OnionSkinPreview
  declare _onion_toggle: Gtk.ToggleButton
  declare _sequence_stack: Gtk.Stack
  declare _sequence_strip: Gtk.Box
  declare _timeline: AnimationTimeline
  declare _play_toggle: Gtk.ToggleButton
  declare _time_label: Gtk.Label
  declare _palette: TilePalette
  declare _add_frame_button: Gtk.MenuButton
  declare _apply_all_button: Gtk.Button
  declare _frame_picker: TilePalette

  private _character: CharacterDefinition | null = null
  private _spriteSet: GdkSpriteSetResource | null = null
  /** Per-frame sequence — each frame carries its own sprite id + duration (ms). */
  private _frames: AnimationFrame[] = []
  /**
   * The in-progress drag's payload, armed by the source (a sequence chip or
   * a draggable picker swatch) and read by a gap drop-zone. `move` reorders
   * the frame at `from`; `insert` adds a new frame for `spriteId`.
   */
  private _dragPayload: { kind: 'move'; from: number } | { kind: 'insert'; spriteId: number } | null = null
  private _sequenceState = 'empty'
  private _previewIndex = 0
  private _previewTimeoutId = 0
  /** Whether the preview loop is running (timeline transport + auto-play). */
  private _playing = true
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
          'onion_preview',
          'onion_toggle',
          'sequence_stack',
          'sequence_strip',
          'timeline',
          'play_toggle',
          'time_label',
          'palette',
          'add_frame_button',
          'apply_all_button',
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
    this._wireTimeline()
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
      // Per-frame durations round-trip verbatim; seed the default row
      // from the first frame so "Apply default to all" is a sane no-op.
      this._frames = existingAnimation.frames.map((f) => ({ ...f }))
      this._name_row.set_text(existingAnimation.id)
      this._duration_row.set_value(existingAnimation.frames[0]?.duration ?? DEFAULT_DURATION_MS)
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
    this._onion_preview.set_size_request(w, h)
  }

  private _wireInputs(): void {
    this._onion_toggle.connect('toggled', () => this._onion_preview.setOnion(this._onion_toggle.get_active()))
    this._name_row.connect('changed', () => {
      this._refreshValidity()
    })
    // The duration row is now the DEFAULT for new frames (per-frame
    // durations are edited on each chip); "Apply default to all" pushes
    // it across the whole sequence.
    this._apply_all_button.connect('clicked', () => this._applyDurationToAll())
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
    // Dragging a swatch arms an INSERT so a gap drop-zone adds a new frame
    // at that caret (vs. click, which appends). Both pickers are drag-source
    // enabled in the blp.
    for (const picker of [this._palette, this._frame_picker]) {
      picker.connect('tile-drag-started', (_p: TilePalette, spriteId: number) => {
        this._dragPayload = { kind: 'insert', spriteId }
      })
      picker.connect('tile-drag-ended', () => {
        this._dragPayload = null
      })
    }
  }

  /**
   * Wire the timeline dock: the play/pause transport toggles the preview
   * loop, and dragging the timeline playhead scrubs — pausing playback and
   * jumping the preview to the frame under the playhead.
   */
  private _wireTimeline(): void {
    this._play_toggle.connect('toggled', () => this._setPlaying(this._play_toggle.get_active()))
    this._timeline.connect('scrubbed', (_t: AnimationTimeline, timeMs: number) => this._onScrub(timeMs))
  }

  /** Per-frame durations (ms) in sequence order — the timeline's model. */
  private _durationList(): number[] {
    return this._frames.map((f) => f.duration)
  }

  /** Start / stop the preview loop + reflect it in the transport icon. */
  private _setPlaying(playing: boolean): void {
    this._playing = playing
    this._play_toggle.set_icon_name(playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic')
    if (playing) this._restartPreviewTimer()
    else this._stopPreviewTimer()
  }

  /**
   * Handle a timeline scrub: pause playback (via the transport, so the icon
   * stays in sync) and snap the preview to the frame under the playhead,
   * leaving the playhead at the exact drag position.
   */
  private _onScrub(timeMs: number): void {
    if (this._frames.length === 0) return
    if (this._play_toggle.get_active()) this._play_toggle.set_active(false)
    else this._setPlaying(false)
    const idx = frameAtTime(this._durationList(), timeMs)
    if (idx >= 0) {
      this._previewIndex = idx
      this._onion_preview.setCurrentIndex(idx)
    }
    this._timeline.setPlayheadTime(timeMs)
    this._updateTimeLabel(timeMs)
  }

  /** Update the "current / total ms" caption beside the timeline. */
  private _updateTimeLabel(timeMs: number): void {
    const total = this._frames.length === 0 ? 0 : totalDuration(this._durationList())
    this._time_label.set_label(`${Math.round(timeMs)} / ${total} ms`)
  }

  /** Append a sprite to the frame sequence (at the default duration) + refresh. */
  private _appendFrame(spriteId: number): void {
    const duration = Math.round(this._duration_row.get_value())
    this._frames = [...this._frames, { spriteId, duration }]
    this._previewIndex = 0
    this._rebuildSequenceStrip()
    this._refreshPreview()
    this._refreshValidity()
  }

  /** Set every frame's duration to the current default-duration value. */
  private _applyDurationToAll(): void {
    const duration = Math.round(this._duration_row.get_value())
    this._frames = this._frames.map((f) => ({ ...f, duration }))
    this._rebuildSequenceStrip()
    this._refreshPreview()
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

    // Interleave a caret gap around every chip: gap 0, chip 0, gap 1, …,
    // chip n-1, gap n. Each gap is a drop-zone that inserts/moves a frame
    // AT that position (see `_buildGap`).
    this._sequence_strip.append(this._buildGap(0))
    for (let i = 0; i < this._frames.length; i++) {
      this._sequence_strip.append(this._buildSequenceChip(this._frames[i], i))
      this._sequence_strip.append(this._buildGap(i + 1))
    }

    this.sequenceState = this._frames.length === 0 ? 'empty' : 'populated'
  }

  /**
   * Build one caret gap for the sequence strip. A thin drop-zone that
   * accepts either a dragged picker swatch (insert a new frame here) or a
   * dragged chip (move the frame here) — `gapIndex` is the insertion index.
   * Highlights while a drag hovers so the drop position reads as a caret.
   */
  private _buildGap(gapIndex: number): Gtk.Widget {
    const gap = new Gtk.Box({ cssClasses: ['timeline-caret'], valign: Gtk.Align.FILL })
    gap.set_size_request(8, -1)
    const drop = new Gtk.DropTarget({ actions: Gdk.DragAction.COPY | Gdk.DragAction.MOVE })
    // Accept both a picker swatch (string tile id) + a chip (int index); the
    // payload side-channel decides what to do, matching the repo's DnD style.
    drop.set_gtypes([GObject.TYPE_STRING, GObject.TYPE_INT])
    drop.connect('enter', () => {
      gap.add_css_class('drop-active')
      return this._dragPayload?.kind === 'insert' ? Gdk.DragAction.COPY : Gdk.DragAction.MOVE
    })
    drop.connect('leave', () => gap.remove_css_class('drop-active'))
    drop.connect('drop', () => {
      gap.remove_css_class('drop-active')
      return this._applyDrop(gapIndex)
    })
    gap.add_controller(drop)
    return gap
  }

  /**
   * Apply the armed drag payload at `gapIndex`: insert a new frame (default
   * duration) for a picker swatch, or move the dragged chip there. Returns
   * whether the drop was handled (GTK's `drop` contract).
   */
  private _applyDrop(gapIndex: number): boolean {
    const payload = this._dragPayload
    this._dragPayload = null
    if (!payload) return false
    if (payload.kind === 'insert') {
      const duration = Math.round(this._duration_row.get_value())
      this._frames = insertAt(this._frames, gapIndex, { spriteId: payload.spriteId, duration })
    } else {
      this._frames = moveTo(this._frames, payload.from, gapIndex)
    }
    this._previewIndex = 0
    this._rebuildSequenceStrip()
    this._refreshPreview()
    this._refreshValidity()
    return true
  }

  /**
   * Build one chip for the sequence strip: the frame's sprite thumbnail
   * (click removes; drag it onto a caret gap to reorder — the chip is a
   * `Gtk.DragSource`, the gaps are the drop-zones) stacked over a per-frame
   * duration stepper (−/ms/+). Click and drag coexist — GTK suppresses the
   * click once a press turns into a drag.
   */
  private _buildSequenceChip(frame: AnimationFrame, indexInSequence: number): Gtk.Box {
    const chip = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 })

    const button = new Gtk.Button({
      tooltipText: _('Drag to reorder · click to remove'),
      cssClasses: ['flat'],
    })
    const sprite = this._spriteSet?.getSprite(frame.spriteId)
    const paintable = sprite?.createPaintable({ keepAspectRatio: true }) ?? null
    const picture = new Gtk.Picture({
      contentFit: Gtk.ContentFit.CONTAIN,
      canShrink: true,
      widthRequest: this._chipWidthFor(frame.duration),
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

    // Drag source — arms a MOVE of this frame's index; a gap drop-zone
    // reads the payload + reorders. The dragged sprite shows as the icon.
    const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE })
    dragSource.connect('prepare', () => {
      this._dragPayload = { kind: 'move', from: indexInSequence }
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
      this._dragPayload = null
    })
    button.add_controller(dragSource)

    chip.append(button)
    // Resize this chip live as its duration changes (timeline width),
    // without a full strip rebuild (which would destroy the stepper the
    // user is clicking).
    chip.append(
      this._buildDurationStepper(indexInSequence, () => {
        picture.set_size_request(
          this._chipWidthFor(this._frames[indexInSequence]?.duration ?? DEFAULT_DURATION_MS),
          SEQUENCE_THUMB_SIZE,
        )
      }),
    )
    return chip
  }

  /** Sequence-chip width for a frame duration (timeline metaphor; clamped). */
  private _chipWidthFor(duration: number): number {
    const scaled = Math.round((duration / DURATION_REF_MS) * SEQUENCE_THUMB_SIZE)
    return Math.max(CHIP_MIN_WIDTH, Math.min(CHIP_MAX_WIDTH, scaled))
  }

  /**
   * Compact −/ms/+ stepper for one frame's duration. Adjusts
   * `_frames[index].duration` in ±50 ms steps (clamped 50–2000) and
   * retimes the live preview so a mixed-duration loop reads correctly.
   */
  private _buildDurationStepper(index: number, onChange: () => void): Gtk.Box {
    const row = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 0,
      halign: Gtk.Align.CENTER,
      cssClasses: ['linked'],
    })
    const label = new Gtk.Label({ cssClasses: ['caption', 'numeric'], widthChars: 6 })
    const setLabel = () => label.set_label(`${this._frames[index]?.duration ?? 0} ms`)
    const nudge = (delta: number) => {
      const frame = this._frames[index]
      if (!frame) return
      frame.duration = Math.max(50, Math.min(2000, frame.duration + delta))
      setLabel()
      onChange()
      this._refreshPreview()
    }
    const minus = new Gtk.Button({
      iconName: 'list-remove-symbolic',
      cssClasses: ['flat', 'circular'],
      tooltipText: _('Shorter'),
    })
    minus.connect('clicked', () => nudge(-50))
    const plus = new Gtk.Button({
      iconName: 'list-add-symbolic',
      cssClasses: ['flat', 'circular'],
      tooltipText: _('Longer'),
    })
    plus.connect('clicked', () => nudge(50))
    setLabel()
    row.append(minus)
    row.append(label)
    row.append(plus)
    return row
  }

  private _refreshPreview(): void {
    this._syncPreviewFrames()
    this._stopPreviewTimer()
    this._applyPreviewFrame()
    this._restartPreviewTimer()
  }

  /**
   * Rebuild the onion-skin preview's frame paintables from the current
   * sequence (1:1 with `_frames`, `null` for an unresolved sprite so the
   * playback index stays aligned). Called on every sequence mutation;
   * the per-tick path only moves the current index.
   */
  private _syncPreviewFrames(): void {
    const set = this._spriteSet
    const paintables = set
      ? this._frames.map((f) => set.getSprite(f.spriteId)?.createPaintable({ keepAspectRatio: true }) ?? null)
      : []
    this._onion_preview.setFrames(paintables)
    // The timeline shares the sequence's per-frame durations.
    this._timeline.setFrames(this._durationList())
  }

  private _restartPreviewTimer(): void {
    this._stopPreviewTimer()
    if (!this._playing) return
    if (this._frames.length <= 1) return
    // Per-frame timing: schedule off the CURRENT frame's own duration and
    // reschedule each tick so a mixed-duration loop plays back accurately.
    const duration = Math.max(
      50,
      this._frames[this._previewIndex % this._frames.length]?.duration ?? DEFAULT_DURATION_MS,
    )
    this._previewTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
      this._previewIndex = (this._previewIndex + 1) % Math.max(1, this._frames.length)
      this._applyPreviewFrame()
      this._previewTimeoutId = 0
      this._restartPreviewTimer()
      return GLib.SOURCE_REMOVE
    })
  }

  private _stopPreviewTimer(): void {
    if (this._previewTimeoutId !== 0) {
      GLib.Source.remove(this._previewTimeoutId)
      this._previewTimeoutId = 0
    }
  }

  private _applyPreviewFrame(): void {
    if (this._frames.length === 0) {
      this._updateTimeLabel(0)
      return
    }
    const idx = this._previewIndex % this._frames.length
    this._onion_preview.setCurrentIndex(idx)
    this._timeline.setPlayheadFrame(idx)
    this._updateTimeLabel(frameStartTime(this._durationList(), idx))
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
    // Frames already carry their per-frame durations; copy so the caller
    // can't mutate our working array.
    return {
      id: name,
      frames: this._frames.map((f) => ({ ...f })),
    }
  }
}

GObject.type_ensure(AddAnimationDialog.$gtype)
