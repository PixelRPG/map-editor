import type Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterDefinition, ComponentSpecRegistry, EntityDefinition } from '@pixelrpg/engine'
import {
  ActionDirectionMatrix,
  CastInspector,
  CharacterPreview,
  type ComponentRefOptions,
  EntityComponentsEditor,
  type GdkSpriteSetResource,
  type ModeRail,
  type NewCharacterDraft,
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
} from '../services/cast-view-model.ts'
import {
  confirmCharacterDelete,
  type NewCharacterActions,
  presentAnimationDialog,
  presentNewCharacterDialog as presentNewCharacter,
} from './cast/cast-dialogs.ts'
import { attachStatTiles, characterSubtitle, STAT_KEYS, type StatKey, statValues } from './cast/cast-detail.ts'
import {
  wireAnimationMatrix,
  wireCastInspector,
  wireDetailActions,
  wireRoleFilter,
  wireRosterSelection,
} from './cast/cast-view.wiring.ts'
import { CastRosterRow } from './cast/roster-row.ts'
import { attachTemplateSlots } from './cast/template-slots.ts'
import Template from './cast-view.blp'
import { ResponsiveEditorView } from './responsive-editor-view.ts'

GObject.type_ensure(CharacterPreview.$gtype)
GObject.type_ensure(CastInspector.$gtype)
GObject.type_ensure(ActionDirectionMatrix.$gtype)

export namespace CastView {
  export type ConstructorProps = Partial<Adw.Bin.ConstructorProps>
  export interface SignalProps {
    'mode-changed': [string]
  }
}

/**
 * Project-level Cast view — a Characters-only lens (the friendly hero /
 * NPC roster) as an `Adw.NavigationSplitView` **master-detail**: a
 * filterable character LIST on the left, a rich detail pane (animated
 * preview + stat summary + editable inspector) on the right. The split
 * collapses to a drill-down on narrow widths.
 *
 * Animation authoring lives here: the {@link ActionDirectionMatrix} in
 * the detail edits the character's appearance animations directly. The
 * raw sprite-sheet *asset* (import / delete / glance) lives in the
 * unified **Sheets** view; the detail's "Edit appearance →" deep-links
 * there for asset management.
 *
 * Mutations land via host-supplied callbacks (`bindCallbacks`) so the
 * application window stays the single owner of project data.
 */
export class CastView extends ResponsiveEditorView {
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
  declare _detail_stack: Gtk.Stack
  declare _preview: CharacterPreview
  declare _detail_name: Gtk.Label
  declare _detail_player_badge: Gtk.Label
  declare _detail_subtitle: Gtk.Label
  declare _stat_grid: Gtk.Grid
  declare _edit_appearance_button: Gtk.Button
  declare _place_button: Gtk.Button
  declare _inspector: CastInspector
  declare _matrix: ActionDirectionMatrix
  declare _advanced_slot: Gtk.Box

  private _projectName = ''
  private _filter: RoleFilter = 'all'
  private _characters: CharacterDefinition[] = []
  private _sheets: SpriteSetChoice[] = []
  private _activeCharacterId: string | null = null
  private _spriteSetsById = new Map<string, GdkSpriteSetResource | null>()
  /** charId → its roster row, so selection + active-id stay in sync. */
  private _rows = new Map<string, CastRosterRow>()
  /** Stat-tile value labels, updated on every detail refresh. */
  private _statValues = new Map<StatKey, Gtk.Label>()
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
          'mode_rail',
          'cast_split',
          'roster_list',
          'roster_empty',
          'filter_all',
          'filter_heroes',
          'filter_npcs',
          'template_slots',
          'detail_page',
          'detail_stack',
          'preview',
          'detail_name',
          'detail_player_badge',
          'detail_subtitle',
          'stat_grid',
          'edit_appearance_button',
          'place_button',
          'inspector',
          'matrix',
          'advanced_slot',
        ],
        Properties: {
          'project-name': GObject.ParamSpec.string(
            'project-name',
            'Project Name',
            'Display name fed into the ModeRail hero block',
            GObject.ParamFlags.READWRITE,
            '',
          ),
        },
        Signals: {
          // mode-changed inherited from ResponsiveEditorView.
          'character-entity-changed': { param_types: [GObject.TYPE_STRING] },
        },
      },
      CastView,
    )
  }

  private _advancedEditor = new EntityComponentsEditor()
  private _silentAdvanced = false

  constructor() {
    super()
    const expander = new Gtk.Expander({ label: _('All components'), marginTop: 8 })
    expander.set_child(this._advancedEditor)
    this._advanced_slot.append(expander)
    this._advancedEditor.connect('entity-changed', (_e: EntityComponentsEditor, json: string) => {
      if (!this._silentAdvanced) this.emit('character-entity-changed', json)
    })
    this._statValues = attachStatTiles(this._stat_grid)
    attachTemplateSlots(this._template_slots, (name) => this.presentNewCharacterDialog(name, 'npc'))
  }

  /**
   * Populate the "all components" disclosure with a raw entity def.
   * Silent. `registry` is the project's EFFECTIVE component registry, so
   * a component whose game system is off is not offered here either.
   */
  setCharacterEntity(def: EntityDefinition, refOptions: ComponentRefOptions, registry?: ComponentSpecRegistry): void {
    this._silentAdvanced = true
    try {
      if (registry) this._advancedEditor.setRegistry(registry)
      this._advancedEditor.setRefOptions(refOptions)
      this._advancedEditor.setEntity(def)
    } finally {
      this._silentAdvanced = false
    }
  }

  vfunc_map(): void {
    super.vfunc_map()
    this._inspector.setMode('character')

    this.signals.connect(this._mode_rail, 'mode-changed', (_v: ModeRail, mode: string) => {
      this.emit('mode-changed', mode)
    })
    wireRoleFilter(
      this.signals,
      { all: this._filter_all, heroes: this._filter_heroes, npcs: this._filter_npcs },
      (filter) => this._setFilter(filter),
    )
    wireRosterSelection(this.signals, this._roster_list, (charId) => this._selectCharacter(charId))
    wireCastInspector(this.signals, this._inspector, {
      rename: (name) => this._withActiveCharacter((id) => this._onRenameRequested?.(id, name)),
      setPlayer: (isPlayer) => this._withActiveCharacter((id) => this._onSetPlayerRequested?.(id, isPlayer)),
      setSpeed: (tilesPerSec) => this._withActiveCharacter((id) => this._onSetSpeedRequested?.(id, tilesPerSec)),
      changeSheet: (sheetId) => this._withActiveCharacter((id) => this._onChangeSheetRequested?.(id, sheetId)),
      editAppearance: () => this._editAppearance(),
    })
    wireAnimationMatrix(
      this.signals,
      { matrix: this._matrix, preview: this._preview },
      {
        addAnimation: () => this._presentAnimationDialog(null),
        editAnimation: (animId) => this._presentAnimationDialog(animId),
        deleteAnimation: (animId) => this._deleteAnimation(animId),
      },
    )
    wireDetailActions(
      this.signals,
      { editAppearance: this._edit_appearance_button, place: this._place_button },
      { editAppearance: () => this._editAppearance(), placeOnMap: () => this._placeActiveOnMap() },
    )
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

  get projectName(): string {
    return this._projectName ?? ''
  }

  set projectName(value: string) {
    if (this._projectName === value) return
    this._projectName = value
    this._mode_rail.projectName = value
    this.notify('project-name')
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
    this._inspector.setSheets(this._sheets, this._currentCharacter()?.spriteSetId ?? null)
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
    const character = this._currentCharacter()
    if (!character) {
      this._detail_stack.set_visible_child_name('empty')
      this._preview.setCharacter(null, null)
      return
    }
    this._detail_stack.set_visible_child_name('info')
    const spriteSet = this._activeSpriteSet()
    this._preview.setCharacter(character, spriteSet)
    this._detail_name.set_label(character.name)
    this._detail_player_badge.set_visible(character.isPlayer === true)
    this._detail_subtitle.set_label(characterSubtitle(character))
    this._refreshStats(character)
    this._refreshEditors(character, spriteSet)

    const entity = this._onGetCharacterEntity?.(character.id) ?? null
    if (entity) {
      this.setCharacterEntity(entity, this._onGetRefOptions?.() ?? {}, this._onGetComponentRegistry?.())
    }
  }

  private _refreshStats(character: CharacterDefinition): void {
    const values = statValues(character, this._sheets)
    for (const key of STAT_KEYS) this._statValues.get(key)?.set_label(values[key])
  }

  private _refreshEditors(character: CharacterDefinition, spriteSet: GdkSpriteSetResource | null): void {
    this._inspector.setCharacter(character)
    this._inspector.setSheets(this._sheets, character.spriteSetId)
    this._inspector.setAppearanceUsage(countSheetUsers(this._characters, character.spriteSetId))
    this._matrix.setCharacter(character, spriteSet)
  }

  /** Deep-link into the active character's raw appearance ASSET (Sheets view). */
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
