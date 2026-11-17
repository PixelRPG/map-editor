import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { ColourDot } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import { COLLAB_COLOURS } from '../services/collab-identity.ts'
import type { CollabIdentityService } from '../services/collab-identity.service.ts'
import type { EditorDefaultsService } from '../services/editor-defaults.service.ts'
import { THEME_PREFERENCES } from '../services/theme-preference.ts'
import type { ThemeService } from '../services/theme.service.ts'
import type { UiTierService } from '../services/ui-tier.service.ts'
import Template from './preferences-dialog.blp'

/** Diameter of a swatch in the colour popover — a comfortable phone target. */
const SWATCH_PX = 24

/**
 * App preferences. One page, three groups (REDESIGN.md § 4.8):
 *
 * - **View** — the Color Scheme row (Auto · Light · Dark) bound to the
 *   {@link ThemeService}, its row order mirroring `THEME_PREFERENCES`,
 *   and the Full view switch bound to the {@link UiTierService} (one of
 *   the tier's three entry points, with the primary-menu check item and
 *   the "Show N more settings" row).
 * - **Editing** — defaults a session starts from, bound to the
 *   {@link EditorDefaultsService}.
 * - **Together** — who this user is to everyone else, bound to the
 *   {@link CollabIdentityService}. These are *settings*, not session
 *   controls: who is here right now and how to invite them live in the
 *   Together dialog (§ 4.7).
 *
 * The spec's Help group is not here yet: it needs a tips system that
 * does not exist. Tracked in `TODO.md`.
 */
export class PreferencesDialog extends Adw.PreferencesDialog {
  static {
    GObject.registerClass(
      {
        GTypeName: 'PreferencesDialog',
        Template,
        InternalChildren: [
          'theme_row',
          'full_view_row',
          'show_grid_row',
          'collab_name_row',
          'collab_colour_button',
          'collab_nearby_row',
          'collab_assistant_row',
        ],
      },
      PreferencesDialog,
    )
  }

  private declare _theme_row: Adw.ComboRow
  private declare _full_view_row: Adw.SwitchRow
  private declare _show_grid_row: Adw.SwitchRow
  private declare _collab_name_row: Adw.EntryRow
  private declare _collab_colour_button: Gtk.MenuButton
  private declare _collab_nearby_row: Adw.SwitchRow
  private declare _collab_assistant_row: Adw.SwitchRow

  private themeService: ThemeService | null = null
  /** Suppresses the name row's `changed` while this dialog writes into it. */
  private writingName = false

  constructor(params: Partial<Adw.PreferencesDialog.ConstructorProps> = {}) {
    super(params)
  }

  /** Bind the dialog to the app's theme service; call before presenting. */
  setThemeService(service: ThemeService): void {
    this.themeService = service
    this._theme_row.set_selected(Math.max(0, THEME_PREFERENCES.indexOf(service.theme)))
  }

  /** Bind the Full view switch to the tier service, both ways; call before presenting. */
  setUiTierService(service: UiTierService): void {
    service.bind_property(
      'full-view',
      this._full_view_row,
      'active',
      GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL,
    )
  }

  /**
   * Bind the Editing group to the defaults service, both ways; call
   * before presenting. Writing here does NOT touch the live
   * `win.toggle-grid` state — the preference is what the NEXT session
   * opens with, so changing it mid-map does not yank the grid out from
   * under the user.
   */
  setEditorDefaults(service: EditorDefaultsService): void {
    service.bind_property(
      'show-grid',
      this._show_grid_row,
      'active',
      GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL,
    )
  }

  /**
   * Bind the Together group to the identity service; call before
   * presenting.
   *
   * The name row is seeded once and then only ever *written* — never
   * synced back from `notify::display-name`. An empty name means "track
   * whatever the system calls me", so the service answers the derived
   * name for it, and syncing that back would refill the entry under a
   * user who is in the middle of clearing it.
   */
  setCollabIdentity(service: CollabIdentityService): void {
    this.writingName = true
    this._collab_name_row.set_text(service.displayName)
    this.writingName = false
    this._collab_name_row.connect('changed', () => {
      if (this.writingName) return
      service.displayName = this._collab_name_row.get_text()
    })

    this._collab_colour_button.set_child(new ColourDot(service.colour, SWATCH_PX))
    this._collab_colour_button.set_popover(this.buildColourPopover(service))
    service.connect('notify::colour', () => {
      const dot = this._collab_colour_button.get_child()
      if (dot instanceof ColourDot) dot.setColor(service.colour)
    })

    service.bind_property(
      'visible-nearby',
      this._collab_nearby_row,
      'active',
      GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL,
    )
    service.bind_property(
      'assistant-enabled',
      this._collab_assistant_row,
      'active',
      GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.BIDIRECTIONAL,
    )
  }

  /**
   * The eight palette swatches, four per line.
   *
   * A popover and not eight buttons in the row itself: at phone width
   * the row has well under 200px to spare beside its title, and a
   * squeezed swatch is a missed tap. Toggle buttons rather than a
   * `Gtk.ColorDialogButton` because the palette is a whitelist — it is
   * what keeps peers apart and leaves the AI's purple unclaimed.
   */
  private buildColourPopover(service: CollabIdentityService): Gtk.Popover {
    const popover = new Gtk.Popover()
    const grid = new Gtk.FlowBox({
      max_children_per_line: 4,
      min_children_per_line: 4,
      row_spacing: 6,
      column_spacing: 6,
      selection_mode: Gtk.SelectionMode.NONE,
      homogeneous: true,
    })
    let group: Gtk.ToggleButton | null = null
    for (const colour of COLLAB_COLOURS) {
      const button = new Gtk.ToggleButton({
        active: colour === service.colour,
        css_classes: ['circular', 'flat'],
        tooltip_text: _('Use this colour'),
        child: new ColourDot(colour, SWATCH_PX),
      })
      if (group) button.set_group(group)
      else group = button
      button.connect('toggled', () => {
        if (button.get_active()) {
          service.colour = colour
          popover.popdown()
        }
      })
      grid.append(button)
    }
    popover.set_child(grid)
    return popover
  }

  _onThemeSelected(): void {
    const service = this.themeService
    if (!service) return
    const selected = THEME_PREFERENCES[this._theme_row.selected]
    // Guard both the sync-back during setThemeService and out-of-range
    // selections; assigning the current value is a no-op upstream too.
    if (selected && selected !== service.theme) {
      service.theme = selected
    }
  }
}

GObject.type_ensure(PreferencesDialog.$gtype)
