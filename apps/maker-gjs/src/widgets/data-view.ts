import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import Gio from '@girs/gio-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { SpriteSetKind } from '@pixelrpg/engine'
import type { EditorMode, ModeRail } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import Template from './data-view.blp'

/** One asset (sprite sheet or tileset) as a management row. */
export interface DataAssetRow {
  id: string
  name: string
  kind: SpriteSetKind
  /** Bounded thumbnail (first sprite for sheets, downscaled sheet for tilesets). */
  paintable: Gdk.Paintable | null
  /** e.g. "320×32 · 20 sprites". */
  meta: string
  /** How many characters/maps reference it — 0 ⇒ orphan. */
  usedBy: number
}

/** The whole Data-view model the controller pushes in one shot. */
export interface DataViewModel {
  name: string
  author: string
  version: string
  description: string
  tileSize: number
  path: string
  sheets: DataAssetRow[]
  tilesets: DataAssetRow[]
}

export interface DataViewCallbacks {
  importAsset: (kind: SpriteSetKind) => void
  openAsset: (id: string, kind: SpriteSetKind) => void
  renameAsset: (id: string, currentName: string) => void
  deleteAsset: (id: string, name: string, usedBy: number) => void
  setProjectField: (field: 'name' | 'author' | 'version' | 'description' | 'tileSize', value: string) => void
}

const THUMB_SIZE = 44

/**
 * Data view — the project's "Assets and project" surface. A management
 * list (Adwaita rows grouped by type) of every imported sprite sheet +
 * tileset, each with a thumbnail, metadata, a "used by" count (orphans
 * flagged) and a ⋯ menu (open / rename / delete), plus editable
 * project metadata. Complements the visual Cast/Tiles galleries — same
 * assets, file/management angle. See `data-controller.ts` for the data.
 */
export class DataView extends Adw.Bin {
  declare _outer_split: Adw.OverlaySplitView
  declare _mode_rail: ModeRail
  declare _library_toggle: Gtk.ToggleButton
  declare _name_row: Adw.EntryRow
  declare _author_row: Adw.EntryRow
  declare _version_row: Adw.EntryRow
  declare _description_row: Adw.EntryRow
  declare _tilesize_row: Adw.SpinRow
  declare _path_row: Adw.ActionRow
  declare _sheets_group: Adw.PreferencesGroup
  declare _tilesets_group: Adw.PreferencesGroup
  declare _import_sheet_button: Gtk.Button
  declare _import_tileset_button: Gtk.Button

  private _callbacks: DataViewCallbacks | null = null
  // True while `setData` writes the row texts, so the `notify`/`apply`
  // handlers don't fire the edit callbacks back during a refresh.
  private _loading = false
  private _sheetRows: Adw.ActionRow[] = []
  private _tilesetRows: Adw.ActionRow[] = []
  // Backing fields for the GObject properties (GJS uses the camelCase
  // get/set below as the `show-library` / `library-collapsed` accessors).
  private _showLibrary = false
  private _libraryCollapsed = false

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
          'sheets_group',
          'tilesets_group',
          'import_sheet_button',
          'import_tileset_button',
        ],
        Properties: {
          'show-library': GObject.ParamSpec.boolean(
            'show-library',
            'Show Library',
            'Whether the left mode-rail sidebar is visible (shared across views)',
            GObject.ParamFlags.READWRITE,
            true,
          ),
          'library-collapsed': GObject.ParamSpec.boolean(
            'library-collapsed',
            'Library Collapsed',
            'Whether the mode rail should auto-overlay (responsive breakpoint)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        Signals: {
          'mode-changed': { param_types: [GObject.TYPE_STRING] },
        },
      },
      DataView,
    )
  }

  constructor() {
    super()
    this._mode_rail.connect('mode-changed', (_r: ModeRail, mode: string) => this.emit('mode-changed', mode))
    this._import_sheet_button.connect('clicked', () => this._callbacks?.importAsset('character'))
    this._import_tileset_button.connect('clicked', () => this._callbacks?.importAsset('tileset'))

    this._name_row.connect('apply', () => this._emitField('name', this._name_row.get_text()))
    this._author_row.connect('apply', () => this._emitField('author', this._author_row.get_text()))
    this._version_row.connect('apply', () => this._emitField('version', this._version_row.get_text()))
    this._description_row.connect('apply', () => this._emitField('description', this._description_row.get_text()))
    this._tilesize_row.connect('notify::value', () => {
      if (this._loading) return
      this._callbacks?.setProjectField('tileSize', String(Math.round(this._tilesize_row.get_value())))
    })
  }

  private _emitField(field: 'name' | 'author' | 'version' | 'description', value: string): void {
    if (this._loading) return
    this._callbacks?.setProjectField(field, value.trim())
  }

  bindCallbacks(callbacks: DataViewCallbacks): void {
    this._callbacks = callbacks
  }

  get showLibrary(): boolean {
    return this._showLibrary
  }

  set showLibrary(value: boolean) {
    if (this._showLibrary === value) return
    this._showLibrary = value
    this.notify('show-library')
  }

  get libraryCollapsed(): boolean {
    return this._libraryCollapsed
  }

  set libraryCollapsed(value: boolean) {
    if (this._libraryCollapsed === value) return
    this._libraryCollapsed = value
    this.notify('library-collapsed')
  }

  /** Sync the ModeRail's active mode (called when the host changes view). */
  syncActiveMode(mode: EditorMode): void {
    this._mode_rail.activeMode = mode
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
    this._import_sheet_button.set_sensitive(sensitive)
    this._import_tileset_button.set_sensitive(sensitive)

    this._rebuild(this._sheets_group, this._sheetRows, model?.sheets ?? [], _('No sprite sheets yet.'))
    this._rebuild(this._tilesets_group, this._tilesetRows, model?.tilesets ?? [], _('No tilesets yet.'))
  }

  private _rebuild(
    group: Adw.PreferencesGroup,
    tracked: Adw.ActionRow[],
    rows: DataAssetRow[],
    emptyText: string,
  ): void {
    for (const row of tracked) group.remove(row)
    tracked.length = 0
    if (rows.length === 0) {
      const empty = new Adw.ActionRow({ title: emptyText, sensitive: false })
      group.add(empty)
      tracked.push(empty)
      return
    }
    for (const model of rows) {
      const row = this._buildAssetRow(model)
      group.add(row)
      tracked.push(row)
    }
  }

  private _buildAssetRow(model: DataAssetRow): Adw.ActionRow {
    const usedLabel = model.usedBy === 0 ? _('unused') : `${_('used by')} ${model.usedBy}`
    const row = new Adw.ActionRow({
      title: model.name,
      subtitle: `${model.meta} · ${usedLabel}`,
    })
    if (model.usedBy === 0) row.add_css_class('dim-label')

    // Bounded thumbnail prefix (paintable is already small/downscaled).
    if (model.paintable) {
      const picture = new Gtk.Picture({
        contentFit: Gtk.ContentFit.CONTAIN,
        canShrink: true,
        widthRequest: THUMB_SIZE,
        heightRequest: THUMB_SIZE,
        valign: Gtk.Align.CENTER,
      })
      picture.set_paintable(model.paintable)
      row.add_prefix(picture)
    } else {
      row.add_prefix(new Gtk.Image({ iconName: 'image-x-generic-symbolic', pixelSize: 24 }))
    }

    // Per-row ⋯ menu: Open / Rename / Delete.
    const actions = new Gio.SimpleActionGroup()
    const open = new Gio.SimpleAction({ name: 'open' })
    open.connect('activate', () => this._callbacks?.openAsset(model.id, model.kind))
    actions.add_action(open)
    const rename = new Gio.SimpleAction({ name: 'rename' })
    rename.connect('activate', () => this._callbacks?.renameAsset(model.id, model.name))
    actions.add_action(rename)
    const del = new Gio.SimpleAction({ name: 'delete' })
    del.connect('activate', () => this._callbacks?.deleteAsset(model.id, model.name, model.usedBy))
    actions.add_action(del)
    row.insert_action_group('asset', actions)

    const menu = new Gio.Menu()
    menu.append(_('Open'), 'asset.open')
    menu.append(_('Rename…'), 'asset.rename')
    menu.append(_('Delete…'), 'asset.delete')
    const menuButton = new Gtk.MenuButton({
      iconName: 'view-more-symbolic',
      tooltipText: _('Asset actions'),
      valign: Gtk.Align.CENTER,
      menuModel: menu,
      cssClasses: ['flat'],
    })
    row.add_suffix(menuButton)
    row.set_activatable_widget(menuButton)

    return row
  }
}

GObject.type_ensure(DataView.$gtype)
