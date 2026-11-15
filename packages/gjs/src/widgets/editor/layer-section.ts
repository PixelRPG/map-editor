import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import type GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { DepthGlyph } from './depth-glyph'

import Template from './layer-section.blp'

GObject.type_ensure(DepthGlyph.$gtype)

/**
 * One of the Layers page's three fixed sections — "Above the hero" /
 * "At hero height" / "Below the hero": a header (40 px depth glyph,
 * title, subtitle) over a `boxed-list` of {@link LayerRow}s. The header
 * is the explanation of the plane, so it stays when the list is empty
 * and a dimmed "Nothing here yet" takes the rows' place.
 *
 * Owns no rows and no signals of its own: {@link LayersPage} fills the
 * list, wires selection across the three sections and installs the
 * drop target. `plane` / `title` / `subtitle` are template-bound.
 *
 * Carries one command of its own, an "Add a layer" button row below the
 * list — the plane a new layer lands on is the section it was asked
 * from, so the button cannot live once at the bottom of the page.
 */
export class LayerSection extends Adw.Bin {
  declare _glyph: DepthGlyph
  declare _list: Gtk.ListBox
  declare _empty_label: Gtk.Label
  declare _add_list: Gtk.ListBox
  declare _add_row: Adw.ButtonRow

  private _plane = 'ground'
  private _title = ''
  private _subtitle = ''

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgLayerSection',
        Template,
        InternalChildren: ['glyph', 'list', 'empty_label', 'add_list', 'add_row'],
        Properties: {
          plane: GObject.ParamSpec.string(
            'plane',
            'Plane',
            'The plane this section lists: ground, hero or overlay',
            GObject.ParamFlags.READWRITE,
            'ground',
          ),
          title: GObject.ParamSpec.string('title', 'Title', 'Section heading', GObject.ParamFlags.READWRITE, ''),
          subtitle: GObject.ParamSpec.string(
            'subtitle',
            'Subtitle',
            'What belongs on this plane, in the child’s words',
            GObject.ParamFlags.READWRITE,
            '',
          ),
        },
      },
      LayerSection,
    )
  }

  get plane(): string {
    return this._plane ?? 'ground'
  }

  set plane(value: string) {
    if (this._plane === value) return
    this._plane = value
    this.notify('plane')
  }

  get title(): string {
    return this._title ?? ''
  }

  set title(value: string) {
    if (this._title === value) return
    this._title = value
    this.notify('title')
  }

  get subtitle(): string {
    return this._subtitle ?? ''
  }

  set subtitle(value: string) {
    if (this._subtitle === value) return
    this._subtitle = value
    this.notify('subtitle')
  }

  /** The row list the tab fills and listens to. */
  get list(): Gtk.ListBox {
    return this._list
  }

  /** The header glyph, so the tab can hand it the project's hero sprite. */
  get glyph(): DepthGlyph {
    return this._glyph
  }

  /** Show the "Nothing here yet" line instead of an empty box. */
  setEmpty(empty: boolean): void {
    this._empty_label.set_visible(empty)
    this._list.set_visible(!empty)
  }

  /** The hero sprite shown in the header glyph (`null` = silhouette). */
  set heroPaintable(value: Gdk.Paintable | null) {
    this._glyph.heroPaintable = value
  }

  /**
   * The plane to hand `win.new-layer`, as the action's target — or
   * `null` to take the "Add a layer" row away, which is what Simple
   * view does (one row at the bottom of the page instead of three).
   *
   * One setter for the target AND the visibility: a `boxed-list` draws
   * its frame even with no visible row, so the wrapper has to follow
   * the row, and two separate calls could disagree.
   */
  set addTarget(value: GLib.Variant | null) {
    if (value) this._add_row.set_action_target_value(value)
    this._add_list.set_visible(value !== null)
  }
}

GObject.type_ensure(LayerSection.$gtype)
