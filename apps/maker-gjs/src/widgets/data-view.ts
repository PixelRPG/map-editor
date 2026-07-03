import type Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { type ModeRail, SignalScope } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import Template from './data-view.blp'
import { ResponsiveEditorView } from './responsive-editor-view.ts'

/**
 * The whole Data-view model the controller pushes in one shot. Assets are
 * summarised as COUNTS only — they're owned + edited in Cast / Sheets, so
 * Data references them rather than duplicating the management surface.
 */
export interface DataViewModel {
  name: string
  author: string
  version: string
  description: string
  tileSize: number
  path: string
  appearanceCount: number
  tilesetCount: number
}

export interface DataViewCallbacks {
  setProjectField: (field: 'name' | 'author' | 'version' | 'description' | 'tileSize', value: string) => void
}

/**
 * Data view — the project's settings surface. Editable project metadata
 * (name / author / version / description) + tile settings, plus a
 * "Linked assets" group that just *references* the appearances (Cast) and
 * tilesets (Sheets) with a count + a jump-to-managing-view link. The
 * assets themselves are owned + edited in those views — Data no longer
 * duplicates the import/rename/delete surface. See `data-controller.ts`.
 */
// biome-ignore lint/suspicious/noShadowRestrictedNames: GTK view-class naming convention (CastView/TilesView/DataView); the JS DataView global is unused in this app
export class DataView extends ResponsiveEditorView {
  declare _outer_split: Adw.OverlaySplitView
  declare _library_toggle: Gtk.ToggleButton
  declare _name_row: Adw.EntryRow
  declare _author_row: Adw.EntryRow
  declare _version_row: Adw.EntryRow
  declare _description_row: Adw.EntryRow
  declare _tilesize_row: Adw.SpinRow
  declare _path_row: Adw.ActionRow
  declare _appearances_ref_row: Adw.ActionRow
  declare _tilesets_ref_row: Adw.ActionRow
  declare _appearances_open_button: Gtk.Button
  declare _tilesets_open_button: Gtk.Button

  private signals = new SignalScope()
  private _callbacks: DataViewCallbacks | null = null
  // True while `setData` writes the row texts, so the `notify`/`apply`
  // handlers don't fire the edit callbacks back during a refresh.
  private _loading = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgDataView',
        Template,
        InternalChildren: [
          'outer_split',
          'mode_rail',
          'library_toggle',
          'name_row',
          'author_row',
          'version_row',
          'description_row',
          'tilesize_row',
          'path_row',
          'appearances_ref_row',
          'tilesets_ref_row',
          'appearances_open_button',
          'tilesets_open_button',
        ],
        // show-library / library-collapsed (+ inspector) props + the
        // mode-changed signal are inherited from ResponsiveEditorView.
      },
      DataView,
    )
  }

  // Signals are connected in vfunc_map / released in vfunc_unmap via
  // SignalScope (the workspace's GTK lifecycle rule) so a remapped view
  // doesn't accumulate duplicate handlers and an unmapped one stops firing.
  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._mode_rail, 'mode-changed', (_r: ModeRail, mode: string) =>
      this.emit('mode-changed', mode),
    )
    // Reference links jump to the view that OWNS the asset type.
    this.signals.connect(this._appearances_open_button, 'clicked', () =>
      this.activate_action('win.mode', GLib.Variant.new_string('cast')),
    )
    this.signals.connect(this._tilesets_open_button, 'clicked', () =>
      this.activate_action('win.mode', GLib.Variant.new_string('tiles')),
    )

    this.signals.connect(this._name_row, 'apply', () => this._emitField('name', this._name_row.get_text()))
    this.signals.connect(this._author_row, 'apply', () => this._emitField('author', this._author_row.get_text()))
    this.signals.connect(this._version_row, 'apply', () => this._emitField('version', this._version_row.get_text()))
    this.signals.connect(this._description_row, 'apply', () =>
      this._emitField('description', this._description_row.get_text()),
    )
    this.signals.connect(this._tilesize_row, 'notify::value', () => {
      if (this._loading) return
      this._callbacks?.setProjectField('tileSize', String(Math.round(this._tilesize_row.get_value())))
    })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  private _emitField(field: 'name' | 'author' | 'version' | 'description', value: string): void {
    if (this._loading) return
    this._callbacks?.setProjectField(field, value.trim())
  }

  bindCallbacks(callbacks: DataViewCallbacks): void {
    this._callbacks = callbacks
  }

  /** Replace the whole view from a freshly built model. */
  setData(model: DataViewModel | null): void {
    this._loading = true
    this._name_row.set_text(model?.name ?? '')
    this._author_row.set_text(model?.author ?? '')
    this._version_row.set_text(model?.version ?? '')
    this._description_row.set_text(model?.description ?? '')
    this._tilesize_row.set_value(model?.tileSize ?? 16)
    this._path_row.set_subtitle(model?.path ?? '—')
    this._mode_rail.projectName = model?.name || _('New Project')
    this._loading = false

    const sensitive = model !== null
    for (const row of [
      this._name_row,
      this._author_row,
      this._version_row,
      this._description_row,
      this._tilesize_row,
    ]) {
      row.set_sensitive(sensitive)
    }

    // Reference-row subtitles: how many + where they're managed.
    const appearances = model?.appearanceCount ?? 0
    const tilesets = model?.tilesetCount ?? 0
    this._appearances_ref_row.set_subtitle(
      appearances === 1 ? _('1 appearance · used by the Cast') : _(`${appearances} appearances · used by the Cast`),
    )
    this._tilesets_ref_row.set_subtitle(
      tilesets === 1 ? _('1 tileset · used by maps') : _(`${tilesets} tilesets · used by maps`),
    )
    this._appearances_open_button.set_sensitive(sensitive)
    this._tilesets_open_button.set_sensitive(sensitive)
  }
}

GObject.type_ensure(DataView.$gtype)
