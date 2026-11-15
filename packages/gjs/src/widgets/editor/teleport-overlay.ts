import Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Graphene from '@girs/graphene-1.0'
import Gsk from '@girs/gsk-4.0'
import Gtk from '@girs/gtk-4.0'
import Pango from '@girs/pango-1.0'
import { gettext as _ } from 'gettext'
import type { SampleScene, SampleTeleport } from '../../__demo__/world-sample'
import type { SceneRect } from './atlas-canvas.geometry.ts'
import {
  type ConnectionHit,
  connectionTouches,
  type DoorRef,
  fanGroups,
  type MapConnection,
  pairDoors,
} from './map-connections.model.ts'
import {
  arrowheadPoints,
  cardAtPoint,
  clipToViewport,
  distanceToQuad,
  type EndpointCard,
  fanFactor,
  fannedControl,
  type OverlayPoint,
  type PlacedCard,
  pointOnQuad,
  rectContains,
  stubEnd,
  teleportEndpoint,
  tileAtPoint,
} from './teleport-overlay.geometry.ts'

const ACCENT_FALLBACK = '#3584e4'
const BROKEN_FALLBACK = '#e01b24'

const STROKE_WIDTH = 2
const STROKE_DASH: [number, number] = [6, 4]

/** Opacity of the lines of a card that is neither selected nor hovered. */
const OPACITY_DIMMED = 0.35
/** Opacity when nothing on the atlas is selected or hovered. */
const OPACITY_NORMAL = 0.85
/** Opacity of the selected card's lines, and of a hovered one. */
const OPACITY_FOCUSED = 1

/**
 * Zoom (widget px per atlas px) below which the lines are hidden —
 * REDESIGN.md § 6.2. At a tenth of a pixel per atlas px the cards are
 * thumbnails and a dozen curves across them is noise, so only the
 * selected card keeps its lines, which is how the user asks "where does
 * THIS one lead" while zoomed out.
 */
const LINE_HIDE_ZOOM = 0.25

/** Side of the door glyph's rounded square, and its corner radius. */
const DOOR_GLYPH_SIZE = 11
const DOOR_GLYPH_RADIUS = 3
/** The white knob on the door glyph: radius, and offset from its centre. */
const DOOR_KNOB_RADIUS = 1.7
const DOOR_KNOB_OFFSET = 0.24

/** The round dot at a one-way's arrival tile — deliberately not a door. */
const ARRIVAL_RING_RADIUS = 5
const ARRIVAL_CORE_RADIUS = 3.2

const ARROW_SIZE = 9

/**
 * The drag handle on every door of the SELECTED map — the expert path of
 * REDESIGN.md § 6.2: drag from a door onto another card to say where it
 * leads. Only the selected map grows handles, so the atlas is not a
 * field of grab targets, and a handle is bigger to the pointer than it
 * is to the eye because it is dragged, not admired.
 */
const HANDLE_RING_RADIUS = 10
const HANDLE_HIT_RADIUS = 15

/** Length of the stub a door that goes nowhere trails off into. */
const STUB_LENGTH = 34
/** Radius of the disc carrying the broken door's "!". */
const BROKEN_BADGE_RADIUS = 8

/**
 * Where along a line its name pill sits — near the far end, so the pill
 * reads as a label on the map it names rather than as a label on the
 * line's middle (which is where three of them used to collide).
 */
const LABEL_T = 0.85

/** Clearance a label keeps from the marker it belongs to. */
const LABEL_GAP = 12

const LABEL_FONT_SIZE_PT = 10
const LABEL_PADDING_X = 8
const LABEL_PADDING_Y = 2

/** How far from a line the pointer may be and still hit it. */
const LINE_HIT_RADIUS = 12

/**
 * One connection as it is drawn: the model's line plus the three points
 * the Bézier needs, in surface coords.
 */
interface DrawnConnection {
  connection: MapConnection
  a: OverlayPoint
  control: OverlayPoint
  b: OverlayPoint
  /** Map id the far end belongs to, or `null` for a broken door. */
  farMapId: string | null
}

/** An edge chip from the last frame, for {@link TeleportOverlay.chipAt}. */
interface EdgeChip {
  rect: SceneRect
  mapId: string
}

/** A door of the selected map, and the point its drag handle sits on. */
export interface DoorHandle {
  point: OverlayPoint
  door: DoorRef
}

/** A drag-to-connect in flight: the door it started at, and the pointer. */
export interface ConnectDrag {
  from: OverlayPoint
  to: OverlayPoint
}

/**
 * Vector overlay that draws the connections between maps on top of the
 * atlas canvas (REDESIGN.md § 6.2).
 *
 * What a line says, by shape rather than by colour alone:
 * - a door and its way back are ONE solid line with a door glyph at
 *   both ends,
 * - a door with no way back is dashed and carries an arrowhead at the
 *   tile the hero arrives on,
 * - a door whose target does not resolve trails off into a short stub
 *   with a "!" — there is no far end to reach.
 *
 * Both ends sit on the door's own tile of the whole-map card, and
 * several lines between the same two cards fan apart. Names are shown
 * on demand only: for the selected card's lines and for a hovered one.
 * A line whose far end is off-screen stops at the viewport edge in a
 * "→ Name" chip the host turns into a pan.
 *
 * All drawing happens in `vfunc_snapshot` — no SVG, no Cairo offscreen.
 * The curve, fan, clip and hit-test maths is pure in
 * `teleport-overlay.geometry.ts`; the pairing is pure in
 * `map-connections.model.ts`.
 */
export class TeleportOverlay extends Gtk.Widget {
  private _scenes: SampleScene[] = []
  private _teleports: SampleTeleport[] = []
  /** Drawn card body rects by scene id — the atlas camera's output. */
  private _rects = new Map<string, SceneRect>()
  private _selectedId: string | null = null
  private _accentColor: Gdk.RGBA
  private _brokenColor: Gdk.RGBA
  /** The folded lines with their geometry, rebuilt by {@link setWorld}. */
  private _layout: DrawnConnection[] = []
  /** Index into {@link _layout} of the line under the pointer. */
  private _hovered: number | null = null
  private _hoverPoint: OverlayPoint | null = null
  /** The visible region in surface coords, or `null` while unknown. */
  private _viewport: SceneRect | null = null
  private _zoom = 1
  /** Edge chips placed by the last snapshot — see {@link chipAt}. */
  private _chips: EdgeChip[] = []
  /** Drag handles of the selected map's doors — see {@link handleAt}. */
  private _handles: DoorHandle[] = []
  /** The drag-to-connect in flight, or `null`. */
  private _connect: ConnectDrag | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTeleportOverlay',
      },
      TeleportOverlay,
    )
  }

  constructor() {
    super()
    this._accentColor = new Gdk.RGBA()
    this._accentColor.parse(ACCENT_FALLBACK)
    this._brokenColor = new Gdk.RGBA()
    this._brokenColor.parse(BROKEN_FALLBACK)
    this.can_target = false
    this.set_hexpand(true)
    this.set_vexpand(true)
  }

  /**
   * Replace the drawn world. `rects` maps each scene id to the card
   * body rect the atlas camera placed on the surface — the overlay
   * derives every endpoint from those, so it needs no zoom of its own
   * and stays correct for cards floored to the minimum size.
   */
  setWorld(scenes: SampleScene[], teleports: SampleTeleport[], rects: Map<string, SceneRect>): void {
    this._scenes = scenes
    this._teleports = teleports
    this._rects = rects
    this._rebuildLayout()
    this.queue_draw()
  }

  setSelected(id: string | null): void {
    if (this._selectedId === id) return
    this._selectedId = id
    this._rebuildHandles()
    this.queue_draw()
  }

  /**
   * Tell the overlay where the pointer is, in surface coords, or `null`
   * when it has left. Only redraws when the line under it changes, so
   * this is safe to call from a motion handler.
   */
  setHoverPoint(point: OverlayPoint | null): void {
    this._hoverPoint = point
    const hovered = point ? this._hitIndex(point) : null
    if (hovered === this._hovered) return
    this._hovered = hovered
    this.queue_draw()
  }

  /**
   * The visible region in surface coords. Lines leaving it end in an
   * edge chip naming the map they lead to; without a viewport no chip
   * is drawn, because every line would look as if it left.
   */
  setViewport(rect: SceneRect): void {
    const current = this._viewport
    if (current && current.x === rect.x && current.y === rect.y && current.w === rect.w && current.h === rect.h) return
    this._viewport = { ...rect }
    this.queue_draw()
  }

  /** The camera's zoom, for the {@link LINE_HIDE_ZOOM} threshold. */
  setZoom(zoom: number): void {
    if (this._zoom === zoom) return
    this._zoom = zoom
    this.queue_draw()
  }

  /**
   * The connection under `point` (surface coords) together with the
   * doors it draws, or `null`. Used by the canvas to open a line's
   * popover, whose items act on those doors.
   */
  connectionAt(point: OverlayPoint): ConnectionHit | null {
    const index = this._hitIndex(point)
    if (index === null) return null
    const { connection } = this._layout[index]
    return { connection, doors: this._doorRefs(connection) }
  }

  /**
   * The drag handle under `point` (surface coords), or `null`. A press
   * on one starts a drag-to-connect instead of moving the card it sits
   * on.
   *
   * Returns the handle rather than just its door because the caller
   * needs both: the door to act on, and the point to draw the dragged
   * line from — which is the door's tile, not the pixel the finger
   * happened to land on inside the handle.
   */
  handleAt(point: OverlayPoint): DoorHandle | null {
    let best: DoorHandle | null = null
    let bestDistance = HANDLE_HIT_RADIUS
    for (const handle of this._handles) {
      const distance = Math.hypot(handle.point.x - point.x, handle.point.y - point.y)
      if (distance <= bestDistance) {
        bestDistance = distance
        best = handle
      }
    }
    return best
  }

  /**
   * Show (or clear) the line a drag-to-connect is dragging. Drawn as a
   * preview only — the host decides on drop whether anything is written.
   */
  setConnectDrag(drag: ConnectDrag | null): void {
    this._connect = drag
    this.queue_draw()
  }

  /**
   * The map and tile a drop at `point` (surface coords) means, or `null`
   * when it landed on the backdrop.
   *
   * The card is picked from the rects the camera last placed rather than
   * from GTK: the overlay is `can_target = false`, so it cannot pick the
   * sibling card the pointer is over, and the rects are the same numbers
   * the user saw drawn.
   */
  dropTargetAt(point: OverlayPoint): { mapId: string; tile: { x: number; y: number } } | null {
    const cards: PlacedCard[] = []
    for (const scene of this._scenes) {
      const rect = this._rects.get(scene.id)
      if (rect) cards.push({ mapId: scene.id, rect })
    }
    const mapId = cardAtPoint(cards, point)
    if (!mapId) return null
    const card = this._cardOf(mapId)
    if (!card) return null
    return { mapId, tile: tileAtPoint(card, point) }
  }

  /**
   * The doors a connection was folded from, resolved from the model's
   * input indices back to the teleports they came from.
   *
   * The model works in indices because it is pure and knows nothing
   * about placements; the overlay holds the list those indices point
   * into, so this is the only place the two can be joined. A door whose
   * index no longer resolves is dropped rather than faked — the world
   * was replaced under a stale hit, and an empty popover is better than
   * one acting on the wrong placement.
   */
  private _doorRefs(connection: MapConnection): DoorRef[] {
    const refs: DoorRef[] = []
    for (const index of connection.doors) {
      const door = this._teleports[index]
      if (door) refs.push({ mapId: door.from, placementId: door.placementId })
    }
    return refs
  }

  /**
   * The map id of the edge chip under `point` (surface coords), or
   * `null`.
   *
   * Answered from the chips the LAST frame placed: a chip's size is its
   * text's size, which only Pango knows, so the rects exist after a
   * snapshot rather than before one. A click arrives against the frame
   * the user was looking at, so that is the right frame to test.
   */
  chipAt(point: OverlayPoint): string | null {
    for (const chip of this._chips) {
      if (rectContains(chip.rect, point)) return chip.mapId
    }
    return null
  }

  vfunc_snapshot(snapshot: Gtk.Snapshot): void {
    if (!this._layout.length && !this._handles.length) return

    const accent = this._lookupColor('accent_bg_color', this._accentColor)
    this._accentColor = accent
    const broken = this._lookupColor('destructive_bg_color', this._brokenColor)
    this._brokenColor = broken
    const white = new Gdk.RGBA()
    white.parse('#ffffff')

    const solid = new Gsk.Stroke(STROKE_WIDTH)
    solid.set_line_cap(Gsk.LineCap.ROUND)
    const dashed = new Gsk.Stroke(STROKE_WIDTH)
    dashed.set_dash(STROKE_DASH)
    dashed.set_line_cap(Gsk.LineCap.ROUND)

    this._chips = []
    this._layout.forEach((drawn, index) => {
      if (!this._isVisible(drawn)) return
      this._drawConnection(snapshot, drawn, index, { solid, dashed, accent, broken, white })
    })

    // Last, so the thing being dragged and the things that can be
    // grabbed are never hidden under a line that merely passes over.
    if (this._connect) this._drawConnectDrag(snapshot, this._connect, dashed, accent, white)
    this._drawHandles(snapshot, accent, white)
  }

  /**
   * The line a drag-to-connect is dragging: dashed from the door to the
   * pointer, with the arrival dot at the pointer end.
   *
   * Straight rather than bowed, and borrowing the one-way line's dash
   * plus arrival dot: the drag is a one-way target being aimed, so it
   * looks like what it is about to produce, and a straight line keeps
   * the far end exactly under the finger that is placing it.
   */
  private _drawConnectDrag(
    snapshot: Gtk.Snapshot,
    drag: ConnectDrag,
    dashed: Gsk.Stroke,
    colour: Gdk.RGBA,
    white: Gdk.RGBA,
  ): void {
    const builder = new Gsk.PathBuilder()
    builder.move_to(drag.from.x, drag.from.y)
    builder.line_to(drag.to.x, drag.to.y)
    snapshot.push_stroke(builder.to_path(), dashed)
    snapshot.append_color(colour, this._coverRect())
    snapshot.pop()
    this._drawDisc(snapshot, drag.to.x, drag.to.y, ARRIVAL_RING_RADIUS, colour)
    this._drawDisc(snapshot, drag.to.x, drag.to.y, ARRIVAL_CORE_RADIUS, white)
  }

  /** The grab target on each door of the selected map. */
  private _drawHandles(snapshot: Gtk.Snapshot, colour: Gdk.RGBA, white: Gdk.RGBA): void {
    for (const handle of this._handles) {
      this._drawDisc(snapshot, handle.point.x, handle.point.y, HANDLE_RING_RADIUS, colour)
      this._drawDisc(snapshot, handle.point.x, handle.point.y, HANDLE_RING_RADIUS - STROKE_WIDTH, white)
      this._drawDoorGlyph(snapshot, handle.point, colour, white)
    }
  }

  /**
   * Fold the doors into lines and place their endpoints. Runs per world
   * update — including every frame of a card drag, which is a handful of
   * doors and a few dozen flops.
   */
  private _rebuildLayout(): void {
    const byId = new Map<string, SampleScene>()
    for (const scene of this._scenes) byId.set(scene.id, scene)

    const connections = pairDoors(this._teleports)
    const fans = fanGroups(connections)
    const layout: DrawnConnection[] = []

    connections.forEach((connection, index) => {
      const a = this._endpoint(byId, connection.from.mapId, connection.from.tileX, connection.from.tileY)
      if (!a) return

      if (connection.to === null) {
        const rect = this._rects.get(connection.from.mapId)
        if (!rect) return
        const centre = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }
        const b = stubEnd(centre, a, STUB_LENGTH)
        // A stub is too short for a bow to read as anything but a wobble.
        layout.push({ connection, a, control: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, b, farMapId: null })
        return
      }

      const b = this._endpoint(byId, connection.to.mapId, connection.to.tileX, connection.to.tileY)
      if (!b) return
      const factor = fanFactor(fans[index].index, fans[index].count)
      layout.push({ connection, a, control: fannedControl(a, b, factor), b, farMapId: connection.to.mapId })
    })

    this._layout = layout
    // The lines moved under a pointer that has not — re-resolve the hover
    // against the new geometry instead of highlighting a stale index.
    this._hovered = this._hoverPoint ? this._hitIndex(this._hoverPoint) : null
    this._chips = []
    this._rebuildHandles()
  }

  /** Whether `drawn` is painted at all at the current zoom. */
  private _isVisible(drawn: DrawnConnection): boolean {
    if (this._zoom >= LINE_HIDE_ZOOM) return true
    return this._selectedId !== null && connectionTouches(drawn.connection, this._selectedId)
  }

  private _drawConnection(
    snapshot: Gtk.Snapshot,
    drawn: DrawnConnection,
    index: number,
    paint: { solid: Gsk.Stroke; dashed: Gsk.Stroke; accent: Gdk.RGBA; broken: Gdk.RGBA; white: Gdk.RGBA },
  ): void {
    const { connection, a, control, b } = drawn
    const isBroken = connection.kind === 'broken'
    const colour = isBroken ? paint.broken : paint.accent
    const selected = this._selectedId !== null && connectionTouches(connection, this._selectedId)
    const focused = selected || this._hovered === index

    snapshot.push_opacity(this._opacityFor(focused))

    const builder = new Gsk.PathBuilder()
    builder.move_to(a.x, a.y)
    builder.quad_to(control.x, control.y, b.x, b.y)
    // Solid = you can come back. Dashed = one way only. The shape says
    // it, so the meaning survives a colour-blind reading.
    snapshot.push_stroke(builder.to_path(), connection.kind === 'one-way' ? paint.dashed : paint.solid)
    snapshot.append_color(colour, this._coverRect())
    snapshot.pop()

    this._drawDoorGlyph(snapshot, a, colour, paint.white)
    if (isBroken) {
      this._drawBrokenBadge(snapshot, b, paint.broken, paint.white)
    } else if (connection.kind === 'pair') {
      this._drawDoorGlyph(snapshot, b, colour, paint.white)
    } else {
      this._drawDisc(snapshot, b.x, b.y, ARRIVAL_RING_RADIUS, colour)
      this._drawDisc(snapshot, b.x, b.y, ARRIVAL_CORE_RADIUS, paint.white)
      this._drawArrowhead(snapshot, control, b, colour)
    }

    if (focused) this._drawNamePill(snapshot, drawn, colour, paint.white)
    this._drawEdgeChip(snapshot, drawn, colour, paint.white)

    snapshot.pop()
  }

  private _opacityFor(focused: boolean): number {
    if (focused) return OPACITY_FOCUSED
    const anyFocus = this._selectedId !== null || this._hovered !== null
    return anyFocus ? OPACITY_DIMMED : OPACITY_NORMAL
  }

  /**
   * The name pill of a focused line, at the end that is NOT the map the
   * user is looking at: the selected card's own name is already on the
   * card, so repeating it there would say nothing while the far end is
   * the answer to "where does this go".
   */
  private _drawNamePill(snapshot: Gtk.Snapshot, drawn: DrawnConnection, bg: Gdk.RGBA, fg: Gdk.RGBA): void {
    const { connection, a, control, b } = drawn
    if (connection.to === null) {
      // Past the "!" badge rather than on it, along the stub's own line.
      this._drawPill(snapshot, stubEnd(a, b, BROKEN_BADGE_RADIUS + LABEL_GAP), _('Goes nowhere'), bg, fg)
      return
    }
    const atFarEnd = this._selectedId === null || this._selectedId !== connection.to.mapId
    const mapId = atFarEnd ? connection.to.mapId : connection.from.mapId
    const name = this._sceneName(mapId)
    if (!name) return
    this._drawPill(snapshot, pointOnQuad(a, control, b, atFarEnd ? LABEL_T : 1 - LABEL_T), name, bg, fg)
  }

  /**
   * A chip where a line leaves the visible atlas, naming the map at its
   * far end. The host pans there when it is tapped — the only reason the
   * rect is remembered.
   */
  private _drawEdgeChip(snapshot: Gtk.Snapshot, drawn: DrawnConnection, bg: Gdk.RGBA, fg: Gdk.RGBA): void {
    const viewport = this._viewport
    if (!viewport || !drawn.farMapId) return
    const exit = clipToViewport(drawn.a, drawn.b, viewport)
    if (!exit) return
    const name = this._sceneName(drawn.farMapId)
    if (!name) return
    const rect = this._drawPill(snapshot, exit, _('→ %s').replace('%s', name), bg, fg, viewport)
    this._chips.push({ rect, mapId: drawn.farMapId })
  }

  private _endpoint(
    byId: Map<string, SampleScene>,
    sceneId: string,
    tileX: number,
    tileY: number,
  ): OverlayPoint | null {
    const card = this._cardOf(sceneId, byId.get(sceneId))
    if (!card) return null
    return teleportEndpoint(card, { x: tileX, y: tileY })
  }

  /**
   * The scene's drawn body rect plus its tile dimensions — everything
   * both {@link teleportEndpoint} and {@link tileAtPoint} need, and the
   * one place the two derivations of "how many tiles is this map" live.
   */
  private _cardOf(sceneId: string, known?: SampleScene): EndpointCard | null {
    const scene = known ?? this._scenes.find((candidate) => candidate.id === sceneId)
    const rect = this._rects.get(sceneId)
    if (!scene || !rect) return null
    const cols = scene.rows[0]?.length || scene.cols || 0
    const rows = scene.rows.length || scene.previewRows || 0
    if (!cols || !rows) return null
    return { rect, cols, rows }
  }

  /**
   * Place a drag handle on every door that LEAVES the selected map.
   *
   * Only the outgoing end gets one: a handle means "drag me to say where
   * this goes", and the far end of a pair belongs to the other map,
   * where it will grow its own handle when that map is selected.
   */
  private _rebuildHandles(): void {
    const handles: DoorHandle[] = []
    const selected = this._selectedId
    if (selected) {
      const byId = new Map<string, SampleScene>()
      for (const scene of this._scenes) byId.set(scene.id, scene)
      for (const teleport of this._teleports) {
        if (teleport.from !== selected) continue
        const point = this._endpoint(byId, teleport.from, teleport.fx, teleport.fy)
        if (point) handles.push({ point, door: { mapId: teleport.from, placementId: teleport.placementId } })
      }
    }
    this._handles = handles
  }

  private _sceneName(sceneId: string): string {
    return this._scenes.find((scene) => scene.id === sceneId)?.name ?? ''
  }

  /** Index of the line nearest `point`, within {@link LINE_HIT_RADIUS}. */
  private _hitIndex(point: OverlayPoint): number | null {
    let best: number | null = null
    let bestDistance = LINE_HIT_RADIUS
    this._layout.forEach((drawn, index) => {
      if (!this._isVisible(drawn)) return
      const distance = distanceToQuad(drawn.a, drawn.control, drawn.b, point)
      if (distance <= bestDistance) {
        bestDistance = distance
        best = index
      }
    })
    return best
  }

  private _coverRect(): Graphene.Rect {
    const rect = new Graphene.Rect()
    rect.init(0, 0, this.get_width() || 1, this.get_height() || 1)
    return rect
  }

  /**
   * The door marker: a rounded square with a knob, so a door end never
   * reads as the round arrival dot at the other kind of end.
   */
  private _drawDoorGlyph(snapshot: Gtk.Snapshot, at: OverlayPoint, colour: Gdk.RGBA, knob: Gdk.RGBA): void {
    const half = DOOR_GLYPH_SIZE / 2
    const rect = new Graphene.Rect()
    rect.init(at.x - half, at.y - half, DOOR_GLYPH_SIZE, DOOR_GLYPH_SIZE)
    const rounded = new Gsk.RoundedRect()
    rounded.init_from_rect(rect, DOOR_GLYPH_RADIUS)
    snapshot.push_rounded_clip(rounded)
    snapshot.append_color(colour, rect)
    snapshot.pop()
    this._drawDisc(snapshot, at.x + DOOR_GLYPH_SIZE * DOOR_KNOB_OFFSET, at.y, DOOR_KNOB_RADIUS, knob)
  }

  /** The "!" disc that ends a door leading nowhere. */
  private _drawBrokenBadge(snapshot: Gtk.Snapshot, at: OverlayPoint, colour: Gdk.RGBA, fg: Gdk.RGBA): void {
    this._drawDisc(snapshot, at.x, at.y, BROKEN_BADGE_RADIUS, colour)
    const layout = this._layoutFor('!')
    const [w, h] = layout.get_pixel_size()
    snapshot.save()
    snapshot.translate(new Graphene.Point({ x: at.x - w / 2, y: at.y - h / 2 }))
    snapshot.append_layout(layout, fg)
    snapshot.restore()
  }

  private _drawDisc(snapshot: Gtk.Snapshot, cx: number, cy: number, r: number, color: Gdk.RGBA): void {
    const builder = new Gsk.PathBuilder()
    builder.add_circle(new Graphene.Point({ x: cx, y: cy }), r)
    const path = builder.to_path()
    snapshot.push_fill(path, Gsk.FillRule.WINDING)
    const rect = new Graphene.Rect()
    rect.init(cx - r, cy - r, r * 2, r * 2)
    snapshot.append_color(color, rect)
    snapshot.pop()
  }

  /**
   * Filled triangle at `tip`, oriented along the incoming direction
   * `from → tip`. Sits at the arrival end of a one-way line, which is
   * the only place direction has to be read off the line itself.
   */
  private _drawArrowhead(snapshot: Gtk.Snapshot, from: OverlayPoint, tip: OverlayPoint, color: Gdk.RGBA): void {
    const size = ARROW_SIZE
    const [apex, left, right] = arrowheadPoints(from, tip, size)
    const builder = new Gsk.PathBuilder()
    builder.move_to(apex.x, apex.y)
    builder.line_to(left.x, left.y)
    builder.line_to(right.x, right.y)
    builder.close()
    snapshot.push_fill(builder.to_path(), Gsk.FillRule.WINDING)
    const rect = new Graphene.Rect()
    rect.init(tip.x - size * 2, tip.y - size * 2, size * 4, size * 4)
    snapshot.append_color(color, rect)
    snapshot.pop()
  }

  /**
   * A rounded label pill centred on `at`, nudged to stay inside `bounds`
   * when given one. Returns the rect it occupies, so an edge chip can be
   * hit-tested later.
   */
  private _drawPill(
    snapshot: Gtk.Snapshot,
    at: OverlayPoint,
    text: string,
    bg: Gdk.RGBA,
    fg: Gdk.RGBA,
    bounds?: SceneRect,
  ): SceneRect {
    const layout = this._layoutFor(text)
    const [w, h] = layout.get_pixel_size()
    const pillW = w + LABEL_PADDING_X * 2
    const pillH = h + LABEL_PADDING_Y * 2
    let x = at.x - pillW / 2
    let y = at.y - pillH / 2
    if (bounds) {
      x = Math.min(Math.max(x, bounds.x), bounds.x + Math.max(bounds.w - pillW, 0))
      y = Math.min(Math.max(y, bounds.y), bounds.y + Math.max(bounds.h - pillH, 0))
    }

    const pillRect = new Graphene.Rect()
    pillRect.init(x, y, pillW, pillH)
    const rounded = new Gsk.RoundedRect()
    rounded.init_from_rect(pillRect, pillH / 2)

    snapshot.push_rounded_clip(rounded)
    snapshot.append_color(bg, pillRect)
    snapshot.pop()

    snapshot.save()
    snapshot.translate(new Graphene.Point({ x: x + LABEL_PADDING_X, y: y + LABEL_PADDING_Y }))
    snapshot.append_layout(layout, fg)
    snapshot.restore()

    return { x, y, w: pillW, h: pillH }
  }

  private _layoutFor(text: string): Pango.Layout {
    const ctx = this.get_pango_context()
    const layout = Pango.Layout.new(ctx)
    const fontDesc = ctx.get_font_description()?.copy() ?? Pango.FontDescription.new()
    fontDesc.set_size(LABEL_FONT_SIZE_PT * Pango.SCALE)
    fontDesc.set_weight(Pango.Weight.BOLD)
    layout.set_font_description(fontDesc)
    layout.set_text(text, -1)
    return layout
  }

  private _lookupColor(name: string, fallback: Gdk.RGBA): Gdk.RGBA {
    try {
      const ctx = this.get_style_context()
      const [found, color] = ctx.lookup_color(name)
      if (found) return color
    } catch {
      /* lookup deprecated — fall through. */
    }
    return fallback
  }
}

GObject.type_ensure(TeleportOverlay.$gtype)
