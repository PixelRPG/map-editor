import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { GameProjectResource, SpriteDataSet, SpriteSetResource } from '@pixelrpg/engine'
import {
  GdkSpriteSetResource,
  type ModeRail,
  SignalScope,
  TileInspector,
  TilePalette,
} from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import Template from './tiles-view.blp'

// Force registration so blueprint `$PixelRpg…` refs resolve at parse time.
GObject.type_ensure(TilePalette.$gtype)
GObject.type_ensure(TileInspector.$gtype)

/**
 * Tileset editor view. Lives at the same level as cast-view + atlas-view:
 * an Adw.OverlaySplitView with the ModeRail on the left, a tile inspector
 * on the right, and the central area showing a sprite-set picker + the
 * full tile palette of the active sprite-set.
 *
 * Selecting a tile populates the right inspector with that sprite's
 * properties (Solid switch, Surface combo). Inspector edits mutate the
 * `SpriteSetData` in memory, push the change to the engine's live
 * tilemap via `refreshTileSolidsForSprite`, and persist the JSON via a
 * host-supplied callback so the host owns the file-IO path.
 */
export class TilesView extends Adw.Bin {
  declare _mode_rail: ModeRail
  declare _inspector: TileInspector
  declare _palette: TilePalette
  declare _tileset_combo: Adw.ComboRow

  private _projectName = ''
  private _showLibrary = true
  private _showInspector = false
  private _libraryCollapsed = false
  private _inspectorCollapsed = false

  private _signals = new SignalScope()
  private _spriteSets: { id: string; resource: SpriteSetResource; gdk: GdkSpriteSetResource | null }[] = []
  private _activeSpriteSetIdx = 0
  private _selectedSpriteId: number | null = null
  /** Suppress combo selection echo while we're populating the model. */
  private _suppressComboNotify = false

  private _onSolidChanged: ((spriteSetId: string, spriteId: number, solid: boolean) => void) | null = null
  private _onSurfaceChanged: ((spriteSetId: string, spriteId: number, surface: string | null) => void) | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'TilesView',
        Template,
        InternalChildren: ['mode_rail', 'inspector', 'palette', 'tileset_combo'],
        Properties: {
          'project-name': GObject.ParamSpec.string(
            'project-name',
            'Project Name',
            'Display name fed into the ModeRail hero block',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          'show-library': GObject.ParamSpec.boolean(
            'show-library',
            'Show Library',
            'Whether the mode-rail sidebar is shown',
            GObject.ParamFlags.READWRITE,
            true,
          ),
          'show-inspector': GObject.ParamSpec.boolean(
            'show-inspector',
            'Show Inspector',
            'Whether the right inspector is shown',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'library-collapsed': GObject.ParamSpec.boolean(
            'library-collapsed',
            'Library Collapsed',
            'Whether the library should auto-overlay (responsive breakpoint)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'inspector-collapsed': GObject.ParamSpec.boolean(
            'inspector-collapsed',
            'Inspector Collapsed',
            'Whether the inspector should auto-overlay (responsive breakpoint)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        Signals: {
          'mode-changed': { param_types: [GObject.TYPE_STRING] },
          'tile-changed': {},
        },
      },
      TilesView,
    )
  }

  constructor() {
    super()
  }

  /**
   * Signals wire in `vfunc_map` (not the constructor) so they
   * re-connect on every (re)map — `vfunc_unmap` does
   * `SignalScope.disconnectAll`. Without this, navigating away from
   * the Tiles view and back left the `tile-selected` connection
   * disconnected, so clicking a tile no longer refreshed the
   * inspector preview (the user-reported bug from image #53).
   */
  vfunc_map(): void {
    super.vfunc_map()
    this._signals.connect(this._mode_rail, 'mode-changed', (_v: ModeRail, mode: string) => {
      this.emit('mode-changed', mode)
    })
    this._signals.connect(this._tileset_combo, 'notify::selected', () => {
      if (this._suppressComboNotify) return
      const idx = this._tileset_combo.get_selected()
      this._activeSpriteSetIdx = idx
      this._loadActivePalette()
    })
    this._signals.connect(this._palette, 'tile-selected', (_p: TilePalette, tileId: number) => {
      this._selectedSpriteId = tileId
      this._refreshInspector()
    })
    this._signals.connect(this._inspector, 'solid-changed', (_v: TileInspector, solid: boolean) => {
      const active = this._activeSpriteSet()
      if (!active || this._selectedSpriteId == null) return
      this._onSolidChanged?.(active.id, this._selectedSpriteId, solid)
    })
    this._signals.connect(this._inspector, 'surface-changed', (_v: TileInspector, surface: string) => {
      const active = this._activeSpriteSet()
      if (!active || this._selectedSpriteId == null) return
      this._onSurfaceChanged?.(active.id, this._selectedSpriteId, surface === '' ? null : surface)
    })
  }

  get projectName(): string {
    return this._projectName ?? ''
  }

  set projectName(value: string) {
    if (this._projectName === value) return
    this._projectName = value
    this._mode_rail.projectName = value
    this.notify('project-name')
  }

  get showLibrary(): boolean {
    return this._showLibrary
  }

  set showLibrary(value: boolean) {
    if (this._showLibrary === value) return
    this._showLibrary = value
    this.notify('show-library')
  }

  get showInspector(): boolean {
    return this._showInspector
  }

  set showInspector(value: boolean) {
    if (this._showInspector === value) return
    this._showInspector = value
    this.notify('show-inspector')
  }

  get libraryCollapsed(): boolean {
    return this._libraryCollapsed
  }

  set libraryCollapsed(value: boolean) {
    if (this._libraryCollapsed === value) return
    this._libraryCollapsed = value
    this.notify('library-collapsed')
  }

  get inspectorCollapsed(): boolean {
    return this._inspectorCollapsed
  }

  set inspectorCollapsed(value: boolean) {
    if (this._inspectorCollapsed === value) return
    this._inspectorCollapsed = value
    this.notify('inspector-collapsed')
  }

  /**
   * Wire host callbacks for property mutations. Decouples this view
   * from the file-IO + engine-refresh path — same pattern as
   * `CastView.bindCallbacks`.
   */
  bindCallbacks(callbacks: {
    setSolid: (spriteSetId: string, spriteId: number, solid: boolean) => void
    setSurface: (spriteSetId: string, spriteId: number, surface: string | null) => void
  }): void {
    this._onSolidChanged = callbacks.setSolid
    this._onSurfaceChanged = callbacks.setSurface
  }

  /**
   * Replace the view's data from a freshly loaded project resource.
   * Called by the host when entering the Tiles mode and after any
   * tile-property mutation so the inspector reflects the persisted
   * state.
   */
  async setProject(project: GameProjectResource | null): Promise<void> {
    this._projectName = project?.data?.name ?? _('New Project')
    if (this._mode_rail) this._mode_rail.projectName = this._projectName

    if (!project) {
      this._spriteSets = []
      this._activeSpriteSetIdx = 0
      this._selectedSpriteId = null
      this._populateCombo([])
      this._palette.setTiles([])
      this._inspector.setSprite(null, null)
      return
    }

    // Snapshot sprite-set ids in project order. Build GdkSpriteSet
    // resources lazily on first palette load (cheap, but no point
    // doing it for sets the user never switches to).
    const ids: string[] = []
    const items: { id: string; resource: SpriteSetResource; gdk: GdkSpriteSetResource | null }[] = []
    for (const [id, resource] of project.spriteSets) {
      ids.push(id)
      items.push({ id, resource, gdk: null })
    }
    this._spriteSets = items
    this._populateCombo(ids)

    // Restore active selection if possible; otherwise default to 0.
    if (this._activeSpriteSetIdx >= items.length) this._activeSpriteSetIdx = 0
    await this._loadActivePalette()
  }

  /** Sync the ModeRail's active mode (called when the host changes view). */
  syncActiveMode(mode: string): void {
    this._mode_rail.activeMode = mode as 'world' | 'cast' | 'tiles' | 'audio' | 'data'
  }

  private _populateCombo(ids: string[]): void {
    const model = new Gtk.StringList()
    for (const id of ids) model.append(id)
    this._suppressComboNotify = true
    try {
      this._tileset_combo.set_model(model)
      this._tileset_combo.set_selected(this._activeSpriteSetIdx)
      this._tileset_combo.set_sensitive(ids.length > 1)
    } finally {
      this._suppressComboNotify = false
    }
  }

  private _activeSpriteSet() {
    return this._spriteSets[this._activeSpriteSetIdx] ?? null
  }

  private async _loadActivePalette(): Promise<void> {
    const active = this._activeSpriteSet()
    if (!active) {
      this._palette.setTiles([])
      this._inspector.setSprite(null, null)
      return
    }
    if (!active.gdk) {
      try {
        active.gdk = await GdkSpriteSetResource.fromEngineResource(active.resource)
      } catch (err) {
        console.warn('[TilesView] Failed to load sprite-set for palette:', err)
        return
      }
    }
    const sheet = active.gdk.spriteSheet
    if (!sheet) return
    // Use the palette's sprite-sheet aware loader — it auto-adopts the
    // sheet's native column count (32 for lokiri-forest, so the
    // tile-set renders in its canonical 32×N grid). Pattern mirrors
    // the `TilePaletteSpriteSheetStory` reference impl that the user
    // pointed at: native columns + tile-size 32 + a horizontal scroll
    // on the surrounding ScrolledWindow.
    this._palette.setFromSpriteSheet(sheet)
    this._refreshInspector()
  }

  /**
   * Push the selected tile's properties into the inspector. Called
   * after every selection change + after host-driven mutations so
   * the inspector mirrors the latest persisted state.
   */
  refreshInspectorForSelection(): void {
    this._refreshInspector()
  }

  private _refreshInspector(): void {
    const active = this._activeSpriteSet()
    if (!active || this._selectedSpriteId == null) {
      this._inspector.setSprite(null, null)
      return
    }
    const def: SpriteDataSet | undefined = active.resource.data?.sprites.find(
      (s) => s.id === this._selectedSpriteId,
    )
    const sprite = active.gdk?.getSprite(this._selectedSpriteId)
    this._inspector.setSprite(def ?? null, sprite?.createPaintable() ?? null)
  }

  vfunc_unmap(): void {
    this._signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(TilesView.$gtype)
