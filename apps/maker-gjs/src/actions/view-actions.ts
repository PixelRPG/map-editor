import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import { DEFAULT_LIBRARY_CHIP, isLibraryChip, type LibraryChip } from '../services/library-chip.ts'
import { resolveModeNavigation, type ViewName } from '../services/view-mode-map.ts'
import { addAction } from './action-registry.ts'

/** What the navigation actions need from the window. */
export interface ViewActionsContext {
  hasProject(): boolean
  setView(view: ViewName): void
  /** Re-hydrate the lenses behind `view` before showing it (the Library's). */
  prepareView(view: ViewName): void
  /** Show `chip` in the Library. Does not navigate: pair it with `win.mode('library')`. */
  setLibraryChip(chip: LibraryChip): void
  /** The atlas card the user last selected — what `win.open-scene` opens. */
  selectedSceneId(): string | null
  openScene(sceneId: string): void
  /** Select one atlas card and centre on it, as a click would. */
  selectScene(sceneId: string): void
  /** Close every toast on screen (screenshots, scripted drivers). */
  dismissToasts(): void
  /**
   * Leave the map editor for World, with the atlas on the map just left
   * (§ 3.4 step 5). Not plain `setView('world')`: the atlas has to move,
   * and `win.back` must land in the same place as this button.
   */
  leaveMap(): void
  /**
   * Open `mapId` (if it is not already open), then select `placementId`
   * and move the camera onto it — `win.focus-placement`.
   */
  focusPlacement(mapId: string, placementId: string): void
  /**
   * Switch to Full view from where a wall was hit (the "Show N more
   * settings" row, the Library banner) and offer the way back in a toast.
   */
  showFullView(): void
  /** Present the keyboard-shortcut reference (`Adw.ShortcutsDialog`). */
  showShortcuts(): void
}

/**
 * `win.mode`, `win.library-chip` and the scene-navigation actions.
 *
 * `win.mode` stays the one navigation entry point even though the shell's
 * view switchers drive the `Adw.ViewStack` directly: the window mirrors
 * the stack's `notify::visible-child-name` back into this action, so deep
 * links (the MCP bridge's `set_view`, the smoke driver) and switcher
 * clicks end up in the same state.
 */
export function installViewActions(
  group: Gio.SimpleActionGroup,
  ctx: ViewActionsContext,
): { mode: Gio.SimpleAction; libraryChip: Gio.SimpleAction } {
  const mode = Gio.SimpleAction.new_stateful('mode', GLib.VariantType.new('s'), GLib.Variant.new_string('world'))
  mode.connect('change-state', (action, value) => {
    action.set_state(value!)
    const nav = resolveModeNavigation(value!.get_string()[0], ctx.hasProject())
    if (nav.kind === 'navigate') {
      ctx.prepareView(nav.view)
      ctx.setView(nav.view)
    }
  })
  addAction(group, mode)

  // Which of the Library's chip pages is showing. Stateful like `win.mode`
  // so the view's own chip clicks push their state back in (the window
  // mirrors `notify::chip`) and a driver reads it from ListActions. A
  // deep link is `win.mode('library')` followed by this; Cast / Objects /
  // Sheets used to be three `win.mode` targets, and the MCP bridge's
  // `set_view` drives the pair.
  const libraryChip = Gio.SimpleAction.new_stateful(
    'library-chip',
    GLib.VariantType.new('s'),
    GLib.Variant.new_string(DEFAULT_LIBRARY_CHIP),
  )
  libraryChip.connect('change-state', (action, value) => {
    const chip = value!.get_string()[0]
    if (!isLibraryChip(chip)) return
    action.set_state(value!)
    ctx.setLibraryChip(chip)
  })
  addAction(group, libraryChip)

  // Name kept: the scene editor's back buttons, the MCP bridge's
  // `back_to_atlas` tool and `scripts/smoke/drive.py` all bind it. The
  // destination is the shell's World page (REDESIGN.md § 3.4) — this is
  // the UNCONDITIONAL leave, where `win.back` is the conditional one
  // that may collapse a sheet or clear a selection first. Both end up in
  // the same `leaveMap`.
  const backToAtlas = new Gio.SimpleAction({ name: 'back-to-atlas' })
  backToAtlas.connect('activate', () => ctx.leaveMap())
  addAction(group, backToAtlas)

  const openScene = new Gio.SimpleAction({ name: 'open-scene' })
  openScene.connect('activate', () => {
    const id = ctx.selectedSceneId()
    if (id) ctx.openScene(id)
  })
  addAction(group, openScene)

  // `(mapId, placementId)` — open the map, select that placement and put
  // the camera on it (REDESIGN.md § 3.4). A tuple rather than two
  // actions because the pair is meaningless apart: a placement id is
  // only resolvable inside its own map.
  const focusPlacement = Gio.SimpleAction.new('focus-placement', GLib.VariantType.new('(ss)'))
  focusPlacement.connect('activate', (_a, parameter) => {
    const [mapId, placementId] = (parameter?.deepUnpack() as [string, string] | undefined) ?? []
    if (mapId && placementId) ctx.focusPlacement(mapId, placementId)
  })
  addAction(group, focusPlacement)

  const openSceneById = Gio.SimpleAction.new('open-scene-by-id', GLib.VariantType.new('s'))
  openSceneById.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (id) ctx.openScene(id)
  })
  addAction(group, openSceneById)

  const selectScene = Gio.SimpleAction.new('select-scene', GLib.VariantType.new('s'))
  selectScene.connect('activate', (_a, parameter) => {
    const id = parameter?.get_string()[0]
    if (id) ctx.selectScene(id)
  })
  addAction(group, selectScene)

  const dismissToasts = new Gio.SimpleAction({ name: 'dismiss-toasts' })
  dismissToasts.connect('activate', () => ctx.dismissToasts())
  addAction(group, dismissToasts)

  // Stateless on purpose: the tier itself is `app.full-view`; this is the
  // "reveal" gesture, which is always upward and always toasts.
  const showFullView = new Gio.SimpleAction({ name: 'show-full-view' })
  showFullView.connect('activate', () => ctx.showFullView())
  addAction(group, showFullView)

  // Registered at last: the primary menu bound this name for a long time
  // with nothing behind it, so the item was greyed out in every build
  // ever made — the bug `check-blp-actions.mjs` exists for.
  const showHelpOverlay = new Gio.SimpleAction({ name: 'show-help-overlay' })
  showHelpOverlay.connect('activate', () => ctx.showShortcuts())
  addAction(group, showHelpOverlay)

  return { mode, libraryChip }
}
