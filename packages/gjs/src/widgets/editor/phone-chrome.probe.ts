import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import type Graphene from '@girs/graphene-1.0'
import Gtk from '@girs/gtk-4.0'

import packageStyle from '../../index.css'

import type { ChromeStage } from './chrome-stages.ts'
import { pumpUntil, solidPaintable, solidPaintableRect } from './pixel-probe.ts'
import { RECENT_TILES_MAX } from './recent-tiles.geometry.ts'
import { SceneEditor } from './scene-editor.ts'
import type { TileDescriptor } from './tile-palette.ts'

/**
 * Display-backed measurement of the scene editor's chrome, asked of GTK
 * itself — `measure()` and allocations — rather than read off pixels.
 *
 * The phone half builds a real `PixelRpgSceneEditor` in phone layout at
 * the ladder's own floor width, gives the brush page and the recency
 * strip realistic content, and reports what every part asks for. The
 * defect this exists for: the sheet's Brush page pinned six 54 px
 * palette columns, which is 378 px, and `Adw.BottomSheet` keeps its
 * page and its docked bar in one homogeneous `Gtk.Stack` — so the bar,
 * the canvas and every end-aligned pill were allocated 18 px past a
 * 360 px window with the sheet closed. Nothing in the GTK-free tests
 * could see it, and the breakpoint guard only knows the wide pills.
 *
 * The wide half measures the editing pill's natural width at each rung,
 * so `STAGE_EDITING_PILL_PX` is checked against the widget rather than
 * remembered from a screenshot. GTK-only; the spec loads this lazily.
 */

/** One widget's horizontal demand and what it actually got. */
export interface WidthReport {
  name: string
  min: number
  nat: number
  alloc: number
}

export interface PhoneChromeReport {
  /** The ladder's `width-request` — the narrowest window the editor allows. */
  floorPx: number
  /** The bottom sheet's minimum width: everything below the ladder, bar and page included. */
  sheetMinPx: number
  /** What the sheet was actually allocated at the floor — more than `floorPx` is the overflow. */
  sheetAllocPx: number
  parts: WidthReport[]
  recent: {
    /** Natural width of one swatch button — CSS and `RECENT_BUTTON_PX` must agree. */
    buttonPx: number
    shown: number
    /** Every shown swatch lies inside the strip; a sliced one fails this. */
    allWhole: boolean
  }
}

/** The sentence beside the badge that `STAGE_EDITING_PILL_PX` was measured with. */
const BRUSH_SENTENCE = 'Paint · Ground'

const TILE = { r: 60, g: 140, b: 80 }
const OBJECT = { r: 200, g: 120, b: 40 }
const TILE_COUNT = 60
const OBJECT_COUNT = 6

let styled = false

/**
 * The UI font every measurement is taken in: GNOME's default since 47
 * (`adwaita-sans-fonts`), which is what the app runs under on the
 * platform the design targets. Pinned because GTK otherwise takes it
 * from the session — a workstation says "Adwaita Sans 11" through the
 * portal, a bare container says "Sans 10" with whatever fontconfig
 * substitutes, and a container with no fonts at all measured the
 * labelled rungs 52 px narrower than the table. With the pin the same
 * widget measures the same everywhere the font is installed (CI
 * installs it), and a missing font shows up as a wrong number rather
 * than as a run that quietly measured something else.
 */
const PROBE_FONT = 'Adwaita Sans 11'

/**
 * Install the package stylesheet once, as the app does: without it every
 * button measures at Adwaita's defaults, and the numbers this probe
 * exists for — the 44 px targets, the pill table — are the CSS's doing.
 */
function ensureStyles(): void {
  Adw.init()
  if (styled) return
  const display = Gdk.Display.get_default()
  if (!display) throw new Error('no display for the package stylesheet')
  const settings = Gtk.Settings.get_for_display(display)
  settings.gtk_font_name = PROBE_FONT
  const provider = new Gtk.CssProvider()
  provider.load_from_string(packageStyle)
  Gtk.StyleContext.add_provider_for_display(display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
  styled = true
}

function report(name: string, widget: Gtk.Widget): WidthReport {
  const [min, nat] = widget.measure(Gtk.Orientation.HORIZONTAL, -1)
  return { name, min, nat, alloc: widget.get_width() }
}

/** `child`'s bounds in `ancestor`'s coordinates, or `null` when not laid out. */
function boundsIn(child: Gtk.Widget, ancestor: Gtk.Widget): Graphene.Rect | null {
  const [ok, rect] = child.compute_bounds(ancestor)
  return ok ? rect : null
}

/** Realistic content: a full tileset and a few object brushes with a wide sprite. */
function populate(editor: SceneEditor): void {
  const tile = solidPaintable(16, TILE)
  const tiles: TileDescriptor[] = Array.from({ length: TILE_COUNT }, (_, id) => ({
    id,
    name: `Tile ${id}`,
    paintable: tile,
  }))
  editor.brushPage.setTiles(tiles)
  const wide = solidPaintableRect(32, 16, OBJECT)
  editor.brushPage.setObjectBrushes(
    Array.from({ length: OBJECT_COUNT }, (_, i) => ({ id: `thing-${i}`, name: `Thing ${i}`, paintable: wide })),
  )
  editor.brushPage.setActivePlane('ground', ['ground', 'hero', 'overlay'])
  editor.recentTiles.setTiles(tiles.slice(0, RECENT_TILES_MAX))
  editor.recentTiles.setActive(0)
}

/** Build the editor in phone layout at its floor width and measure everything below the ladder. */
export function probePhoneChrome(): PhoneChromeReport {
  // The template names libadwaita types, which only `Adw.init()` registers
  // in a bare test process (the app gets it from `Adw.Application`).
  ensureStyles()
  const editor = new SceneEditor()
  const floorPx = editor._ladder.width_request
  const window = new Gtk.Window({ default_width: floorPx, default_height: 780, decorated: false })
  window.set_child(editor)
  editor.setLayout('phone')
  populate(editor)
  window.present()
  pumpUntil(() => editor.get_mapped() && editor._phone_bar.get_width() > 0, 'phone chrome window')

  const page = editor.brushPage
  const badgeButton = editor._badge_slot_bar.get_child()
  const parts: WidthReport[] = [
    report('bottom sheet', editor._bottom_sheet),
    report('phone bar', editor._phone_bar),
    report('  tool group', editor.toolGroup),
    ...(badgeButton ? [report('  badge button', badgeButton)] : []),
    report('  recent tiles', editor.recentTiles),
    report('brush page', page),
    report('  plane chips', page._plane_chips),
    report('  layer row', page._layers_button.get_parent() ?? page._layers_button),
    report('  search', page._search),
    report('  tile palette', page._palette),
    report('  object palette', page._object_palette),
  ]

  const strip = editor.recentTiles
  const buttons = strip.tileButtons
  const shownButtons = buttons.filter((button) => button.get_child_visible())
  const stripBounds = boundsIn(strip, strip)
  const allWhole =
    stripBounds !== null &&
    shownButtons.every((button) => {
      const b = boundsIn(button, strip)
      return b !== null && b.get_x() >= 0 && b.get_x() + b.get_width() <= stripBounds.get_width()
    })
  const result: PhoneChromeReport = {
    floorPx,
    sheetMinPx: editor._bottom_sheet.measure(Gtk.Orientation.HORIZONTAL, -1)[0],
    sheetAllocPx: editor._bottom_sheet.get_width(),
    parts,
    recent: {
      buttonPx: buttons[0]?.measure(Gtk.Orientation.HORIZONTAL, -1)[1] ?? 0,
      shown: shownButtons.length,
      allWhole,
    },
  }
  window.destroy()
  return result
}

/** Natural widths of the two wide-layout pills: the editing pill per rung, the context pill solo. */
export interface PillWidths {
  /** `_editing_pill` itself — the box the table names; its handle's 12 px margin is `PILL_MARGINS_PX`. */
  editing: Record<ChromeStage, number>
  /** `_context_pill` with no roster — `CONTEXT_PILL_PX.solo`. */
  contextSolo: number
}

/**
 * Measure both pills in the wide layout. The window's size does not
 * matter — `measureEditingPillWidths` applies each rung's flags itself,
 * so a display too small for the `roomy` canvas (Broadway's is) still
 * yields every rung; the widget only has to be rooted for its CSS.
 */
export function probePillWidths(): PillWidths {
  ensureStyles()
  const editor = new SceneEditor()
  editor.brushLabel = BRUSH_SENTENCE
  const window = new Gtk.Window({ default_width: 1000, default_height: 700, decorated: false })
  window.set_child(editor)
  editor.setLayout('wide')
  populate(editor)
  window.present()
  pumpUntil(() => editor.get_mapped(), 'wide chrome window')

  const editing = editor.measureEditingPillWidths()
  const contextSolo = editor._context_pill.measure(Gtk.Orientation.HORIZONTAL, -1)[1]
  window.destroy()
  return { editing, contextSolo }
}
