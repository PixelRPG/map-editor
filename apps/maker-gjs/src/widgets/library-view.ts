import type Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { ProjectMenuButton, RosterChip } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import {
  chipForTier,
  DEFAULT_LIBRARY_CHIP,
  isChipInTier,
  isLibraryChip,
  type LibraryChip,
} from '../services/library-chip.ts'
import { markersIn, type PlaceMarkers } from '../services/peer-places.ts'
import { CastDetailPane } from './cast/cast-detail-pane.ts'
import { CastView } from './cast-view.ts'
import Template from './library-view.blp'
import { ObjectDetailPane } from './objects/object-detail-pane.ts'
import { ObjectsView } from './objects-view.ts'
import { ResponsiveEditorView } from './responsive-editor-view.ts'
import { TilesDetailPane } from './tiles/tiles-detail-pane.ts'
import { TilesView } from './tiles-view.ts'

// Force registration so the `$CastView` / `$ObjectsView` / `$TilesView`
// / the three `$PixelRpg…DetailPane` / `$PixelRpgProjectMenuButton` /
// `$PixelRpgRosterChip` references in the blueprint resolve at parse
// time. The panes are built HERE, in the split's content, so their
// registration belongs here too — the galleries only import their types.
GObject.type_ensure(CastView.$gtype)
GObject.type_ensure(ObjectsView.$gtype)
GObject.type_ensure(TilesView.$gtype)
GObject.type_ensure(CastDetailPane.$gtype)
GObject.type_ensure(ObjectDetailPane.$gtype)
GObject.type_ensure(TilesDetailPane.$gtype)
GObject.type_ensure(ProjectMenuButton.$gtype)
GObject.type_ensure(RosterChip.$gtype)

/** The detail header's title before any selection, per chip. */
const DEFAULT_DETAIL_TITLES: Record<LibraryChip, string> = {
  characters: 'Character',
  things: 'Thing',
  graphics: 'Graphics',
}

/**
 * The Library — one shell destination hosting three chip pages: **Characters**
 * ({@link CastView}), **Things** ({@link ObjectsView}) and **Graphics**
 * ({@link TilesView}). They were three rail rows over the same data (the
 * entity library + the sprite sets); Things already listed the
 * characters with a badge and Graphics sent appearance edits to
 * Characters, so they were one place with three doors.
 *
 * This host owns the ONE navigation as well as the one header: a single
 * `Adw.NavigationSplitView` whose sidebar carries all three galleries
 * and whose content carries all three detail panes, swapped in lockstep
 * by the chip (REDESIGN.md § 4.4). Before this each chip nested its own
 * `Adw.NavigationView` / `Adw.NavigationSplitView`, which stacked a
 * second header bar under the Library's own on phone and let every chip
 * drill down slightly differently.
 *
 * Each chip is therefore TWO widgets — a gallery in the sidebar and a
 * detail pane in the content — joined once at construction via
 * `attachDetail`. They cannot be one widget: a collapsed split unmaps
 * the sidebar while the detail is on screen, so a single `SignalScope`
 * spanning both halves would disconnect the detail's handlers exactly
 * when the phone drilled into it.
 *
 * The `chip` property is the whole navigation model: the
 * `Adw.ViewStack` binds `visible-child-name` to it bidirectionally, the
 * `Adw.InlineViewSwitcher` under the header drives that stack, and the
 * detail stack, the detail header's action slot and the bottom
 * "New …" stack all follow it — so a click, a deep link and the
 * `win.library-chip` action all take the same path.
 *
 * The chips follow the view tier: Graphics exists in Full view only
 * (`FULL_VIEW_ONLY_CHIPS`), so its page is hidden in Simple view — which
 * takes its chip out of the switcher — and the stack falls back to
 * Characters if it was showing. The view never flips the tier itself — a
 * deep link that needs Graphics from Simple view goes through the
 * window, which reveals Full view first (`win.show-full-view`'s toast
 * with its Undo) and lands here after.
 */
export class LibraryView extends ResponsiveEditorView {
  declare _split: Adw.NavigationSplitView
  declare _sidebar_header: Adw.HeaderBar
  declare _detail_header: Adw.HeaderBar
  declare _detail_end: Gtk.Stack
  declare _project_menu: ProjectMenuButton
  declare _detail_page: Adw.NavigationPage
  declare _pages: Adw.ViewStack
  declare _graphics_page: Adw.ViewStackPage
  declare _hidden_banner: Adw.Banner
  declare _cast_view: CastView
  declare _objects_view: ObjectsView
  declare _tiles_view: TilesView
  declare _cast_detail: CastDetailPane
  declare _object_detail: ObjectDetailPane
  declare _tiles_detail: TilesDetailPane

  private _chip: LibraryChip = DEFAULT_LIBRARY_CHIP
  /** Last value `active-item-id` was notified with — see `_notifyActiveItem`. */
  private _announcedItemId = ''
  private _hiddenContent = false
  /**
   * Whether the roster chip + project menu currently sit in the SIDEBAR
   * header. Starts true because that is where the template packs them.
   */
  private _headerEndCollapsed = true
  /**
   * The last title each chip's gallery reported. A chip switch re-applies
   * its own, so the detail header never sits above the previous chip's
   * selection — the three panes share one `Adw.NavigationPage`, and its
   * title is a single string.
   */
  private _titles: Record<LibraryChip, string> = {
    characters: _(DEFAULT_DETAIL_TITLES.characters),
    things: _(DEFAULT_DETAIL_TITLES.things),
    graphics: _(DEFAULT_DETAIL_TITLES.graphics),
  }

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgLibraryView',
        Template,
        InternalChildren: [
          'split',
          'sidebar_header',
          'detail_header',
          'detail_end',
          'detail_page',
          'view_switcher',
          'project_menu',
          'roster_chip',
          'pages',
          'graphics_page',
          'hidden_banner',
          'cast_view',
          'objects_view',
          'tiles_view',
          'cast_detail',
          'object_detail',
          'tiles_detail',
        ],
        Properties: {
          chip: GObject.ParamSpec.string(
            'chip',
            'Chip',
            'The visible chip page: characters, things or graphics',
            GObject.ParamFlags.READWRITE,
            DEFAULT_LIBRARY_CHIP,
          ),
          // The three galleries each track their own selection; this is
          // the one the window broadcasts as our awareness place, so a
          // peer sees "Mia · Library" land on the character she opened.
          'active-item-id': GObject.ParamSpec.string(
            'active-item-id',
            'Active item id',
            'Id of the item open on the visible chip, for presence — empty when none',
            GObject.ParamFlags.READABLE,
            '',
          ),
        },
        // show-inspector / inspector-collapsed / compact / full-view are
        // inherited from ResponsiveEditorView.
      },
      LibraryView,
    )
  }

  constructor() {
    super()
    // Join each gallery to its detail pane, once. NOT in `vfunc_map`:
    // the two halves map and unmap independently once the split is
    // collapsed, so the join has to outlive both.
    this._cast_view.attachDetail(this._cast_detail)
    this._objects_view.attachDetail(this._object_detail)
    this._tiles_view.attachDetail(this._tiles_detail)

    // Six plain `connect`s rather than a loop over the three galleries:
    // `@girs` 5 types `connect` per class through `SignalMethods`, so a
    // union-typed helper has no overload to match. They are never
    // disconnected and need no scope — a host listening to its own
    // template children outlives nothing — and they must NOT sit in
    // `vfunc_map`, because `setCharacters` / `setObjects` / `setProject`
    // can land while the Library is unmapped and those titles would be
    // dropped silently.
    this._cast_view.connect('detail-requested', () => this._showDetail())
    this._cast_view.connect('detail-title', (_v: CastView, title: string) => this._setTitle('characters', title))
    this._objects_view.connect('detail-requested', () => this._showDetail())
    this._objects_view.connect('detail-title', (_v: ObjectsView, title: string) => this._setTitle('things', title))
    this._tiles_view.connect('detail-requested', () => this._showDetail())
    this._tiles_view.connect('detail-title', (_v: TilesView, title: string) => this._setTitle('graphics', title))

    // Presence: any gallery's selection can move the Library's place,
    // even an invisible one — the chip can flip back to it without a
    // further selection, and `_notifyActiveItem` filters the no-ops.
    this._cast_view.connect('notify::active-item-id', () => this._notifyActiveItem())
    this._objects_view.connect('notify::active-item-id', () => this._notifyActiveItem())
    this._tiles_view.connect('notify::active-item-id', () => this._notifyActiveItem())

    // The template builds all three pages; the tier decides which are
    // visible. Runs here because the window's `full-view` binding only
    // NOTIFIES on a change, and Simple view is the default on both
    // sides — without this the Graphics chip would sit in the switcher
    // until the tier flipped twice.
    this._syncChipsToTier()
    // Same reason: `inspector-collapsed` is false on both sides at
    // startup, so the setter never notifies and the pair would stay in
    // the sidebar header until a breakpoint fired once.
    this._rehomeHeaderEnd(this.inspectorCollapsed)
  }

  /**
   * Whether the open project holds content Simple view cannot show; the
   * window pushes it from `ProjectStore.hasSimpleViewHiddenContent()` on
   * every project + library change. The banner shows iff this AND the
   * view is Simple — there is nothing to reveal in Full view.
   */
  setHiddenContent(present: boolean): void {
    this._hiddenContent = present
    this._refreshBanner()
  }

  protected override _onFullViewChanged(): void {
    this._refreshBanner()
    this._syncChipsToTier()
    // The tile shape editor is Full view only (REDESIGN.md § 6.4) — the
    // pane hides its entry point rather than greying it out.
    this._tiles_detail.fullView = this.fullView
  }

  protected override _onInspectorCollapsedChanged(collapsed: boolean): void {
    this._rehomeHeaderEnd(collapsed)
  }

  /**
   * Keep "roster chip · ⋯" against the window controls (REDESIGN.md
   * § 3.3). The Library is the one shell view with TWO header bars, and
   * which of them carries the window controls depends on the split:
   * while both panes show, the right edge of the window is the DETAIL
   * header, so the pair belongs there; once the split collapses the
   * sidebar is a page of its own and gets its own copy of the controls,
   * so the pair moves back to it — the detail is then one back-tap
   * away. Re-homing in code mirrors the map editor, which moves its
   * tile inspector between the sidebar and the bottom sheet.
   *
   * `Gtk.HeaderBar` has no reorder API and packs each `[end]` child
   * inward from the controls, so the per-chip action stack is unpacked
   * and re-packed last to keep the order "actions · roster chip · ⋯".
   */
  private _rehomeHeaderEnd(collapsed: boolean): void {
    const chip = this._roster_chip
    if (!chip || this._headerEndCollapsed === collapsed) return
    const from = this._headerEndCollapsed ? this._sidebar_header : this._detail_header
    const to = collapsed ? this._sidebar_header : this._detail_header
    this._headerEndCollapsed = collapsed
    this._detail_header.remove(this._detail_end)
    from.remove(this._project_menu)
    from.remove(chip)
    to.pack_end(this._project_menu)
    to.pack_end(chip)
    this._detail_header.pack_end(this._detail_end)
  }

  /**
   * Show or hide the Full-view-only Graphics page to match the tier.
   * An invisible `Adw.ViewStackPage` is skipped by the
   * `Adw.InlineViewSwitcher`, so one flag covers both the chip and the
   * page.
   *
   * Order matters on the way down: the stack moves to its fallback chip
   * BEFORE the page is hidden, because hiding the VISIBLE page would
   * leave the stack showing nothing.
   */
  private _syncChipsToTier(): void {
    if (this.fullView === this._graphics_page.get_visible()) return
    if (this.fullView) {
      this._graphics_page.set_visible(true)
      return
    }
    this.chip = chipForTier(this.chip, false)
    this._graphics_page.set_visible(false)
  }

  private _refreshBanner(): void {
    this._hidden_banner.set_revealed(this._hiddenContent && !this.fullView)
  }

  /** The banner's one button: the same reveal gesture as the count row. */
  _onBannerClicked(): void {
    this.activate_action('win.show-full-view', null)
  }

  /**
   * A gallery drilled into its selection. Only a collapsed split has
   * anywhere to go; while both panes show, the detail is already on
   * screen and this is a no-op.
   */
  private _showDetail(): void {
    this._split.set_show_content(true)
  }

  /**
   * A gallery renamed what its detail shows. Recorded per chip and
   * applied only while that chip is visible, so a background refresh
   * cannot retitle the detail the user is looking at.
   */
  private _setTitle(chip: LibraryChip, title: string): void {
    this._titles[chip] = title
    if (this.chip === chip) this._detail_page.set_title(title)
  }

  /**
   * Re-apply the visible chip's own title. Called from the `chip`
   * setter, which runs during template construction too — the early
   * return covers the window between `super()` and the field
   * initialisers.
   */
  private _syncDetailTitle(): void {
    if (!this._detail_page || !this._titles) return
    this._detail_page.set_title(this._titles[this.chip])
  }

  get chip(): LibraryChip {
    return this._chip ?? DEFAULT_LIBRARY_CHIP
  }

  /**
   * Typed as `string` because the stack's `visible-child-name` binding
   * writes through here; anything that is not a chip is ignored rather
   * than shown as an empty stack. A chip outside the current tier is
   * refused loudly: the window reveals Full view before landing on
   * Graphics, so reaching this branch means a caller skipped that step.
   */
  set chip(value: string) {
    if (!isLibraryChip(value) || this._chip === value) return
    if (!isChipInTier(value, this.fullView)) {
      console.warn(`[LibraryView] "${value}" is a Full-view chip; reveal Full view before landing on it`)
      return
    }
    this._chip = value
    this.notify('chip')
    // The place follows the chip as well as the selection: switching to
    // Graphics puts us on whatever graphic is selected there.
    this._notifyActiveItem()
    this._syncDetailTitle()
    // A chip change is gallery-level navigation, so it lands on the
    // gallery — otherwise a collapsed split that is already showing one
    // chip's detail swaps the pane underneath and the phone appears to
    // have skipped the list. A deep link that wants the detail
    // (`win.open-object`) asks for it afterwards, through the gallery.
    // Guarded like `_syncDetailTitle`: the setter also runs while the
    // template is still being built, before the children exist.
    if (this._split) this._split.set_show_content(false)
  }

  /**
   * What the window announces as our awareness place — the item open on
   * the VISIBLE chip, since that is what the user is looking at.
   */
  get activeItemId(): string {
    const byChip: Record<LibraryChip, () => string> = {
      characters: () => this._cast_view.activeItemId,
      things: () => this._objects_view.activeItemId,
      graphics: () => this._tiles_view.activeItemId,
    }
    return byChip[this.chip]()
  }

  /**
   * Hand each gallery the peers standing in the Library, keyed by item
   * id. All three get the same map: the ids are entity and sprite-set
   * ids, which do not collide, so a gallery simply finds none of the
   * other chips' entries.
   */
  override setPeerMarkers(markers: PlaceMarkers): void {
    const byId = markersIn(markers, 'library')
    this._cast_view.setPeerMarkers(byId)
    this._objects_view.setPeerMarkers(byId)
    this._tiles_view.setPeerMarkers(byId)
  }

  private _notifyActiveItem(): void {
    const id = this.activeItemId
    if (id === this._announcedItemId) return
    this._announcedItemId = id
    this.notify('active-item-id')
  }

  /** The Characters gallery — the friendly lens over the cast. */
  get castView(): CastView {
    return this._cast_view
  }

  /** The Things gallery — the general lens over the whole entity library. */
  get objectsView(): ObjectsView {
    return this._objects_view
  }

  /** The Graphics gallery — tilesets and appearances as raw assets. */
  get tilesView(): TilesView {
    return this._tiles_view
  }

  /** Reset the Library to its gallery (used on project swap). */
  resetToOverview(): void {
    this._split.set_show_content(false)
  }

  /**
   * Slide back from the detail to the gallery, and say whether there was
   * anywhere to go — back step 4 (REDESIGN.md § 3.4). Only a collapsed
   * split has a "page" to pop; while both panes show, the detail is not
   * covering anything and back belongs to the caller.
   */
  popPage(): boolean {
    if (!this.hasPushedPage()) return false
    this._split.set_show_content(false)
    return true
  }

  /** Whether the detail is covering the gallery (collapsed only). */
  hasPushedPage(): boolean {
    return this._split.get_collapsed() && this._split.get_show_content()
  }
}

GObject.type_ensure(LibraryView.$gtype)
