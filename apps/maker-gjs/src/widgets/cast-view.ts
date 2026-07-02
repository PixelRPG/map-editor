import type Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterDefinition, EntityDefinition } from '@pixelrpg/engine'
import {
  ActionDirectionMatrix,
  AddAnimationDialog,
  CastInspector,
  CharacterPreview,
  type ComponentRefOptions,
  confirmDestructive,
  EntityComponentsEditor,
  type GdkSpriteSetResource,
  type ModeRail,
  NewCharacterDialog,
  type NewCharacterDraft,
  SignalScope,
  type SpriteSetChoice,
  SpriteSetImportDialog,
  type SpriteSetImportResult,
} from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import Template from './cast-view.blp'
import { ResponsiveEditorView } from './responsive-editor-view.ts'

/** Roster-row avatar edge length (px). */
const ROSTER_AVATAR_SIZE = 40

type RoleFilter = 'all' | 'heroes' | 'npcs'

/** NPC archetypes offered as "Add from template" quick-create slots. */
const NPC_TEMPLATES = ['Villager', 'Guard', 'Merchant', 'Child'] as const

GObject.type_ensure(CharacterPreview.$gtype)
GObject.type_ensure(CastInspector.$gtype)
GObject.type_ensure(ActionDirectionMatrix.$gtype)

export namespace CastView {
  export type ConstructorProps = Partial<Adw.Bin.ConstructorProps>
  export interface SignalProps {
    'mode-changed': [string]
    'character-changed': []
  }
}

/**
 * Project-level Cast view — a Characters-only lens (the friendly hero /
 * NPC roster) as an `Adw.NavigationSplitView` **master-detail**: a
 * filterable character LIST on the left, a rich detail pane (animated
 * preview + stat summary + editable inspector) on the right. The split
 * collapses to a drill-down on narrow widths.
 *
 * A character just *picks* an appearance — sprite sheets + their
 * animation editor live in the unified **Sheets** view; the detail's
 * "Edit appearance →" deep-links there.
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
  private _rows = new Map<string, Gtk.ListBoxRow>()
  /** Stat-tile value labels, updated on every detail refresh. */
  private _statValues = new Map<string, Gtk.Label>()
  private signals = new SignalScope()

  private _onRenameRequested: ((charId: string, name: string) => void) | null = null
  private _onSetPlayerRequested: ((charId: string, isPlayer: boolean) => void) | null = null
  private _onGetCharacterEntity: ((charId: string) => EntityDefinition | null) | null = null
  private _onGetRefOptions: (() => ComponentRefOptions) | null = null
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
          'character-changed': {},
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
    this._buildStatGrid()
    this._buildTemplateSlots()
  }

  /** Populate the "all components" disclosure with a raw entity def. Silent. */
  setCharacterEntity(def: EntityDefinition, refOptions: ComponentRefOptions): void {
    this._silentAdvanced = true
    try {
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

    // Role filter chips.
    for (const [button, filter] of [
      [this._filter_all, 'all'],
      [this._filter_heroes, 'heroes'],
      [this._filter_npcs, 'npcs'],
    ] as [Gtk.ToggleButton, RoleFilter][]) {
      this.signals.connect(button, 'toggled', () => {
        if (button.get_active() && this._filter !== filter) {
          this._filter = filter
          this._rebuildRoster()
        }
      })
    }

    // Roster selection → detail.
    this.signals.connect(this._roster_list, 'row-selected', (_l: Gtk.ListBox, row: Gtk.ListBoxRow | null) => {
      if (!row) return
      const id = (row as Gtk.ListBoxRow & { _charId?: string })._charId
      if (id) this._selectCharacter(id)
    })

    // ── Character detail inspector (mode: character) ───────────────
    this.signals.connect(this._inspector, 'name-changed', (_v: CastInspector, name: string) => {
      if (this._activeCharacterId) this._onRenameRequested?.(this._activeCharacterId, name)
    })
    this.signals.connect(this._inspector, 'player-changed', (_v: CastInspector, isPlayer: boolean) => {
      if (this._activeCharacterId) this._onSetPlayerRequested?.(this._activeCharacterId, isPlayer)
    })
    this.signals.connect(this._inspector, 'speed-changed', (_v: CastInspector, tilesPerSec: number) => {
      if (this._activeCharacterId) this._onSetSpeedRequested?.(this._activeCharacterId, tilesPerSec)
    })
    this.signals.connect(this._inspector, 'sheet-changed', (_v: CastInspector, sheetId: string) => {
      if (this._activeCharacterId) this._onChangeSheetRequested?.(this._activeCharacterId, sheetId)
    })
    this.signals.connect(this._inspector, 'edit-appearance-requested', () => this._editAppearance())
    this.signals.connect(this._edit_appearance_button, 'clicked', () => this._editAppearance())

    // ── Animation matrix (sheet-owned animations) ──────────────────
    this.signals.connect(this._matrix, 'animation-selected', (_m: ActionDirectionMatrix, id: string) => {
      this._preview.setActiveAnimation(id)
    })
    // Keep the matrix highlight in sync when the preview's direction pad
    // changes the active animation.
    this.signals.connect(this._preview, 'notify::active-animation-id', () => {
      this._matrix.setActiveAnimation(this._preview.activeAnimationId || null)
    })
    this.signals.connect(this._matrix, 'add-animation-requested', () => this._presentAnimationDialog(null))
    this.signals.connect(this._matrix, 'edit-animation-requested', (_m: ActionDirectionMatrix, id: string) => {
      this._presentAnimationDialog(id)
    })
    this.signals.connect(this._matrix, 'delete-animation-requested', (_m: ActionDirectionMatrix, id: string) => {
      const character = this._currentCharacter()
      if (character) this._onDeleteAnimation?.(character.spriteSetId, id)
    })
    this.signals.connect(this._place_button, 'clicked', () => {
      const character = this._currentCharacter()
      if (character) this.activate_action('win.place-character', GLib.Variant.new_string(character.id))
    })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  /** Deep-link into the active character's raw appearance ASSET (Sheets view). */
  private _editAppearance(): void {
    const character = this._currentCharacter()
    if (character) this.activate_action('win.open-appearance', GLib.Variant.new_string(character.spriteSetId))
  }

  /**
   * Open the frame editor for a role (`animId`) or a brand-new custom
   * animation (`null`) on the active character's sheet. Reuses the
   * existing {@link AddAnimationDialog}; mutations route through the
   * sheet-owned controller callbacks (the same path the Sheets view used
   * before authoring moved here).
   */
  private _presentAnimationDialog(animId: string | null): void {
    const character = this._currentCharacter()
    if (!character) return
    const spriteSet = this._activeSpriteSet()
    const sheetId = character.spriteSetId
    const anims = spriteSet?.data?.characterAnimations ?? character.animations ?? []
    const existing = animId ? (anims.find((a) => a.id === animId) ?? null) : null
    const dialog = new AddAnimationDialog()
    dialog.setContext(character, spriteSet, existing ?? undefined)
    if (existing) {
      dialog.connect(
        'animation-edited',
        (_d: AddAnimationDialog, originalId: string, animation: CharacterAnimation) => {
          this._onEditAnimation?.(sheetId, originalId, animation)
        },
      )
    } else {
      dialog.connect('animation-created', (_d: AddAnimationDialog, animation: CharacterAnimation) => {
        this._onAddAnimation?.(sheetId, animation)
      })
    }
    dialog.present(this)
  }

  private _selectCharacter(id: string): void {
    const character = this._characters.find((c) => c.id === id)
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

  presentNewCharacterDialog(initialName?: string, initialKind: 'hero' | 'npc' = 'hero'): void {
    const dialog = new NewCharacterDialog()
    dialog.connect('spriteset-activated', (_d: NewCharacterDialog, id: string) => {
      void this._onLoadSpriteSetPreview?.(id).then((res) => dialog.setPreview(res ?? null))
    })
    dialog.connect('import-spriteset-requested', () =>
      this._presentSpriteSetImportDialog((choice) => dialog.addSpriteSet(choice)),
    )
    dialog.connect('character-created', (_d: NewCharacterDialog, draft: NewCharacterDraft) => {
      this._onCreateCharacter?.(draft)
    })
    dialog.setSpriteSets(this._onListSpriteSets?.() ?? [])
    if (initialName) dialog.seed(initialName, initialKind)
    dialog.present(this)
  }

  private _presentSpriteSetImportDialog(onImported?: (choice: SpriteSetChoice) => void): void {
    const dialog = new SpriteSetImportDialog()
    dialog.kind = 'character'
    dialog.connect('spriteset-imported', (_d: SpriteSetImportDialog, result: SpriteSetImportResult) => {
      void this._onImportSpriteSet?.(result).then((choice) => {
        if (choice) onImported?.(choice)
      })
    })
    dialog.present(this)
  }

  /** Reset to the roster (used on project swap). */
  resetToOverview(): void {
    this._cast_split.set_show_content(false)
  }

  /** Select a character AND reveal its detail (creation landing + tooling drill-in). */
  focusCharacter(id: string): void {
    this._selectCharacter(id)
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

  private _filtered(): CharacterDefinition[] {
    if (this._filter === 'heroes') return this._characters.filter((c) => c.kind === 'hero')
    if (this._filter === 'npcs') return this._characters.filter((c) => c.kind === 'npc')
    return this._characters
  }

  private _rebuildRoster(): void {
    for (const row of this._rows.values()) this._roster_list.remove(row)
    this._rows.clear()

    const filtered = this._filtered()
    this._roster_empty.set_visible(filtered.length === 0)
    this._roster_list.set_visible(filtered.length > 0)

    for (const character of filtered) {
      const row = this._buildRosterRow(character)
      this._roster_list.append(row)
      this._rows.set(character.id, row)
    }
    // Keep the selection highlight in sync with the active character.
    const activeRow = this._activeCharacterId ? this._rows.get(this._activeCharacterId) : null
    if (activeRow) this._roster_list.select_row(activeRow)
  }

  private _buildRosterRow(character: CharacterDefinition): Gtk.ListBoxRow {
    const row = new Gtk.ListBoxRow() as Gtk.ListBoxRow & { _charId?: string }
    row._charId = character.id
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 12,
      marginTop: 6,
      marginBottom: 6,
      marginStart: 6,
      marginEnd: 6,
    })

    const avatar = new CharacterPreview()
    avatar.showControls = false
    avatar.autoCycle = false
    avatar.highlighted = false
    avatar.frameSize = ROSTER_AVATAR_SIZE
    avatar.setCharacter(character, this._spriteSetsById.get(character.spriteSetId) ?? null)
    box.append(avatar)

    const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true, valign: Gtk.Align.CENTER })
    const name = new Gtk.Label({ label: character.name, halign: Gtk.Align.START, cssClasses: ['heading'] })
    const role = new Gtk.Label({
      label: character.kind === 'hero' ? _('Hero') : _('NPC'),
      halign: Gtk.Align.START,
      cssClasses: ['caption', 'dim-label'],
    })
    text.append(name)
    text.append(role)
    box.append(text)

    if (character.isPlayer) {
      const badge = new Gtk.Label({
        label: _('Player'),
        valign: Gtk.Align.CENTER,
        cssClasses: ['caption-heading', 'accent'],
      })
      box.append(badge)
    }

    // Delete affordance — destructive, confirmed.
    const del = new Gtk.Button({
      iconName: 'user-trash-symbolic',
      valign: Gtk.Align.CENTER,
      cssClasses: ['flat'],
      tooltipText: _('Delete character'),
    })
    del.connect('clicked', () => this._confirmDeleteCharacter(character.id))
    box.append(del)

    row.set_child(box)
    return row
  }

  private _buildTemplateSlots(): void {
    for (const name of NPC_TEMPLATES) {
      const button = new Gtk.Button({ cssClasses: ['flat', 'card', 'cast-template-slot'] })
      const inner = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        marginTop: 8,
        marginBottom: 8,
        marginStart: 10,
        marginEnd: 10,
      })
      inner.append(new Gtk.Image({ iconName: 'list-add-symbolic' }))
      inner.append(new Gtk.Label({ label: _(name), halign: Gtk.Align.START, hexpand: true }))
      button.set_child(inner)
      button.connect('clicked', () => this.presentNewCharacterDialog(_(name), 'npc'))
      this._template_slots.append(button)
    }
  }

  // ── Detail ──────────────────────────────────────────────────────

  private _buildStatGrid(): void {
    const specs: [string, string][] = [
      ['appearance', _('Appearance')],
      ['movement', _('Movement')],
      ['role', _('Role')],
      ['collision', _('Collision')],
    ]
    specs.forEach(([key, label], i) => {
      const tile = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 2,
        cssClasses: ['card', 'cast-stat-tile'],
        hexpand: true,
      })
      tile.append(new Gtk.Label({ label, halign: Gtk.Align.START, cssClasses: ['caption', 'dim-label'] }))
      const value = new Gtk.Label({
        label: '—',
        halign: Gtk.Align.START,
        xalign: 0,
        wrap: true,
        cssClasses: ['heading'],
      })
      tile.append(value)
      this._statValues.set(key, value)
      this._stat_grid.attach(tile, i % 2, Math.floor(i / 2), 1, 1)
    })
  }

  private _activeSpriteSet(): GdkSpriteSetResource | null {
    const character = this._currentCharacter()
    if (!character) return null
    return this._spriteSetsById.get(character.spriteSetId) ?? null
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
    this._detail_subtitle.set_label(
      character.kind === 'hero' ? _("Hero · spawns at the map's player spawn-point") : _('NPC · placed on maps'),
    )
    this._refreshStats(character)

    this._inspector.setCharacter(character)
    this._inspector.setSheets(this._sheets, character.spriteSetId)
    const usage = this._characters.filter((c) => c.spriteSetId === character.spriteSetId).length
    this._inspector.setAppearanceUsage(usage)
    this._matrix.setCharacter(character, spriteSet)

    const entity = this._onGetCharacterEntity?.(character.id) ?? null
    if (entity) this.setCharacterEntity(entity, this._onGetRefOptions?.() ?? {})
  }

  private _refreshStats(character: CharacterDefinition): void {
    const sheet = this._sheets.find((s) => s.id === character.spriteSetId)
    const speed = character.speedTilesPerSec ?? 4
    this._statValues.get('appearance')?.set_label(sheet?.name ?? character.spriteSetId)
    this._statValues.get('movement')?.set_label(_(`${speed} tiles/second`))
    this._statValues.get('role')?.set_label(character.kind === 'hero' ? _('Hero') : _('NPC'))
    this._statValues.get('collision')?.set_label(_('On'))
  }

  private _currentCharacter(): CharacterDefinition | null {
    if (!this._activeCharacterId) return null
    return this._characters.find((c) => c.id === this._activeCharacterId) ?? null
  }

  private _confirmDeleteCharacter(id: string): void {
    const character = this._characters.find((c) => c.id === id)
    if (!character) return
    void confirmDestructive(this, {
      heading: _('Delete character?'),
      body: _('“%s” will be removed from the project. This cannot be undone.').replace('%s', character.name),
    }).then((confirmed) => {
      if (confirmed) this._onDeleteCharacterRequested?.(id)
    })
  }
}

GObject.type_ensure(CastView.$gtype)
