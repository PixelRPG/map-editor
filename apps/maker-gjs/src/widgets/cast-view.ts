import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterDefinition } from '@pixelrpg/engine'
import {
  AddAnimationDialog,
  AnimationList,
  CardGallery,
  CastInspector,
  CharacterPreview,
  type EditorMode,
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
 * Project-level Cast (heroes + NPCs) view. A master-detail drill-down
 * inside an `Adw.NavigationView`:
 *
 * - `ModeRail` (left navigation, always present; this view's
 *   `mode-changed` signal forwards to the application window to switch
 *   between World / Cast / Tiles / Audio / Data)
 * - GALLERY page — every character as a `CardGallery` card (preview +
 *   name + kind + Player badge + delete). Activating a card drills into:
 * - DETAIL page — `CharacterPreview` (animated, direction-pad), the
 *   `AnimationList`, and the `CastInspector` (name, isPlayer, speed,
 *   anim duration) as a collapsible right pane. A back button returns
 *   to the gallery; the two pages are never shown at once.
 *
 * Mutations land via host-supplied callbacks (set via `bindCallbacks`)
 * so the application window remains the single owner of project data +
 * the persistence path. The cast view is intentionally presentational;
 * it diffs against `setCharacters` and emits `character-changed` once
 * the host has applied the mutation.
 */
export class CastView extends Adw.Bin {
  declare _mode_rail: ModeRail
  declare _inspector: CastInspector
  declare _preview: CharacterPreview
  declare _anim_list: AnimationList
  declare _characters_gallery: CardGallery
  declare _nav: Adw.NavigationView
  declare _detail_page: Adw.NavigationPage
  // Desktop gallery quick-view (read-only glance for the selected card).
  declare _quick_stack: Gtk.Stack
  declare _quick_preview: CharacterPreview
  declare _quick_name: Gtk.Label
  declare _quick_kind: Gtk.Label
  declare _quick_player: Gtk.Label
  declare _quick_speed: Gtk.Label
  declare _quick_edit: Gtk.Button

  private _projectName = ''
  // Sidebar visibility starts CLOSED — the actual value is overwritten
  // by `ApplicationWindow._shareSidebarState`'s SYNC_CREATE bind on
  // window construction. Keeping the default `false` here means the
  // very first frame (before the bind fires) doesn't briefly show an
  // open sidebar against the user's saved-closed state.
  private _showLibrary = false
  private _showInspector = false
  // Quick-view sidebar starts shown on desktop; the `inspectorCollapsed`
  // setter flips it off when the responsive breakpoint collapses (phone).
  private _showQuickview = true
  private _libraryCollapsed = false
  private _inspectorCollapsed = false

  private _characters: CharacterDefinition[] = []
  private _activeCharacterId: string | null = null
  private _activeAnimationId: string | null = null
  /**
   * Resolved GTK preview resource per sprite-set id. Keyed by
   * `spriteSetId` (not character id) so several characters sharing a
   * set reuse the one resource. Filled by the controller's `refresh`;
   * a missing/failed set maps to `null` (the card falls back to an icon
   * and the detail preview blanks).
   */
  private _spriteSetsById = new Map<string, GdkSpriteSetResource | null>()
  private signals = new SignalScope()

  private _onRenameRequested: ((charId: string, name: string) => void) | null = null
  private _onSetPlayerRequested: ((charId: string, isPlayer: boolean) => void) | null = null
  private _onSetSpeedRequested: ((charId: string, tilesPerSec: number) => void) | null = null
  private _onSetDurationRequested: ((charId: string, animId: string, durationMs: number) => void) | null = null
  private _onAddAnimationRequested: ((charId: string, animation: CharacterAnimation) => void) | null = null
  private _onEditAnimationRequested:
    | ((charId: string, originalId: string, animation: CharacterAnimation) => void)
    | null = null
  private _onDeleteAnimationRequested: ((charId: string, animId: string) => void) | null = null
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
          'inspector',
          'preview',
          'anim_list',
          'characters_gallery',
          'nav',
          'detail_page',
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
          'show-quickview': GObject.ParamSpec.boolean(
            'show-quickview',
            'Show Quick-view',
            "Whether the gallery's right quick-view sidebar is shown (desktop)",
            GObject.ParamFlags.READWRITE,
            true,
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
          'character-changed': {},
        },
      },
      CastView,
    )
  }

  constructor() {
    super()
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
    this.signals.connect(this._mode_rail, 'mode-changed', (_v: ModeRail, mode: string) => {
      this.emit('mode-changed', mode)
    })
    // Bidirectional active-animation sync — three surfaces stay in
    // lock-step: the preview's direction/pause buttons, the animation-
    // list row highlight, and the inspector's duration field. Both
    // user inputs (list activate, preview button click) funnel into
    // `_setActiveAnimation` which is idempotent on no-change, so the
    // resulting `preview-notify → setActive → list-highlight` round
    // trip terminates after one pass.
    this.signals.connect(this._anim_list, 'animation-selected', (_v: AnimationList, animId: string) => {
      this._setActiveAnimation(animId)
    })
    this.signals.connect(this._preview, 'notify::active-animation-id', () => {
      this._setActiveAnimation(this._preview.activeAnimationId)
    })
    this.signals.connect(this._inspector, 'name-changed', (_v: CastInspector, name: string) => {
      if (this._activeCharacterId) this._onRenameRequested?.(this._activeCharacterId, name)
    })
    this.signals.connect(this._inspector, 'player-changed', (_v: CastInspector, isPlayer: boolean) => {
      if (this._activeCharacterId) this._onSetPlayerRequested?.(this._activeCharacterId, isPlayer)
    })
    this.signals.connect(this._inspector, 'speed-changed', (_v: CastInspector, tilesPerSec: number) => {
      if (this._activeCharacterId) this._onSetSpeedRequested?.(this._activeCharacterId, tilesPerSec)
    })
    this.signals.connect(this._inspector, 'duration-changed', (_v: CastInspector, ms: number) => {
      if (this._activeCharacterId && this._activeAnimationId) {
        this._onSetDurationRequested?.(this._activeCharacterId, this._activeAnimationId, ms)
      }
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
    // Character gallery. Single-click SELECTS (desktop: populates the
    // quick-view sidebar; phone: drills straight to detail). Double-click
    // / the quick-view "Edit" button OPENS the full detail page. The
    // three-dots menu's delete routes through a confirm.
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
    this._activeAnimationId = null
    this._refreshActive()
    this._characters_gallery.setActiveId(id)
    this._detail_page.title = character.name
    if (this._inspectorCollapsed) this._openDetail()
  }

  /**
   * Drill into the detail sub-page for the active character. The detail
   * page is a single scrolling column (preview + animations + the
   * inlined inspector), responsive via its own breakpoint — no overlay
   * sidebar, so there's just the one NavigationView back button. No-op
   * if already on the detail page.
   */
  private _openDetail(): void {
    if (!this._activeCharacterId) return
    if (this._nav.get_visible_page()?.tag !== 'detail') this._nav.push_by_tag('detail')
  }

  /**
   * Construct a fresh `AddAnimationDialog`, seed it with the
   * currently-selected character + sprite-set, and present it
   * against this view. The dialog manages its own lifecycle —
   * cancel/save both call `close()`, libadwaita destroys the
   * widget on close, so we don't track an instance reference.
   *
   * Save fires `animation-created` with the assembled
   * `CharacterAnimation`; we forward it to the host's
   * `addAnimation` callback (controller writes the new entry into
   * `CharacterDefinition.animations` + persists). The host's
   * follow-up `refresh()` rebuilds the animation list with the new
   * row already present.
   */
  private _presentAddAnimationDialog(): void {
    const character = this._currentCharacter()
    if (!character) return
    const dialog = new AddAnimationDialog()
    dialog.setContext(character, this._activeSpriteSet())
    dialog.connect('animation-created', (_d: AddAnimationDialog, animation: CharacterAnimation) => {
      this._onAddAnimationRequested?.(character.id, animation)
    })
    dialog.present(this)
  }

  /**
   * Same dialog as {@link _presentAddAnimationDialog} but seeded
   * with the existing animation so the user edits in place. The
   * dialog's third `setContext` argument flips it to edit mode
   * (title swap, name locked for required roles, save fires
   * `animation-edited` instead of `animation-created`) — see the
   * dialog's `setContext` doc for the full behaviour.
   */
  private _presentEditAnimationDialog(animId: string): void {
    const character = this._currentCharacter()
    if (!character) return
    const existing = character.animations.find((a) => a.id === animId)
    if (!existing) return
    const dialog = new AddAnimationDialog()
    dialog.setContext(character, this._activeSpriteSet(), existing)
    dialog.connect('animation-edited', (_d: AddAnimationDialog, originalId: string, animation: CharacterAnimation) => {
      this._onEditAnimationRequested?.(character.id, originalId, animation)
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
   * generates the id, seeds animations, persists).
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
   * Open the sprite-set import dialog. On import the host copies the
   * image + registers the set; `onImported` (when given) receives the
   * resulting choice — the character dialog uses it to append + select
   * the new set without leaving its flow.
   */
  private _presentSpriteSetImportDialog(onImported?: (choice: SpriteSetChoice) => void): void {
    const dialog = new SpriteSetImportDialog()
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

  get showQuickview(): boolean {
    return this._showQuickview ?? true
  }

  set showQuickview(value: boolean) {
    if (this._showQuickview === value) return
    this._showQuickview = value
    this.notify('show-quickview')
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
    // Collapsed = narrow/phone → hide the gallery quick-view (a card tap
    // drills straight into the detail page there). Expanded = desktop →
    // show it. The user can still toggle it via the header button.
    this.showQuickview = !value
  }

  /**
   * Set the host callbacks. Called once by `ApplicationWindow` after
   * construction. Decouples the view from the project mutation /
   * persistence layer.
   */
  bindCallbacks(callbacks: {
    rename: (charId: string, name: string) => void
    setPlayer: (charId: string, isPlayer: boolean) => void
    setSpeed: (charId: string, tilesPerSec: number) => void
    setDuration: (charId: string, animId: string, durationMs: number) => void
    addAnimation: (charId: string, animation: CharacterAnimation) => void
    editAnimation: (charId: string, originalId: string, animation: CharacterAnimation) => void
    deleteAnimation: (charId: string, animId: string) => void
    deleteCharacter: (charId: string) => void
    listSpriteSets: () => SpriteSetChoice[]
    createCharacter: (draft: NewCharacterDraft) => void
    importSpriteSet: (result: SpriteSetImportResult) => Promise<SpriteSetChoice | null>
    loadSpriteSetPreview: (id: string) => Promise<GdkSpriteSetResource | null>
  }): void {
    this._onRenameRequested = callbacks.rename
    this._onSetPlayerRequested = callbacks.setPlayer
    this._onSetSpeedRequested = callbacks.setSpeed
    this._onSetDurationRequested = callbacks.setDuration
    this._onAddAnimationRequested = callbacks.addAnimation
    this._onEditAnimationRequested = callbacks.editAnimation
    this._onDeleteAnimationRequested = callbacks.deleteAnimation
    this._onDeleteCharacterRequested = callbacks.deleteCharacter
    this._onListSpriteSets = callbacks.listSpriteSets
    this._onCreateCharacter = callbacks.createCharacter
    this._onImportSpriteSet = callbacks.importSpriteSet
    this._onLoadSpriteSetPreview = callbacks.loadSpriteSetPreview
  }

  /**
   * Refresh from project data. Called by the host on every cast
   * mutation + on initial project load.
   *
   * `spriteSetsById` carries a resolved GTK preview resource for every
   * sprite-set id referenced by the cast (keyed by `spriteSetId`), so
   * each card previews its OWN character's sheet and the detail preview
   * follows the active character rather than always the player's set.
   */
  setCharacters(characters: CharacterDefinition[], spriteSetsById: Map<string, GdkSpriteSetResource | null>): void {
    this._characters = characters
    this._spriteSetsById = spriteSetsById
    if (this._activeCharacterId && !characters.find((c) => c.id === this._activeCharacterId)) {
      this._activeCharacterId = null
      this._activeAnimationId = null
    }
    if (!this._activeCharacterId && characters.length > 0) {
      this._activeCharacterId = characters[0].id
    }
    this._rebuildGallery()
    this._refreshActive()
  }

  /**
   * `win.mode` routes here so the view can keep its ModeRail's
   * `activeMode` in sync with the wider app state.
   */
  syncActiveMode(mode: EditorMode): void {
    this._mode_rail.activeMode = mode
  }

  /**
   * Rebuild the character cards. Each card's preview is a live
   * {@link CharacterCardPreview} — the character walks in its default
   * direction, and hovering reveals direction arrows to spin it.
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
    const preview = new CharacterPreview()
    preview.showControls = false
    preview.autoCycle = true
    preview.frameSize = CARD_PREVIEW_SIZE
    preview.highlighted = false
    preview.setCharacter(character, this._spriteSetsById.get(character.spriteSetId) ?? null)
    return preview
  }

  /** The GTK preview resource for the active character's sprite set. */
  private _activeSpriteSet(): GdkSpriteSetResource | null {
    const character = this._currentCharacter()
    if (!character) return null
    return this._spriteSetsById.get(character.spriteSetId) ?? null
  }

  private _refreshActive(): void {
    const character = this._currentCharacter()
    const spriteSet = this._activeSpriteSet()
    this._preview.setCharacter(character, spriteSet)
    this._anim_list.setCharacter(character, spriteSet)
    this._inspector.setCharacter(character)
    this._refreshQuickView(character, spriteSet)
    // Pick up whatever the preview defaulted to (`walk-down` on a
    // fresh character) so the list highlight + inspector duration
    // line up with what's playing — without this the first row
    // would never be marked accent until the user clicked
    // something.
    this._setActiveAnimation(this._preview.activeAnimationId)
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
   * Single-entry helper that keeps the three active-animation
   * surfaces in lock-step:
   *
   * - `_activeAnimationId` — the field every other lookup
   *   (`_currentAnimation`, the inspector's duration write-back)
   *   reads from.
   * - `AnimationList` row highlight — accent class on the matching
   *   row.
   * - `CharacterPreview` direction + paused — derived from the id
   *   via `setActiveAnimation`.
   * - `CastInspector` duration row — populated from the resolved
   *   animation.
   *
   * Idempotent on `id === current` to break the round-trip
   * `preview-notify → cast-view → preview-setActive` chain after one
   * pass.
   */
  private _setActiveAnimation(animId: string | null): void {
    if (this._activeAnimationId === animId) return
    this._activeAnimationId = animId
    this._anim_list.setActiveAnimation(animId)
    if (animId) this._preview.setActiveAnimation(animId)
    this._inspector.setAnimation(this._currentAnimation())
  }

  private _currentCharacter(): CharacterDefinition | null {
    if (!this._activeCharacterId) return null
    return this._characters.find((c) => c.id === this._activeCharacterId) ?? null
  }

  private _currentAnimation(): CharacterAnimation | null {
    const character = this._currentCharacter()
    if (!character || !this._activeAnimationId) return null
    return character.animations.find((a) => a.id === this._activeAnimationId) ?? null
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
   * Delete a custom animation. Lower-stakes than a character delete (a
   * custom animation is trivially re-created in the editor) so it
   * skips the confirm dialog — the trash affordance only appears on
   * custom rows, never the required roles. The host removes it from the
   * character + re-broadcasts the character.
   */
  private _confirmDeleteAnimation(animId: string): void {
    const character = this._currentCharacter()
    if (!character) return
    this._onDeleteAnimationRequested?.(character.id, animId)
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(CastView.$gtype)
