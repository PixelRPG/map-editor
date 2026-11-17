import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import { BADGE_SIZES } from './brush-badge.geometry.ts'
import {
  type ChromeFlags,
  type ChromeStage,
  CHROME_STAGES,
  chromeFlags,
  CONTEXT_PILL_PX,
  effectiveStage,
} from './chrome-stages.ts'
import { BrushBadge } from './brush-badge.ts'
import type { PageSlots } from './editor-pages.ts'
import { FloatingPlay } from './floating-play.ts'
import { RecentTiles } from './recent-tiles.ts'
import { RosterChip } from './roster-chip.ts'
import { SheetDetentController } from './sheet-detent-controller.ts'
import type { SheetDetent } from './sheet-detents.ts'
import { ToolGroup } from './tool-group.ts'
import { ZoomOsd } from './zoom-osd.ts'

import Template from './scene-editor.blp'

GObject.type_ensure(ZoomOsd.$gtype)
GObject.type_ensure(FloatingPlay.$gtype)
GObject.type_ensure(RecentTiles.$gtype)

/** The two chrome layouts. `phone` is what `inspector-collapsed` (<768sp) selects. */
export type SceneEditorLayout = 'wide' | 'phone'

/** `win.sheet-page`'s target for every affordance that means "the brush". */
const BRUSH_PAGE_TARGET = GLib.Variant.new_string('brush')

/**
 * Typed view of the signals {@link SceneEditor} registers, layered on
 * the parent's own so inherited signals keep their argument lists.
 */
export interface SceneEditorSignals extends Adw.Bin.SignalSignatures {
  'detent-changed': (detent: SheetDetent) => void
  'pick-cancelled': () => void
}

/**
 * Scene-editor content surface: the striped backdrop, the engine slot,
 * and the floating chrome over it.
 *
 * Four things exist on a wide layout — an editing pill at the top left,
 * a context pill at the top right, the Play FAB at the bottom right, and
 * a transient zoom readout — and nothing else stands between the person
 * and the map. On phone the two pills shrink to a "‹" and a three-button
 * pill, and the tool chooser, brush badge and recent tiles move into a
 * docked bottom bar.
 *
 * The four things a stroke needs — which tool, which tile, which layer,
 * and undo — used to be spread over three of five clusters. Tool, tile
 * and layer are now one compound {@link BrushBadge} beside the tool
 * chooser, and undo is a button at every width.
 *
 * `setLayout` is the whole wide↔phone switch, and it moves exactly two
 * widgets. The engine canvas is not one of them: it tears down in
 * `vfunc_unroot`, so it keeps one parent for the life of the view.
 */
export class SceneEditor extends Adw.Bin {
  declare connect: GObject.SignalMethods<this, SceneEditorSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, SceneEditorSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, SceneEditorSignals>['emit']

  declare _ladder: Adw.BreakpointBin
  declare _bottom_sheet: Adw.BottomSheet
  declare _overlay: Gtk.Overlay
  declare _run_frame: Gtk.Box
  declare _engine_holder: Gtk.Box

  declare _editing_handle: Gtk.WindowHandle
  declare _back_button: Gtk.Button
  declare _back_label: Gtk.Label
  declare _undo_button: Gtk.Button
  declare _redo_button: Gtk.Button
  declare _tools_slot_top: Adw.Bin
  declare _badge_button: Gtk.Button
  declare _badge_slot_top: Adw.Bin
  declare _badge_label: Gtk.Label
  declare _back_circle: Gtk.Button

  declare _context_handle: Gtk.WindowHandle
  declare _context_pill: Gtk.Box
  declare _roster_slot: Adw.Bin
  declare _stop_button: Gtk.Button
  declare _restart_button: Gtk.Button
  declare _overflow_button: Gtk.MenuButton
  declare _inspector_toggle: Gtk.ToggleButton

  declare _pick_banner: Gtk.Box
  declare _pick_cancel: Gtk.Button

  declare _history_pill: Gtk.Box
  declare _phone_undo: Gtk.Button
  declare _phone_redo: Gtk.Button

  declare _zoom_osd: ZoomOsd
  declare _cursor_caption: Gtk.Box
  declare _floating_play: FloatingPlay

  declare _phone_bar: Gtk.Box
  declare _tools_slot_bar: Adw.Bin
  declare _badge_slot_bar: Adw.Bin
  declare _bar_row_b: Gtk.Stack
  declare _recent_tiles: RecentTiles
  declare _selection_label: Gtk.Inscription
  declare _sheet_view: Gtk.Box
  declare _sheet_grabber: Gtk.Box
  declare _sheet_switcher: Adw.InlineViewSwitcher
  declare _sheet_scroller: Gtk.ScrolledWindow
  declare _sheet_stack: Adw.ViewStack
  declare _brush_slot_sheet: Adw.Bin
  declare _layers_slot_sheet: Adw.Bin
  declare _selected_slot_sheet: Adw.Bin

  private _engineWidget: Gtk.Widget | null = null
  private _layout: SceneEditorLayout = 'wide'
  private _stage: ChromeStage = 'tight'
  private _fullView = false
  private _playing = false
  private _picking = false
  /** Whether the selected placement is a door — see {@link _buildPlacementMenu}. */
  private _selectionIsDoor = false
  private _brushLabel = ''
  private _mapName = ''
  private _cursorText = ''

  /** The widgets `setLayout` moves, plus the surfaces they move between. */
  private _badge = new BrushBadge({ size: BADGE_SIZES.wide })
  private _toolGroup = new ToolGroup()
  private _rosterChip = new RosterChip()
  private _phoneBadgeButton = new Gtk.Button()

  /**
   * The context menu a long press on a placement opens, at the finger.
   * Built here rather than in `scene-editor.blp` for the same reason the
   * overflow menu is (`_updateOverflowMenu`): its model is a `Gio.Menu`,
   * and a popover that has to be positioned per press has no sensible
   * declarative parent — a `Gtk.PopoverMenu` is a `GtkNative`, so it
   * takes no part in the overlay's layout and only needs a parent to
   * position against (`set_parent` in {@link showPlacementMenu}).
   */
  private _placementMenu = new Gtk.PopoverMenu({ hasArrow: false })

  /**
   * The sheet's three detents. Built in the constructor because it needs
   * the template's children; everything it decides is in
   * `sheet-detents.ts`, so this widget only forwards the result on.
   */
  private _detents: SheetDetentController

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgSceneEditor',
        Template,
        Signals: {
          /**
           * The phone sheet settled on a new detent (`peek` | `half` |
           * `full`). The host answers it by reading {@link bottomInset}
           * and ducking the camera, which is why the detent is a signal
           * and not just a getter.
           */
          'detent-changed': { param_types: [GObject.TYPE_STRING] },
          /**
           * Cancel was pressed while a pick was armed (§6.2 step 2).
           * The host owns what that means — disarm the engine and take
           * the person back to the door they started from — because the
           * banner knows neither map.
           */
          'pick-cancelled': { param_types: [] },
        },
        InternalChildren: [
          'ladder',
          'bottom_sheet',
          'overlay',
          'run_frame',
          'engine_holder',
          'editing_handle',
          'back_button',
          'back_label',
          'undo_button',
          'redo_button',
          'tools_slot_top',
          'badge_button',
          'badge_slot_top',
          'badge_label',
          'back_circle',
          'context_handle',
          'context_pill',
          'roster_slot',
          'stop_button',
          'restart_button',
          'overflow_button',
          'inspector_toggle',
          'pick_banner',
          'pick_cancel',
          'history_pill',
          'phone_undo',
          'phone_redo',
          'zoom_osd',
          'cursor_caption',
          'floating_play',
          'phone_bar',
          'tools_slot_bar',
          'badge_slot_bar',
          'bar_row_b',
          'recent_tiles',
          'selection_label',
          'sheet_view',
          'sheet_grabber',
          'sheet_switcher',
          'sheet_scroller',
          'sheet_stack',
          'brush_slot_sheet',
          'layers_slot_sheet',
          'selected_slot_sheet',
        ],
        Properties: {
          stage: GObject.ParamSpec.string(
            'stage',
            'Stage',
            'Which rung of the disclosure ladder the canvas width is on — written by the BreakpointBin',
            GObject.ParamFlags.READWRITE,
            'tight',
          ),
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Whether the editor renders the Full-view extras (cursor caption, Play menu, two more "⋯" items)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'brush-label': GObject.ParamSpec.string(
            'brush-label',
            'Brush Label',
            'The sentence beside the badge — "<tool> · <layer>"',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'map-name': GObject.ParamSpec.string(
            'map-name',
            'Map Name',
            'The open map, shown beside the back arrow so the pill says where you are',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'cursor-text': GObject.ParamSpec.string(
            'cursor-text',
            'Cursor Text',
            'The tile under the pointer, shown in the full-view caption',
            GObject.ParamFlags.READWRITE,
            '',
          ),
        },
      },
      SceneEditor,
    )
  }

  constructor() {
    super()
    this._detents = new SheetDetentController(
      {
        sheet: this._bottom_sheet,
        view: this._sheet_view,
        grabber: this._sheet_grabber,
        scroller: this._sheet_scroller,
        canvas: this,
      },
      (detent) => {
        this._applyToastClearance()
        this.emit('detent-changed', detent)
      },
    )
    this._badge_slot_top.set_child(this._badge)
    this._tools_slot_top.set_child(this._toolGroup)
    this._roster_slot.set_child(this._rosterChip)

    // Blueprint has no GVariant literal, so every `win.sheet-page`
    // target is set here. `check-blp-actions.mjs` only validates the
    // action NAME, which the template still carries.
    this._badge_button.set_action_target_value(BRUSH_PAGE_TARGET)

    this._phoneBadgeButton.add_css_class('flat')
    this._phoneBadgeButton.add_css_class('badge-phone')
    this._phoneBadgeButton.set_tooltip_text(_('Brush'))
    this._phoneBadgeButton.set_action_name('win.sheet-page')
    this._phoneBadgeButton.set_action_target_value(BRUSH_PAGE_TARGET)
    this._recent_tiles.connect('expand-requested', () => this.activate_action('win.sheet-page', BRUSH_PAGE_TARGET))
    // The roster chip's WIDTH is what decides whether the tool group
    // still fits beside it, and that width changes both when the chip
    // appears and when another participant joins an already-visible one.
    this._pick_cancel.connect('clicked', () => this.emit('pick-cancelled'))
    this._rosterChip.connect('notify::visible', () => this._applyVisibility())
    this._rosterChip.connect('notify::roster-size', () => this._applyVisibility())

    this._buildPlacementMenu()
    this._updateOverflowMenu()
    this._applyVisibility()
  }

  /**
   * Open the placement context menu at a canvas position, in the
   * overlay's coordinates — which are the canvas's own: the backdrop,
   * the engine holder and the engine widget all fill the overlay, so
   * the engine's screen origin is the overlay's.
   *
   * Driven by a long press on a placement (`PLACEMENT_CONTEXT_REQUESTED`);
   * the menu's items act on the current selection, which the engine has
   * already pointed at that placement.
   */
  showPlacementMenu(x: number, y: number): void {
    // Parented on first use rather than in the constructor: a popover
    // needs its parent only to position against, and attaching it late
    // keeps the widget out of the overlay for every editor that never
    // sees a long press.
    if (this._placementMenu.get_parent() !== this._overlay) {
      this._placementMenu.set_parent(this._overlay)
    }
    this._placementMenu.set_pointing_to(new Gdk.Rectangle({ x: Math.round(x), y: Math.round(y), width: 1, height: 1 }))
    this._placementMenu.popup()
  }

  /** Inject the host engine widget into the centred scratchpad slot. */
  setEngine(widget: Gtk.Widget | null): void {
    if (this._engineWidget) {
      this._engine_holder.remove(this._engineWidget)
      this._engineWidget = null
    }
    if (widget) {
      this._engine_holder.append(widget)
      this._engineWidget = widget
    }
  }

  get brushBadge(): BrushBadge {
    return this._badge
  }

  get toolGroup(): ToolGroup {
    return this._toolGroup
  }

  /** The three bins the shell hands to `EditorPages.host` on phone. */
  get pageSlots(): PageSlots {
    return { brush: this._brush_slot_sheet, layers: this._layers_slot_sheet, selected: this._selected_slot_sheet }
  }

  get sheetPage(): string {
    return this._sheet_stack.get_visible_child_name() ?? 'brush'
  }

  set sheetPage(name: string) {
    this._sheet_stack.set_visible_child_name(name)
  }

  /**
   * Reveal the sheet over the canvas at Half. No-op on wide, where it
   * can't open — and no-op at Full, so opening the sheet on a page that
   * is already fully showing never shrinks it.
   */
  openSheet(): void {
    if (this._detents.detent === 'peek') this._detents.setDetent('half')
  }

  /** Which detent the sheet rests at. `peek` is the docked bar. */
  get detent(): SheetDetent {
    return this._detents.detent
  }

  /**
   * How far, in px, the camera has to lift its focus point so a focused
   * tile is not behind the sheet. Read by the host on `detent-changed`.
   */
  get bottomInset(): number {
    return this._detents.bottomInset
  }

  get rosterChip(): RosterChip {
    return this._rosterChip
  }

  get recentTiles(): RecentTiles {
    return this._recent_tiles
  }

  /**
   * Which of the phone bar's two second rows is showing: the selection's
   * verbs while `name` is a placement's name, the recent-tile strip on
   * `null` (REDESIGN § 5.4). No sheet opens either way — the point of
   * the bar is that the map stays visible.
   *
   * The row exists at every width; on wide layouts the whole docked bar
   * is hidden, so this is a no-op there rather than a special case.
   */
  setPlacementSelected(name: string | null, isDoor = false): void {
    this._selection_label.set_text(name)
    this._bar_row_b.set_visible_child_name(name === null ? 'recent' : 'selection')
    if (isDoor === this._selectionIsDoor) return
    this._selectionIsDoor = isDoor
    this._buildPlacementMenu()
  }

  get floatingPlay(): FloatingPlay {
    return this._floating_play
  }

  /**
   * Whether the phone sheet is expanded over the canvas. Only phone
   * layout can open it (`set_can_open`), so this is `false` at every
   * wider rung — where the brush lives in a popover instead.
   */
  get sheetOpen(): boolean {
    return this._detents.detent !== 'peek'
  }

  /**
   * Collapse the sheet back to its peek bar, and say whether there was
   * anything to collapse. Step 2 of the back order (REDESIGN.md § 3.4).
   *
   * ONE step, straight to Peek, even from Full: back has a pinned order
   * (`resolveBackStep`), and a stepwise Full → Half → Peek would put two
   * back presses where the smoke scenario and the docs count one.
   */
  collapseSheet(): boolean {
    if (this._detents.detent === 'peek') return false
    this._detents.setDetent('peek')
    return true
  }

  get layout(): SceneEditorLayout {
    return this._layout
  }

  get stage(): ChromeStage {
    return this._stage ?? 'tight'
  }

  /**
   * Written by the `Adw.BreakpointBin` in the template, never by hand.
   * One property is the whole ladder contract: `chrome-stages.ts` turns
   * it, the layout and the runtime state into every `visible` flag.
   */
  set stage(value: ChromeStage) {
    if (this._stage === value || !CHROME_STAGES.includes(value)) return
    this._stage = value
    this._applyVisibility()
    this.notify('stage')
  }

  get fullView(): boolean {
    return this._fullView ?? false
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this._updateCursorCaption()
    this._floating_play.showMenu = value
    this._updateOverflowMenu()
    this.notify('full-view')
  }

  get mapName(): string {
    return this._mapName ?? ''
  }

  set mapName(value: string) {
    if (this._mapName === value) return
    this._mapName = value
    this.notify('map-name')
  }

  get brushLabel(): string {
    return this._brushLabel ?? ''
  }

  set brushLabel(value: string) {
    if (this._brushLabel === value) return
    this._brushLabel = value
    // The ladder hides this label at the narrower rungs, so the same
    // sentence is also the badge button's tooltip and the badge's
    // accessible name — the three facts stay reachable at every width and
    // to a screen reader. (`chrome-stages.ts` owns which rungs; naming a
    // width here would be a fifth place for it to drift.)
    this._badge_button.set_tooltip_text(value)
    this._badge.setAccessibleLabel(value)
    this.notify('brush-label')
  }

  get cursorText(): string {
    return this._cursorText ?? ''
  }

  set cursorText(value: string) {
    if (this._cursorText === value) return
    this._cursorText = value
    this._updateCursorCaption()
    this.notify('cursor-text')
  }

  /**
   * The caption and the history pill want the same bottom-left corner.
   * The pill wins there: on phone the corner is the one a thumb owns,
   * and a tile readout needs a hovering pointer, which touch has not
   * got. A stray motion event from a tap would otherwise raise the
   * caption straight on top of Undo.
   */
  private _updateCursorCaption(): void {
    this._cursor_caption.set_visible(this._fullView && this._cursorText !== '' && this._layout !== 'phone')
  }

  /** Show `zoom` in the transient bottom-centre readout. */
  setZoom(zoom: number): void {
    this._zoom_osd.setZoom(zoom)
  }

  /** The tile under the pointer; `null, null` clears the caption. */
  setCursorTile(tileX: number | null, tileY: number | null): void {
    this.cursorText = tileX == null || tileY == null ? '' : `${tileX}, ${tileY}`
  }

  /**
   * Reflect the `win.play` state. On phone the bar and the FAB give way
   * to the runtime: the canvas grows to the full window and the context
   * pill becomes Stop · Restart, because during a Live Run the finger is
   * the joystick, not a brush.
   */
  setPlaying(playing: boolean): void {
    this._playing = playing
    this._floating_play.playing = playing
    // An open sheet rests over the lower half of the canvas — exactly
    // where the run's joystick and action button sit, so a run started
    // from Half had controls drawn behind the brush palette. Collapsing
    // is enough: `bottomBar` then takes the peek bar away too.
    if (playing) this.collapseSheet()
    this._applyVisibility()
  }

  /**
   * Arm or clear §6.2's pick mode: the map is open and the next tap on
   * it says where the hero arrives, so every other affordance goes and
   * the banner is what is left (`chromeFlags`' `picking`).
   *
   * Only the chrome — the tap itself is the engine's
   * (`PendingArrivalPickComponent` on this scene, consumed ahead of the
   * tool lookup), which is why this is a plain setter and not a mode the
   * widget could get out of step with: the host arms both together and
   * the engine disarms itself on the tap.
   *
   * The sheet collapses for the same reason a run collapses it — it
   * rests over the lower half of the canvas, which is half the tiles the
   * person is being asked to point at.
   */
  setPicking(picking: boolean): void {
    if (this._picking === picking) return
    this._picking = picking
    if (picking) this.collapseSheet()
    this._applyVisibility()
  }

  /**
   * The whole wide↔phone switch. Five steps, two of which move a small,
   * GL-free widget between two slots; the sheet and the canvas never
   * move, so the Excalibur loop never sees an unroot.
   *
   * The three editor pages are NOT moved here — the shell owns that set
   * and hosts it from `inspector-collapsed` (`EditorPages.host`), which
   * is the same signal this method follows.
   */
  setLayout(layout: SceneEditorLayout): void {
    if (this._layout === layout) return
    this._layout = layout
    const phone = layout === 'phone'

    // 1. The tool chooser: editing pill ↔ bar row A.
    reparent(this._toolGroup, phone ? this._tools_slot_bar : this._tools_slot_top)
    // 2. The badge: beside the label in the pill ↔ inside the bar's button.
    if (phone) {
      this._badge_slot_top.set_child(null)
      this._phoneBadgeButton.set_child(this._badge)
      this._badge_slot_bar.set_child(this._phoneBadgeButton)
    } else {
      this._badge_slot_bar.set_child(null)
      this._phoneBadgeButton.set_child(null)
      this._badge_slot_top.set_child(this._badge)
    }
    this._badge.size = phone ? BADGE_SIZES.phone : BADGE_SIZES.wide
    // 3. Four tools instead of six.
    this._toolGroup.phone = phone
    // 4. The sheet stops being inert.
    this._bottom_sheet.set_can_open(phone)
    // 5. Which buttons the pills carry, from `chrome-stages.ts`.
    this._applyVisibility()
    this._updateCursorCaption()
    this._updateOverflowMenu()
  }

  private _applyVisibility(): void {
    const canvas = this._ladder.get_width()
    // The chip's real natural width, not the table's estimate: a roster
    // of three is wider than a roster of one, and the ladder has to know.
    // `CONTEXT_PILL_PX` is only the fallback before the first allocation.
    const measured = this._context_pill.get_preferred_size()[1]?.width ?? 0
    const contextPill =
      measured > 0 ? measured : this._rosterChip.get_visible() ? CONTEXT_PILL_PX.withRoster : CONTEXT_PILL_PX.solo
    // The bin proposes a rung from the canvas width; the thresholds
    // already carry a one-avatar roster, and this demotes further for a
    // wider one. Before the first allocation `canvas` is 0, which lands
    // on `tight` — the right floor to start from.
    const stage = this._layout === 'phone' ? this._stage : effectiveStage(this._stage, canvas, contextPill)
    this._applyFlags(chromeFlags(stage, this._layout, this._playing, this._picking))
  }

  /**
   * The editing pill's natural width at each rung, read off the real
   * widget: each rung's wide-layout flags are applied, the pill measured,
   * and the current state put back. It needs no canvas of any width —
   * only a rooted widget, so its CSS resolves — which is what lets
   * `phone-chrome.probe.spec.ts` check `STAGE_EDITING_PILL_PX` on any
   * display. The ladder itself still reasons with that table; measuring
   * here at startup and dropping the table is tracked in TODO.md.
   */
  measureEditingPillWidths(): Record<ChromeStage, number> {
    const pill = this._editing_handle.get_child()
    const widths = {} as Record<ChromeStage, number>
    for (const stage of CHROME_STAGES) {
      this._applyFlags(chromeFlags(stage, 'wide', false))
      widths[stage] = pill?.measure(Gtk.Orientation.HORIZONTAL, -1)[1] ?? 0
    }
    this._applyVisibility()
    return widths
  }

  /** Make one visible set real — every flag `chromeFlags` names, on its widget. */
  private _applyFlags(f: ChromeFlags): void {
    this._editing_handle.set_visible(f.editingPill)
    this._back_circle.set_visible(f.backCircle)
    this._back_label.set_visible(f.backLabel)
    this._undo_button.set_visible(f.undoButton)
    this._redo_button.set_visible(f.redoButton)
    this._badge_label.set_visible(f.badgeLabel)
    this._toolGroup.set_visible(f.toolGroup)
    this._toolGroup.showLabels = f.toolLabels

    this._history_pill.set_visible(f.historyPill)
    this._phone_undo.set_visible(f.phoneUndo)
    this._phone_redo.set_visible(f.phoneRedo)
    this._stop_button.set_visible(f.stopButton)
    this._restart_button.set_visible(f.restartButton)
    this._overflow_button.set_visible(f.overflowButton)
    this._inspector_toggle.set_visible(f.inspectorToggle)
    // The chip hides itself when the roster is empty, so this only ever
    // takes it away — never puts a chip on screen for a solo session.
    // Guarded, or the `notify::visible` handler above would recurse.
    if (!f.overflowButton && this._rosterChip.get_visible()) this._rosterChip.set_visible(false)

    this._pick_banner.set_visible(f.pickBanner)

    this._bottom_sheet.set_reveal_bottom_bar(f.bottomBar)
    this._floating_play.set_visible(f.playFab)
    // Its own overlay child above the canvas, because GTK draws a
    // widget's border under its children and the engine fills the
    // backdrop — and because a border on the backdrop would shrink the
    // engine's allocation by 4 px at Play, handing the GL area a resize
    // (and the canvas a different whole-pixel zoom) for a decoration.
    this._run_frame.set_visible(f.runBorder)
    this._applyToastClearance()
  }

  /**
   * Lift the window's toasts clear of the docked bar. The class has to
   * sit on the WINDOW: `Adw.ToastOverlay` is this widget's ancestor
   * (`application-window.blp`), so a selector rooted here could never
   * reach a toast. Found the hard way — a toast raised during the
   * measurement round rendered on top of the tool chooser.
   */
  private _applyToastClearance(): void {
    const root = this.get_root()
    if (!root) return
    // Follows the bar, not the layout: `bottomBar` is false for a run
    // and for a pick alike, and a toast lifted 120 px clear of a bar
    // that is not there floats for no reason.
    const wanted = this._layout === 'phone' && !this._playing && !this._picking
    if (wanted) root.add_css_class('sheet-peeking')
    else root.remove_css_class('sheet-peeking')
  }

  /**
   * Half and Full are shares of the editor's height, so a rotation or a
   * window resize moves them. Re-applied here rather than from a
   * `notify::` because the height is only known once it is allocated;
   * `reapply` is guarded against re-entering the relayout it sits in.
   */
  vfunc_size_allocate(width: number, height: number, baseline: number): void {
    super.vfunc_size_allocate(width, height, baseline)
    this._detents.reapply()
  }

  vfunc_map(): void {
    super.vfunc_map()
    // The root is only reachable once this widget is in a window, so the
    // class is (re-)applied here rather than only from `setLayout`.
    this._applyToastClearance()
  }

  vfunc_unmap(): void {
    // Leaving the scene editor must not leave every other view's toasts
    // floating 120 px up.
    this.get_root()?.remove_css_class('sheet-peeking')
    // A `set_parent`ed popover is a real child of the overlay and has to
    // be taken off again by hand, or the overlay is finalized with
    // children still attached. Symmetric with the lazy attach in
    // `showPlacementMenu`, which re-parents it on the next long press.
    if (this._placementMenu.get_parent()) {
      this._placementMenu.popdown()
      this._placementMenu.unparent()
    }
    super.vfunc_unmap()
  }

  /**
   * The placement context menu's model. Every action is stateless and
   * reads the current selection, the same contract as `win.undo`: the
   * long press sets the selection before the menu opens, so nothing has
   * to be carried in an action target. The same four verbs make up the
   * phone selection bar ({@link setPlacementSelected}) — one set of
   * actions, two surfaces.
   *
   * Rebuilt whenever the selection changes between a door and anything
   * else, because "Goes to…" (REDESIGN § 5.5) is the one entry that is
   * not always there: a thing with no teleport component has no
   * destination to set, and an entry that answers nothing is worse than
   * an entry that is absent. Five appends, so rebuilding is cheaper
   * than a `Gio.Menu` section swapped in and out.
   */
  private _buildPlacementMenu(): void {
    const model = new Gio.Menu()
    model.append(_('Edit'), 'win.edit-placement')
    model.append(_('Copy'), 'win.copy-placement')
    model.append(_('Move'), 'win.move-placement')
    // No "›": the entry opens a dialog, and §5.5's chevron described a
    // submenu the flow does not use.
    if (this._selectionIsDoor) model.append(_('Goes to…'), 'win.door-target')
    model.append(_('Delete'), 'win.delete-placement')
    this._placementMenu.set_menu_model(model)
  }

  /**
   * The "⋯" menu — a fixed list, rebuilt only when the tier or the
   * layout changes. It never contains undo, redo, back or a tool: the bar it
   * replaces rebuilt its menu from button visibility so the two could
   * never disagree, which is machinery this design does not need
   * because the menu's items are never buttons.
   *
   * It also carries the app's primary menu. The map editor shows no
   * shell navigation (REDESIGN.md § 3.3), so the context pill is its
   * only header end, and this is the only door — at every width, not
   * just on phone as it was while the mode rail still existed.
   */
  private _updateOverflowMenu(): void {
    const phone = this._layout === 'phone'
    const root = new Gio.Menu()

    const view = new Gio.Menu()
    view.append(_('Show grid'), 'win.toggle-grid')
    view.append(_('Dim other layers'), 'win.toggle-transparency')
    // Also reachable from the tileset sheet (REDESIGN.md § 6.5); both
    // drive `win.toggle-walls`, so the two controls cannot disagree.
    view.append(_('Show walls'), 'win.toggle-walls')
    // Ungated by the tier: the Layers page no longer carries a Things
    // row, so this is the ONLY way to get hidden Things back — a Simple
    // view that hid the item would hide the things with it.
    view.append(_('Show Things'), 'win.toggle-objects')
    root.append_section(null, view)

    const zoom = new Gio.Menu()
    zoom.append(_('Zoom in'), 'win.zoom-in')
    zoom.append(_('Zoom out'), 'win.zoom-out')
    zoom.append(_('Reset zoom'), 'win.zoom-reset')
    root.append_section(null, zoom)

    const play = new Gio.Menu()
    play.append(_('Play from start'), 'win.play-from-start')
    play.append(_('Together…'), 'win.share-session')
    root.append_section(null, play)

    // The primary menu's own sections, in its order.
    const project = new Gio.Menu()
    project.append(_('Open Recent'), 'win.open-recent-projects')
    project.append(_('Close Project'), 'win.close-project')
    root.append_section(null, project)

    const tier = new Gio.Menu()
    tier.append(_('Full view'), 'app.full-view')
    root.append_section(null, tier)

    const help = new Gio.Menu()
    if (this._fullView && !phone) help.append(_('Keyboard shortcuts'), 'win.show-help-overlay')
    help.append(_('Preferences'), 'app.preferences')
    help.append(_('About PixelRPG Maker'), 'app.about')
    root.append_section(null, help)

    const quit = new Gio.Menu()
    quit.append(_('Quit'), 'app.quit')
    root.append_section(null, quit)

    this._overflow_button.set_menu_model(root)
  }
}

/** Move `widget` into `slot`, clearing whichever slot currently holds it. */
function reparent(widget: Gtk.Widget, slot: Adw.Bin): void {
  const parent = widget.get_parent()
  if (parent === slot) return
  if (parent instanceof Adw.Bin) parent.set_child(null)
  else parent?.unparent()
  slot.set_child(widget)
}

GObject.type_ensure(SceneEditor.$gtype)
