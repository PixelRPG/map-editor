import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterDefinition, EntityDefinition } from '@pixelrpg/engine'
import {
  AddAnimationDialog,
  AnimationList,
  CardGallery,
  CastInspector,
  CharacterPreview,
  type ComponentRefOptions,
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
GObject.type_ensure(AnimationList.$gtype)
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
 * Project-level Cast view. Two sections, switched by the header
 * `Adw.ViewSwitcher`, each a master-detail drill-down inside the shared
 * `Adw.NavigationView`:
 *
 * - **Characters** — every hero / NPC as a `CardGallery` card. A
 *   character just *picks* an appearance (its look + animations); the
 *   detail page is identity-only: an animated `CharacterPreview` + the
 *   `CastInspector` in `character` mode (name, appearance picker, player
 *   flag, speed, "Edit appearance" deep-link).
 * - **Appearances** (user-facing term; internally still sprite sheets /
 *   `SpriteSetData{kind:'character'}`) — every character-kind sheet as a
 *   card. An appearance OWNS its animations (shared by every character
 *   wearing it), so the animation editor lives here: the sheet detail has
 *   a `CharacterPreview` + the `AnimationList` + the `CastInspector` in
 *   `sheet` mode (selected-animation duration), all keyed by `_activeSheetId`.
 *
 * The `ModeRail` (left navigation) is always present; this view's
 * `mode-changed` signal forwards to the application window to switch
 * between World / Cast / Tiles / Audio / Data.
 *
 * Mutations land via host-supplied callbacks (set via `bindCallbacks`)
 * so the application window remains the single owner of project data +
 * the persistence path. The cast view is intentionally presentational;
 * it diffs against `setCharacters` / `setSheets` and emits
 * `character-changed` once the host has applied the mutation.
 */
export class CastView extends ResponsiveEditorView {
  // ── Characters section / detail ─────────────────────────────────
  declare _characters_gallery: CardGallery
  declare _detail_page: Adw.NavigationPage
  declare _preview: CharacterPreview
  declare _inspector: CastInspector
  declare _advanced_slot: Gtk.Box
  // ── Sprite-sheets section / detail ──────────────────────────────
  declare _sheets_gallery: CardGallery
  declare _sheet_detail_page: Adw.NavigationPage
  declare _sheet_preview: CharacterPreview
  declare _sheet_inspector: CastInspector
  declare _anim_list: AnimationList
  // ── Shared chrome ───────────────────────────────────────────────
  declare _section_stack: Adw.ViewStack
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
  // flips it off when the responsive breakpoint collapses (phone) or when
  // the active section isn't Characters (the quick-view is character-only).
  private _showQuickview = true

  private _characters: CharacterDefinition[] = []
  private _sheets: SpriteSetChoice[] = []
  private _activeCharacterId: string | null = null
  private _activeSheetId: string | null = null
  /** Active animation in the SHEET detail (preview ↔ list ↔ duration). */
  private _activeAnimationId: string | null = null
  /**
   * Resolved GTK preview resource per sprite-set id. Keyed by
   * `spriteSetId` so several characters sharing a set reuse the one
   * resource, and so a sheet card / sheet detail can resolve the same
   * resource by sheet id. Filled by the controller's `refresh`; a
   * missing/failed set maps to `null` (the card falls back to an icon
   * and the preview blanks).
   */
  private _spriteSetsById = new Map<string, GdkSpriteSetResource | null>()
  private signals = new SignalScope()

  private _onRenameRequested: ((charId: string, name: string) => void) | null = null
  private _onSetPlayerRequested: ((charId: string, isPlayer: boolean) => void) | null = null
  private _onGetCharacterEntity: ((charId: string) => EntityDefinition | null) | null = null
  private _onGetRefOptions: (() => ComponentRefOptions) | null = null
  private _onSetSpeedRequested: ((charId: string, tilesPerSec: number) => void) | null = null
  private _onChangeSheetRequested: ((charId: string, sheetId: string) => void) | null = null
  // Animation edits target the SHEET (keyed by spriteSetId), not the character.
  private _onSetDurationRequested: ((sheetId: string, animId: string, durationMs: number) => void) | null = null
  private _onAddAnimationRequested: ((sheetId: string, animation: CharacterAnimation) => void) | null = null
  private _onEditAnimationRequested:
    | ((sheetId: string, originalId: string, animation: CharacterAnimation) => void)
    | null = null
  private _onDeleteAnimationRequested: ((sheetId: string, animId: string) => void) | null = null
  private _onRenameSheetRequested: ((sheetId: string, name: string) => void) | null = null
  private _onDeleteCharacterRequested: ((charId: string) => void) | null = null
  private _onDeleteSheetRequested: ((sheetId: string) => void) | null = null
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
          'sheets_gallery',
          'sheet_detail_page',
          'sheet_preview',
          'sheet_inspector',
          'anim_list',
          'section_stack',
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
    // The two inspectors serve fixed roles — set their modes once.
    this._inspector.setMode('character')
    this._sheet_inspector.setMode('sheet')

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
    // Deep-link from the character detail into its appearance's editor —
    // animations live on the shared appearance asset, not the character.
    this.signals.connect(this._inspector, 'edit-appearance-requested', () => {
      const character = this._currentCharacter()
      if (character) this.focusSheet(character.spriteSetId)
    })

    // ── Sheet detail: bidirectional active-animation sync ──────────
    // Three surfaces stay in lock-step — the sheet preview's direction/
    // pause buttons, the animation-list row highlight, and the sheet
    // inspector's duration field. Both user inputs (list activate,
    // preview button click) funnel into `_setActiveAnimation` which is
    // idempotent on no-change, so the resulting
    // `preview-notify → setActive → list-highlight` round trip
    // terminates after one pass.
    this.signals.connect(this._anim_list, 'animation-selected', (_v: AnimationList, animId: string) => {
      this._setActiveAnimation(animId)
    })
    this.signals.connect(this._sheet_preview, 'notify::active-animation-id', () => {
      this._setActiveAnimation(this._sheet_preview.activeAnimationId)
    })
    this.signals.connect(this._sheet_inspector, 'duration-changed', (_v: CastInspector, ms: number) => {
      if (this._activeSheetId && this._activeAnimationId) {
        this._onSetDurationRequested?.(this._activeSheetId, this._activeAnimationId, ms)
      }
    })
    this.signals.connect(this._sheet_inspector, 'sheet-renamed', (_v: CastInspector, name: string) => {
      if (this._activeSheetId) this._onRenameSheetRequested?.(this._activeSheetId, name)
    })
    this.signals.connect(this._anim_list, 'add-animation-requested', () => {
      this._presentAddAnimationDialog()
    })
    this.signals.connect(this._anim_list, 'edit-animation-requested', (_v: AnimationList, animId: string) => {
      this._presentEditAnimationDialog(animId)
    })
    this.signals.connect(this._anim_list, 'delete-animation-requested', (_v: AnimationList, animId: string) => {
      this._confirmDeleteAnimation(animId)
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

    // ── Sprite-sheets gallery ──────────────────────────────────────
    // No quick-view for sheets — a tap (single or double) drills straight
    // into the sheet's animation editor. The three-dots delete confirms.
    this.signals.connect(this._sheets_gallery, 'item-activated', (_v: CardGallery, id: string) => {
      this._openSheetDetail(id)
    })
    this.signals.connect(this._sheets_gallery, 'item-opened', (_v: CardGallery, id: string) => {
      this._openSheetDetail(id)
    })
    this.signals.connect(this._sheets_gallery, 'delete-requested', (_v: CardGallery, id: string) => {
      this._confirmDeleteSheet(id)
    })

    // The quick-view is character-only — hide it (and disable its toggle)
    // while the Sprite-sheets section is showing.
    this.signals.connect(this._section_stack, 'notify::visible-child-name', () => this._syncQuickviewVisibility())
    this._syncQuickviewVisibility()
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
   * the `character`-mode inspector). Animations live on the sheet now, so
   * there's no animation list here. No-op if already on the page.
   */
  private _openDetail(): void {
    if (!this._activeCharacterId) return
    if (this._nav.get_visible_page()?.tag !== 'detail') this._nav.push_by_tag('detail')
  }

  /**
   * Drill into the Sprite-sheet detail sub-page for `id` — the sheet's
   * animation editor (preview + animation list + selected-animation
   * duration), shared by every character using the sheet. Switches the
   * underlying gallery section to Sprite-sheets so the back button lands
   * there.
   */
  private _openSheetDetail(id: string): void {
    const sheet = this._sheets.find((s) => s.id === id)
    if (!sheet) return
    this._activeSheetId = id
    this._sheets_gallery.setActiveId(id)
    this._refreshActiveSheet()
    this._sheet_detail_page.title = sheet.name
    if (this._section_stack.get_visible_child_name() !== 'sheets') {
      this._section_stack.set_visible_child_name('sheets')
    }
    if (this._nav.get_visible_page()?.tag !== 'sheet-detail') this._nav.push_by_tag('sheet-detail')
  }

  /**
   * Construct a fresh `AddAnimationDialog` against the ACTIVE SHEET, seed
   * it with a synthetic character bound to the sheet (so its picker +
   * preview render and name-uniqueness validates against the sheet's
   * animations), and present it. Save fires `animation-created`; we
   * forward it to the host's `addAnimation` callback keyed by the sheet
   * id (controller writes the new entry into the sheet's
   * `characterAnimations` + persists the sheet JSON).
   */
  private _presentAddAnimationDialog(): void {
    const sheetId = this._activeSheetId
    const synthetic = this._sheetAsCharacter(sheetId)
    if (!sheetId || !synthetic) return
    const dialog = new AddAnimationDialog()
    dialog.setContext(synthetic, this._spriteSetsById.get(sheetId) ?? null)
    dialog.connect('animation-created', (_d: AddAnimationDialog, animation: CharacterAnimation) => {
      this._onAddAnimationRequested?.(sheetId, animation)
    })
    dialog.present(this)
  }

  /**
   * Same dialog as {@link _presentAddAnimationDialog} but seeded with the
   * sheet's existing animation so the user edits in place — the dialog's
   * third `setContext` argument flips it to edit mode (title swap, name
   * locked for required roles, save fires `animation-edited`).
   */
  private _presentEditAnimationDialog(animId: string): void {
    const sheetId = this._activeSheetId
    const synthetic = this._sheetAsCharacter(sheetId)
    if (!sheetId || !synthetic) return
    const existing = this._sheetAnimations(sheetId).find((a) => a.id === animId)
    if (!existing) return
    const dialog = new AddAnimationDialog()
    dialog.setContext(synthetic, this._spriteSetsById.get(sheetId) ?? null, existing)
    dialog.connect('animation-edited', (_d: AddAnimationDialog, originalId: string, animation: CharacterAnimation) => {
      this._onEditAnimationRequested?.(sheetId, originalId, animation)
    })
    dialog.present(this)
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
   * Present the sprite-set import dialog standalone (wired to
   * `win.new-spriteset`). The imported set is copied into the project
   * and registered; it's then available to any character. Reuses the
   * same flow the character dialog's "+" button drives.
   */
  presentSpriteSetImportDialog(): void {
    this._presentSpriteSetImportDialog()
  }

  /**
   * Present the "New animation" dialog for a sprite sheet (wired to
   * `win.new-animation`, mainly for tooling / MCP). When `sheetId` is
   * given it drills into that sheet's detail first so the dialog has a
   * context in one call; otherwise it targets the currently-active sheet
   * ({@link _presentAddAnimationDialog} no-ops if there is none).
   */
  presentNewAnimationDialog(sheetId?: string): void {
    if (sheetId) this.focusSheet(sheetId)
    this._presentAddAnimationDialog()
  }

  /**
   * Open the sprite-set import dialog. On import the host copies the
   * image + registers the set; `onImported` (when given) receives the
   * resulting choice — the character dialog uses it to append + select
   * the new set without leaving its flow.
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
    if (this._section_stack.get_visible_child_name() !== 'characters') {
      this._section_stack.set_visible_child_name('characters')
    }
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

  /**
   * Drill into a sprite sheet's detail page by id. Used by the
   * `win.open-sheet` action (tooling drill-in) — the master-detail
   * equivalent of {@link focusCharacter} for the Sprite-sheets section.
   */
  focusSheet(id: string): void {
    this._openSheetDetail(id)
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
  // show it (only on the Characters section). The user can still toggle
  // it via the header button.
  protected override _onInspectorCollapsedChanged(_collapsed: boolean): void {
    this._syncQuickviewVisibility()
  }

  /**
   * The quick-view is character-only and desktop-only: show it when the
   * Characters section is active AND the layout isn't collapsed, and
   * disable its toggle button otherwise so it can't resurface a stale
   * character glance over the sheet cards.
   */
  private _syncQuickviewVisibility(): void {
    const onCharacters = (this._section_stack?.get_visible_child_name() ?? 'characters') === 'characters'
    this._quickview_toggle?.set_sensitive(onCharacters)
    this.showQuickview = onCharacters && !this.inspectorCollapsed
  }

  /**
   * Set the host callbacks. Called once by `CastController` after
   * construction. Decouples the view from the project mutation /
   * persistence layer.
   *
   * Animation callbacks key by SHEET id (animations are sheet-owned now,
   * shared by every character using the sheet).
   */
  bindCallbacks(callbacks: {
    rename: (charId: string, name: string) => void
    setPlayer: (charId: string, isPlayer: boolean) => void
    getCharacterEntity: (charId: string) => EntityDefinition | null
    getRefOptions: () => ComponentRefOptions
    setSpeed: (charId: string, tilesPerSec: number) => void
    changeSheet: (charId: string, sheetId: string) => void
    setDuration: (sheetId: string, animId: string, durationMs: number) => void
    addAnimation: (sheetId: string, animation: CharacterAnimation) => void
    editAnimation: (sheetId: string, originalId: string, animation: CharacterAnimation) => void
    deleteAnimation: (sheetId: string, animId: string) => void
    renameSheet: (sheetId: string, name: string) => void
    deleteCharacter: (charId: string) => void
    deleteSheet: (sheetId: string) => void
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
    this._onSetDurationRequested = callbacks.setDuration
    this._onAddAnimationRequested = callbacks.addAnimation
    this._onEditAnimationRequested = callbacks.editAnimation
    this._onDeleteAnimationRequested = callbacks.deleteAnimation
    this._onRenameSheetRequested = callbacks.renameSheet
    this._onDeleteCharacterRequested = callbacks.deleteCharacter
    this._onDeleteSheetRequested = callbacks.deleteSheet
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
   * character rather than always the player's set. The same map covers
   * the sheets section (see {@link setSheets}).
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
   * Push the project's sprite-sheet list into the Cast view. Called by
   * the host alongside {@link setCharacters} (same `spriteSetsById` map).
   * `sheets` are the character-kind sprite sheets — the ones a character
   * can pick + the ones whose animations are editable here.
   */
  setSheets(sheets: SpriteSetChoice[], spriteSetsById: Map<string, GdkSpriteSetResource | null>): void {
    this._sheets = sheets
    this._spriteSetsById = spriteSetsById
    if (this._activeSheetId && !sheets.find((s) => s.id === this._activeSheetId)) {
      this._activeSheetId = null
    }
    if (!this._activeSheetId && sheets.length > 0) {
      this._activeSheetId = sheets[0].id
    }
    this._rebuildSheetsGallery()
    // The character detail's sheet picker reflects the latest list.
    this._inspector.setSheets(this._sheets, this._currentCharacter()?.spriteSetId ?? null)
    this._refreshActiveSheet()
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
   * Rebuild the sprite-sheet cards. Each previews the sheet's animations
   * via a showcase {@link CharacterPreview} (bound to a synthetic
   * character — see {@link _sheetAsCharacter}).
   */
  private _rebuildSheetsGallery(): void {
    this._sheets_gallery.setItems(
      this._sheets.map((s) => this._buildSheetCardItem(s)),
      (item) => this._buildSheetCardPreview(item.id),
    )
    this._sheets_gallery.setActiveId(this._activeSheetId)
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

  /** Build the card model for one sprite sheet: animation count as subtitle. */
  private _buildSheetCardItem(sheet: SpriteSetChoice): GalleryCardItem {
    const count = this._spriteSetsById.get(sheet.id)?.data?.characterAnimations?.length ?? 0
    return {
      id: sheet.id,
      title: sheet.name,
      subtitle: count === 1 ? _('1 animation') : _(`${count} animations`),
      fallbackIcon: 'image-x-generic-symbolic',
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

  /** Showcase preview for a sprite-sheet card (synthetic character bound to the sheet). */
  private _buildSheetCardPreview(id: string): CharacterPreview | null {
    const synthetic = this._sheetAsCharacter(id)
    if (!synthetic) return null
    return this._buildShowcasePreview(synthetic, this._spriteSetsById.get(id) ?? null)
  }

  /** Shared showcase-preview factory used by both galleries. */
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
   * Refresh the Sprite-sheet detail surfaces (preview + animation list +
   * duration inspector), all bound to the active sheet via a synthetic
   * character. Re-derives the active animation from the preview's default
   * so the list highlight + duration line up immediately.
   */
  private _refreshActiveSheet(): void {
    const synthetic = this._sheetAsCharacter(this._activeSheetId)
    const sheet = this._activeSheetId ? (this._spriteSetsById.get(this._activeSheetId) ?? null) : null
    this._sheet_preview.setCharacter(synthetic, sheet)
    this._anim_list.setCharacter(synthetic, sheet)
    this._sheet_inspector.setSheetName(synthetic?.name ?? '')
    this._activeAnimationId = null
    this._setActiveAnimation(this._sheet_preview.activeAnimationId)
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

  /**
   * Single-entry helper that keeps the three active-animation surfaces
   * (sheet detail) in lock-step: the `_activeAnimationId` field, the
   * `AnimationList` row highlight, the `CharacterPreview` direction +
   * paused, and the `CastInspector` duration row.
   *
   * Idempotent on `id === current` to break the round-trip
   * `preview-notify → cast-view → preview-setActive` chain after one pass.
   */
  private _setActiveAnimation(animId: string | null): void {
    if (this._activeAnimationId === animId) return
    this._activeAnimationId = animId
    this._anim_list.setActiveAnimation(animId)
    if (animId) this._sheet_preview.setActiveAnimation(animId)
    this._sheet_inspector.setAnimation(this._currentSheetAnimation())
  }

  private _currentCharacter(): CharacterDefinition | null {
    if (!this._activeCharacterId) return null
    return this._characters.find((c) => c.id === this._activeCharacterId) ?? null
  }

  /** The animations owned by the sheet with `spriteSetId`. */
  private _sheetAnimations(spriteSetId: string): CharacterAnimation[] {
    return this._spriteSetsById.get(spriteSetId)?.data?.characterAnimations ?? []
  }

  /** The currently-selected animation in the SHEET detail. */
  private _currentSheetAnimation(): CharacterAnimation | null {
    if (!this._activeSheetId || !this._activeAnimationId) return null
    return this._sheetAnimations(this._activeSheetId).find((a) => a.id === this._activeAnimationId) ?? null
  }

  /**
   * A throwaway {@link CharacterDefinition} bound to a sprite sheet, so
   * the character-keyed widgets ({@link CharacterPreview},
   * {@link AnimationList}, {@link AddAnimationDialog}) can render a SHEET
   * directly. The sheet owns the animations (read via
   * `spriteSet.data.characterAnimations`); the synthetic character just
   * carries the same list as its (deprecated) `animations` so the
   * dialog's name-uniqueness check sees the existing ids. Never
   * persisted.
   */
  private _sheetAsCharacter(sheetId: string | null): CharacterDefinition | null {
    if (!sheetId) return null
    const name = this._sheets.find((s) => s.id === sheetId)?.name ?? sheetId
    return {
      id: sheetId,
      name,
      kind: 'hero',
      spriteSetId: sheetId,
      defaultAnimation: 'idle-down',
      animations: this._sheetAnimations(sheetId),
    }
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
    const dialog = new Adw.AlertDialog({
      heading: _('Delete character?'),
      body: _(`“${character.name}” will be removed from the project. This cannot be undone.`),
    })
    dialog.add_response('cancel', _('Cancel'))
    dialog.add_response('delete', _('Delete'))
    dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE)
    dialog.set_default_response('cancel')
    dialog.set_close_response('cancel')
    dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
      if (response === 'delete') this._onDeleteCharacterRequested?.(id)
    })
    dialog.present(this)
  }

  /**
   * Confirm + delete a sprite sheet. Destructive — drops the sheet (and
   * its animations) from the project; any character still referencing it
   * falls back to a blank preview until reassigned. Confirms before the
   * host callback fires.
   */
  private _confirmDeleteSheet(id: string): void {
    const sheet = this._sheets.find((s) => s.id === id)
    if (!sheet) return
    const dialog = new Adw.AlertDialog({
      heading: _('Delete appearance?'),
      body: _(
        `“${sheet.name}” will be removed from the project. Characters using it lose their look until reassigned. This cannot be undone.`,
      ),
    })
    dialog.add_response('cancel', _('Cancel'))
    dialog.add_response('delete', _('Delete'))
    dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE)
    dialog.set_default_response('cancel')
    dialog.set_close_response('cancel')
    dialog.connect('response', (_d: Adw.AlertDialog, response: string) => {
      if (response === 'delete') this._onDeleteSheetRequested?.(id)
    })
    dialog.present(this)
  }

  /**
   * Delete a custom animation from the active sheet. Lower-stakes than a
   * character delete (a custom animation is trivially re-created) so it
   * skips the confirm dialog — the trash affordance only appears on
   * custom rows, never the required roles. The host removes it from the
   * sheet + re-persists.
   */
  private _confirmDeleteAnimation(animId: string): void {
    if (this._activeSheetId) this._onDeleteAnimationRequested?.(this._activeSheetId, animId)
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(CastView.$gtype)
