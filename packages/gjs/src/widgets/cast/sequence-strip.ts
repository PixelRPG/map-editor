import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { AnimationFrame } from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import type { GdkSpriteSetResource } from '../../sprite/index.ts'
import {
  chipWidthForDuration,
  clampFrameDuration,
  DEFAULT_DURATION_MS,
  DURATION_STEP_MS,
  SEQUENCE_THUMB_SIZE,
} from './add-animation-dialog.model.ts'
import { insertAt, moveTo, removeAt } from './animation-sequence.ts'

/**
 * The in-progress drag's payload, armed by the source (a sequence chip or
 * a draggable picker swatch outside the strip) and read by a gap
 * drop-zone. `move` reorders the frame at `from`; `insert` adds a new
 * frame for `spriteId`.
 */
type DragPayload = { kind: 'move'; from: number } | { kind: 'insert'; spriteId: number }

/**
 * Horizontal strip of the animation's frame sequence — the sole owner of
 * the frame list while the dialog is open.
 *
 * Each frame renders as a chip: the sprite thumbnail (click removes; drag
 * onto a caret gap reorders) over a −/ms/+ duration stepper. Chip width
 * scales with the frame's duration so the strip reads as a timeline. A
 * caret gap is interleaved around every chip (gap `i` sits before frame
 * `i`), acting as a drop-zone that inserts a dragged picker swatch or
 * moves a dragged chip to that index.
 *
 * Emits `frames-changed` on a structural edit (append / remove / insert /
 * reorder) and `duration-changed` when a stepper retimes one frame in
 * place — the host distinguishes them because a retime must not reset
 * playback position.
 */
export class SequenceStrip extends Gtk.Box {
  private _frames: AnimationFrame[] = []
  private _spriteSet: GdkSpriteSetResource | null = null
  private _defaultDuration = DEFAULT_DURATION_MS
  private _dragPayload: DragPayload | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgSequenceStrip',
        Properties: {
          'default-duration': GObject.ParamSpec.int(
            'default-duration',
            'Default duration',
            'Duration (ms) a newly appended or inserted frame starts at',
            GObject.ParamFlags.READWRITE,
            1,
            10000,
            DEFAULT_DURATION_MS,
          ),
        },
        Signals: {
          // A frame was added, removed or reordered — the sequence's
          // shape changed, so playback restarts from the first frame.
          'frames-changed': {},
          // One frame was retimed in place; the sequence's shape is
          // unchanged, so the host retimes without seeking.
          'duration-changed': {},
        },
      },
      SequenceStrip,
    )
  }

  constructor() {
    // Orientation / spacing / alignment are declared in
    // `add-animation-dialog.blp`, where this strip is instantiated.
    super()
    this._rebuild()
  }

  get defaultDuration(): number {
    return this._defaultDuration ?? DEFAULT_DURATION_MS
  }

  // notify-only: read per USE, not per build — `_defaultDuration` seeds
  // the duration of frames appended or dropped from here on. Existing
  // chips carry their own duration, so a change deliberately does not
  // retime them; `_rebuild`'s `?? this._defaultDuration` is a fallback
  // for a frame that somehow has none, not a build-time capture.
  set defaultDuration(value: number) {
    if (this._defaultDuration === value) return
    this._defaultDuration = value
    this.notify('default-duration')
  }

  /** The current sequence. Copied — callers can't mutate the strip's state. */
  get frames(): AnimationFrame[] {
    return this._frames.map((frame) => ({ ...frame }))
  }

  /** Per-frame durations (ms) in sequence order — the timeline's model. */
  get durations(): number[] {
    return this._frames.map((frame) => frame.duration)
  }

  get frameCount(): number {
    return this._frames.length
  }

  /** Replace the sequence programmatically. Silent — no signal is emitted. */
  setFrames(frames: readonly AnimationFrame[]): void {
    this._frames = frames.map((frame) => ({ ...frame }))
    this._rebuild()
  }

  /** Sprite source for chip thumbnails; `null` renders empty chips. */
  setSpriteSet(spriteSet: GdkSpriteSetResource | null): void {
    this._spriteSet = spriteSet
    this._rebuild()
  }

  /** Append a sprite at the default duration (the picker's click path). */
  appendFrame(spriteId: number): void {
    this._commit([...this._frames, { spriteId, duration: this._defaultDuration }])
  }

  /** Set every frame's duration to `duration` ("Apply default to all"). */
  applyDurationToAll(duration: number): void {
    this._frames = this._frames.map((frame) => ({ ...frame, duration }))
    this._rebuild()
    this.emit('duration-changed')
  }

  /**
   * Arm an INSERT for the next gap drop — called by the host when a
   * draggable picker swatch starts its drag, so a caret drop adds a new
   * frame there instead of appending.
   */
  armInsert(spriteId: number): void {
    this._dragPayload = { kind: 'insert', spriteId }
  }

  /** Drop the armed payload (the picker's drag ended without a caret drop). */
  disarm(): void {
    this._dragPayload = null
  }

  /** Adopt a new sequence, rebuild the chips and announce the change. */
  private _commit(frames: AnimationFrame[]): void {
    this._frames = frames
    this._rebuild()
    this.emit('frames-changed')
  }

  private _rebuild(): void {
    // Drop existing chips before re-adding so removal + append produce
    // the same widget shape (no append-only growth).
    let child = this.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this.remove(child)
      child = next
    }

    // Interleave a caret gap around every chip: gap 0, chip 0, gap 1, …,
    // chip n-1, gap n. Each gap is a drop-zone that inserts/moves a frame
    // AT that position (see `_buildGap`).
    this.append(this._buildGap(0))
    for (let i = 0; i < this._frames.length; i++) {
      this.append(this._buildChip(this._frames[i], i))
      this.append(this._buildGap(i + 1))
    }
  }

  /**
   * Build one caret gap. A thin drop-zone that accepts either a dragged
   * picker swatch (insert a new frame here) or a dragged chip (move the
   * frame here) — `gapIndex` is the insertion index. Highlights while a
   * drag hovers so the drop position reads as a caret.
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
   * Apply the armed drag payload at `gapIndex`: insert a new frame
   * (default duration) for a picker swatch, or move the dragged chip
   * there. Returns whether the drop was handled (GTK's `drop` contract).
   */
  private _applyDrop(gapIndex: number): boolean {
    const payload = this._dragPayload
    this._dragPayload = null
    if (!payload) return false
    this._commit(
      payload.kind === 'insert'
        ? insertAt(this._frames, gapIndex, { spriteId: payload.spriteId, duration: this._defaultDuration })
        : moveTo(this._frames, payload.from, gapIndex),
    )
    return true
  }

  /**
   * Build one chip: the frame's sprite thumbnail (click removes; drag it
   * onto a caret gap to reorder — the chip is a `Gtk.DragSource`, the gaps
   * are the drop-zones) stacked over a per-frame duration stepper. Click
   * and drag coexist — GTK suppresses the click once a press turns into a
   * drag.
   */
  private _buildChip(frame: AnimationFrame, index: number): Gtk.Box {
    const chip = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 })

    const paintable = this._spriteSet?.getSprite(frame.spriteId)?.createPaintable({ keepAspectRatio: true }) ?? null
    const picture = new Gtk.Picture({
      contentFit: Gtk.ContentFit.CONTAIN,
      canShrink: true,
      widthRequest: chipWidthForDuration(frame.duration),
      heightRequest: SEQUENCE_THUMB_SIZE,
    })
    picture.set_paintable(paintable)

    const button = new Gtk.Button({
      tooltipText: _('Drag to reorder · click to remove'),
      cssClasses: ['flat'],
    })
    button.set_child(picture)
    button.connect('clicked', () => this._commit(removeAt(this._frames, index)))
    button.add_controller(this._buildDragSource(index, paintable))

    chip.append(button)
    // Resize this chip live as its duration changes (timeline width),
    // without a full strip rebuild (which would destroy the stepper the
    // user is clicking).
    chip.append(
      this._buildDurationStepper(index, () => {
        picture.set_size_request(
          chipWidthForDuration(this._frames[index]?.duration ?? this._defaultDuration),
          SEQUENCE_THUMB_SIZE,
        )
      }),
    )
    return chip
  }

  /**
   * Drag source arming a MOVE of this frame's index; a gap drop-zone
   * reads the payload + reorders. The dragged sprite shows as the icon.
   */
  private _buildDragSource(index: number, paintable: Gdk.Paintable | null): Gtk.DragSource {
    const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE })
    dragSource.connect('prepare', () => {
      this._dragPayload = { kind: 'move', from: index }
      const value = new GObject.Value()
      value.init(GObject.TYPE_INT)
      value.set_int(index)
      return Gdk.ContentProvider.new_for_value(value)
    })
    if (paintable) {
      const hotspot = Math.round(SEQUENCE_THUMB_SIZE / 2)
      dragSource.connect('drag-begin', () => dragSource.set_icon(paintable, hotspot, hotspot))
    }
    dragSource.connect('drag-end', () => {
      this._dragPayload = null
    })
    return dragSource
  }

  /**
   * Compact −/ms/+ stepper for one frame's duration. Adjusts the frame in
   * ±{@link DURATION_STEP_MS} steps (clamped) and announces a retime so
   * the host can re-time a mixed-duration loop without seeking.
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
      frame.duration = clampFrameDuration(frame.duration + delta)
      setLabel()
      onChange()
      this.emit('duration-changed')
    }
    row.append(this._stepperButton('list-remove-symbolic', _('Shorter'), () => nudge(-DURATION_STEP_MS)))
    row.append(label)
    row.append(this._stepperButton('list-add-symbolic', _('Longer'), () => nudge(DURATION_STEP_MS)))
    setLabel()
    return row
  }

  private _stepperButton(iconName: string, tooltip: string, onClick: () => void): Gtk.Button {
    const button = new Gtk.Button({ iconName, cssClasses: ['flat', 'circular'], tooltipText: tooltip })
    button.connect('clicked', onClick)
    return button
  }
}

GObject.type_ensure(SequenceStrip.$gtype)
