import type Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { ProjectMenuButton, RosterChip, SignalScope } from '@pixelrpg/gjs'

import {
  chipForTier,
  DEFAULT_LIBRARY_CHIP,
  isChipInTier,
  isLibraryChip,
  type LibraryChip,
} from '../services/library-chip.ts'
import { CastView } from './cast-view.ts'
import Template from './library-view.blp'
import { ObjectsView } from './objects-view.ts'
import { ResponsiveEditorView } from './responsive-editor-view.ts'
import { TilesView } from './tiles-view.ts'

// Force registration so the `$CastView` / `$ObjectsView` / `$TilesView`
// / `$PixelRpgProjectMenuButton` / `$PixelRpgRosterChip` references in
// the blueprint resolve at parse time.
GObject.type_ensure(CastView.$gtype)
GObject.type_ensure(ObjectsView.$gtype)
GObject.type_ensure(TilesView.$gtype)
GObject.type_ensure(ProjectMenuButton.$gtype)
GObject.type_ensure(RosterChip.$gtype)

/**
 * The Library — one shell destination hosting three chip pages: **Characters**
 * ({@link CastView}), **Things** ({@link ObjectsView}) and **Graphics**
 * ({@link TilesView}). They were three rail rows over the same data (the
 * entity library + the sprite sets); Things already listed the
 * characters with a badge and Graphics sent appearance edits to
 * Characters, so they were one place with three doors.
 *
 * This host owns the one header and pushes the breakpoint's
 * `inspector-collapsed` into the pages that have a split to collapse.
 * The `chip` property is the whole navigation model: the `Adw.ViewStack`
 * binds `visible-child-name` to it bidirectionally and the
 * `Adw.InlineViewSwitcher` under the header drives that stack, so a
 * click, a deep link and the `win.library-chip` action all take the same
 * path.
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
  declare _pages: Adw.ViewStack
  declare _graphics_page: Adw.ViewStackPage
  declare _hidden_banner: Adw.Banner
  declare _new_thing_button: Gtk.Button
  declare _cast_view: CastView
  declare _objects_view: ObjectsView
  declare _tiles_view: TilesView

  private _chip: LibraryChip = DEFAULT_LIBRARY_CHIP
  private _hiddenContent = false
  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgLibraryView',
        Template,
        InternalChildren: [
          'view_switcher',
          'roster_chip',
          'pages',
          'graphics_page',
          'hidden_banner',
          'new_thing_button',
          'cast_view',
          'objects_view',
          'tiles_view',
        ],
        Properties: {
          chip: GObject.ParamSpec.string(
            'chip',
            'Chip',
            'The visible chip page: characters, things or graphics',
            GObject.ParamFlags.READWRITE,
            DEFAULT_LIBRARY_CHIP,
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
    // The template builds all three pages; the tier decides which are
    // visible. Runs here because the window's `full-view` binding only
    // NOTIFIES on a change, and Simple view is the default on both
    // sides — without this the Graphics chip would sit in the switcher
    // until the tier flipped twice.
    this._syncChipsToTier()
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._new_thing_button, 'clicked', () => this._objects_view.presentTemplateChooser())
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
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
  }

  /** The Characters page — the friendly lens over the cast. */
  get castView(): CastView {
    return this._cast_view
  }

  /** The Things page — the general lens over the whole entity library. */
  get objectsView(): ObjectsView {
    return this._objects_view
  }

  /** The Graphics page — tilesets and appearances as raw assets. */
  get tilesView(): TilesView {
    return this._tiles_view
  }

  /** Reset every page to its overview (used on project swap). */
  resetToOverview(): void {
    this._cast_view.resetToOverview()
    this._tiles_view.resetToOverview()
  }
}

GObject.type_ensure(LibraryView.$gtype)
