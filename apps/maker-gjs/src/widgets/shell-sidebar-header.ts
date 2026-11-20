import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import { ProjectMenuButton, RosterChip } from '@pixelrpg/gjs'

import Template from './shell-sidebar-header.blp'

GObject.type_ensure(ProjectMenuButton.$gtype)
GObject.type_ensure(RosterChip.$gtype)

/**
 * The width of every shell sidebar, defined once. Min equals max so the
 * destination switcher in the sidebar header sits at the same spot on
 * every destination instead of shifting with the sidebar's fraction.
 */
export const SHELL_SIDEBAR_WIDTH = 300

/** Pin a split view's sidebar to {@link SHELL_SIDEBAR_WIDTH}. */
export function applyShellSidebarWidth(split: Adw.NavigationSplitView | Adw.OverlaySplitView): void {
  split.min_sidebar_width = SHELL_SIDEBAR_WIDTH
  split.max_sidebar_width = SHELL_SIDEBAR_WIDTH
}

/**
 * Header bar for the left sidebar of a shell view: the World / Library /
 * Game switcher in the title slot, the roster chip and main menu at the
 * end. Any shell view with a sidebar consumes it unchanged — it only
 * needs `compact` (phone: switcher hidden, `title` shown instead) and a
 * call to {@link attachStack}.
 */
export class ShellSidebarHeader extends Adw.Bin {
  declare _header: Adw.HeaderBar
  declare _switcher: Adw.ViewSwitcher
  declare _project_menu: ProjectMenuButton
  declare _roster_chip: RosterChip

  // No initializer: GObject reads `title` while the base constructor
  // applies construct properties, before a field initializer would run,
  // and an initializer would then overwrite the value just set.
  private declare _title?: string
  private _compact = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgShellSidebarHeader',
        Template,
        InternalChildren: ['header', 'switcher', 'project_menu', 'roster_chip'],
        Properties: {
          title: GObject.ParamSpec.string(
            'title',
            'Title',
            'The page title shown instead of the switcher at the phone tier',
            GObject.ParamFlags.READWRITE,
            '',
          ),
          compact: GObject.ParamSpec.boolean(
            'compact',
            'Compact',
            'Phone tier: the bottom switcher bar owns the destinations, so the switcher hides',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      ShellSidebarHeader,
    )
  }

  get title(): string {
    return this._title ?? ''
  }

  set title(value: string) {
    if (this._title === value) return
    this._title = value
    this.notify('title')
  }

  get compact(): boolean {
    return this._compact
  }

  set compact(value: boolean) {
    if (this._compact === value) return
    this._compact = value
    this.notify('compact')
  }

  /** The inner header bar, for a view that re-homes end items. */
  get header(): Adw.HeaderBar {
    return this._header
  }

  get projectMenu(): ProjectMenuButton {
    return this._project_menu
  }

  get rosterChip(): RosterChip {
    return this._roster_chip
  }

  attachStack(stack: Adw.ViewStack): void {
    this._switcher.stack = stack
  }
}

GObject.type_ensure(ShellSidebarHeader.$gtype)
