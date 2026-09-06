import type Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import type Gtk from '@girs/gtk-4.0'
import { type ModeRail, SignalScope } from '@pixelrpg/gjs'

import { DEFAULT_LIBRARY_CHIP, isLibraryChip, type LibraryChip } from '../services/library-chip.ts'
import { CastView } from './cast-view.ts'
import Template from './library-view.blp'
import { ObjectsView } from './objects-view.ts'
import { ResponsiveEditorView } from './responsive-editor-view.ts'
import { TilesView } from './tiles-view.ts'

// Force registration so the `$CastView` / `$ObjectsView` / `$TilesView`
// references in the blueprint resolve at parse time.
GObject.type_ensure(CastView.$gtype)
GObject.type_ensure(ObjectsView.$gtype)
GObject.type_ensure(TilesView.$gtype)

/**
 * The Library — one rail row hosting three chip pages: **Characters**
 * ({@link CastView}), **Things** ({@link ObjectsView}) and **Graphics**
 * ({@link TilesView}). They were three rail rows over the same data (the
 * entity library + the sprite sets); Things already listed the
 * characters with a badge and Graphics sent appearance edits to
 * Characters, so they were one place with three doors.
 *
 * This host owns what a rail row owns — the mode rail, the window's
 * shared sidebar state, the one header — and pushes the breakpoint's
 * `inspector-collapsed` into the pages that have a split to collapse.
 * The `chip` property is the whole navigation model: the header's
 * `Adw.ToggleGroup` binds to it bidirectionally and both stacks follow
 * the group, so a click, a deep link and the `win.library-chip` action
 * all take the same path.
 */
export class LibraryView extends ResponsiveEditorView {
  declare _chips: Adw.ToggleGroup
  declare _hidden_banner: Adw.Banner
  declare _new_thing_button: Gtk.Button
  declare _cast_view: CastView
  declare _objects_view: ObjectsView
  declare _tiles_view: TilesView

  private _chip: LibraryChip = DEFAULT_LIBRARY_CHIP
  private _projectName = ''
  private _hiddenContent = false
  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgLibraryView',
        Template,
        InternalChildren: [
          'mode_rail',
          'chips',
          'hidden_banner',
          'new_thing_button',
          'cast_view',
          'objects_view',
          'tiles_view',
        ],
        Properties: {
          'project-name': GObject.ParamSpec.string(
            'project-name',
            'Project Name',
            'Display name fed into the ModeRail hero block',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          chip: GObject.ParamSpec.string(
            'chip',
            'Chip',
            'The visible chip page: characters, things or graphics',
            GObject.ParamFlags.READWRITE,
            DEFAULT_LIBRARY_CHIP,
          ),
        },
        // show-library / library-collapsed (+ inspector) props + the
        // mode-changed signal are inherited from ResponsiveEditorView.
      },
      LibraryView,
    )
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._mode_rail, 'mode-changed', (_r: ModeRail, mode: string) =>
      this.emit('mode-changed', mode),
    )
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
   * Typed as `string` because the toggle group's `active-name` binding
   * writes through here; anything that is not a chip is ignored rather
   * than shown as an empty stack.
   */
  set chip(value: string) {
    if (!isLibraryChip(value) || this._chip === value) return
    this._chip = value
    this.notify('chip')
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
