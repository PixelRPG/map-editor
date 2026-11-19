import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

import {
  type TerrainData,
  TERRAIN_PRESETS,
  type TerrainPreset,
  type TerrainProposal,
  findTerrainProposals,
  terrainPresetSpec,
  terrainSampleTiles,
  terrainSpriteIds,
  terrainTilesForPreset,
} from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import { readSheetAlpha, type SheetAlpha } from '../editor/sheet-alpha.ts'
import { TerrainSample } from '../editor/terrain-sample.ts'
import { TileSheet } from '../editor/tile-sheet.ts'
import { type SheetFrame, type SheetGrid, spanOfIndex } from '../editor/tile-sheet.geometry.ts'
import { scrollRectIntoView } from '../../utils/scroll-into-view.ts'
import { SignalScope } from '../../utils/signal-scope.ts'
import {
  assignPiece,
  cellsUsingPiece,
  type FixupCell,
  fixupCells,
  missingCells,
  nextBrushName,
  type TerrainPlacement,
  placeActivePart,
  placementFrames,
  placementFromLayout,
  placementLayout,
  placementProblems,
  placementSpriteIds,
  placementTableSpriteIds,
  placementTiles,
  nudgeActivePart,
  partSpans,
  setActivePart,
  startPlacement,
  terrainIdFor,
  toggleTerrainMember,
} from './terrain-define-dialog.model.ts'
import { TerrainPresetSilhouette } from './terrain-preset-silhouette.ts'

import Template from './terrain-define-dialog.blp'

/** The sheet a brush is being defined on, and how to draw its tiles. */
export interface TerrainDialogSheet {
  readonly texture: Gdk.Texture
  readonly grid: SheetGrid
  /** Paintable for a LOCAL sprite id — `null` where the set has none. */
  readonly paintable: (spriteId: number) => Gdk.Paintable | null
  /** Whether the set marks this sprite as a wall — the walk switch's initial answer. */
  readonly isSolid?: (spriteId: number) => boolean
  /**
   * The tile the sample is drawn ON. Without one an overlay brush's
   * shores would show the dialog's background through them.
   *
   * Left out, the dialog takes the set's first fully opaque tile. §5.2
   * asks for the most COMMON one, which would need a histogram over
   * every map's tile data — the Graphics view holds none, and loading
   * every map to pick a background colour is the wrong trade.
   */
  readonly floorSpriteId?: number | null
}

/** What the dialog hands back when a brush is created or edited. */
export interface TerrainDraft {
  readonly terrain: TerrainData
  /**
   * Every sprite the block covers, blank cells included — the tiles the
   * walkable switch writes collision for.
   */
  readonly spriteIds: number[]
  /** The switch's answer: the hero can walk on it. */
  readonly walkable: boolean
}

export interface TerrainDefineDialogSignals extends Adw.Dialog.SignalSignatures {
  /** "Create" / "Save" — the brush to write to the sprite set. */
  'terrain-saved': (draft: TerrainDraft) => void
  /** The "⋯" menu's Delete, by terrain id. */
  'terrain-deleted': (terrainId: string) => void
}

/** Kid names for the presets — TERRAIN.md § 5.2's copy. */
const PRESET_COPY: Record<string, () => { title: string; subtitle: string }> = {
  'ground-29': () => ({
    title: _('Paths and areas'),
    subtitle: _('A big block with paths, corners and ends.'),
  }),
  'patch-13': () => ({
    title: _('Area with corners'),
    subtitle: _('A square patch and four corner pieces.'),
  }),
  'block-9': () => ({ title: _('Square patch'), subtitle: _('Just a 3×3 square.') }),
  'path-16': () => ({
    title: _('Paths only'),
    subtitle: _('A 4×4 block of thin pieces: ends, bends, crossings.'),
  }),
  'blob-47': () => ({
    title: _('Everything'),
    subtitle: _('A wide 8×6 block with every edge and corner.'),
  }),
}

/** What each part of a preset is called in the part selector. */
const PART_LABELS: Record<string, () => string> = {
  block: () => _('Block'),
  corners: () => _('Corners'),
}

/**
 * Defining a ground brush: pick the shape the tiles are drawn in, then
 * say where on the sheet that block sits (TERRAIN.md § 5).
 *
 * The thing this dialog refuses to do is ask about rules. There is no
 * "which tile is the north-west outer corner" grid — the preset says
 * what the pieces are and in what order, the author only moves a frame,
 * and the sample above the sheet shows the answer as a picture. A block
 * one row off turns the sample to rubble, which needs no vocabulary to
 * read.
 *
 * Presentation-only, like {@link TileShapeDialog}: it emits a draft and
 * the host writes it to the sprite set, so the dialog never holds a
 * project.
 */
export class TerrainDefineDialog extends Adw.Dialog {
  declare _nav: Adw.NavigationView
  declare _brush_list: Gtk.ListBox
  declare _new_row: Adw.ButtonRow
  declare _find_row: Adw.ButtonRow
  declare _found_add_button: Gtk.Button
  declare _found_label: Gtk.Label
  declare _found_list: Gtk.ListBox
  declare _preset_list: Gtk.ListBox
  declare _create_button: Gtk.Button
  declare _sample: TerrainSample
  declare _hint_label: Gtk.Label
  declare _part_group: Adw.ToggleGroup
  declare _name_row: Adw.EntryRow
  declare _walk_row: Adw.SwitchRow
  declare _sheet: TileSheet
  declare _fixup_row: Adw.ActionRow
  declare _fixup_page: Adw.NavigationPage
  declare _fixup_sample: TerrainSample
  declare _fixup_hint: Gtk.Label
  declare _fixup_mode: Adw.ToggleGroup
  declare _fixup_name_list: Gtk.ListBox
  declare _fixup_name_row: Adw.EntryRow
  declare _fixup_sheet: TileSheet
  declare _fixup_create_button: Gtk.Button

  private _signals = new SignalScope()
  private _sheetInfo: TerrainDialogSheet | null = null
  /** This sheet's alpha, read once on first use — see {@link readSheetAlpha}. */
  private _alpha: SheetAlpha | null = null
  private _alphaRead = false
  /** Only the host's `floorSpriteId`; the scanned floor depends on the placement. */
  private _floor: Gdk.Paintable | null = null
  /** Opaque tiles seen so far, in sheet order — see {@link _floorPaintable}. */
  private _opaque: number[] = []
  /** How far the opaque scan has got. */
  private _scanned = 0
  private _terrains: TerrainData[] = []
  private _placement: TerrainPlacement | null = null
  /** The brush being edited, or `null` while making a new one. */
  private _editing: TerrainData | null = null
  private _rows: Gtk.Widget[] = []
  private _found: { proposal: TerrainProposal; row: Adw.SwitchRow }[] = []
  private _presetRows: Gtk.Widget[] = []
  private _partEcho = false
  private _nameEcho = false
  /**
   * Pieces the author assigned by hand, mask → sprite id, laid OVER
   * whatever the frames produce (§5.3).
   *
   * An overlay rather than a copy of the table, so moving the block
   * afterwards still works: the arrangement is re-derived, the three
   * pieces someone fixed by hand survive it. That is the asymmetry
   * {@link TerrainLayout} already describes — the layout is editor
   * memory, `tiles` is the truth.
   */
  private _fixes: Record<string, number> = {}
  /** "Also counts as this" — sprites that are the terrain without being a variant. */
  private _members: number[] = []
  /** The sample cell the fix-up page is editing, `null` until one is tapped. */
  private _fixupCell: number | null = null
  /** Whether this dialog may offer the Full-view extras. */
  private _fullView = false

  static {
    GObject.type_ensure(TerrainSample.$gtype)
    GObject.type_ensure(TileSheet.$gtype)
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgTerrainDefineDialog',
        Template,
        InternalChildren: [
          'nav',
          'brush_list',
          'new_row',
          'find_row',
          'found_add_button',
          'found_label',
          'found_list',
          'preset_list',
          'create_button',
          'sample',
          'hint_label',
          'part_group',
          'name_row',
          'walk_row',
          'sheet',
          'fixup_row',
          'fixup_page',
          'fixup_sample',
          'fixup_hint',
          'fixup_mode',
          'fixup_name_list',
          'fixup_name_row',
          'fixup_sheet',
          'fixup_create_button',
        ],
        Signals: {
          'terrain-saved': { param_types: [GObject.TYPE_JSOBJECT] },
          'terrain-deleted': { param_types: [GObject.TYPE_STRING] },
        },
      },
      TerrainDefineDialog,
    )
  }

  declare connect: GObject.SignalMethods<this, TerrainDefineDialogSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, TerrainDefineDialogSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, TerrainDefineDialogSignals>['emit']

  constructor() {
    super()
    this._buildPresetList()
  }

  /**
   * Show `terrains` for the sheet described by `sheet`, on the list
   * page.
   *
   * Called on every presentation rather than once: terrain ids are only
   * unique within their set, so a dialog that kept the previous set's
   * brushes would offer to edit something that no longer exists.
   */
  setSheet(sheet: TerrainDialogSheet | null, terrains: readonly TerrainData[]): void {
    this._sheetInfo = sheet
    this._terrains = [...terrains]
    this._placement = null
    this._editing = null
    this._alpha = null
    this._alphaRead = false
    this._floor = null
    this._opaque = []
    this._scanned = 0
    this._fixes = {}
    this._members = []
    this._fixupCell = null
    this._sheet.setSheet(sheet?.texture ?? null, sheet?.grid ?? null)
    this._fixup_sheet.setSheet(sheet?.texture ?? null, sheet?.grid ?? null)
    this._buildBrushList()
    this._nav.pop_to_tag('list')
  }

  /**
   * Offer the Full-view extras: the fix-up page and the "Tile by tile"
   * card (REDESIGN § 4.4).
   *
   * A method rather than a GObject property, because nothing in the
   * template binds to it — the host knows the tier and hands it over,
   * exactly as the sprite-set import dialog is given it.
   */
  setFullView(full: boolean): void {
    this._fullView = full
    this._fixup_row.set_visible(full)
    this._buildPresetList()
  }

  /**
   * Deep-link into the pages: `''` stays on the list, `'new'` opens the
   * preset picker, `'tile-by-tile'` starts a brush with no block at
   * all, and anything else opens that brush id (and falls back to the
   * list when the set has no such brush). A `/fix` suffix on a brush id
   * carries on to the fix-up page — "the shore pieces of water are
   * wrong" is a request that names both the brush and the page. Both
   * of those are Full-view surfaces, so in Simple view the first does
   * nothing and the second lands on the brush without the extra page.
   *
   * Call AFTER {@link setSheet} — it pops back to the list.
   */
  openAt(target: string): void {
    if (!target) return
    if (target === 'new') {
      this._startNew()
      return
    }
    if (target === 'find') {
      this._findBrushes()
      return
    }
    if (target === 'tile-by-tile') {
      if (this._fullView) this._pickTileByTile()
      return
    }
    const fix = target.endsWith('/fix')
    const id = fix ? target.slice(0, -'/fix'.length) : target
    const terrain = this._terrains.find((candidate) => candidate.id === id)
    if (!terrain) return
    this._openExisting(terrain)
    // Only when it landed on the place page: a brush that opened on the
    // preset picker has no table yet, and a fix-up page over nothing is
    // a screen of dashed rings with no way back to a block. Simple view
    // drops the suffix rather than the whole link — the brush is still
    // what was asked for, the extra page is just not on offer there.
    if (fix && this._fullView && this._nav.get_visible_page()?.get_tag() === 'place') this._openFixupPage()
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._signals.connect(this._new_row, 'activated', () => this._startNew())
    this._signals.connect(this._find_row, 'activated', () => this._findBrushes())
    this._signals.connect(this._found_add_button, 'clicked', () => this._addFound())
    this._signals.connect(this._create_button, 'clicked', () => this._save())
    this._signals.connect(this._sheet, 'tile-selected', (_sheet, index: number) => this._tapped(index))
    this._signals.connect(this._part_group, 'notify::active-name', () => this._partChanged())
    this._signals.connect(this._name_row, 'changed', () => this._nameChanged())
    this._signals.connect(this._fixup_row, 'activated', () => this._openFixupPage())
    this._signals.connect(this._fixup_create_button, 'clicked', () => this._save())
    this._signals.connect(this._fixup_name_row, 'changed', () => this._fixupNameChanged())
    this._signals.connect(this._fixup_mode, 'notify::active-name', () => this._syncFixup())
    this._signals.connect(this._fixup_sample, 'cell-activated', (_s, index: number) => this._fixupCellTapped(index))
    this._signals.connect(this._fixup_sheet, 'tile-selected', (_s, index: number) => this._fixupSheetTapped(index))
    this._fixup_sample.setInteractive(true)

    const keys = new Gtk.EventControllerKey()
    this._signals.connect(keys, 'key-pressed', (_c, keyval: number) => this._keyPressed(keyval))
    this.add_controller(keys)
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap()
  }

  /** The brushes this set has, newest last, each with a Delete in its menu. */
  private _buildBrushList(): void {
    for (const row of this._rows) this._brush_list.remove(row)
    this._rows = []
    for (const terrain of this._terrains) {
      const row = new Adw.ActionRow({
        title: terrain.name || terrain.id,
        subtitle: terrain.layout ? (PRESET_COPY[terrain.layout.preset]?.().title ?? '') : '',
        activatable: true,
      })
      row.connect('activated', () => this._openExisting(terrain))
      row.add_suffix(this._deleteButton(terrain))
      this._brush_list.append(row)
      this._rows.push(row)
    }
    this._brush_list.set_visible(this._terrains.length > 0)
  }

  /**
   * Delete, and only Delete. Renaming is the edit page's Name row, one
   * tap away and already an entry — a second rename path here would be
   * a dialog for a field that is on screen.
   */
  private _deleteButton(terrain: TerrainData): Gtk.Button {
    const button = new Gtk.Button({
      icon_name: 'user-trash-symbolic',
      tooltip_text: _('Delete this brush'),
      valign: Gtk.Align.CENTER,
      css_classes: ['flat'],
    })
    button.connect('clicked', () => {
      this._terrains = this._terrains.filter((other) => other.id !== terrain.id)
      this._buildBrushList()
      this.emit('terrain-deleted', terrain.id)
    })
    return button
  }

  /**
   * The preset cards. They do not depend on the sheet, only on the view
   * tier — rebuilt when {@link setFullView} changes it, which is why the
   * rows are tracked rather than appended and forgotten.
   */
  private _buildPresetList(): void {
    for (const row of this._presetRows) this._preset_list.remove(row)
    this._presetRows = []
    for (const spec of TERRAIN_PRESETS) {
      const copy = PRESET_COPY[spec.preset]?.() ?? { title: spec.preset, subtitle: '' }
      const row = new Adw.ActionRow({ title: copy.title, subtitle: copy.subtitle, activatable: true })
      const silhouette = new TerrainPresetSilhouette(spec.preset)
      silhouette.set_valign(Gtk.Align.CENTER)
      row.add_prefix(silhouette)
      row.connect('activated', () => this._pickPreset(spec.preset))
      this._preset_list.append(row)
      this._presetRows.push(row)
    }
    if (this._fullView) this._appendTileByTileCard()
  }

  /**
   * The last card: no block at all, every piece picked by hand.
   *
   * Full view only, and last, because it is the answer for a sheet none
   * of the presets fit — a hand-drawn tileset, or pieces scattered over
   * three corners of the image. Offering it first would invite someone
   * to tap twenty-nine tiles where moving one frame would have done.
   */
  private _appendTileByTileCard(): void {
    const row = new Adw.ActionRow({
      title: _('Tile by tile'),
      subtitle: _('No block — pick every piece yourself.'),
      activatable: true,
    })
    const icon = new Gtk.Image({ icon_name: 'view-grid-symbolic', valign: Gtk.Align.CENTER })
    icon.add_css_class('dim-label')
    row.add_prefix(icon)
    row.connect('activated', () => this._pickTileByTile())
    this._preset_list.append(row)
    this._presetRows.push(row)
  }

  /**
   * Look at the sheet's alpha for blocks that match a preset and offer
   * what it finds. Tiles another brush already uses are left out, so
   * pressing it twice does not duplicate anything.
   */
  private _findBrushes(): void {
    const sheet = this._sheetInfo
    const alpha = this._sheetAlpha()
    for (const entry of this._found) this._found_list.remove(entry.row)
    this._found = []
    if (!sheet || !alpha) {
      this._found_label.set_label(_('This picture could not be read.'))
      this._found_add_button.set_sensitive(false)
      this._nav.push_by_tag('found')
      return
    }
    const { columns, rows } = sheet.grid
    const signatures = Array.from({ length: columns * rows }, (_unused, index) => alpha.signature(index))
    const taken = new Set<number>()
    for (const terrain of this._terrains) for (const id of terrainSpriteIds(terrain)) taken.add(id)
    const proposals = findTerrainProposals(signatures, sheet.grid, taken)
    for (const proposal of proposals) {
      const copy = PRESET_COPY[proposal.preset]?.() ?? { title: proposal.preset, subtitle: '' }
      const row = new Adw.SwitchRow({
        title: copy.title,
        subtitle: _('Column %d, row %d')
          .replace('%d', String(proposal.col + 1))
          .replace('%d', String(proposal.row + 1)),
        active: true,
      })
      const silhouette = new TerrainPresetSilhouette(proposal.preset)
      silhouette.set_valign(Gtk.Align.CENTER)
      row.add_prefix(silhouette)
      this._found_list.append(row)
      this._found.push({ proposal, row })
    }
    this._found_label.set_label(
      proposals.length > 0
        ? _('These look like ground brushes. Switch off the ones you do not want.')
        : _('Nothing found. Tiles drawn on a solid background cannot be told apart this way — use New brush… instead.'),
    )
    this._found_add_button.set_sensitive(proposals.length > 0)
    this._nav.push_by_tag('found')
  }

  /** Create a brush for every switched-on proposal, then go back to the list. */
  private _addFound(): void {
    const sheet = this._sheetInfo
    if (!sheet) return
    const alpha = this._sheetAlpha()
    for (const { proposal, row } of this._found) {
      if (!row.get_active()) continue
      const tiles = terrainTilesForPreset(proposal.preset, proposal.layout.parts, sheet.grid)
      const ids = [...new Set(Object.values(tiles))].sort((a, b) => a - b)
      if (ids.length === 0) continue
      const name = nextBrushName(
        this._terrains.map((terrain) => terrain.name ?? ''),
        _('Brush'),
      )
      const terrain: TerrainData = {
        id: terrainIdFor(
          name,
          this._terrains.map((other) => other.id),
        ),
        name,
        tiles,
        layout: proposal.layout,
      }
      if (alpha) terrain.overlay = ids.some((id) => alpha.hasTransparency(id))
      this._terrains.push(terrain)
      this.emit('terrain-saved', { terrain, spriteIds: ids, walkable: true })
    }
    this._buildBrushList()
    this._nav.pop_to_tag('list')
  }

  private _startNew(): void {
    this._editing = null
    this._nav.push_by_tag('preset')
  }

  private _pickPreset(preset: TerrainPreset): void {
    const sheet = this._sheetInfo
    if (!sheet) return
    this._startDraft()
    this._placement = startPlacement(preset, sheet.grid)
    this._openPlacePage()
  }

  /**
   * "Tile by tile": no preset at all, straight to the fix-up page with
   * an empty table.
   *
   * The same page, because it is the same job — every piece of the
   * shape starts out borrowed from nothing, so the whole sample comes
   * up dashed and the author taps their way through it. A second
   * "define by hand" screen would be this one with a different title.
   */
  private _pickTileByTile(): void {
    if (!this._sheetInfo) return
    this._startDraft()
    this._placement = null
    this._openFixupPage()
  }

  /** The state every new brush starts from, whichever card opened it. */
  private _startDraft(): void {
    this._fixes = {}
    this._members = []
    this._fixupCell = null
    this._setName(
      nextBrushName(
        this._terrains.map((terrain) => terrain.name ?? ''),
        _('Brush'),
      ),
    )
    this._walk_row.set_active(true)
    this._create_button.set_label(_('Create'))
    this._fixup_create_button.set_label(_('Create'))
  }

  /**
   * Reopen on an existing brush, on the page that can actually edit it:
   * the place page when a preset filled it, the fix-up page when
   * nothing but hand-picked pieces did.
   *
   * A brush written before layouts existed (or imported from Tiled) has
   * no layout, and used to land on the preset picker — where every card
   * would have overwritten its table. Only a brush with no table at all
   * still goes there, because for that one there is nothing to lose.
   */
  private _openExisting(terrain: TerrainData): void {
    this._editing = terrain
    this._members = [...(terrain.members ?? [])]
    this._fixupCell = null
    this._setName(terrain.name || terrain.id)
    this._walk_row.set_active(this._walkableNow(terrain))
    this._create_button.set_label(_('Save'))
    this._fixup_create_button.set_label(_('Save'))

    const layout = terrain.layout && terrainPresetSpec(terrain.layout.preset) ? terrain.layout : null
    if (!layout) {
      this._placement = null
      this._fixes = { ...(terrain.tiles ?? {}) }
      if (Object.keys(this._fixes).length === 0) this._nav.push_by_tag('preset')
      else this._openFixupPage()
      return
    }
    this._placement = placementFromLayout(layout)
    // Whatever the frames do not produce was put there by hand: keep it
    // as an overlay, or saving again would quietly drop every fix.
    this._fixes = this._handFixes(terrain.tiles ?? {})
    this._openPlacePage()
  }

  /** The entries of `tiles` the current frames do not account for. */
  private _handFixes(tiles: Readonly<Record<string, number>>): Record<string, number> {
    const sheet = this._sheetInfo
    const placement = this._placement
    const base = sheet && placement ? placementTiles(placement, sheet.grid) : {}
    const fixes: Record<string, number> = {}
    for (const [mask, spriteId] of Object.entries(tiles)) {
      if (base[mask] !== spriteId) fixes[mask] = spriteId
    }
    return fixes
  }

  /** Write the name into the one store, both entries echoing it. */
  private _setName(name: string): void {
    this._nameEcho = true
    try {
      this._name_row.set_text(name)
      this._fixup_name_row.set_text(name)
    } finally {
      this._nameEcho = false
    }
    this._syncCreateButton()
  }

  /**
   * Where the switch stands for a brush that already exists: off as
   * soon as ANY of its tiles is a wall.
   *
   * Asked of the sprite set rather than remembered on the brush,
   * because collision is a property of the tiles and the author may
   * have changed it tile by tile since. The asymmetry is deliberate —
   * one wall among the shores is still "the hero cannot walk here".
   */
  private _walkableNow(terrain: TerrainData): boolean {
    const isSolid = this._sheetInfo?.isSolid
    if (!isSolid) return true
    return !Object.values(terrain.tiles ?? {}).some((spriteId) => isSolid(spriteId))
  }

  private _openPlacePage(): void {
    this._buildPartGroup()
    this._syncPlacement()
    this._nav.push_by_tag('place')
    this._revealActivePart()
  }

  /**
   * Pan the sheet to the active part.
   *
   * Opening an existing brush is the case that needs it: the grass brush
   * of the shipped pack sits on row 15 of a 31-row sheet, so without this
   * the place page shows the sheet's top-left corner, no frames at all,
   * and a hint about moving a piece that is nowhere on screen. It runs on
   * a {@link scrollRectIntoView} idle because the scroller has no
   * allocation until the page it was just pushed onto is laid out.
   */
  private _revealActivePart(): void {
    scrollRectIntoView(() => {
      const placement = this._placement
      if (!placement) return null
      const span = partSpans(placement).find((candidate) => candidate.part === placement.activePart)
      const rect = span ? this._sheet.rectOfSpan(span) : null
      return rect ? { widget: this._sheet, rect } : null
    })
  }

  /** One toggle per part — hidden for a preset that has only one. */
  private _buildPartGroup(): void {
    const spec = this._placement ? terrainPresetSpec(this._placement.preset) : undefined
    const parts = spec?.parts ?? []
    this._partEcho = true
    try {
      this._part_group.remove_all()
      for (const part of parts) {
        this._part_group.add(new Adw.Toggle({ name: part.id, label: PART_LABELS[part.id]?.() ?? part.id }))
      }
      if (this._placement) this._part_group.set_active_name(this._placement.activePart)
    } finally {
      this._partEcho = false
    }
    this._part_group.set_visible(parts.length > 1)
    this._hint_label.set_label(
      parts.length > 1 ? _('Tap a tile to move the chosen piece there.') : _('Tap a tile to move the block there.'),
    )
  }

  private _partChanged(): void {
    if (this._partEcho || !this._placement) return
    const name = this._part_group.active_name
    if (!name) return
    this._placement = setActivePart(this._placement, name)
    this._syncPlacement()
    // Switching parts is the other way a part off screen becomes the
    // subject — a tap never is, it lands where the finger already was.
    this._revealActivePart()
  }

  private _tapped(index: number): void {
    const sheet = this._sheetInfo
    if (!sheet || !this._placement) return
    const columns = sheet.grid.columns
    if (columns <= 0) return
    this._placement = placeActivePart(this._placement, index % columns, Math.floor(index / columns))
    this._syncPlacement()
  }

  /**
   * Arrow keys nudge the active part — the desktop half of
   * tap-to-place. Ignored while a text entry has the focus, where the
   * arrows belong to the cursor.
   */
  private _keyPressed(keyval: number): boolean {
    if (this._nav.visible_page?.tag !== 'place' || !this._placement) return false
    if (this.get_root()?.get_focus() instanceof Gtk.Text) return false
    const step = ARROW_STEPS[keyval]
    if (!step) return false
    this._placement = nudgeActivePart(this._placement, step[0], step[1])
    this._syncPlacement()
    return true
  }

  /** Redraw everything the placement decides: frames, sample, Create. */
  private _syncPlacement(): void {
    const sheet = this._sheetInfo
    const placement = this._placement
    if (!sheet || !placement) return
    const tiles = this._draftTiles()
    const used = new Set(Object.values(tiles))
    this._sheet.setFrames(placementFrames(placement, sheet.grid))
    this._sample.setTiles(this._sampleTiles(tiles), this._floorPaintable(used), sheet.grid.tileWidth)
    this._syncCreateButton()
  }

  /**
   * The table as it would be saved right now: what the frames produce,
   * with the hand-picked pieces laid over it.
   *
   * One function, because both pages draw a sample and the save writes
   * one — three readings of "the brush" that may never disagree, which
   * they would the moment the fix-up page kept a table of its own.
   */
  private _draftTiles(): Record<string, number> {
    const sheet = this._sheetInfo
    const placement = this._placement
    const base = sheet && placement ? placementTiles(placement, sheet.grid) : {}
    return { ...base, ...this._fixes }
  }

  /**
   * The fix-up page: the same sample again, tappable (TERRAIN.md §5.3).
   *
   * Reached two ways — the "Fix single pieces" row on the place page,
   * and "Tile by tile", which lands here with an empty table — and it
   * is the same page both times, because the job is the same: look at a
   * piece of the shape, say which tile it should be.
   */
  private _openFixupPage(): void {
    if (!this._sheetInfo) return
    const byHand = this._placement === null
    this._fixup_page.set_title(byHand ? _('Tile by tile') : _('Fix single pieces'))
    this._fixup_name_list.set_visible(byHand)
    this._fixup_mode.set_active_name('pieces')
    this._syncFixup()
    this._nav.push_by_tag('fixup')
  }

  /** Redraw the fix-up page from the draft: sample, rings, frames, hint. */
  private _syncFixup(): void {
    const sheet = this._sheetInfo
    if (!sheet) return
    const tiles = this._draftTiles()
    const cells = fixupCells(tiles)
    const used = new Set(Object.values(tiles))
    this._fixup_sample.setTiles(this._sampleTiles(tiles), this._floorPaintable(used), sheet.grid.tileWidth)
    const selected = this._fixupCell == null ? [] : cellsUsingPiece(cells, this._fixupCell)
    this._fixup_sample.setMarks(selected, missingCells(cells))
    this._fixup_sheet.setFrames(this._fixupFrames(cells))
    this._fixup_hint.set_label(this._fixupHint(cells))
    this._syncCreateButton()
  }

  /** Is the sheet editing "Also counts as this" rather than a piece? */
  private _fixupMembers(): boolean {
    return this._fixup_mode.active_name === 'members'
  }

  /**
   * What the sheet outlines: every member tile, or the one tile the
   * selected piece currently draws.
   *
   * Frames rather than the selection ring, because the ring is what a
   * tap moves and these are a state — in members mode there are several
   * at once, which a single ring cannot say at all.
   */
  private _fixupFrames(cells: readonly FixupCell[]): SheetFrame[] {
    const sheet = this._sheetInfo
    if (!sheet) return []
    const ids = this._fixupMembers()
      ? this._members
      : [this._fixupCell == null ? null : (cells[this._fixupCell]?.spriteId ?? null)].filter(
          (id): id is number => id != null,
        )
    const frames: SheetFrame[] = []
    for (const id of ids) {
      const span = spanOfIndex(sheet.grid, id)
      if (span) frames.push({ span, tone: 'active' })
    }
    return frames
  }

  /** The sentence under the sample — it has to say what the next tap does. */
  private _fixupHint(cells: readonly FixupCell[]): string {
    if (this._fixupMembers()) {
      return _('Tap the tiles that already count as this ground — plain water next to a shore, say.')
    }
    if (this._fixupCell == null) {
      // Nothing is "wrong" yet when there was never a block: tile by
      // tile starts empty, and being told to look for a mistake would
      // send the author hunting for one.
      return this._placement === null
        ? _('Tap a piece of the shape, then tap the tile it should be.')
        : _('Tap a piece that looks wrong, then tap the tile it should be.')
    }
    const exact = cells[this._fixupCell]?.exact === true
    return exact
      ? _('Now tap the tile this piece should use.')
      : _('This piece is borrowed from another one. Tap the tile it should use.')
  }

  /**
   * A tap on the sample picks the PIECE under it — every cell asking for
   * the same thing lights up, because that is what the next tap changes.
   *
   * It also leaves members mode: someone who taps the shape is pointing
   * at a piece, and silently treating that as a no-op would be the page
   * ignoring the only gesture it has.
   */
  private _fixupCellTapped(index: number): void {
    const cells = fixupCells(this._draftTiles())
    const cell = cells[index]
    if (!cell || cell.mask == null) return
    this._fixupCell = index
    if (this._fixupMembers()) this._fixup_mode.set_active_name('pieces')
    this._syncFixup()
    // The tile behind the piece may be anywhere on a 1767-tile sheet;
    // without this the author is told to tap something off screen.
    if (cell.spriteId != null) this._revealFixupTile(cell.spriteId)
  }

  /** A tap on the sheet: assign the selected piece, or toggle a member. */
  private _fixupSheetTapped(index: number): void {
    const sheet = this._sheetInfo
    if (!sheet) return
    if (this._fixupMembers()) {
      this._members = toggleTerrainMember(this._members, index)
      this._syncFixup()
      return
    }
    const at = this._fixupCell
    if (at == null) return
    const mask = fixupCells(this._draftTiles())[at]?.mask
    if (mask == null) return
    this._fixes = assignPiece(this._fixes, mask, index)
    this._syncFixup()
    // The place page draws the same brush, and it is one back-gesture
    // away: leaving its sample stale would show two different answers.
    this._syncPlacement()
  }

  private _revealFixupTile(spriteId: number): void {
    scrollRectIntoView(() => {
      const grid = this._sheetInfo?.grid
      const span = grid ? spanOfIndex(grid, spriteId) : null
      const rect = span ? this._fixup_sheet.rectOfSpan(span) : null
      return rect ? { widget: this._fixup_sheet, rect } : null
    })
  }

  /** The two Name entries are one value — whichever is typed into wins. */
  private _nameChanged(): void {
    if (this._nameEcho) return
    this._nameEcho = true
    try {
      this._fixup_name_row.set_text(this._name_row.get_text())
    } finally {
      this._nameEcho = false
    }
    this._syncCreateButton()
  }

  private _fixupNameChanged(): void {
    if (this._nameEcho) return
    this._nameEcho = true
    try {
      this._name_row.set_text(this._fixup_name_row.get_text())
    } finally {
      this._nameEcho = false
    }
    this._syncCreateButton()
  }

  /**
   * The tile the sample sits on: the host's choice, else the first
   * fully opaque tile of the sheet that the brush does not use itself
   * (see {@link TerrainDialogSheet}).
   *
   * `used` is why this is not resolved once per sheet: on a water set
   * the first opaque tile IS water, and water on water hides the very
   * mistake the sample exists to show. Skipping the brush's own tiles
   * costs nothing and puts the shape on something it contrasts with.
   *
   * The scan is lazy and resumable — {@link readSheetAlpha} gives up on
   * a tile at its first transparent pixel, and this keeps the opaque
   * tiles it has already seen, so a 1767-tile sheet is never walked
   * whole just to pick a background.
   */
  private _floorPaintable(used: ReadonlySet<number>): Gdk.Paintable | null {
    const sheet = this._sheetInfo
    if (!sheet) return null
    if (sheet.floorSpriteId != null) {
      this._floor ??= sheet.paintable(sheet.floorSpriteId)
      // A declared tile the set cannot draw falls through to the scan
      // rather than leaving the sample on a transparent void.
      if (this._floor) return this._floor
    }
    const alpha = this._sheetAlpha()
    if (!alpha) return null
    const count = sheet.grid.columns * sheet.grid.rows
    for (;;) {
      const free = this._opaque.find((index) => !used.has(index))
      if (free != null) return sheet.paintable(free)
      if (this._scanned >= count) break
      while (this._scanned < count) {
        const index = this._scanned++
        if (alpha.isOpaque(index)) {
          this._opaque.push(index)
          break
        }
      }
    }
    // Every opaque tile belongs to the brush: better its own tile than
    // a transparent void behind the shape.
    const first = this._opaque[0]
    return first == null ? null : sheet.paintable(first)
  }

  private _sheetAlpha(): SheetAlpha | null {
    const sheet = this._sheetInfo
    if (!sheet) return null
    if (!this._alphaRead) {
      this._alpha = readSheetAlpha(sheet.texture, sheet.grid)
      this._alphaRead = true
    }
    return this._alpha
  }

  /** The test shape drawn with a table — what the brush would do. */
  private _sampleTiles(tiles: Readonly<Record<string, number>>): (Gdk.Paintable | null)[] {
    const sheet = this._sheetInfo
    if (!sheet) return []
    const draft: TerrainData = { id: 'draft', name: 'draft', tiles: { ...tiles } }
    return terrainSampleTiles(draft).map((id) => (id == null ? null : sheet.paintable(id)))
  }

  private _syncCreateButton(): void {
    const sheet = this._sheetInfo
    if (!sheet) return
    const placement = this._placement
    // No placement is "Tile by tile", not a broken one: there are no
    // frames to hang off the sheet or collide with each other.
    const broken = placement ? placementProblems(placement, sheet.grid).length > 0 : false
    const named = this._name_row.get_text().trim().length > 0
    const hasTiles = Object.keys(this._draftTiles()).length > 0
    const ready = !broken && named && hasTiles
    this._create_button.set_sensitive(ready)
    this._fixup_create_button.set_sensitive(ready)
  }

  private _save(): void {
    const sheet = this._sheetInfo
    if (!sheet) return
    const placement = this._placement
    const name = this._name_row.get_text().trim()
    if (!name) return
    const tiles = this._draftTiles()
    if (Object.keys(tiles).length === 0) return
    const taken = this._terrains.filter((terrain) => terrain.id !== this._editing?.id).map((terrain) => terrain.id)
    const terrain: TerrainData = {
      ...(this._editing ?? {}),
      id: this._editing?.id ?? terrainIdFor(name, taken),
      name,
      tiles,
    }
    if (placement) terrain.layout = placementLayout(placement)
    // Deleted rather than left behind: a brush that lost its preset
    // would otherwise reopen on frames that no longer describe it.
    else delete terrain.layout
    if (this._members.length > 0) terrain.members = [...this._members]
    else delete terrain.members
    // The table's own tiles plus, where a block was placed, the blank
    // cells inside it: a hole in the arrangement is still part of the
    // brush as far as the sheet goes.
    const tableIds = [...new Set(Object.values(tiles))].sort((a, b) => a - b)
    const covered = placement
      ? [...new Set([...placementSpriteIds(placement, sheet.grid), ...tableIds])].sort((a, b) => a - b)
      : tableIds
    const overlay = this._deriveOverlay(
      placement ? [...new Set([...placementTableSpriteIds(placement, sheet.grid), ...tableIds])] : tableIds,
    )
    if (overlay === null) delete terrain.overlay
    else terrain.overlay = overlay
    this.emit('terrain-saved', {
      terrain,
      spriteIds: covered,
      walkable: this._walk_row.get_active(),
    })
    this.close()
  }

  /**
   * Does the brush keep the floor beneath it? Asked of the artwork's
   * alpha rather than of the author (TERRAIN.md § 3.4): a shore tile is
   * grass with a bite out of it, a dirt tile is dirt edge to edge, and
   * the picture already says which. `null` where the texture cannot be
   * read, which leaves whatever the brush said before.
   */
  private _deriveOverlay(spriteIds: readonly number[]): boolean | null {
    if (spriteIds.length === 0) return null
    const alpha = this._sheetAlpha()
    if (!alpha) return null
    return spriteIds.some((id) => alpha.hasTransparency(id))
  }
}

/** Arrow keyvals → the cell step they nudge by. */
const ARROW_STEPS: Record<number, [number, number]> = {
  65361: [-1, 0], // Left
  65362: [0, -1], // Up
  65363: [1, 0], // Right
  65364: [0, 1], // Down
}
