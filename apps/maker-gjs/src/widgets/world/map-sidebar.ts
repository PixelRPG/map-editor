import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { GameProjectResource } from '@pixelrpg/engine'
import {
  buildMapContextMenu,
  mapCaption,
  MapPreview,
  MiniMap,
  PeerDots,
  type PeerMarker,
  previewTilePx,
  type SampleScene,
  type SampleTeleport,
  sceneTileSize,
  SignalScope,
} from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import Template from './map-sidebar.blp'
import {
  type MapDoorModel,
  type MapRowModel,
  mapDetails,
  mapRows,
  rowIndexOf,
  tileSizeText,
} from './map-sidebar.model.ts'

const ROW_THUMB_PX = 48

export interface MapSidebarSignals extends Adw.Bin.SignalSignatures {
  'map-selected': (id: string) => void
  'map-opened': (id: string) => void
  'map-renamed': (id: string, name: string) => void
  /** A row's "⋯" opened: select that map without treating it as a pick. */
  'map-menu-requested': (id: string) => void
}

/**
 * A map's thumbnail — the project's real tiles where we have them, else
 * the same char-grid placeholder the cards use.
 *
 * `MiniMap` paints fixed-size squares and does not fit, so a large map
 * overflows its box by design; the bin clips it to a crisp top-left
 * corner rather than shrinking tiles below a pixel. `MapPreview` fits
 * the whole map on its own.
 */
export function mapThumbnail(scene: SampleScene, project: GameProjectResource | null, sizePx: number): Gtk.Widget {
  const bin = new Adw.Bin({
    widthRequest: sizePx,
    heightRequest: sizePx,
    valign: Gtk.Align.CENTER,
    overflow: Gtk.Overflow.HIDDEN,
  })
  if (project?.maps.get(scene.id)) {
    const preview = new MapPreview()
    bin.child = preview
    void preview.setFromResource(project, scene.id)
    return bin
  }
  const { cols, rows } = sceneTileSize(scene)
  bin.child = new MiniMap({ rows: scene.rows, tilePx: previewTilePx(cols, rows, sizePx, sizePx) })
  return bin
}

/**
 * Body of the World view's left sidebar: every map as a row, a "New map"
 * row, and the details of the selected map. Selection is shared with the
 * canvas by the owner — this widget only reports a pick and renders
 * whatever it is told is selected.
 */
export class MapSidebar extends Adw.Bin {
  declare _map_list: Gtk.ListBox
  declare _details_box: Gtk.Box
  declare _name_row: Adw.EntryRow
  declare _size_row: Adw.ActionRow
  declare _tile_size_row: Adw.ActionRow
  declare _things_row: Adw.ActionRow
  declare _doors_group: Adw.PreferencesGroup
  declare _open_row: Adw.ButtonRow

  private signals = new SignalScope()
  private _scenes: readonly SampleScene[] = []
  private _teleports: readonly SampleTeleport[] = []
  private _project: GameProjectResource | null = null
  private _startMapId: string | null = null
  private _rows: MapRowModel[] = []
  private _selectedId: string | null = null
  private _fullView = false
  private _peers: ReadonlyMap<string, readonly PeerMarker[]> = new Map()
  private _dots = new Map<string, PeerDots>()
  private _doorRows: Adw.ActionRow[] = []
  /** Guards `row-selected` while {@link _syncSelection} writes it. */
  private _suppress = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgMapSidebar',
        Template,
        InternalChildren: [
          'map_list',
          'details_box',
          'name_row',
          'size_row',
          'tile_size_row',
          'things_row',
          'doors_group',
          'open_row',
        ],
        Signals: {
          'map-selected': { param_types: [GObject.TYPE_STRING] },
          'map-opened': { param_types: [GObject.TYPE_STRING] },
          'map-renamed': { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING] },
          'map-menu-requested': { param_types: [GObject.TYPE_STRING] },
        },
      },
      MapSidebar,
    )
  }

  declare connect: GObject.SignalMethods<this, MapSidebarSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, MapSidebarSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, MapSidebarSignals>['emit']

  /** The whole world changed (project load, map added, renamed, deleted). */
  setWorld(
    scenes: readonly SampleScene[],
    teleports: readonly SampleTeleport[],
    project: GameProjectResource | null,
    startMapId: string | null,
  ): void {
    this._scenes = scenes
    this._teleports = teleports
    this._project = project
    this._startMapId = startMapId
    this._rebuild()
  }

  /** Things are a Full-view fact, so the row captions change with the tier. */
  setFullView(fullView: boolean): void {
    if (this._fullView === fullView) return
    this._fullView = fullView
    this._rebuild()
  }

  setPeerMarkers(markers: ReadonlyMap<string, readonly PeerMarker[]>): void {
    this._peers = markers
    for (const [id, dots] of this._dots) dots.setPeers([...(markers.get(id) ?? [])])
  }

  /** Mirror the canvas selection; `null` clears it. */
  setSelected(id: string | null): void {
    this._selectedId = id
    this._syncSelection()
    this._refreshDetails()
  }

  private _rebuild(): void {
    let child = this._map_list.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._map_list.remove(child)
      child = next
    }
    this._dots.clear()
    this._rows = mapRows(this._scenes, this._teleports, this._startMapId)
    for (const model of this._rows) {
      const scene = this._scenes.find((s) => s.id === model.id)
      if (scene) this._map_list.append(this._buildRow(model, scene))
    }
    this._syncSelection()
    this._refreshDetails()
  }

  private _buildRow(model: MapRowModel, scene: SampleScene): Adw.ActionRow {
    const row = new Adw.ActionRow({
      title: model.name,
      subtitle: mapCaption(model.facts, { things: this._fullView }),
      // Map names are user data: a map called "Cliffs <of> Doom"
      // must read as itself, not vanish into a broken tag.
      useMarkup: false,
      activatable: false,
    })
    row.add_prefix(mapThumbnail(scene, this._project, ROW_THUMB_PX))
    if (model.isStart) {
      row.add_suffix(new Gtk.Image({ iconName: 'starred-symbolic', tooltipText: _('The game starts on this map') }))
    }
    const dots = new PeerDots()
    dots.setPeers([...(this._peers.get(model.id) ?? [])])
    this._dots.set(model.id, dots)
    row.add_suffix(dots)
    const menu = new Gtk.MenuButton({
      iconName: 'view-more-symbolic',
      menuModel: buildMapContextMenu(),
      valign: Gtk.Align.CENTER,
      tooltipText: _('Map actions'),
      cssClasses: ['flat'],
    })
    // The verbs act on the selected map, so the row under the menu is
    // selected first.
    menu.connect('notify::active', () => {
      if (menu.active && this._selectedId !== model.id) this.emit('map-menu-requested', model.id)
    })
    row.add_suffix(menu)
    return row
  }

  private _syncSelection(): void {
    const index = rowIndexOf(this._rows, this._selectedId)
    const row = index >= 0 ? this._map_list.get_row_at_index(index) : null
    // Writing the selection re-emits `row-selected`.
    this._suppress = true
    if (row) this._map_list.select_row(row)
    else this._map_list.unselect_all()
    this._suppress = false
  }

  private _refreshDetails(): void {
    for (const row of this._doorRows) this._doors_group.remove(row)
    this._doorRows = []
    const details = mapDetails(this._scenes, this._teleports, this._selectedId, (id) => {
      const data = this._project?.maps.get(id)?.mapData
      return data ? { width: data.tileWidth, height: data.tileHeight } : null
    })
    this._details_box.set_visible(details !== null)
    if (!details) return
    if (this._name_row.get_text() !== details.name) this._name_row.set_text(details.name)
    const { cols, rows, things } = details.facts
    this._size_row.set_subtitle(cols > 0 && rows > 0 ? `${cols} × ${rows}` : '–')
    const px = tileSizeText(details.tileSize)
    this._tile_size_row.set_subtitle(details.tileSize ? _('%s px').replace('%s', px) : px)
    this._things_row.set_subtitle(String(things))
    for (const door of details.doors) {
      const row = this._buildDoorRow(door)
      this._doors_group.add(row)
      this._doorRows.push(row)
    }
    this._doors_group.set_visible(details.doors.length > 0)
  }

  private _buildDoorRow(door: MapDoorModel): Adw.ActionRow {
    let subtitle = _('Leads nowhere yet')
    if (door.otherSceneId !== null) {
      subtitle = (door.direction === 'out' ? _('Leads to %s') : _('Comes from %s')).replace('%s', door.otherSceneName)
    }
    const row = new Adw.ActionRow({
      title: door.label || _('Door'),
      subtitle,
      useMarkup: false,
      activatable: true,
      tooltipText: _('Go to the door'),
    })
    row.add_suffix(new Gtk.Image({ iconName: 'go-next-symbolic' }))
    row.connect('activated', () => {
      this.activate_action(
        'win.focus-placement',
        GLib.Variant.new_tuple([GLib.Variant.new_string(door.ownerMapId), GLib.Variant.new_string(door.placementId)]),
      )
    })
    return row
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._map_list, 'row-selected', (_l: Gtk.ListBox, row: Gtk.ListBoxRow | null) => {
      if (this._suppress || !row) return
      const id = this._rows[row.get_index()]?.id
      if (id && id !== this._selectedId) this.emit('map-selected', id)
    })
    this.signals.connect(this._name_row, 'apply', () => {
      const id = this._selectedId
      const name = this._name_row.get_text().trim()
      if (id && name) this.emit('map-renamed', id, name)
    })
    this.signals.connect(this._open_row, 'activated', () => {
      if (this._selectedId) this.emit('map-opened', this._selectedId)
    })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(MapSidebar.$gtype)
