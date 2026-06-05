import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { CharacterAnimation, CharacterDefinition } from '@pixelrpg/engine'
import {
  AddAnimationDialog,
  AnimationList,
  CastInspector,
  CharacterPreview,
  type EditorMode,
  type GdkSpriteSetResource,
  type ModeRail,
  SignalScope,
} from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import Template from './cast-view.blp'

// Force registration of all referenced cast widgets up-front so the
// `$PixelRpgModeRail` / `$PixelRpgCharacterPreview` / … references in
// `cast-view.blp` resolve at template-parse time.
GObject.type_ensure(CharacterPreview.$gtype)
GObject.type_ensure(AnimationList.$gtype)
GObject.type_ensure(CastInspector.$gtype)

export namespace CastView {
  export type ConstructorProps = Partial<Adw.Bin.ConstructorProps>
  export interface SignalProps {
    'mode-changed': [string]
    'character-changed': []
  }
}

/**
 * Project-level Cast (heroes + NPCs) view. Composes:
 *
 * - `ModeRail` (left navigation; this view's `mode-changed` signal
 *   forwards to the application window to switch between World / Cast
 *   / Tiles / Audio / Data)
 * - Character gallery (`Adw.PreferencesGroup` of action rows)
 * - `CharacterPreview` (animated, direction-pad-switchable)
 * - `AnimationList` (list of the selected character's animations)
 * - `CastInspector` (right pane — name, isPlayer, speed, anim duration)
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
  declare _gallery_group: Adw.PreferencesGroup

  private _projectName = ''
  // Sidebar visibility starts CLOSED — the actual value is overwritten
  // by `ApplicationWindow._shareSidebarState`'s SYNC_CREATE bind on
  // window construction. Keeping the default `false` here means the
  // very first frame (before the bind fires) doesn't briefly show an
  // open sidebar against the user's saved-closed state.
  private _showLibrary = false
  private _showInspector = false
  private _libraryCollapsed = false
  private _inspectorCollapsed = false

  private _characters: CharacterDefinition[] = []
  private _activeCharacterId: string | null = null
  private _activeAnimationId: string | null = null
  private _spriteSet: GdkSpriteSetResource | null = null
  private _galleryRowsById = new Map<string, Adw.ActionRow>()
  private signals = new SignalScope()

  private _onRenameRequested: ((charId: string, name: string) => void) | null = null
  private _onSetPlayerRequested: ((charId: string, isPlayer: boolean) => void) | null = null
  private _onSetSpeedRequested: ((charId: string, tilesPerSec: number) => void) | null = null
  private _onSetDurationRequested: ((charId: string, animId: string, durationMs: number) => void) | null = null
  private _onAddAnimationRequested: ((charId: string, animation: CharacterAnimation) => void) | null = null
  private _onEditAnimationRequested:
    | ((charId: string, originalId: string, animation: CharacterAnimation) => void)
    | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'CastView',
        Template,
        InternalChildren: ['mode_rail', 'inspector', 'preview', 'anim_list', 'gallery_group'],
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
    dialog.setContext(character, this._spriteSet)
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
    dialog.setContext(character, this._spriteSet, existing)
    dialog.connect(
      'animation-edited',
      (_d: AddAnimationDialog, originalId: string, animation: CharacterAnimation) => {
        this._onEditAnimationRequested?.(character.id, originalId, animation)
      },
    )
    dialog.present(this)
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
  }): void {
    this._onRenameRequested = callbacks.rename
    this._onSetPlayerRequested = callbacks.setPlayer
    this._onSetSpeedRequested = callbacks.setSpeed
    this._onSetDurationRequested = callbacks.setDuration
    this._onAddAnimationRequested = callbacks.addAnimation
    this._onEditAnimationRequested = callbacks.editAnimation
  }

  /**
   * Refresh from project data. Called by the host on every cast
   * mutation + on initial project load.
   */
  setCharacters(characters: CharacterDefinition[], spriteSet: GdkSpriteSetResource | null): void {
    this._characters = characters
    this._spriteSet = spriteSet
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

  private _rebuildGallery(): void {
    for (const row of this._galleryRowsById.values()) {
      this._gallery_group.remove(row)
    }
    this._galleryRowsById.clear()

    for (const character of this._characters) {
      const row = new Adw.ActionRow({
        title: character.name,
        subtitle: character.kind === 'hero' ? _('Hero') : _('NPC'),
        activatable: true,
      })
      if (character.isPlayer) {
        const label = new Gtk.Label({ label: _('Player') })
        label.add_css_class('caption')
        label.add_css_class('accent')
        row.add_suffix(label)
      }
      row.connect('activated', () => {
        this._activeCharacterId = character.id
        this._activeAnimationId = null
        this._refreshActive()
        this._refreshHighlight()
        // Auto-open the right inspector when the user picks a
        // character — see [right-inspector auto-open policy] in
        // `docs/concepts/responsive-chrome.md`. The inspector now
        // has content to show (name + isPlayer + speed + active-
        // animation duration); leaving it closed hides the only
        // configuration surface the click produced.
        this.showInspector = true
      })
      this._gallery_group.add(row)
      this._galleryRowsById.set(character.id, row)
    }
    this._refreshHighlight()
  }

  private _refreshHighlight(): void {
    for (const [id, row] of this._galleryRowsById) {
      if (id === this._activeCharacterId) row.add_css_class('accent')
      else row.remove_css_class('accent')
    }
  }

  private _refreshActive(): void {
    const character = this._currentCharacter()
    this._preview.setCharacter(character, this._spriteSet)
    this._anim_list.setCharacter(character, this._spriteSet)
    this._inspector.setCharacter(character)
    // Pick up whatever the preview defaulted to (`walk-down` on a
    // fresh character) so the list highlight + inspector duration
    // line up with what's playing — without this the first row
    // would never be marked accent until the user clicked
    // something.
    this._setActiveAnimation(this._preview.activeAnimationId)
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

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }
}

GObject.type_ensure(CastView.$gtype)
