import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterDefinition, ComponentSpecRegistry, EntityDefinition } from '@pixelrpg/engine'
import {
  type ComponentRefOptions,
  type GdkSpriteSetResource,
  type NewCharacterDraft,
  type PeerMarker,
  SignalScope,
  type SpriteSetChoice,
  type SpriteSetImportResult,
} from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import {
  countSheetUsers,
  filterCharactersByRole,
  findAnimationToEdit,
  findCharacterById,
  findCharacterBySheet,
  type RoleFilter,
  shouldShowRoleFilter,
} from '../services/cast-view-model.ts'
import {
  type NewCharacterActions,
  presentAnimationDialog,
  presentNewCharacterDialog as presentNewCharacter,
} from './cast/cast-dialogs.ts'
import type { CastDetailActions, CastDetailPane } from './cast/cast-detail-pane.ts'
import { wireRoleFilter, wireRosterSelection } from './cast/cast-view.wiring.ts'
import { CastRosterRow } from './cast/roster-row.ts'
import Template from './cast-view.blp'
import { RowContextMenu } from './row-context-menu.ts'

/**
 * Typed view of the signals {@link CastView} registers, layered on the parent's
 * own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface CastViewSignals extends Adw.Bin.SignalSignatures {
  'notify::active-item-id': (pspec: GObject.ParamSpec) => void
  'character-entity-changed': (entityJson: string) => void
  'detail-requested': () => void
  'detail-title': (title: string) => void
}

/**
 * The Library's **Characters** gallery — a characters-only lens (the
 * friendly hero / NPC roster): a filterable character LIST. The rich
 * detail pane (animated preview + stat summary + editable inspector)
 * is a {@link CastDetailPane} in the `LibraryView` host's one
 * `Adw.NavigationSplitView`, joined by {@link attachDetail} so each
 * half connects its handlers in its own `vfunc_map` (a collapsed split
 * unmaps the sidebar while the detail shows).
 *
 * The host owns the navigation: this widget asks for the detail with
 * `detail-requested` and names it with `detail-title`.
 *
 * Animation authoring lives in the detail: its action×direction matrix
 * edits the character's appearance animations directly. The raw
 * sprite-sheet *asset* (import / delete / glance) lives on the
 * **Graphics** page; the Looks group's "Edit animations" row deep-links
 * there for asset management (Full view only, like the page it opens).
 *
 * Mutations land via host-supplied callbacks (`bindCallbacks`) so the
 * application window stays the single owner of project data.
 */
export class CastView extends Adw.Bin {
  // ── Roster ──────────────────────────────────────────────────────
  declare _roster_list: Gtk.ListBox
  declare _roster_empty: Adw.StatusPage
  declare _filter_bar: Gtk.Box
  declare _filter_all: Gtk.ToggleButton
  declare _filter_heroes: Gtk.ToggleButton
  declare _filter_npcs: Gtk.ToggleButton

  /** The content half, joined by {@link attachDetail}. */
  private _detail: CastDetailPane | null = null
  private _filter: RoleFilter = 'all'
  private _characters: CharacterDefinition[] = []
  private _sheets: SpriteSetChoice[] = []
  private _activeCharacterId: string | null = null
  private _spriteSetsById = new Map<string, GdkSpriteSetResource | null>()
  /** charId → its roster row, so selection + active-id stay in sync. */
  private _rows = new Map<string, CastRosterRow>()
  private signals = new SignalScope()
  private _fullView = false
  /** The roster's shared context menu, built on the first press. */
  private _rowContextMenu: RowContextMenu | null = null
  /** Latest presence, re-applied to the rows a rebuild just replaced. */
  private _peerMarkers: ReadonlyMap<string, readonly PeerMarker[]> = new Map()

  private _onRenameRequested: ((charId: string, name: string) => void) | null = null
  private _onSetPlayerRequested: ((charId: string, isPlayer: boolean) => void) | null = null
  private _onGetCharacterEntity: ((charId: string) => EntityDefinition | null) | null = null
  private _onGetRefOptions: (() => ComponentRefOptions) | null = null
  private _onGetComponentRegistry: (() => ComponentSpecRegistry) | null = null
  private _onSetSpeedRequested: ((charId: string, tilesPerSec: number) => void) | null = null
  private _onChangeSheetRequested: ((charId: string, sheetId: string) => void) | null = null
  private _onDeleteCharacterRequested: ((charId: string) => void) | null = null
  private _onListSpriteSets: (() => SpriteSetChoice[]) | null = null
  private _onCreateCharacter: ((draft: NewCharacterDraft) => void) | null = null
  private _onImportSpriteSet: ((result: SpriteSetImportResult) => Promise<SpriteSetChoice | null>) | null = null
  private _onLoadSpriteSetPreview: ((id: string) => Promise<GdkSpriteSetResource | null>) | null = null
  // Sheet-owned animation mutators — the matrix authors the character's
  // appearance animations directly in the Cast detail now (moved here
  // from the Sheets view). `sheetId` is the character's spriteSetId.
  private _onAddAnimation: ((sheetId: string, animation: CharacterAnimation) => void) | null = null
  private _onEditAnimation: ((sheetId: string, originalId: string, animation: CharacterAnimation) => void) | null = null
  private _onDeleteAnimation: ((sheetId: string, animId: string) => void) | null = null
  /**
   * True while {@link _rebuildRoster} is restoring the selection
   * highlight. `Gtk.ListBox.select_row` emits `row-selected` exactly
   * like a click, and the click path drills a collapsed split into the
   * detail — which is how the phone landed in a character's sheet
   * straight after `win.mode library`, with no one having picked anyone.
   */
  private _syncingSelection = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'CastView',
        Template,
        InternalChildren: ['roster_list', 'roster_empty', 'filter_bar', 'filter_all', 'filter_heroes', 'filter_npcs'],
        Properties: {
          // Pushed down from the Library host so the dialogs this view
          // presents inherit the window's tier.
          'full-view': GObject.ParamSpec.boolean(
            'full-view',
            'Full view',
            'Whether the dialogs this view presents show their advanced rows',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          // The detail's "⋯" menu lives in the Library host's header, so
          // the host binds its Delete item's `enabled` to this rather
          // than reaching into the roster's selection state.
          'has-active': GObject.ParamSpec.boolean(
            'has-active',
            'Has active',
            'Whether a character is currently open in the detail pane',
            GObject.ParamFlags.READABLE,
            false,
          ),
          // What the Library host announces as our awareness place.
          // A property rather than a signal so a late listener (the
          // window wires presence after construction) can still read
          // where we already are.
          'active-item-id': GObject.ParamSpec.string(
            'active-item-id',
            'Active item id',
            'Id of the character currently open, for presence — empty when none',
            GObject.ParamFlags.READABLE,
            '',
          ),
        },
        Signals: {
          'character-entity-changed': { param_types: [GObject.TYPE_STRING] },
          'detail-requested': {},
          'detail-title': { param_types: [GObject.TYPE_STRING] },
        },
      },
      CastView,
    )
  }

  declare connect: GObject.SignalMethods<this, CastViewSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, CastViewSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, CastViewSignals>['emit']

  /**
   * Join this gallery to its {@link CastDetailPane}. Called once, from
   * the `LibraryView` host's constructor: the pane's own handlers live
   * in ITS `vfunc_map`, so the gestures it reports must be connected
   * outside any map scope — a collapsed split unmaps this half while
   * the detail is on screen.
   */
  attachDetail(detail: CastDetailPane): void {
    this._detail = detail
    detail.bindActions(this._detailActions())
    this._refreshActive()
  }

  private _detailActions(): CastDetailActions {
    return {
      rename: (name) => this._withActiveCharacter((id) => this._onRenameRequested?.(id, name)),
      setPlayer: (isPlayer) => this._withActiveCharacter((id) => this._onSetPlayerRequested?.(id, isPlayer)),
      setSpeed: (tilesPerSec) => this._withActiveCharacter((id) => this._onSetSpeedRequested?.(id, tilesPerSec)),
      changeSheet: (sheetId) => this._withActiveCharacter((id) => this._onChangeSheetRequested?.(id, sheetId)),
      editAppearance: () => this._editAppearance(),
      placeOnMap: () => this._placeActiveOnMap(),
      addAnimation: () => this._presentAnimationDialog(null),
      editAnimation: (animId) => this._presentAnimationDialog(animId),
      deleteAnimation: (animId) => this._deleteAnimation(animId),
      entityChanged: (json) => this.emit('character-entity-changed', json),
    }
  }

  vfunc_map(): void {
    super.vfunc_map()

    wireRoleFilter(
      this.signals,
      { all: this._filter_all, heroes: this._filter_heroes, npcs: this._filter_npcs },
      (filter) => this._setFilter(filter),
    )
    wireRosterSelection(this.signals, this._roster_list, (charId) => {
      if (this._syncingSelection) return
      this._selectCharacter(charId)
    })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    // A `set_parent`ed popover is a real child and has to be taken off
    // by hand, or this widget is finalized with children attached.
    this._rowContextMenu?.dispose()
    this._rowContextMenu = null
    super.vfunc_unmap()
  }

  get fullView(): boolean {
    return this._fullView ?? false
  }

  set fullView(value: boolean) {
    if (this._fullView === value) return
    this._fullView = value
    this.notify('full-view')
  }

  presentNewCharacterDialog(): void {
    presentNewCharacter(this, this.fullView, this._newCharacterActions())
  }

  /** Select a character AND reveal its detail (creation landing + tooling drill-in). */
  focusCharacter(id: string): void {
    this._selectCharacter(id)
  }

  /**
   * Select the first character wearing `sheetId` and reveal its detail —
   * the animation matrix is the authoring home for an appearance's
   * animations. Returns `false` when no character uses the appearance yet
   * (an orphan sheet), so the caller can surface that instead of silently
   * doing nothing. Entry for the Sheets view's "edit in Cast" jump +
   * `win.edit-appearance`.
   */
  focusCharacterBySheet(sheetId: string): boolean {
    const character = findCharacterBySheet(this._characters, sheetId)
    if (!character) return false
    this._selectCharacter(character.id)
    return true
  }

  /**
   * Open the add-animation dialog on a sheet's character (the `win.new-animation`
   * tooling/MCP entry). Targets the character wearing `sheetId`, or the
   * active character when no id is given. Returns `false` when there's no
   * such character (orphan sheet / empty roster) so the caller can toast.
   */
  presentNewAnimationForSheet(sheetId?: string): boolean {
    if (sheetId && !this.focusCharacterBySheet(sheetId)) return false
    if (!this._currentCharacter()) return false
    this._presentAnimationDialog(null)
    return true
  }

  bindCallbacks(callbacks: {
    rename: (charId: string, name: string) => void
    setPlayer: (charId: string, isPlayer: boolean) => void
    getCharacterEntity: (charId: string) => EntityDefinition | null
    getRefOptions: () => ComponentRefOptions
    getComponentRegistry: () => ComponentSpecRegistry
    setSpeed: (charId: string, tilesPerSec: number) => void
    changeSheet: (charId: string, sheetId: string) => void
    deleteCharacter: (charId: string) => void
    listSpriteSets: () => SpriteSetChoice[]
    createCharacter: (draft: NewCharacterDraft) => void
    importSpriteSet: (result: SpriteSetImportResult) => Promise<SpriteSetChoice | null>
    loadSpriteSetPreview: (id: string) => Promise<GdkSpriteSetResource | null>
    addAnimation: (sheetId: string, animation: CharacterAnimation) => void
    editAnimation: (sheetId: string, originalId: string, animation: CharacterAnimation) => void
    deleteAnimation: (sheetId: string, animId: string) => void
  }): void {
    this._onRenameRequested = callbacks.rename
    this._onSetPlayerRequested = callbacks.setPlayer
    this._onGetCharacterEntity = callbacks.getCharacterEntity
    this._onGetRefOptions = callbacks.getRefOptions
    this._onGetComponentRegistry = callbacks.getComponentRegistry
    this._onSetSpeedRequested = callbacks.setSpeed
    this._onChangeSheetRequested = callbacks.changeSheet
    this._onDeleteCharacterRequested = callbacks.deleteCharacter
    this._onListSpriteSets = callbacks.listSpriteSets
    this._onCreateCharacter = callbacks.createCharacter
    this._onImportSpriteSet = callbacks.importSpriteSet
    this._onLoadSpriteSetPreview = callbacks.loadSpriteSetPreview
    this._onAddAnimation = callbacks.addAnimation
    this._onEditAnimation = callbacks.editAnimation
    this._onDeleteAnimation = callbacks.deleteAnimation
  }

  setCharacters(characters: CharacterDefinition[], spriteSetsById: Map<string, GdkSpriteSetResource | null>): void {
    this._characters = characters
    this._spriteSetsById = spriteSetsById
    if (this._activeCharacterId && !characters.find((c) => c.id === this._activeCharacterId)) {
      this._setActiveId(null)
    }
    if (!this._activeCharacterId && characters.length > 0) {
      this._setActiveId(characters[0].id)
    }
    this._rebuildRoster()
    this._refreshActive()
  }

  setSheets(sheets: SpriteSetChoice[]): void {
    this._sheets = sheets
    this._detail?.setSheets(this._sheets, this._currentCharacter()?.spriteSetId ?? null)
  }

  // ── Roster (master) ─────────────────────────────────────────────

  private _setFilter(filter: RoleFilter): void {
    if (this._filter === filter) return
    this._filter = filter
    this._rebuildRoster()
  }

  private _rebuildRoster(): void {
    for (const row of this._rows.values()) this._roster_list.remove(row)
    this._rows.clear()

    // A hidden chip row must not keep filtering: a roster that shrinks
    // below the threshold while "Heroes" is active would otherwise hide
    // NPCs with nothing on screen explaining why.
    const showFilter = shouldShowRoleFilter(this._characters.length)
    this._filter_bar.set_visible(showFilter)
    if (!showFilter && this._filter !== 'all') {
      this._filter = 'all'
      this._filter_all.set_active(true)
    }

    const filtered = filterCharactersByRole(this._characters, this._filter)
    this._roster_empty.set_visible(filtered.length === 0)
    this._roster_list.set_visible(filtered.length > 0)

    for (const character of filtered) {
      const row = new CastRosterRow(character, this._spriteSetsById.get(character.spriteSetId) ?? null)
      this._rowMenu().attach(row, character.id, () => this._selectCharacter(character.id))
      this._roster_list.append(row)
      this._rows.set(character.id, row)
    }
    this._applyPeers()
    // Keep the selection highlight in sync with the active character.
    // Flagged, because `select_row` is indistinguishable from a click at
    // the signal and a click reveals the detail.
    const activeRow = this._activeCharacterId ? this._rows.get(this._activeCharacterId) : null
    if (!activeRow) return
    this._syncingSelection = true
    try {
      this._roster_list.select_row(activeRow)
    } finally {
      this._syncingSelection = false
    }
  }

  /**
   * The roster's one context menu. Lazy: the label goes through gettext,
   * and a field initializer would run it while the template is still
   * being built.
   */
  private _rowMenu(): RowContextMenu {
    if (!this._rowContextMenu) {
      this._rowContextMenu = new RowContextMenu(this, [{ label: _('Delete'), action: 'win.delete-character' }])
    }
    return this._rowContextMenu
  }

  private _selectCharacter(id: string): void {
    const character = findCharacterById(this._characters, id)
    if (!character) return
    this._setActiveId(id)
    this._refreshActive()
    const row = this._rows.get(id)
    if (row && this._roster_list.get_selected_row() !== row) this._roster_list.select_row(row)
    // Drill into the detail pane when collapsed (phone); on desktop both
    // panes are already visible so the host's answer is a no-op.
    this.emit('detail-requested')
  }

  /** Whether a character is open in the detail — see the `has-active` property. */
  get hasActive(): boolean {
    return this._activeCharacterId !== null
  }

  /** Id of the open character, for presence. Empty when the detail is idle. */
  get activeItemId(): string {
    return this._activeCharacterId ?? ''
  }

  /**
   * Show who has each character open, keyed by character id (§ 4.7).
   *
   * Kept and re-applied after a roster rebuild, because the two arrive
   * independently — a rename rebuilds the list and would otherwise drop
   * every dot until the next peer navigation.
   */
  setPeerMarkers(byId: ReadonlyMap<string, readonly PeerMarker[]>): void {
    this._peerMarkers = byId
    this._applyPeers()
  }

  private _applyPeers(): void {
    for (const [id, row] of this._rows) row.setPeers(this._peerMarkers.get(id) ?? [])
  }

  /** The one writer of the active id, so `has-active` notifies from both paths. */
  private _setActiveId(id: string | null): void {
    const had = this._activeCharacterId !== null
    const was = this._activeCharacterId
    this._activeCharacterId = id
    if (had !== (id !== null)) this.notify('has-active')
    if (was !== id) this.notify('active-item-id')
  }

  /**
   * Delete a character, or the open one when no id is given. No
   * confirmation dialog: the controller's toast carries the Undo, which
   * is both less friction for the common case and a real way back from
   * a mistake. Public — the entry is `win.delete-character`, so the
   * detail's "⋯" and a row's context menu share one path.
   */
  deleteCharacter(id?: string): void {
    const target = id || this._activeCharacterId
    if (!target) return
    if (!findCharacterById(this._characters, target)) return
    this._onDeleteCharacterRequested?.(target)
  }

  // ── Detail ──────────────────────────────────────────────────────

  private _currentCharacter(): CharacterDefinition | null {
    return findCharacterById(this._characters, this._activeCharacterId)
  }

  private _activeSpriteSet(): GdkSpriteSetResource | null {
    const character = this._currentCharacter()
    if (!character) return null
    return this._spriteSetsById.get(character.spriteSetId) ?? null
  }

  /** Run `apply` with the active character's id, if the roster has one. */
  private _withActiveCharacter(apply: (charId: string) => void): void {
    if (this._activeCharacterId) apply(this._activeCharacterId)
  }

  private _refreshActive(): void {
    const character = this._currentCharacter()
    // The host's detail header takes its title from here — also when the
    // pane is not attached yet, so a roster that arrives during
    // construction still names the header.
    this.emit('detail-title', character?.name || _('Character'))
    const detail = this._detail
    if (!detail) return
    if (!character) {
      detail.showEmpty()
      return
    }
    detail.showCharacter({
      character,
      spriteSet: this._activeSpriteSet(),
      sheets: this._sheets,
      appearanceUsage: countSheetUsers(this._characters, character.spriteSetId),
    })

    const entity = this._onGetCharacterEntity?.(character.id) ?? null
    if (entity) {
      detail.setEntity(entity, this._onGetRefOptions?.() ?? {}, this._onGetComponentRegistry?.())
    }
  }

  /** Deep-link into the active character's raw appearance ASSET (Graphics). */
  private _editAppearance(): void {
    const character = this._currentCharacter()
    if (character) this.activate_action('win.open-appearance', GLib.Variant.new_string(character.spriteSetId))
  }

  private _placeActiveOnMap(): void {
    const character = this._currentCharacter()
    if (character) this.activate_action('win.place-character', GLib.Variant.new_string(character.id))
  }

  private _deleteAnimation(animId: string): void {
    const character = this._currentCharacter()
    if (character) this._onDeleteAnimation?.(character.spriteSetId, animId)
  }

  /**
   * Open the frame editor for a role (`animId`) or a brand-new custom
   * animation (`null`) on the active character's sheet. Mutations route
   * through the sheet-owned controller callbacks (the same path the Sheets
   * view used before authoring moved here).
   */
  private _presentAnimationDialog(animId: string | null): void {
    const character = this._currentCharacter()
    if (!character) return
    const spriteSet = this._activeSpriteSet()
    const sheetId = character.spriteSetId
    presentAnimationDialog(
      this,
      {
        character,
        spriteSet,
        existing: findAnimationToEdit(animId, spriteSet?.data?.characterAnimations, character.animations),
      },
      {
        add: (animation) => this._onAddAnimation?.(sheetId, animation),
        edit: (originalId, animation) => this._onEditAnimation?.(sheetId, originalId, animation),
      },
    )
  }

  private _newCharacterActions(): NewCharacterActions {
    return {
      listSpriteSets: () => this._onListSpriteSets?.() ?? [],
      loadPreview: (id) => this._onLoadSpriteSetPreview?.(id),
      importSpriteSet: (result) => this._onImportSpriteSet?.(result),
      createCharacter: (draft) => this._onCreateCharacter?.(draft),
    }
  }
}

GObject.type_ensure(CastView.$gtype)
