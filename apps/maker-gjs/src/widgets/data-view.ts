import Adw from '@girs/adw-1'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { type ModeRail, SignalScope } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import type { GameRuleRow, GameRulesModel } from '../services/game-rules-model.ts'
import Template from './data-view.blp'
import { ResponsiveEditorView } from './responsive-editor-view.ts'

/**
 * The whole Data-view model the controller pushes in one shot. Assets are
 * summarised as COUNTS only — they're owned + edited in Cast / Sheets, so
 * Data references them rather than duplicating the management surface.
 */
export interface DataViewModel {
  name: string
  author: string
  version: string
  description: string
  tileSize: number
  path: string
  appearanceCount: number
  tilesetCount: number
  /** The switchable game systems + the always-on base layer. */
  gameRules: GameRulesModel
}

export interface DataViewCallbacks {
  setProjectField: (field: 'name' | 'author' | 'version' | 'description' | 'tileSize', value: string) => void
  /** Switch one game system on or off (`__project/systems.set` via the ProjectStore). */
  setGameSystemEnabled: (id: string, enabled: boolean) => void
}

/**
 * Data view — the project's settings surface. Editable project metadata
 * (name / author / version / description) + tile settings, plus a
 * "Linked assets" group that just *references* the appearances (Cast) and
 * tilesets (Sheets) with a count + a jump-to-managing-view link. The
 * assets themselves are owned + edited in those views — Data no longer
 * duplicates the import/rename/delete surface. See `data-controller.ts`.
 */
// biome-ignore lint/suspicious/noShadowRestrictedNames: GTK view-class naming convention (CastView/TilesView/DataView); the JS DataView global is unused in this app
export class DataView extends ResponsiveEditorView {
  declare _outer_split: Adw.OverlaySplitView
  declare _library_toggle: Gtk.ToggleButton
  declare _name_row: Adw.EntryRow
  declare _author_row: Adw.EntryRow
  declare _version_row: Adw.EntryRow
  declare _description_row: Adw.EntryRow
  declare _tilesize_row: Adw.SpinRow
  declare _path_row: Adw.ActionRow
  declare _appearances_ref_row: Adw.ActionRow
  declare _tilesets_ref_row: Adw.ActionRow
  declare _appearances_open_button: Gtk.Button
  declare _tilesets_open_button: Gtk.Button
  declare _game_rules: Adw.PreferencesGroup
  declare _always_on: Adw.PreferencesGroup

  private signals = new SignalScope()
  private _callbacks: DataViewCallbacks | null = null
  // True while `setData` writes the row texts, so the `notify`/`apply`
  // handlers don't fire the edit callbacks back during a refresh.
  private _loading = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgDataView',
        Template,
        InternalChildren: [
          'outer_split',
          'mode_rail',
          'library_toggle',
          'name_row',
          'author_row',
          'version_row',
          'description_row',
          'tilesize_row',
          'path_row',
          'appearances_ref_row',
          'tilesets_ref_row',
          'appearances_open_button',
          'tilesets_open_button',
          'game_rules',
          'always_on',
        ],
        // show-library / library-collapsed (+ inspector) props + the
        // mode-changed signal are inherited from ResponsiveEditorView.
      },
      DataView,
    )
  }

  // Signals are connected in vfunc_map / released in vfunc_unmap via
  // SignalScope (the workspace's GTK lifecycle rule) so a remapped view
  // doesn't accumulate duplicate handlers and an unmapped one stops firing.
  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._mode_rail, 'mode-changed', (_r: ModeRail, mode: string) =>
      this.emit('mode-changed', mode),
    )
    // Reference links jump to the view that OWNS the asset type.
    this.signals.connect(this._appearances_open_button, 'clicked', () =>
      this.activate_action('win.mode', GLib.Variant.new_string('cast')),
    )
    this.signals.connect(this._tilesets_open_button, 'clicked', () =>
      this.activate_action('win.mode', GLib.Variant.new_string('tiles')),
    )

    this.signals.connect(this._name_row, 'apply', () => this._emitField('name', this._name_row.get_text()))
    this.signals.connect(this._author_row, 'apply', () => this._emitField('author', this._author_row.get_text()))
    this.signals.connect(this._version_row, 'apply', () => this._emitField('version', this._version_row.get_text()))
    this.signals.connect(this._description_row, 'apply', () =>
      this._emitField('description', this._description_row.get_text()),
    )
    this.signals.connect(this._tilesize_row, 'notify::value', () => {
      if (this._loading) return
      this._callbacks?.setProjectField('tileSize', String(Math.round(this._tilesize_row.get_value())))
    })
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  private _emitField(field: 'name' | 'author' | 'version' | 'description', value: string): void {
    if (this._loading) return
    this._callbacks?.setProjectField(field, value.trim())
  }

  bindCallbacks(callbacks: DataViewCallbacks): void {
    this._callbacks = callbacks
  }

  /** Rows currently in each game-system group, so a refresh can remove them. */
  private _ruleRows: Array<{ group: Adw.PreferencesGroup; row: Adw.PreferencesRow }> = []

  /**
   * Rebuild the Game-rules page from the model.
   *
   * One `Adw.ExpanderRow` per switchable system: `show-enable-switch`
   * makes the switch the on/off and the body the expert surface, so a
   * child flips the switch without ever expanding and an expert expands
   * without ever flipping. The base layer is a separate insensitive
   * group — it has no switch because there is nothing to decide.
   *
   * With no switchable system in this build the first group hides
   * itself: an empty titled group with a description reads as broken.
   */
  private _setGameRules(model: GameRulesModel | null): void {
    for (const { group, row } of this._ruleRows) group.remove(row)
    this._ruleRows = []
    if (!model) {
      this._game_rules.set_visible(false)
      this._always_on.set_visible(false)
      return
    }

    for (const rule of model.switchable) {
      const row = this._buildSwitchableRow(rule)
      this._game_rules.add(row)
      this._ruleRows.push({ group: this._game_rules, row })
    }
    for (const rule of model.alwaysOn) {
      const row = new Adw.ActionRow({ title: _(rule.label), subtitle: _(rule.kidLabel), sensitive: false })
      row.add_prefix(new Gtk.Image({ iconName: rule.icon }))
      this._always_on.add(row)
      this._ruleRows.push({ group: this._always_on, row })
    }
    this._game_rules.set_visible(model.switchable.length > 0)
    this._always_on.set_visible(model.alwaysOn.length > 0)
  }

  /** One switchable system: switch in the header, expert detail in the body. */
  private _buildSwitchableRow(rule: GameRuleRow): Adw.ExpanderRow {
    const row = new Adw.ExpanderRow({
      title: _(rule.label),
      subtitle: _(rule.kidLabel),
      showEnableSwitch: true,
      enableExpansion: rule.enabled,
    })
    row.add_prefix(new Gtk.Image({ iconName: rule.icon }))

    if (rule.alsoEnables.length > 0) {
      row.add_row(new Adw.ActionRow({ title: _('Also turns on'), subtitle: rule.alsoEnables.join(', ') }))
    }
    row.add_row(new Adw.ActionRow({ title: _('Used by'), subtitle: describeUsage(rule) }))

    // A system another enabled system requires cannot be switched off:
    // doing so would leave the dependent half-wired. Say which one.
    if (rule.neededBy.length > 0) {
      row.set_sensitive(false)
      row.set_subtitle(_(`Needed by ${rule.neededBy.join(', ')}`))
    }

    // Connected on the row itself, not through the view's SignalScope:
    // the row is discarded and rebuilt on every refresh, so the handler
    // dies with it — a scope handler would instead be dropped at the
    // next unmap and never reconnected.
    //
    // Switching OFF is dormant, never destructive: it writes
    // `enabled: false` and removes no component. That is why there is no
    // confirmation here — nothing is lost.
    row.connect('notify::enable-expansion', () => {
      if (this._loading) return
      this._callbacks?.setGameSystemEnabled(rule.id, row.get_enable_expansion())
    })
    return row
  }

  /** Replace the whole view from a freshly built model. */
  setData(model: DataViewModel | null): void {
    this._loading = true
    this._name_row.set_text(model?.name ?? '')
    this._author_row.set_text(model?.author ?? '')
    this._version_row.set_text(model?.version ?? '')
    this._description_row.set_text(model?.description ?? '')
    this._tilesize_row.set_value(model?.tileSize ?? 16)
    this._path_row.set_subtitle(model?.path ?? '—')
    this._mode_rail.projectName = model?.name || _('New Project')
    this._loading = false

    const sensitive = model !== null
    for (const row of [
      this._name_row,
      this._author_row,
      this._version_row,
      this._description_row,
      this._tilesize_row,
    ]) {
      row.set_sensitive(sensitive)
    }

    // Reference-row subtitles: how many + where they're managed.
    const appearances = model?.appearanceCount ?? 0
    const tilesets = model?.tilesetCount ?? 0
    this._appearances_ref_row.set_subtitle(
      appearances === 1 ? _('1 appearance · used by the Cast') : _(`${appearances} appearances · used by the Cast`),
    )
    this._tilesets_ref_row.set_subtitle(
      tilesets === 1 ? _('1 tileset · used by maps') : _(`${tilesets} tilesets · used by maps`),
    )
    this._appearances_open_button.set_sensitive(sensitive)
    this._tilesets_open_button.set_sensitive(sensitive)

    // Rebuild inside the loading fence so the freshly-created switches
    // don't echo their initial value back as a user edit.
    this._loading = true
    this._setGameRules(model?.gameRules ?? null)
    this._loading = false
  }
}

/** "3 objects · 12 placed on 2 maps" — or "Nothing uses it yet". */
function describeUsage(rule: GameRuleRow): string {
  const { entities, placements, maps } = rule.usage
  if (entities === 0 && placements === 0) return _('Nothing uses it yet')
  const objects = entities === 1 ? _('1 object') : _(`${entities} objects`)
  if (placements === 0) return objects
  const placed = placements === 1 ? _('1 placed') : _(`${placements} placed`)
  const on = maps === 1 ? _('on 1 map') : _(`on ${maps} maps`)
  return `${objects} · ${placed} ${on}`
}

GObject.type_ensure(DataView.$gtype)
