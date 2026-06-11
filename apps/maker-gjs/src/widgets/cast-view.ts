import type Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { CharacterDefinition, EntityDefinition } from '@pixelrpg/engine'
import {
  CardGallery,
  CastInspector,
  CharacterPreview,
  type ComponentRefOptions,
  confirmDestructive,
  EntityComponentsEditor,
  type GalleryCardItem,
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

/** Card preview edge length (px) — matches the quick-view sidebar preview. */
const CARD_PREVIEW_SIZE = 160

// Force registration of all referenced cast widgets up-front so the
// `$PixelRpgModeRail` / `$PixelRpgCharacterPreview` / … references in
// `cast-view.blp` resolve at template-parse time.
GObject.type_ensure(CharacterPreview.$gtype)
GObject.type_ensure(CastInspector.$gtype)
GObject.type_ensure(CardGallery.$gtype)

export namespace CastView {
  export type ConstructorProps = Partial<Adw.Bin.ConstructorProps>
  export interface SignalProps {
    'mode-changed': [string]
    'character-changed': []
  }
}

/**
 * Project-level Cast view — a Characters-only lens (the friendly hero /
 * NPC roster). A master-detail drill-down inside the shared
 * `Adw.NavigationView`: every character is a `CardGallery` card; a card
 * drills into an identity-only DETAIL page (an animated
 * `CharacterPreview` + the `CastInspector` in `character` mode = name,
 * appearance picker, player flag, speed, "Edit appearance" deep-link,
 * plus the "all components" disclosure).
 *
 * A character just *picks* an appearance — sprite sheets and their
 * animation editor live in the unified **Sheets** view now. The inspector's
 * "Edit appearance →" deep-link activates `win.open-appearance` to drill
 * straight into that editor.
 *
 * The `ModeRail` (left navigation) is always present; this view's
 * `mode-changed` signal forwards to the application window to switch
 * between World / Cast / Objects / Sheets / Audio / Data.
 *
 * Mutations land via host-supplied callbacks (set via `bindCallbacks`)
 * so the application window remains the single owner of project data +
 * the persistence path. The cast view is intentionally presentational;
 * it diffs against `setCharacters` and emits `character-changed` once the
 * host has applied the mutation.
 */
export class CastView extends ResponsiveEditorView {
  // ── Characters gallery / detail ─────────────────────────────────
  declare _characters_gallery: CardGallery
  declare _detail_page: Adw.NavigationPage
  declare _preview: CharacterPreview
  declare _inspector: CastInspector
  declare _advanced_slot: Gtk.Box
  // ── Shared chrome ───────────────────────────────────────────────
  declare _nav: Adw.NavigationView
  declare _quickview_toggle: Gtk.ToggleButton
  // Desktop gallery quick-view (read-only glance for the selected card).
  declare _quick_stack: Gtk.Stack
  declare _quick_preview: CharacterPreview
  declare _quick_name: Gtk.Label
  declare _quick_kind: Gtk.Label
  declare _quick_player: Gtk.Label
  declare _quick_speed: Gtk.Label
  declare _quick_edit: Gtk.Button

  private _projectName = ''
  // Quick-view sidebar starts shown on desktop; `_onInspectorCollapsedChanged`
  // flips it off when the responsive breakpoint collapses (phone).
  private _showQuickview = true

  private _characters: CharacterDefinition[] = []
  // The project's appearance choices — drives the inspector's appearance
  // picker only (the sheets gallery + animation editor moved to Sheets).
  private _sheets: SpriteSetChoice[] = []
  private _activeCharacterId: string | null = null
  /**
   * Resolved GTK preview resource per sprite-set id. Keyed by
   * `spriteSetId` so several characters sharing a set reuse the one
   * resource. Filled by the controller's `refresh`; a missing/failed set
   * maps to `null` (the card falls back to an icon and the preview blanks).
   */
  private _spriteSetsById = new Map<string, GdkSpriteSetResource | null>()
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

  static {
    GObject.registerClass(
      {
        GTypeName: 'CastView',
        Template,
        InternalChildren: [
          'mode_rail',
          'characters_gallery',
          'detail_page',
          'preview',
          'inspector',
          'advanced_slot',
          'nav',
          'quickview_toggle',
          'quick_stack',
          'quick_preview',
          'quick_name',
          'quick_kind',
          'quick_player',
          'quick_speed',
          'quick_edit',
        ],
        Properties: {
          'project-name': GObject.ParamSpec.string(
            'project-name',
            'Project Name',
            'Display name fed into the ModeRail hero block',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          // show-library/-inspector + *-collapsed are inherited from
          // ResponsiveEditorView; only the gallery quick-view is local.
          'show-quickview': GObject.ParamSpec.boolean(
            'show-quickview',
            'Show Quick-view',
            "Whether the gallery's right quick-view sidebar is shown (desktop)",
            GObject.ParamFlags.READWRITE,
            true,
          ),
        },
        Signals: {
          // mode-changed is inherited from ResponsiveEditorView.
          'character-changed': {},
          // The active character's raw entity was edited through the "all
          // components" disclosure — payload is the EntityDefinition JSON.
          'character-entity-changed': { param_types: [GObject.TYPE_STRING] },
        },
      },
      CastView,
    )
  }

  private _advancedEditor = new EntityComponentsEditor()
  /** Suppresses `character-entity-changed` while populating the editor. */
  private _silentAdvanced = false

  constructor() {
    super()
    // Progressive disclosure: the raw "all components" editor lives in a
    // collapsed expander under the friendly inspector.
    const expander = new Gtk.Expander({ label: _('All components'), marginTop: 8 })
    expander.set_child(this._advancedEditor)
    this._advanced_slot.append(expander)
    this._advancedEditor.connect('entity-changed', (_e: EntityComponentsEditor, json: string) => {
      if (!this._silentAdvanced) this.emit('character-entity-changed', json)
    })
  }

  /**
   * Populate the "all components" disclosure with a character's raw entity
   * definition + the project ref-picker options. Silent — no echo back.
   */
  setCharacterEntity(def: EntityDefinition, refOptions: ComponentRefOptions): void {
    this._silentAdvanced = true
    try {
      this._advancedEditor.setRefOptions(refOptions)
      this._advancedEditor.setEntity(def)
    } finally {
      this._silentAdvanced = false
    }
  }

  /**
   * Signals wire in `vfunc_map` (not the constructor) so they
   * re-connect on every (re)map — `vfunc_unmap` does
   * `SignalScope.disconnectAll`. Constructor-wired signals would
   * only connect ONCE and stay disconnected after the first navigate-
   * away (see tiles-view for the same fix).
   */
  vfunc_map(): void {
    super.vfunc_map()
    // The detail inspector serves one fixed role — character mode.
    this._inspector.setMode('character')

    this.signals.connect(this._mode_rail, 'mode-changed', (_v: ModeRail, mode: string) => {
      this.emit('mode-changed', mode)
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
    // Deep-link from the character detail into its appearance's animation
    // editor — animations live on the shared appearance asset (the Sheets
    // view), not the character. Routes through the window's action group.
    this.signals.connect(this._inspector, 'edit-appearance-requested', () => {
      const character = this._currentCharacter()
      if (character) this.activate_action('win.open-appearance', GLib.Variant.new_string(character.spriteSetId))
    })

    // ── Character gallery ──────────────────────────────────────────
    // Single-click SELECTS (desktop: populates the quick-view sidebar;
    // phone: drills straight to detail). Double-click / the quick-view
    // "Edit" button OPENS the full detail page. The three-dots menu's
    // delete routes through a confirm.
    this.signals.connect(this._characters_gallery, 'item-activated', (_v: CardGallery, id: string) => {
      this._selectCharacter(id)
    })
    this.signals.connect(this._characters_gallery, 'item-opened', (_v: CardGallery, id: string) => {
      this._selectCharacter(id)
      this._openDetail()
    })
    this.signals.connect(this._characters_gallery, 'delete-requested', (_v: CardGallery, id: string) => {
      this._confirmDeleteCharacter(id)
    })
    this.signals.connect(this._quick_edit, 'clicked', () => this._openDetail())
  }

  /**
   * Select a character: make it active, refresh the quick-view + detail
   * surfaces, and highlight the card. On a NARROW layout (no quick-view
   * sidebar) this also drills straight into the detail page; on desktop
   * it just updates the quick-view sidebar (the user opens the detail
   * explicitly via double-click or the "Edit" button).
   */
  private _selectCharacter(id: string): void {
    const character = this._characters.find((c) => c.id === id)
    if (!character) return
    this._activeCharacterId = id
    this._refreshActive()
    this._characters_gallery.setActiveId(id)
    this._detail_page.title = character.name
    if (this.inspectorCollapsed) this._openDetail()
  }

  /**
   * Drill into the Character detail sub-page — identity only (preview +
   * the `character`-mode inspector). Animations live on the appearance
   * sheet now, so there's no animation list here. No-op if already on the
   * page.
   */
  private _openDetail(): void {
    if (!this._activeCharacterId) return
    if (this._nav.get_visible_page()?.tag !== 'detail') this._nav.push_by_tag('detail')
  }

  /**
   * Present the "New character" dialog (wired to `win.new-character`).
   * Seeds it with the project's sprite sets, streams a live preview as
   * the selection changes, and routes the "+" import button through the
   * sprite-set import dialog — the imported set is appended + selected
   * so the user can keep going without leaving the flow. The assembled
   * draft goes to the host's `createCharacter` callback (controller
   * generates the id, persists).
   */
  presentNewCharacterDialog(): void {
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
    // Populate AFTER wiring so the initial `spriteset-activated` (fired
    // by setSpriteSets selecting the first entry) loads its preview.
    dialog.setSpriteSets(this._onListSpriteSets?.() ?? [])
    dialog.present(this)
  }

  /**
   * Open the sprite-set import dialog for the New Character flow. On
   * import the host copies the image + registers the set; `onImported`
   * (when given) receives the resulting choice — the character dialog
   * uses it to append + select the new set without leaving its flow.
   * (Standalone appearance import lives in the Sheets view now.)
   */
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

  /**
   * Reset the navigation to the gallery overview. Called by the host on
   * a project swap so a freshly-opened project starts on the card list
   * rather than a stale detail page. (Deliberately NOT done on every
   * re-map — that fired on window resize / sidebar overlay transitions
   * and yanked the user out of the editor.)
   */
  resetToOverview(): void {
    if (this._nav.get_visible_page()?.tag !== 'gallery') this._nav.replace_with_tags(['gallery'])
  }

  /**
   * Select a character AND open its detail page. Used after creation
   * (land on the new character to edit it) and by the `win.open-character`
   * action (tooling drill-in).
   */
  focusCharacter(id: string): void {
    this._selectCharacter(id)
    this._openDetail()
  }

  get projectName(): string {
    // Defensive `?? ''` — see character-preview.ts roleLabel for why.
    return this._projectName ?? ''
  }

  set projectName(value: string) {
    if (this._projectName === value) return
    this._projectName = value
    this._mode_rail.projectName = value
    this.notify('project-name')
  }

  get showQuickview(): boolean {
    return this._showQuickview ?? true
  }

  set showQuickview(value: boolean) {
    if (this._showQuickview === value) return
    this._showQuickview = value
    this.notify('show-quickview')
  }

  // Collapsed = narrow/phone → hide the gallery quick-view (a card tap
  // drills straight into the detail page there). Expanded = desktop →
  // show it. The user can still toggle it via the header button.
  protected override _onInspectorCollapsedChanged(collapsed: boolean): void {
    this.showQuickview = !collapsed
  }

  /**
   * Set the host callbacks. Called once by `CastController` after
   * construction. Decouples the view from the project mutation /
   * persistence layer.
   */
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
  }

  /**
   * Push the project's character list into the Cast view. Called by the
   * host on every cast mutation + on initial project load.
   *
   * `spriteSetsById` carries a resolved GTK preview resource for every
   * sprite-set id (keyed by `spriteSetId`), so each card previews its
   * OWN character's sheet and the detail preview follows the active
   * character rather than always the player's set.
   */
  setCharacters(characters: CharacterDefinition[], spriteSetsById: Map<string, GdkSpriteSetResource | null>): void {
    this._characters = characters
    this._spriteSetsById = spriteSetsById
    if (this._activeCharacterId && !characters.find((c) => c.id === this._activeCharacterId)) {
      this._activeCharacterId = null
    }
    if (!this._activeCharacterId && characters.length > 0) {
      this._activeCharacterId = characters[0].id
    }
    this._rebuildGallery()
    this._refreshActive()
  }

  /**
   * Push the project's appearance (sprite-sheet) choices into the Cast
   * view. Called by the host alongside {@link setCharacters}. Cast no
   * longer renders a sheets gallery (that's the Sheets view) — these only
   * feed the character detail's appearance PICKER so it can reassign a
   * character to a different sheet.
   */
  setSheets(sheets: SpriteSetChoice[]): void {
    this._sheets = sheets
    this._inspector.setSheets(this._sheets, this._currentCharacter()?.spriteSetId ?? null)
  }

  /**
   * Rebuild the character cards. Each card's preview is a live
   * {@link CharacterPreview} that auto-cycles walking direction while the
   * card is the active or hovered one (static otherwise).
   */
  private _rebuildGallery(): void {
    this._characters_gallery.setItems(
      this._characters.map((c) => this._buildCardItem(c)),
      (item) => this._buildCardPreview(item.id),
    )
    this._characters_gallery.setActiveId(this._activeCharacterId)
  }

  /**
   * Build the card model for one character: kind as subtitle, a `Player`
   * badge for the playable character. The preview comes from
   * {@link _buildCardPreview} (animated), so no static paintable here.
   * Every character is deletable.
   */
  private _buildCardItem(character: CharacterDefinition): GalleryCardItem {
    return {
      id: character.id,
      title: character.name,
      subtitle: character.kind === 'hero' ? _('Hero') : _('NPC'),
      badge: character.isPlayer ? _('Player') : null,
      fallbackIcon: 'person-symbolic',
      deletable: true,
    }
  }

  /**
   * Build the per-card preview — the SAME `CharacterPreview` used in the
   * quick-view, in "showcase" mode (no controls, auto-cycling direction).
   * It starts un-highlighted (static); the gallery highlights the active
   * / hovered card so only that one animates + circles.
   */
  private _buildCardPreview(id: string): CharacterPreview | null {
    const character = this._characters.find((c) => c.id === id)
    if (!character) return null
    return this._buildShowcasePreview(character, this._spriteSetsById.get(character.spriteSetId) ?? null)
  }

  /** Shared showcase-preview factory for the character cards. */
  private _buildShowcasePreview(
    character: CharacterDefinition,
    spriteSet: GdkSpriteSetResource | null,
  ): CharacterPreview {
    const preview = new CharacterPreview()
    preview.showControls = false
    preview.autoCycle = true
    preview.frameSize = CARD_PREVIEW_SIZE
    preview.highlighted = false
    preview.setCharacter(character, spriteSet)
    return preview
  }

  /** The GTK preview resource for the active character's sprite set. */
  private _activeSpriteSet(): GdkSpriteSetResource | null {
    const character = this._currentCharacter()
    if (!character) return null
    return this._spriteSetsById.get(character.spriteSetId) ?? null
  }

  /** Refresh the Character detail surfaces (preview + identity inspector). */
  private _refreshActive(): void {
    const character = this._currentCharacter()
    const spriteSet = this._activeSpriteSet()
    this._preview.setCharacter(character, spriteSet)
    this._inspector.setCharacter(character)
    this._inspector.setSheets(this._sheets, character?.spriteSetId ?? null)
    // Share count for the "Edit appearance" deep-link — an animation edit
    // there affects every character wearing the same appearance.
    const usage = character ? this._characters.filter((c) => c.spriteSetId === character.spriteSetId).length : 0
    this._inspector.setAppearanceUsage(usage)
    // Populate the "all components" disclosure with the active character's
    // raw entity (the advanced surface editing `components[]` directly).
    const entity = character ? (this._onGetCharacterEntity?.(character.id) ?? null) : null
    if (entity) this.setCharacterEntity(entity, this._onGetRefOptions?.() ?? {})
    this._refreshQuickView(character, spriteSet)
  }

  /**
   * Populate the desktop quick-view sidebar (read-only glance) for the
   * active character, or switch it to the empty state when nothing is
   * selected.
   */
  private _refreshQuickView(character: CharacterDefinition | null, spriteSet: GdkSpriteSetResource | null): void {
    if (!character) {
      this._quick_stack.set_visible_child_name('empty')
      this._quick_preview.setCharacter(null, null)
      return
    }
    this._quick_stack.set_visible_child_name('info')
    this._quick_preview.setCharacter(character, spriteSet)
    this._quick_name.set_label(character.name)
    this._quick_kind.set_label(character.kind === 'hero' ? _('Hero') : _('NPC'))
    this._quick_player.set_visible(character.isPlayer === true)
    const speed = character.speedTilesPerSec ?? 4
    this._quick_speed.set_label(_(`${speed} tiles/second`))
  }

  private _currentCharacter(): CharacterDefinition | null {
    if (!this._activeCharacterId) return null
    return this._characters.find((c) => c.id === this._activeCharacterId) ?? null
  }

  /**
   * Confirm + delete a character. Deletion is destructive (it drops the
   * whole {@link CharacterDefinition} and, in collab, broadcasts the
   * removal) so it routes through an `Adw.AlertDialog` with a
   * destructive confirm before the host callback fires.
   */
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

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(CastView.$gtype)
