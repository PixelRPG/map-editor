import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'

import type { EditorDefaultsService } from '../services/editor-defaults.service.ts'
import { THEME_PREFERENCES } from '../services/theme-preference.ts'
import type { ThemeService } from '../services/theme.service.ts'
import type { UiTierService } from '../services/ui-tier.service.ts'
import Template from './preferences-dialog.blp'

/**
 * App preferences. One page, two groups (REDESIGN.md § 4.8):
 *
 * - **View** — the Color Scheme row (Auto · Light · Dark) bound to the
 *   {@link ThemeService}, its row order mirroring `THEME_PREFERENCES`,
 *   and the Full view switch bound to the {@link UiTierService} (one of
 *   the tier's three entry points, with the primary-menu check item and
 *   the "Show N more settings" row).
 * - **Editing** — defaults a session starts from, bound to the
 *   {@link EditorDefaultsService}.
 *
 * The spec's Together and Help groups are not here yet: both need
 * surfaces that do not exist (the Together dialog, the tips system).
 * Tracked in `TODO.md`.
 */
export class PreferencesDialog extends Adw.PreferencesDialog {
  static {
    GObject.registerClass(
      {
        GTypeName: 'PreferencesDialog',
        Template,
        InternalChildren: ['theme_row', 'full_view_row', 'show_grid_row'],
      },
      PreferencesDialog,
    )
  }

  private declare _theme_row: Adw.ComboRow
  private declare _full_view_row: Adw.SwitchRow
  private declare _show_grid_row: Adw.SwitchRow

  private themeService: ThemeService | null = null

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
