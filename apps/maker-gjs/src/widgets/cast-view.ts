import type Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterDefinition, ComponentSpecRegistry, EntityDefinition } from '@pixelrpg/engine'
import {
  type ComponentRefOptions,
  type GdkSpriteSetResource,
  type NewCharacterDraft,
  SignalScope,
  type SpriteSetChoice,
  type SpriteSetImportResult,
} from '@pixelrpg/gjs'

import {
  countSheetUsers,
  filterCharactersByRole,
  findAnimationToEdit,
  findCharacterById,
  findCharacterBySheet,
  type RoleFilter,
} from '../services/cast-view-model.ts'
import {
  confirmCharacterDelete,
  type NewCharacterActions,
  presentAnimationDialog,
  presentNewCharacterDialog as presentNewCharacter,
} from './cast/cast-dialogs.ts'
import { type CastDetailActions, CastDetailPane } from './cast/cast-detail-pane.ts'
import { wireRoleFilter, wireRosterSelection } from './cast/cast-view.wiring.ts'
import { CastRosterRow } from './cast/roster-row.ts'
import { attachTemplateSlots } from './cast/template-slots.ts'
import Template from './cast-view.blp'
import { LibraryPage } from './library-page.ts'

GObject.type_ensure(CastDetailPane.$gtype)

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
  'character-entity-changed': (entityJson: string) => void
}

/**
 * The Library's **Characters** page — a characters-only lens (the
 * friendly hero / NPC roster) as an `Adw.NavigationSplitView`
 * **master-detail**: a filterable character LIST on the left, a rich
 * detail pane (animated preview + stat summary + editable inspector) on
 * the right. The split collapses to a drill-down on narrow widths. The
 * mode rail and the header (chips + "+") belong to the `LibraryView`
 * host.
 *
 * Only the roster half lives in this widget; the detail body is a
 * {@link CastDetailPane} joined by {@link attachDetail}, so each half
 * connects its handlers in its own `vfunc_map` (a collapsed split
 * unmaps the sidebar while the detail shows).
 *
 * Animation authoring lives in the detail: its action×direction matrix
 * edits the character's appearance animations directly. The raw
 * sprite-sheet *asset* (import / delete / glance) lives on the
 * **Graphics** page; the detail's "Edit appearance →" deep-links there
 * for asset management.
 *
 * Mutations land via host-supplied callbacks (`bindCallbacks`) so the
 * application window stays the single owner of project data.
 */
export class CastView extends LibraryPage {
  declare _cast_split: Adw.NavigationSplitView
  // ── Master (roster) ─────────────────────────────────────────────
  declare _roster_list: Gtk.ListBox
  declare _roster_empty: Adw.StatusPage
  declare _filter_all: Gtk.ToggleButton
  declare _filter_heroes: Gtk.ToggleButton
  declare _filter_npcs: Gtk.ToggleButton
  declare _template_slots: Gtk.FlowBox
  // ── Detail ──────────────────────────────────────────────────────
  declare _detail_page: Adw.NavigationPage
  declare _detail_pane: CastDetailPane

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

  static {
    GObject.registerClass(
      {
        GTypeName: 'CastView',
        Template,
        InternalChildren: [
          'cast_split',
          'roster_list',
          'roster_empty',
          'filter_all',
          'filter_heroes',
          'filter_npcs',
          'template_slots',
          'detail_page',
          'detail_pane',
        ],
        Signals: {
          'character-entity-changed': { param_types: [GObject.TYPE_STRING] },
        },
      },
      CastView,
    )
  }

  declare connect: GObject.SignalMethods<this, CastViewSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, CastViewSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, CastViewSignals>['emit']

  constructor() {
    super()
    attachTemplateSlots(this._template_slots, (name) => this.presentNewCharacterDialog(name, 'npc'))
    this.attachDetail(this._detail_pane)
  }

  /**
   * Join this gallery to its {@link CastDetailPane}. Done once, at
   * construction: the pane's own handlers live in ITS `vfunc_map`, so
   * the gestures it reports must be connected outside any map scope —
   * a collapsed split unmaps this half while the detail is on screen.
   */
  attachDetail(detail: CastDetailPane): void {
    this._detail = detail
    detail.bindActions(this._detailActions())
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
    wireRosterSelection(this.signals, this._roster_list, (charId) => this._selectCharacter(charId))
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  presentNewCharacterDialog(initialName?: string, initialKind: 'hero' | 'npc' = 'hero'): void {
    presentNewCharacter(
      this,
      this._newCharacterActions(),
      initialName ? { name: initialName, kind: initialKind } : undefined,
    )
  }

  /** Reset to the roster (used on project swap). */
  resetToOverview(): void {
    this._cast_split.set_show_content(false)
  }

  /**
   * Slide back from the character detail to the roster, and say whether
   * there was anywhere to go — back step 4 (REDESIGN.md § 3.4). Only the
   * collapsed split view has a "page" to pop; while both panes show, the
   * detail is not covering anything and back belongs to the caller.
   */
  popPage(): boolean {
    if (!this.hasPushedPage()) return false
    this._cast_split.set_show_content(false)
    return true
  }

  /** Whether the character detail is covering the roster (collapsed only). */
  hasPushedPage(): boolean {
    return this._cast_split.get_collapsed() && this._cast_split.get_show_content()
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
      this._activeCharacterId = null
    }
    if (!this._activeCharacterId && characters.length > 0) {
      this._activeCharacterId = characters[0].id
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

    const filtered = filterCharactersByRole(this._characters, this._filter)
    this._roster_empty.set_visible(filtered.length === 0)
    this._roster_list.set_visible(filtered.length > 0)

    for (const character of filtered) {
      const row = new CastRosterRow(character, this._spriteSetsById.get(character.spriteSetId) ?? null)
      row.connect('delete-requested', () => this._confirmDeleteCharacter(character.id))
      this._roster_list.append(row)
      this._rows.set(character.id, row)
    }
    // Keep the selection highlight in sync with the active character.
    const activeRow = this._activeCharacterId ? this._rows.get(this._activeCharacterId) : null
    if (activeRow) this._roster_list.select_row(activeRow)
  }

  private _selectCharacter(id: string): void {
    const character = findCharacterById(this._characters, id)
    if (!character) return
    this._activeCharacterId = id
    this._refreshActive()
    const row = this._rows.get(id)
    if (row && this._roster_list.get_selected_row() !== row) this._roster_list.select_row(row)
    this._detail_page.title = character.name
    // Drill into the detail pane when collapsed (phone); on desktop both
    // panes are already visible so this is a harmless no-op.
    this._cast_split.set_show_content(true)
  }

  private _confirmDeleteCharacter(id: string): void {
    const character = findCharacterById(this._characters, id)
    if (!character) return
    void confirmCharacterDelete(this, character.name).then((confirmed) => {
      if (confirmed) this._onDeleteCharacterRequested?.(id)
    })
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
    const detail = this._detail
    if (!detail) return
    const character = this._currentCharacter()
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
