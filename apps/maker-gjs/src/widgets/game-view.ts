import Adw from '@girs/adw-1'
import Gio from '@girs/gio-2.0'
import GLib from '@girs/glib-2.0'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { GameProjectResource } from '@pixelrpg/engine'
import { MapPreview, ProjectMenuButton, RosterChip, SignalScope } from '@pixelrpg/gjs'
import { gettext as _, ngettext } from 'gettext'

import type { CheckupLink, CheckupRow } from '../services/game-checkup.model.ts'
import type { GameRuleRow, GameRulesModel } from '../services/game-rules-model.ts'
import { buildCheckupRow } from './game/checkup-list.ts'
import {
  confirmRuleSwitchOff,
  type HeroOption,
  presentHeroDialog,
  presentStartMapDialog,
  type StartMapOption,
} from './game/game-dialogs.ts'
import Template from './game-view.blp'
import { ResponsiveEditorView } from './responsive-editor-view.ts'

// Force registration so the `$PixelRpgProjectMenuButton` and
// `$PixelRpgRosterChip` references in the blueprint resolve at parse time.
GObject.type_ensure(ProjectMenuButton.$gtype)
GObject.type_ensure(RosterChip.$gtype)

/** Which project-metadata field an edited row writes. */
export type GameProjectField = 'name' | 'author' | 'version' | 'description' | 'tileSize'

/** The whole Game-page model the controller pushes in one shot. */
export interface GameViewModel {
  name: string
  author: string
  version: string
  description: string
  tileSize: number
  path: string
  /** The switchable game systems + the always-on base layer. */
  gameRules: GameRulesModel
  /** What stops the game from working, already ordered (`buildGameCheckup`). */
  checkup: readonly CheckupRow[]
  /** The map the game opens on, or `null` when none is set. */
  startMap: StartMapOption | null
  /** The character the player is, or `null` when none is set. */
  hero: HeroOption | null
  /** Every loaded map, for the start-map picker and the title-card cover. */
  maps: readonly StartMapOption[]
  /** Every character, for the hero picker. */
  characters: readonly HeroOption[]
  /** The loaded project, so previews can draw the game's own tiles. */
  projectResource: GameProjectResource | null
}

export interface GameViewCallbacks {
  setProjectField: (field: GameProjectField, value: string) => void
  /** Switch one game system on or off (`__project/systems.set` via the ProjectStore). */
  setGameSystemEnabled: (id: string, enabled: boolean) => void
  /** Point the game at a different start map. */
  setStartMap: (mapId: string) => void
  /** Make one character the hero. */
  setHero: (characterId: string) => void
}

/**
 * Game page — a HOME for the game, the third shell destination
 * (REDESIGN.md § 4.5): the title card with the cover and "Play from the
 * start", the Checkup group of deep links into whatever is unfinished,
 * the Start pickers, the Rules group of switchable game systems and the
 * About group. The assets a project holds are NOT listed here:
 * characters and graphics live one switcher click away in the Library.
 * See `game-controller.ts`.
 */
export class GameView extends ResponsiveEditorView {
  declare _cover: Adw.Bin
  declare _name_row: Adw.EntryRow
  declare _checkup_list: Gtk.ListBox
  declare _start_map_row: Adw.ActionRow
  declare _hero_row: Adw.ActionRow
  declare _game_rules: Adw.PreferencesGroup
  declare _always_on: Adw.PreferencesGroup
  declare _built_in_row: Adw.ExpanderRow
  declare _author_row: Adw.EntryRow
  declare _description_row: Adw.EntryRow
  declare _version_row: Adw.EntryRow
  declare _tilesize_row: Adw.SpinRow
  declare _folder_row: Adw.ActionRow
  private _hasAlwaysOn = false

  private signals = new SignalScope()
  private _callbacks: GameViewCallbacks | null = null
  private _model: GameViewModel | null = null
  // True while `setData` writes the row texts, so the `notify`/`apply`
  // handlers don't fire the edit callbacks back during a refresh.
  private _loading = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgGameView',
        Template,
        InternalChildren: [
          'view_switcher',
          'roster_chip',
          'cover',
          'name_row',
          'checkup_list',
          'start_map_row',
          'hero_row',
          'game_rules',
          'always_on',
          'built_in_row',
          'author_row',
          'description_row',
          'version_row',
          'tilesize_row',
          'folder_row',
        ],
        // show-inspector / inspector-collapsed / compact / full-view are
        // inherited from ResponsiveEditorView.
      },
      GameView,
    )
  }

  // Signals are connected in vfunc_map / released in vfunc_unmap via
  // SignalScope (the workspace's GTK lifecycle rule) so a remapped view
  // doesn't accumulate duplicate handlers and an unmapped one stops firing.
  vfunc_map(): void {
    super.vfunc_map()
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
    this.signals.connect(this._start_map_row, 'activated', () => this._pickStartMap())
    this.signals.connect(this._hero_row, 'activated', () => this._pickHero())
    this.signals.connect(this._folder_row, 'activated', () => this._showFolder())
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  private _emitField(field: Exclude<GameProjectField, 'tileSize'>, value: string): void {
    if (this._loading) return
    this._callbacks?.setProjectField(field, value.trim())
  }

  bindCallbacks(callbacks: GameViewCallbacks): void {
    this._callbacks = callbacks
  }

  /** Replace the whole view from a freshly built model. */
  setData(model: GameViewModel | null): void {
    this._model = model
    this._loading = true
    this._name_row.set_text(model?.name ?? '')
    this._author_row.set_text(model?.author ?? '')
    this._version_row.set_text(model?.version ?? '')
    this._description_row.set_text(model?.description ?? '')
    this._tilesize_row.set_value(model?.tileSize ?? 16)
    this._folder_row.set_subtitle(model?.path ?? '—')

    const sensitive = model !== null
    for (const row of [
      this._name_row,
      this._author_row,
      this._version_row,
      this._description_row,
      this._tilesize_row,
      this._start_map_row,
      this._hero_row,
      this._folder_row,
    ]) {
      row.set_sensitive(sensitive)
    }

    this._start_map_row.set_subtitle(model?.startMap?.name ?? _('Not chosen yet'))
    this._hero_row.set_subtitle(model?.hero?.name ?? _('Nobody yet'))
    this._setCover(model)
    this._setCheckup(model?.checkup ?? [])
    // Rebuilt inside the loading fence so the freshly-created switches
    // don't echo their initial value back as a user edit.
    this._setGameRules(model?.gameRules ?? null)
    this._loading = false
  }

  // ────────────────────────────────────────────────────────────
  // Title card
  // ────────────────────────────────────────────────────────────

  /** Which map the cover currently draws, so a refresh doesn't redraw it. */
  private _coverKey: string | null = null

  /**
   * The cover is the start map, drawn from the project's own tiles.
   *
   * Rebuilt only when the map behind it changes: the page re-hydrates on
   * every metadata keystroke that lands, and re-rendering a `MapPreview`
   * each time would re-read the tileset for nothing. An unset start map
   * leaves the bin empty on purpose — the dim rounded rectangle reads as
   * the place the cover belongs, which is what makes the Checkup's "no
   * start map" row make sense.
   */
  private _setCover(model: GameViewModel | null): void {
    const mapId = model?.startMap?.id ?? null
    const key = mapId && model?.projectResource ? `${model.projectResource.path}#${mapId}` : null
    if (key === this._coverKey) return
    this._coverKey = key
    this._cover.set_child(null)
    if (!key || !mapId || !model?.projectResource?.maps.get(mapId)) return
    const preview = new MapPreview()
    this._cover.set_child(preview)
    void preview.setFromResource(model.projectResource, mapId)
  }

  // ────────────────────────────────────────────────────────────
  // Checkup
  // ────────────────────────────────────────────────────────────

  /**
   * Rebuild the Checkup list. Every row is a deep link into the thing
   * that needs doing (§ 4.5), except "no start map" with maps to choose
   * from: that one is answered by the Start group right below, so the
   * row opens its picker rather than sending anyone anywhere.
   */
  private _setCheckup(rows: readonly CheckupRow[]): void {
    let child = this._checkup_list.get_first_child()
    while (child) {
      const next = child.get_next_sibling()
      this._checkup_list.remove(child)
      child = next
    }
    for (const row of rows) {
      this._checkup_list.append(buildCheckupRow(row, this._checkupActivation(row)))
    }
    this._checkup_list.set_visible(rows.length > 0)
  }

  /** What one Checkup row does when tapped, or `null` when it is a statement. */
  private _checkupActivation(row: CheckupRow): (() => void) | null {
    if (row.link) {
      const link = row.link
      return () => this._activateLink(link)
    }
    if (row.fact.kind === 'no-start-map') return () => this._pickStartMap()
    return null
  }

  /** Activate a `win.*` deep link, marshalling the target the action declares. */
  private _activateLink(link: CheckupLink): void {
    const target = link.target
    if (target === null) {
      this.activate_action(link.action, null)
      return
    }
    if (typeof target === 'string') {
      this.activate_action(link.action, GLib.Variant.new_string(target))
      return
    }
    // A tuple target is `win.focus-placement`'s `(ss)` — an action takes
    // one parameter, so two ids travel as one tuple variant.
    this.activate_action(link.action, GLib.Variant.new_tuple(target.map((id) => GLib.Variant.new_string(id))))
  }

  // ────────────────────────────────────────────────────────────
  // Start
  // ────────────────────────────────────────────────────────────

  private _pickStartMap(): void {
    const model = this._model
    if (!model) return
    presentStartMapDialog(
      this,
      { maps: model.maps, projectResource: model.projectResource, currentMapId: model.startMap?.id ?? null },
      (mapId) => this._callbacks?.setStartMap(mapId),
    )
  }

  private _pickHero(): void {
    const model = this._model
    if (!model) return
    presentHeroDialog(this, { characters: model.characters, currentHeroId: model.hero?.id ?? null }, (characterId) =>
      this._callbacks?.setHero(characterId),
    )
  }

  // ────────────────────────────────────────────────────────────
  // Rules
  // ────────────────────────────────────────────────────────────

  /**
   * Removers for the rows currently in the two rule groups.
   *
   * Closures rather than `{ group, row }` pairs because the always-on
   * rows live inside an `Adw.ExpanderRow`, which takes them through
   * `add_row` and gives them back through `remove` — a different method
   * from the `Adw.PreferencesGroup` the switchable rows sit in.
   */
  private _ruleRows: Array<() => void> = []

  /**
   * Rebuild the Rules group from the model.
   *
   * One `Adw.ExpanderRow` per switchable system: `show-enable-switch`
   * makes the switch the on/off and the body the expert surface, so a
   * child flips the switch without ever expanding and an expert expands
   * without ever flipping. The base layer goes into one collapsed
   * "Built in" expander instead — there is nothing to decide there, so a
   * child's Game page should not carry four locked rows.
   *
   * With no switchable system in this build the first group hides
   * itself: an empty titled group with a description reads as broken.
   */
  private _setGameRules(model: GameRulesModel | null): void {
    for (const remove of this._ruleRows) remove()
    this._ruleRows = []
    if (!model) {
      this._game_rules.set_visible(false)
      this._hasAlwaysOn = false
      this._syncAlwaysOn()
      return
    }

    for (const rule of model.switchable) {
      const row = this._buildSwitchableRow(rule)
      this._game_rules.add(row)
      this._ruleRows.push(() => this._game_rules.remove(row))
    }
    for (const rule of model.alwaysOn) {
      const row = new Adw.ActionRow({ title: _(rule.label), subtitle: _(rule.kidLabel), sensitive: false })
      row.add_prefix(new Gtk.Image({ iconName: rule.icon }))
      this._built_in_row.add_row(row)
      this._ruleRows.push(() => this._built_in_row.remove(row))
    }
    this._game_rules.set_visible(model.switchable.length > 0)
    this._hasAlwaysOn = model.alwaysOn.length > 0
    this._syncAlwaysOn()
  }

  protected override _onFullViewChanged(_fullView: boolean): void {
    this._syncAlwaysOn()
  }

  /** The base layer is a Full view detail: Simple view shows only what the child can switch. */
  private _syncAlwaysOn(): void {
    this._always_on.set_visible(this._hasAlwaysOn && this.fullView)
  }

  /** One switchable system: switch in the header, expert detail in the body. */
  private _buildSwitchableRow(rule: GameRuleRow): Adw.ExpanderRow {
    const row = new Adw.ExpanderRow({
      title: _(rule.label),
      subtitle: ruleSubtitle(rule),
      subtitleLines: 3,
      showEnableSwitch: true,
      enableExpansion: rule.enabled,
    })
    row.add_prefix(new Gtk.Image({ iconName: rule.icon }))

    if (rule.alsoEnables.length > 0) {
      row.add_row(new Adw.ActionRow({ title: _('Also turns on'), subtitle: rule.alsoEnables.join(', ') }))
    }
    row.add_row(new Adw.ActionRow({ title: _('Used by'), subtitle: describeUsage(rule) }))

    // A system another enabled system requires cannot be switched off:
    // doing so would leave the dependent half-wired. The subtitle
    // already says which one.
    if (rule.neededBy.length > 0) row.set_sensitive(false)

    // Connected on the row itself, not through the view's SignalScope:
    // the row is discarded and rebuilt on every refresh, so the handler
    // dies with it — a scope handler would instead be dropped at the
    // next unmap and never reconnected.
    row.connect('notify::enable-expansion', () => this._onRuleToggled(rule, row))
    return row
  }

  /**
   * A switch flip. Turning ON is immediate. Turning OFF is dormant, not
   * destructive — it writes `enabled: false` and removes no component —
   * so the only question is whether anything in the project will go
   * quiet, and the dialog exists to say nothing is lost. A system
   * nothing uses asks nothing.
   */
  private _onRuleToggled(rule: GameRuleRow, row: Adw.ExpanderRow): void {
    if (this._loading) return
    const enabled = row.get_enable_expansion()
    const unused = rule.usage.entities === 0 && rule.usage.placements === 0
    if (enabled || unused) {
      this._callbacks?.setGameSystemEnabled(rule.id, enabled)
      return
    }
    confirmRuleSwitchOff(this, rule, (confirmed) => {
      if (confirmed) {
        this._callbacks?.setGameSystemEnabled(rule.id, false)
        return
      }
      // Cancelling has to put the switch back, and that write must not
      // read as a second user flip.
      this._loading = true
      row.set_enable_expansion(true)
      this._loading = false
    })
  }

  // ────────────────────────────────────────────────────────────
  // About
  // ────────────────────────────────────────────────────────────

  /**
   * Open the project folder in the file manager — the Full-view answer
   * to "where does this game actually live", replacing a path row that
   * could only be read.
   */
  private _showFolder(): void {
    const path = this._model?.path
    if (!path) return
    const launcher = new Gtk.FileLauncher({ file: Gio.File.new_for_path(path) })
    launcher.open_containing_folder(this.get_root() as Gtk.Window | null, null, null)
  }
}

/**
 * The lines under a rule's name: what it is, what turning it on puts in
 * front of you, and — when it is locked on — what is holding it there.
 */
function ruleSubtitle(rule: GameRuleRow): string {
  const lines = [_(rule.kidLabel)]
  if (rule.adds.length > 0) {
    const names = rule.adds.map((name) => _(name)).join(', ')
    lines.push(
      rule.addsMore > 0
        ? ngettext('Adds: %s and %d more', 'Adds: %s and %d more', rule.addsMore)
            .replace('%s', names)
            .replace('%d', String(rule.addsMore))
        : _('Adds: %s').replace('%s', names),
    )
  }
  if (rule.neededBy.length > 0) lines.push(_('Needed by %s').replace('%s', rule.neededBy.join(', ')))
  return lines.join('\n')
}

/** "3 objects · 12 placed on 2 maps" — or "Nothing uses it yet". */
function describeUsage(rule: GameRuleRow): string {
  const { entities, placements, maps } = rule.usage
  if (entities === 0 && placements === 0) return _('Nothing uses it yet')
  const objects = ngettext('%d object', '%d objects', entities).replace('%d', String(entities))
  if (placements === 0) return objects
  const placed = ngettext('%d placed', '%d placed', placements).replace('%d', String(placements))
  const on = ngettext('on %d map', 'on %d maps', maps).replace('%d', String(maps))
  return `${objects} · ${placed} ${on}`
}

GObject.type_ensure(GameView.$gtype)
