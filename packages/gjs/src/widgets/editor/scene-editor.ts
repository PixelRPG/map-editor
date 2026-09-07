import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { gettext as _ } from 'gettext'

import { BADGE_SIZES } from './brush-badge.geometry.ts'
import { type ChromeStage, CHROME_STAGES, chromeFlags } from './chrome-stages.ts'
import { BrushBadge } from './brush-badge.ts'
import { BrushPage } from './brush-page.ts'
import { FloatingPlay } from './floating-play.ts'
import { RecentTiles } from './recent-tiles.ts'
import { RosterChip } from './roster-chip.ts'
import { ToolGroup } from './tool-group.ts'
import { ZoomOsd } from './zoom-osd.ts'

import Template from './scene-editor.blp'

GObject.type_ensure(ZoomOsd.$gtype)
GObject.type_ensure(FloatingPlay.$gtype)
GObject.type_ensure(RecentTiles.$gtype)

/** The two chrome layouts. `phone` is what `inspector-collapsed` (<768sp) selects. */
export type SceneEditorLayout = 'wide' | 'phone'

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
 * `setLayout` is the whole wide↔phone switch, and it moves exactly three
 * widgets. The engine canvas is not one of them: it tears down in
 * `vfunc_unroot`, so it keeps one parent for the life of the view.
 */
export class SceneEditor extends Adw.Bin {
  declare _ladder: Adw.BreakpointBin
  declare _bottom_sheet: Adw.BottomSheet
  declare _overlay: Gtk.Overlay
  declare _engine_holder: Gtk.Box

  declare _editing_handle: Gtk.WindowHandle
  declare _library_toggle: Gtk.ToggleButton
  declare _back_button: Gtk.Button
  declare _back_label: Gtk.Label
  declare _undo_button: Gtk.Button
  declare _redo_button: Gtk.Button
  declare _tools_slot_top: Adw.Bin
  declare _badge_button: Gtk.MenuButton
  declare _badge_slot_top: Adw.Bin
  declare _badge_label: Gtk.Label
  declare _back_circle: Gtk.Button

  declare _context_handle: Gtk.WindowHandle
  declare _roster_slot: Adw.Bin
  declare _phone_undo: Gtk.Button
  declare _stop_button: Gtk.Button
  declare _restart_button: Gtk.Button
  declare _overflow_button: Gtk.MenuButton
  declare _inspector_toggle: Gtk.ToggleButton

  declare _zoom_osd: ZoomOsd
  declare _cursor_caption: Gtk.Box
  declare _floating_play: FloatingPlay

  declare _phone_bar: Gtk.Box
  declare _tools_slot_bar: Adw.Bin
  declare _badge_slot_bar: Adw.Bin
  declare _recent_tiles: RecentTiles
  declare _brush_slot_sheet: Adw.Bin

  private _engineWidget: Gtk.Widget | null = null
  private _layout: SceneEditorLayout = 'wide'
  private _stage: ChromeStage = 'tight'
  private _fullView = false
  private _playing = false
  private _brushLabel = ''
  private _cursorText = ''

  /** The three widgets `setLayout` moves, plus the surfaces they move between. */
  private _badge = new BrushBadge({ size: BADGE_SIZES.wide })
  private _toolGroup = new ToolGroup()
  private _brushPage = new BrushPage()
  private _rosterChip = new RosterChip()
  private _brushPopover = new Gtk.Popover()
  private _phoneBadgeButton = new Gtk.Button()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgSceneEditor',
        Template,
        InternalChildren: [
          'ladder',
          'bottom_sheet',
          'overlay',
          'engine_holder',
          'editing_handle',
          'library_toggle',
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
          'roster_slot',
          'phone_undo',
          'stop_button',
          'restart_button',
          'overflow_button',
          'inspector_toggle',
          'zoom_osd',
          'cursor_caption',
          'floating_play',
          'phone_bar',
          'tools_slot_bar',
          'badge_slot_bar',
          'recent_tiles',
          'brush_slot_sheet',
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
    this._badge_slot_top.set_child(this._badge)
    this._tools_slot_top.set_child(this._toolGroup)
    this._roster_slot.set_child(this._rosterChip)

    this._brushPopover.set_child(this._brushPage)
    this._badge_button.set_popover(this._brushPopover)

    this._phoneBadgeButton.add_css_class('flat')
    this._phoneBadgeButton.set_tooltip_text(_('Brush'))
    this._phoneBadgeButton.connect('clicked', () => this._bottom_sheet.set_open(true))
    this._recent_tiles.connect('expand-requested', () => this._bottom_sheet.set_open(true))

    this._updateOverflowMenu()
    this._applyVisibility()
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

  get brushPage(): BrushPage {
    return this._brushPage
  }

  get rosterChip(): RosterChip {
    return this._rosterChip
  }

  get recentTiles(): RecentTiles {
    return this._recent_tiles
  }

  get floatingPlay(): FloatingPlay {
    return this._floating_play
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
    this._floating_play.showMenu = value
    this._updateOverflowMenu()
    this.notify('full-view')
  }

  get brushLabel(): string {
    return this._brushLabel ?? ''
  }

  set brushLabel(value: string) {
    if (this._brushLabel === value) return
    this._brushLabel = value
    // The label is hidden below a 784 px canvas, so the same sentence is
    // the badge button's tooltip and the badge's accessible name — the
    // three facts stay reachable without reading pixels.
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
    this.notify('cursor-text')
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
    this._applyVisibility()
  }

  /**
   * The whole wide↔phone switch. Six steps, three of which move a small,
   * GL-free widget between two slots; the sheet and the canvas never
   * move, so the Excalibur loop never sees an unroot.
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
    // 3. The brush surface: badge popover ↔ sheet.
    if (phone) {
      this._brushPopover.set_child(null)
      this._brush_slot_sheet.set_child(this._brushPage)
    } else {
      this._brush_slot_sheet.set_child(null)
      this._brushPopover.set_child(this._brushPage)
    }
    // 4. Four tools instead of six.
    this._toolGroup.phone = phone
    // 5. The sheet stops being inert.
    this._bottom_sheet.set_can_open(phone)
    // 6. Which buttons the two pills carry, from `chrome-stages.ts`.
    this._applyVisibility()
    this._updateOverflowMenu()
  }

  private _applyVisibility(): void {
    const f = chromeFlags(this._stage, this._layout, this._playing)

    this._editing_handle.set_visible(f.editingPill)
    this._back_circle.set_visible(f.backCircle)
    this._library_toggle.set_visible(f.libraryToggle)
    this._back_label.set_visible(f.backLabel)
    this._undo_button.set_visible(f.undoButton)
    this._redo_button.set_visible(f.redoButton)
    this._badge_label.set_visible(f.badgeLabel)
    this._toolGroup.set_visible(f.toolGroup)
    this._toolGroup.showLabels = f.toolLabels

    this._phone_undo.set_visible(f.phoneUndo)
    this._stop_button.set_visible(f.runtimeControls)
    this._restart_button.set_visible(f.runtimeControls)
    this._overflow_button.set_visible(f.overflowButton)
    this._inspector_toggle.set_visible(f.inspectorToggle)
    // The chip hides itself when the roster is empty, so this only ever
    // takes it away — never puts a chip on screen for a solo session.
    if (!f.overflowButton) this._rosterChip.set_visible(false)

    this._bottom_sheet.set_reveal_bottom_bar(f.bottomBar)
    this._floating_play.set_visible(f.playFab)
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
    const wanted = this._layout === 'phone' && !this._playing
    if (wanted) root.add_css_class('sheet-peeking')
    else root.remove_css_class('sheet-peeking')
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
    super.vfunc_unmap()
  }

  /**
   * The "⋯" menu — a fixed list, rebuilt only when the tier or the
   * layout changes. It never contains undo, back or a tool: the bar it
   * replaces rebuilt its menu from button visibility so the two could
   * never disagree, which is machinery this design does not need
   * because the menu's items are never buttons.
   */
  private _updateOverflowMenu(): void {
    const phone = this._layout === 'phone'
    const root = new Gio.Menu()

    const view = new Gio.Menu()
    view.append(_('Show grid'), 'win.toggle-grid')
    view.append(_('Dim other layers'), 'win.toggle-transparency')
    if (this._fullView) view.append(_('Show objects'), 'win.toggle-objects')
    root.append_section(null, view)

    const zoom = new Gio.Menu()
    if (phone) zoom.append(_('Redo'), 'win.redo')
    zoom.append(_('Zoom in'), 'win.zoom-in')
    zoom.append(_('Zoom out'), 'win.zoom-out')
    zoom.append(_('Reset zoom'), 'win.zoom-reset')
    root.append_section(null, zoom)

    const play = new Gio.Menu()
    play.append(_('Play from start'), 'win.play-from-start')
    play.append(_('Share…'), 'win.share-session')
    root.append_section(null, play)

    const help = new Gio.Menu()
    if (this._fullView && !phone) help.append(_('Keyboard shortcuts'), 'win.show-help-overlay')
    // The rail's primary menu is unreachable from the phone editor, so
    // the tier switch needs a door here.
    if (phone) help.append(_('Full view'), 'app.full-view')
    if (help.get_n_items() > 0) root.append_section(null, help)

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
