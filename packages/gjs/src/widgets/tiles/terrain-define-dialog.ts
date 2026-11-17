import Adw from '@girs/adw-1'
import type Gdk from '@girs/gdk-4.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'

import {
  type TerrainData,
  TERRAIN_PRESETS,
  type TerrainPreset,
  terrainPresetSpec,
  terrainSampleTiles,
} from '@pixelrpg/engine'
import { gettext as _ } from 'gettext'

import { readSheetAlpha, type SheetAlpha } from '../editor/sheet-alpha.ts'
import { TerrainSample } from '../editor/terrain-sample.ts'
import { TileSheet } from '../editor/tile-sheet.ts'
import type { SheetGrid } from '../editor/tile-sheet.geometry.ts'
import { scrollRectIntoView } from '../../utils/scroll-into-view.ts'
import { SignalScope } from '../../utils/signal-scope.ts'
import {
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
  declare _preset_list: Gtk.ListBox
  declare _create_button: Gtk.Button
  declare _sample: TerrainSample
  declare _hint_label: Gtk.Label
  declare _part_group: Adw.ToggleGroup
  declare _name_row: Adw.EntryRow
  declare _walk_row: Adw.SwitchRow
  declare _sheet: TileSheet

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
  private _partEcho = false

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
          'preset_list',
          'create_button',
          'sample',
          'hint_label',
          'part_group',
          'name_row',
          'walk_row',
          'sheet',
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
    this._sheet.setSheet(sheet?.texture ?? null, sheet?.grid ?? null)
    this._buildBrushList()
    this._nav.pop_to_tag('list')
  }

  /**
   * Deep-link into the pages: `''` stays on the list, `'new'` opens the
   * preset picker, anything else opens that brush id (and falls back to
   * the list when the set has no such brush).
   *
   * Call AFTER {@link setSheet} — it pops back to the list.
   */
  openAt(target: string): void {
    if (!target) return
    if (target === 'new') {
      this._startNew()
      return
    }
    const terrain = this._terrains.find((candidate) => candidate.id === target)
    if (terrain) this._openExisting(terrain)
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._signals.connect(this._new_row, 'activated', () => this._startNew())
    this._signals.connect(this._create_button, 'clicked', () => this._save())
    this._signals.connect(this._sheet, 'tile-selected', (_sheet, index: number) => this._tapped(index))
    this._signals.connect(this._part_group, 'notify::active-name', () => this._partChanged())
    this._signals.connect(this._name_row, 'changed', () => this._syncCreateButton())

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

  /** The preset cards, built once: they do not depend on the sheet. */
  private _buildPresetList(): void {
    for (const spec of TERRAIN_PRESETS) {
      const copy = PRESET_COPY[spec.preset]?.() ?? { title: spec.preset, subtitle: '' }
      const row = new Adw.ActionRow({ title: copy.title, subtitle: copy.subtitle, activatable: true })
      const silhouette = new TerrainPresetSilhouette(spec.preset)
      silhouette.set_valign(Gtk.Align.CENTER)
      row.add_prefix(silhouette)
      row.connect('activated', () => this._pickPreset(spec.preset))
      this._preset_list.append(row)
    }
  }

  private _startNew(): void {
    this._editing = null
    this._nav.push_by_tag('preset')
  }

  private _pickPreset(preset: TerrainPreset): void {
    const sheet = this._sheetInfo
    if (!sheet) return
    this._placement = startPlacement(preset, sheet.grid)
    this._name_row.set_text(
      nextBrushName(
        this._terrains.map((terrain) => terrain.name ?? ''),
        _('Brush'),
      ),
    )
    this._walk_row.set_active(true)
    this._create_button.set_label(_('Create'))
    this._openPlacePage()
  }

  /**
   * Reopen on an existing brush. A brush written before layouts existed
   * (or imported from Tiled) has none, so it reopens on the preset
   * picker: its table stays untouched until something is actually
   * placed.
   */
  private _openExisting(terrain: TerrainData): void {
    this._editing = terrain
    if (!terrain.layout || !terrainPresetSpec(terrain.layout.preset)) {
      this._nav.push_by_tag('preset')
      return
    }
    this._placement = placementFromLayout(terrain.layout)
    this._name_row.set_text(terrain.name || terrain.id)
    this._walk_row.set_active(this._walkableNow(terrain))
    this._create_button.set_label(_('Save'))
    this._openPlacePage()
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
    const tiles = placementTiles(placement, sheet.grid)
    const used = new Set(Object.values(tiles))
    this._sheet.setFrames(placementFrames(placement, sheet.grid))
    this._sample.setTiles(this._sampleTiles(placement), this._floorPaintable(used), sheet.grid.tileWidth)
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
      return this._floor
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

  /** The test shape drawn with the tiles currently under the frames. */
  private _sampleTiles(placement: TerrainPlacement): (Gdk.Paintable | null)[] {
    const sheet = this._sheetInfo
    if (!sheet) return []
    const draft: TerrainData = { id: 'draft', name: 'draft', tiles: placementTiles(placement, sheet.grid) }
    return terrainSampleTiles(draft).map((id) => (id == null ? null : sheet.paintable(id)))
  }

  private _syncCreateButton(): void {
    const sheet = this._sheetInfo
    const placement = this._placement
    if (!sheet || !placement) return
    const broken = placementProblems(placement, sheet.grid).length > 0
    const named = this._name_row.get_text().trim().length > 0
    const hasTiles = Object.keys(placementTiles(placement, sheet.grid)).length > 0
    this._create_button.set_sensitive(!broken && named && hasTiles)
  }

  private _save(): void {
    const sheet = this._sheetInfo
    const placement = this._placement
    if (!sheet || !placement) return
    const name = this._name_row.get_text().trim()
    if (!name) return
    const taken = this._terrains.filter((terrain) => terrain.id !== this._editing?.id).map((terrain) => terrain.id)
    const terrain: TerrainData = {
      ...(this._editing ?? {}),
      id: this._editing?.id ?? terrainIdFor(name, taken),
      name,
      tiles: placementTiles(placement, sheet.grid),
      layout: placementLayout(placement),
    }
    const overlay = this._deriveOverlay(placementTableSpriteIds(placement, sheet.grid))
    if (overlay === null) delete terrain.overlay
    else terrain.overlay = overlay
    this.emit('terrain-saved', {
      terrain,
      spriteIds: placementSpriteIds(placement, sheet.grid),
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
