import Adw from '@girs/adw-1'
import Gdk from '@girs/gdk-4.0'
import Gtk from '@girs/gtk-4.0'
import { CollisionPreset, type SpriteDataSet } from '@pixelrpg/engine'

import packageStyle from '../../index.css'

import { TileInspector } from './tile-inspector.ts'

/**
 * The tile inspector's collision group, measured by GTK rather than read
 * off a screenshot.
 *
 * Two claims need a running widget. The first is width: an
 * `Adw.ToggleGroup` does not wrap, so its minimum is every toggle side
 * by side whatever the `Adw.WrapBox` around it would allow — all ten in
 * one group measured 373 px, which is why there are three. On a 360 px
 * phone the inspector is allocated inside the detail pane's 16 px
 * margins, so anything over {@link PHONE_INSPECTOR_PX} is allocated past
 * the window edge with a warning nobody reads — the same defect
 * `phone-chrome.probe.ts` exists for, one surface over (REDESIGN § 10
 * risk 7). The second is that `Adw.PreferencesGroup` accepts a non-row
 * child at all: `Adw.WrapBox` and `Gtk.Label` are neither
 * `Adw.PreferencesRow` nor listed in the group's documented children,
 * and a group that silently drops them would leave the inspector with no
 * collision control and no error.
 *
 * GTK-only; the spec loads this lazily.
 */

/** The ladder's floor — the narrowest window the app allows. */
export const PHONE_FLOOR_PX = 360
/** The detail pane wraps the inspector in 16 px margins on both sides. */
export const DETAIL_PANE_MARGIN_PX = 16
/** What is left for the inspector itself at the floor. */
export const PHONE_INSPECTOR_PX = PHONE_FLOOR_PX - 2 * DETAIL_PANE_MARGIN_PX

/**
 * Pinned for the same reason `phone-chrome.probe.ts` pins it: GTK
 * otherwise takes the UI font from the session, and a container with a
 * different substitution measures a different widget.
 */
const PROBE_FONT = 'Adwaita Sans 11'

export interface TileInspectorReport {
  /** Horizontal minimum of the whole inspector — what the pane must grant it. */
  inspectorMinPx: number
  /** Horizontal minimum per pictogram group, widest first — none may wrap. */
  groupMinPx: number[]
  /** Natural width of the wrap box holding all three, for the record. */
  wrapNatPx: number
  /** Every group reached the widget tree — proves the `Adw.PreferencesGroup` child. */
  togglesRealized: boolean
  /** The custom-shape hint reached the widget tree. */
  hintRealized: boolean
  /** The marked preset with a tile whose shape is one of the ten. */
  presetActiveName: string | null
  /** The marked preset with a hand-drawn shape — `null`, and the hint shown instead. */
  customActiveName: string | null
  customHintVisible: boolean
  /** Picking a half must leave no corner or whole-tile toggle lit. */
  litGroupsAfterPreset: number
}

let styled = false

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

const TILE_PX = 16

/** A tile the presets can express: the bottom half blocks. */
const HALF_BOTTOM: SpriteDataSet = {
  id: 1,
  col: 0,
  row: 0,
  name: 'Half bottom',
  solid: true,
  colliders: [{ type: 'rectangle', width: 16, height: 8, offset: { x: 0, y: 8 } }],
}

/** A tile no preset can express: the Tiled porter's slope. */
const CUSTOM: SpriteDataSet = {
  id: 2,
  col: 1,
  row: 0,
  name: 'Slope',
  solid: true,
  colliders: [
    {
      type: 'polygon',
      points: [
        { x: 0, y: 16 },
        { x: 16, y: 16 },
        { x: 16, y: 0 },
      ],
    },
  ],
}

/** Build the inspector at the phone's inspector width and read both claims off it. */
export function probeTileInspector(): TileInspectorReport {
  // The template names libadwaita types, which only `Adw.init()`
  // registers in a bare test process (the app gets it from
  // `Adw.Application`).
  ensureStyles()
  const inspector = new TileInspector()
  const window = new Gtk.Window({ default_width: PHONE_INSPECTOR_PX, default_height: 720, decorated: false })
  window.set_child(inspector)

  const groups = [inspector._collision_whole, inspector._collision_halves, inspector._collision_corners]
  const groupMinPx = groups.map((group) => group.measure(Gtk.Orientation.HORIZONTAL, -1)[0]).sort((a, b) => b - a)

  inspector.setSprite(HALF_BOTTOM, null, { width: TILE_PX, height: TILE_PX })
  const presetActiveName = inspector.activeCollisionName
  const litGroupsAfterPreset = groups.filter((group) => group.get_active_name() !== null).length
  inspector.setSprite(CUSTOM, null, { width: TILE_PX, height: TILE_PX })

  const result: TileInspectorReport = {
    inspectorMinPx: inspector.measure(Gtk.Orientation.HORIZONTAL, -1)[0],
    groupMinPx,
    wrapNatPx: inspector._collision_wrap.measure(Gtk.Orientation.HORIZONTAL, -1)[1],
    // An ancestor walk, not a `get_parent()` test: the preferences group
    // hands its children to an internal list box, so "is it in the tree"
    // is the question, not "whose direct child is it".
    togglesRealized: groups.every((group) => group.get_ancestor(TileInspector.$gtype) !== null),
    hintRealized: inspector._custom_hint.get_ancestor(TileInspector.$gtype) !== null,
    presetActiveName,
    customActiveName: inspector.activeCollisionName,
    customHintVisible: inspector._custom_hint.visible,
    litGroupsAfterPreset,
  }
  window.destroy()
  return result
}

/** The preset a tile with the bottom half blocked must classify as. */
export const EXPECTED_PRESET = CollisionPreset.HalfBottom
