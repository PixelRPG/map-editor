import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterDefinition } from '@pixelrpg/engine'
import { REQUIRED_ROLES } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import type { GdkSpriteSetResource } from '../../sprite/index.ts'
import { SignalScope } from '../../utils/signal-scope.ts'
import { cellAspectOf, cellDimensions } from '../editor/tile-palette.geometry.ts'
import { TilePalette } from '../editor/tile-palette.ts'
import {
  clampZoomLevel,
  DEFAULT_DURATION_MS,
  DEFAULT_ZOOM_LEVEL,
  isAnimationNameValid,
  reservedAnimationNames,
  ZOOM_LEVELS,
  zoomPercent,
} from './add-animation-dialog.model.ts'
import { AnimationTimeline } from './animation-timeline.ts'
import { frameAtTime, frameStartTime, totalDuration } from './animation-timeline.geometry.ts'
import { OnionSkinPreview } from './onion-skin-preview.ts'
import { SequenceStrip } from './sequence-strip.ts'

import Template from './add-animation-dialog.blp'

GObject.type_ensure(TilePalette.$gtype)
GObject.type_ensure(OnionSkinPreview.$gtype)
GObject.type_ensure(AnimationTimeline.$gtype)
GObject.type_ensure(SequenceStrip.$gtype)

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
 * - Frame sequence — a {@link SequenceStrip} owning the frame list,
 *   built by clicking sprites in the frame picker (`TilePalette`
 *   reused as a sprite-sheet grid) and edited chip by chip.
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
  declare _sequence_strip: SequenceStrip
  declare _timeline: AnimationTimeline
  declare _play_toggle: Gtk.ToggleButton
  declare _time_label: Gtk.Label
  declare _palette: TilePalette
  declare _add_frame_button: Gtk.MenuButton
  declare _apply_all_button: Gtk.Button
  declare _frame_picker: TilePalette

  private _character: CharacterDefinition | null = null
  private _spriteSet: GdkSpriteSetResource | null = null
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
  private _signals = new SignalScope()

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
    this._sequence_strip.setSpriteSet(spriteSet)

    if (existingAnimation) {
      // Per-frame durations round-trip verbatim; seed the default row
      // from the first frame so "Apply default to all" is a sane no-op.
      this._sequence_strip.setFrames(existingAnimation.frames)
      this._name_row.set_text(existingAnimation.id)
      this._duration_row.set_value(existingAnimation.frames[0]?.duration ?? DEFAULT_DURATION_MS)
      const isRequiredRole = (REQUIRED_ROLES as readonly string[]).includes(existingAnimation.id)
      this._name_row.set_sensitive(!isRequiredRole)
      this.set_title(_('Edit animation'))
    } else {
      this._sequence_strip.setFrames([])
      this._name_row.set_text('')
      this._duration_row.set_value(DEFAULT_DURATION_MS)
      this._name_row.set_sensitive(true)
      this.set_title(_('New animation'))
    }

    this._previewIndex = 0
    this._syncDefaultDuration()
    this._refreshSequenceState()
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
    this._wireButtons()
    this._wireZoom()
    this._wireInputs()
    this._wirePalette()
    this._wireSequence()
    this._restartPreviewTimer()
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    this._stopPreviewTimer()
    super.vfunc_unmap?.()
  }

  vfunc_closed(): void {
    this._stopPreviewTimer()
    super.vfunc_closed?.()
  }

  private _wireButtons(): void {
    this._signals.connect(this._cancel_button, 'clicked', () => this.close())
    this._signals.connect(this._save_button, 'clicked', () => {
      const animation = this._buildAnimation()
      if (!animation) return
      if (this._editingId !== null) this.emit('animation-edited', this._editingId, animation)
      else this.emit('animation-created', animation)
      this.close()
    })
  }

  /**
   * Bottom-right OSD zoom pill — mirrors the scene editor's
   * `FloatingZoom` pattern (the atlas's zoom pill): `[-] [N%] [+]`,
   * flat buttons inside a
   * `toolbar.osd` Box. Clamps at the endpoints; reset jumps back to
   * the default level.
   */
  private _wireZoom(): void {
    this._signals.connect(this._zoom_out_button, 'clicked', () => this._setZoomLevel(this._zoomLevel - 1))
    this._signals.connect(this._zoom_in_button, 'clicked', () => this._setZoomLevel(this._zoomLevel + 1))
    this._signals.connect(this._zoom_reset_button, 'clicked', () => this._setZoomLevel(DEFAULT_ZOOM_LEVEL))
  }

  private _setZoomLevel(level: number): void {
    const next = clampZoomLevel(level)
    if (next === this._zoomLevel) return
    this._zoomLevel = next
    this._applyZoom()
  }

  /**
   * Push the current zoom level to the picker (tile-size) + the
   * preview frame (via `_refreshPreviewSize`) so the rendered sprite
   * size is identical in both surfaces. Updates the OSD label as a
   * percentage relative to the default level and re-greys the
   * endpoint buttons.
   */
  private _applyZoom(): void {
    this._palette.tileSize = ZOOM_LEVELS[this._zoomLevel]
    this._refreshPreviewSize()
    this.zoomLabel = `${zoomPercent(this._zoomLevel)}%`
    this._zoom_out_button.set_sensitive(this._zoomLevel > 0)
    this._zoom_in_button.set_sensitive(this._zoomLevel < ZOOM_LEVELS.length - 1)
  }

  /**
   * Resize the preview picture so its render rect matches the
   * picker's swatch dimensions. The frame wraps to fit the picture +
   * its 8px margins, so the on-screen character ends up at the SAME
   * pixel size as in the picker cells the user is selecting from.
   */
  private _refreshPreviewSize(): void {
    const [w, h] = cellDimensions(this._palette.tileSize, this._cellAspect)
    this._onion_preview.set_size_request(w, h)
  }

  private _wireInputs(): void {
    this._signals.connect(this._onion_toggle, 'toggled', () =>
      this._onion_preview.setOnion(this._onion_toggle.get_active()),
    )
    this._signals.connect(this._name_row, 'changed', () => this._refreshValidity())
    // The duration row is now the DEFAULT for new frames (per-frame
    // durations are edited on each chip); "Apply default to all" pushes
    // it across the whole sequence.
    this._signals.connect(this._duration_row, 'notify::value', () => this._syncDefaultDuration())
    this._signals.connect(this._apply_all_button, 'clicked', () =>
      this._sequence_strip.applyDurationToAll(this._defaultDuration()),
    )
  }

  private _wirePalette(): void {
    // Both pickers (the big side grid + the compact header popover) append
    // the clicked sprite to the end of the sequence. The popover also
    // pops down so the user lands back on the timeline.
    this._signals.connect(this._palette, 'tile-selected', (_p: TilePalette, spriteId: number) =>
      this._sequence_strip.appendFrame(spriteId),
    )
    this._signals.connect(this._frame_picker, 'tile-selected', (_p: TilePalette, spriteId: number) => {
      this._sequence_strip.appendFrame(spriteId)
      this._add_frame_button.popdown()
    })
    // Dragging a swatch arms an INSERT so a gap drop-zone adds a new frame
    // at that caret (vs. click, which appends). Both pickers are drag-source
    // enabled in the blp.
    for (const picker of [this._palette, this._frame_picker]) {
      this._signals.connect(picker, 'tile-drag-started', (_p: TilePalette, spriteId: number) =>
        this._sequence_strip.armInsert(spriteId),
      )
      this._signals.connect(picker, 'tile-drag-ended', () => this._sequence_strip.disarm())
    }
  }

  /**
   * Wire the sequence strip + the timeline dock: structural edits restart
   * playback from the first frame, a retime only re-times it, the
   * play/pause transport toggles the loop, and dragging the playhead
   * scrubs — pausing playback and jumping the preview to the frame under
   * the playhead.
   */
  private _wireSequence(): void {
    this._signals.connect(this._sequence_strip, 'frames-changed', () => {
      this._previewIndex = 0
      this._refreshSequenceState()
      this._refreshPreview()
      this._refreshValidity()
    })
    this._signals.connect(this._sequence_strip, 'duration-changed', () => this._refreshPreview())
    this._signals.connect(this._play_toggle, 'toggled', () => this._setPlaying(this._play_toggle.get_active()))
    this._signals.connect(this._timeline, 'scrubbed', (_t: AnimationTimeline, timeMs: number) => this._onScrub(timeMs))
  }

  /** Duration (ms) a newly added frame starts at — the settings spin row. */
  private _defaultDuration(): number {
    return Math.round(this._duration_row.get_value())
  }

  private _syncDefaultDuration(): void {
    this._sequence_strip.defaultDuration = this._defaultDuration()
  }

  private _refreshSequenceState(): void {
    this.sequenceState = this._sequence_strip.frameCount === 0 ? 'empty' : 'populated'
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
    const durations = this._sequence_strip.durations
    if (durations.length === 0) return
    if (this._play_toggle.get_active()) this._play_toggle.set_active(false)
    else this._setPlaying(false)
    const idx = frameAtTime(durations, timeMs)
    if (idx >= 0) {
      this._previewIndex = idx
      this._onion_preview.setCurrentIndex(idx)
    }
    this._timeline.setPlayheadTime(timeMs)
    this._updateTimeLabel(timeMs)
  }

  /** Update the "current / total ms" caption beside the timeline. */
  private _updateTimeLabel(timeMs: number): void {
    const durations = this._sequence_strip.durations
    const total = durations.length === 0 ? 0 : totalDuration(durations)
    this._time_label.set_label(`${Math.round(timeMs)} / ${total} ms`)
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
    // Drives `_refreshPreviewSize` so the preview frame matches the
    // picker's swatch dimensions.
    this._cellAspect = cellAspectOf(sheet.sprites[0]) ?? 1
    this._refreshPreviewSize()
  }

  private _refreshPreview(): void {
    this._syncPreviewFrames()
    this._stopPreviewTimer()
    this._applyPreviewFrame()
    this._restartPreviewTimer()
  }

  /**
   * Rebuild the onion-skin preview's frame paintables from the current
   * sequence (1:1 with the strip's frames, `null` for an unresolved sprite
   * so the playback index stays aligned). Called on every sequence
   * mutation; the per-tick path only moves the current index.
   */
  private _syncPreviewFrames(): void {
    const set = this._spriteSet
    this._onion_preview.setFrames(
      set
        ? this._sequence_strip.frames.map(
            (f) => set.getSprite(f.spriteId)?.createPaintable({ keepAspectRatio: true }) ?? null,
          )
        : [],
    )
    // The timeline shares the sequence's per-frame durations.
    this._timeline.setFrames(this._sequence_strip.durations)
  }

  private _restartPreviewTimer(): void {
    this._stopPreviewTimer()
    if (!this._playing) return
    const durations = this._sequence_strip.durations
    if (durations.length <= 1) return
    // Per-frame timing: schedule off the CURRENT frame's own duration and
    // reschedule each tick so a mixed-duration loop plays back accurately.
    const duration = Math.max(50, durations[this._previewIndex % durations.length] ?? DEFAULT_DURATION_MS)
    this._previewTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, duration, () => {
      this._previewIndex = (this._previewIndex + 1) % Math.max(1, this._sequence_strip.frameCount)
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
    const durations = this._sequence_strip.durations
    if (durations.length === 0) {
      this._updateTimeLabel(0)
      return
    }
    const idx = this._previewIndex % durations.length
    this._onion_preview.setCurrentIndex(idx)
    this._timeline.setPlayheadFrame(idx)
    this._updateTimeLabel(frameStartTime(durations, idx))
  }

  /** Recompute Save-button sensitivity from the current name + frames state. */
  private _refreshValidity(): void {
    const reserved = reservedAnimationNames(REQUIRED_ROLES, this._character?.animations ?? [], this._editingId)
    const name = this._name_row.get_text().trim()
    this._save_button.set_sensitive(isAnimationNameValid(name, reserved, this._sequence_strip.frameCount))
  }

  private _buildAnimation(): CharacterAnimation | null {
    const name = this._name_row.get_text().trim()
    const frames = this._sequence_strip.frames
    if (!name || frames.length === 0) return null
    return { id: name, frames }
  }
}

GObject.type_ensure(AddAnimationDialog.$gtype)
