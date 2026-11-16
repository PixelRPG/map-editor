import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { ngettext } from 'gettext'
import { MapPreview, ProjectHeroIcon, SignalScope } from '@pixelrpg/gjs'
import type { DiscoveredService } from '../services/lan-discovery-parse.ts'
import type { RecentProjectEntry } from '../services/recent-projects.ts'
import { forgetMissingRecents, loadRecentProjects } from '../services/recent-projects.ts'
import { STARTER_TEMPLATES } from '../services/templates.ts'
import { buildWelcomeRecents } from '../services/welcome-model.ts'

import { buildRecentProjectRow } from './recent-project-row.ts'
import { buildContinueCard, buildTemplateCard } from './welcome-cards.ts'
import { presentJoinByCodeDialog } from './welcome-join-dialog.ts'
import Template from './welcome-view.blp'

/**
 * Rows the Recent section lists below the Continue card. Four is the
 * cap REDESIGN § 4.1 gives the section as a whole; the Continue card
 * holds the newest project and is not repeated among them.
 */
const MAX_RECENT_ROWS = 4

GObject.type_ensure(ProjectHeroIcon.$gtype)
GObject.type_ensure(MapPreview.$gtype)

/**
 * Typed view of the signals {@link WelcomeView} registers, layered on the parent's
 * own so inherited signals keep their argument lists.
 *
 * `@girs` 5 dropped the permissive `connect(signal: string, …)` overload
 * every generated class carried, so a class that registers its own signals
 * now has to spell them out — `SignalMethods` refines the inherited method
 * rather than replacing it at run time.
 */
export interface WelcomeViewSignals extends Adw.Bin.SignalSignatures {
  'create-project': () => void
  'open-project': () => void
  'template-selected': (templateId: string) => void
  'recent-selected': (projectPath: string) => void
  'session-selected': (service: DiscoveredService) => void
  'join-by-code': (roomId: string) => void
}

/**
 * Welcome / home view — one scrolling column at every width
 * (REDESIGN § 4.1): hero, Continue card, "Start something new" cards,
 * Recent rows, then the *Play together* section.
 *
 * It used to be an `Adw.OverlaySplitView` whose 380 px recents sidebar
 * was REPARENTED inline below the hero on phone. The column reads the
 * same everywhere, so the split view, the reparenting and the
 * `inspector-collapsed` / `show-inspector` pair that drove it are gone
 * — `win.toggle-inspector` is unaffected, it is a property action over
 * the *window's* `show-inspector`, not this view's.
 *
 * What goes where comes from {@link buildWelcomeRecents}, which has its
 * own spec; this class only builds widgets for the answer.
 */
export class WelcomeView extends Adw.Bin {
  declare _continue_slot: Adw.Bin
  declare _templates_wrap: Adw.WrapBox
  declare _open_button: Gtk.Button
  declare _recents_section: Gtk.Box
  declare _recents_list: Gtk.ListBox
  declare _sessions_list: Gtk.ListBox
  declare _join_row: Adw.ButtonRow

  private _recentRows: Gtk.Widget[] = []
  /** `name` → row, so `service-gone` events can remove the right entry. */
  private _sessionRows = new Map<string, Adw.ActionRow>()

  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'WelcomeView',
        Template,
        InternalChildren: [
          'continue_slot',
          'templates_wrap',
          'open_button',
          'recents_section',
          'recents_list',
          'sessions_list',
          'join_row',
        ],
        Signals: {
          // The blank template card: scaffolds a copy of
          // `games/blank-starter` into a folder the user picks. It is
          // deliberately NOT `template-selected::blank-starter` —
          // opening the template in place would write into the repo's
          // own files (see `ProjectLifecycle.create`).
          'create-project': {},
          'open-project': {},
          'template-selected': { param_types: [GObject.TYPE_STRING] },
          'recent-selected': { param_types: [GObject.TYPE_STRING] },
          // Emitted when the user picks a discovered LAN session.
          // Param: the same `DiscoveredService` shape the session
          // bus delivered — `SessionService.joinLan(service)` reads
          // every field straight off it.
          'session-selected': { param_types: [GObject.TYPE_JSOBJECT] },
          // Emitted when the join-by-code dialog is accepted. Param is
          // the room id extracted from either a bare code or a
          // `pixelrpg://join/<roomid>` URL.
          'join-by-code': { param_types: [GObject.TYPE_STRING] },
        },
      },
      WelcomeView,
    )
  }

  declare connect: GObject.SignalMethods<this, WelcomeViewSignals>['connect']
  declare connect_after: GObject.SignalMethods<this, WelcomeViewSignals>['connect_after']
  declare emit: GObject.SignalMethods<this, WelcomeViewSignals>['emit']

  constructor() {
    super()
    this._buildTemplateCards()
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._open_button, 'clicked', () => this.emit('open-project'))
    this.signals.connect(this._join_row, 'activated', () =>
      presentJoinByCodeDialog(this, (roomId) => this.emit('join-by-code', roomId)),
    )
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  /**
   * Render the persisted recents list: the newest surviving project as
   * the Continue card, the next few as rows, and one "Tidy up" row when
   * bookmarks point at files that are gone. Passing an empty array
   * leaves the whole Recent section hidden — the templates above it are
   * what a first-time user needs, and an empty list says nothing.
   *
   * Rows come from {@link buildRecentProjectRow}, shared with the "Open
   * Recent" dialog.
   */
  setRecentProjects(recents: RecentProjectEntry[]): void {
    for (const row of this._recentRows) this._recents_list.remove(row)
    this._recentRows = []
    this._continue_slot.set_child(null)

    const model = buildWelcomeRecents(recents, MAX_RECENT_ROWS)

    if (model.continueProject) {
      const card = buildContinueCard(model.continueProject, (path) => this.emit('recent-selected', path))
      this._continue_slot.set_child(card)
    }
    this._continue_slot.set_visible(model.continueProject !== null)

    for (const recent of model.rows) {
      const row = buildRecentProjectRow(recent, (path) => this.emit('recent-selected', path))
      this._recents_list.append(row)
      this._recentRows.push(row)
    }
    if (model.missingCount > 0) this._appendTidyRow(model.missingCount)

    this._recents_section.set_visible(this._recentRows.length > 0)
  }

  /**
   * Add a row to the "Play together" list. Idempotent — a second call
   * with the same `service.name` updates the existing row instead of
   * duplicating it.
   *
   * Avahi resolves the same service once per network interface ×
   * protocol (e.g. lo+eth0+wlan0 × IPv4+IPv6), so a single peer
   * normally fires 3-6 `service-discovered` events with identical
   * `name`. Dedup-by-name collapses them to a single visible row.
   */
  addDiscoveredService(service: DiscoveredService): void {
    const existing = this._sessionRows.get(service.name)
    if (existing) this._sessions_list.remove(existing)

    const peerCount = service.txt.peers ?? '–'
    const projectLabel = service.txt.project ?? service.name
    const hostLabel = service.txt.host ?? service.host
    const action = new Adw.ActionRow({
      title: projectLabel,
      subtitle: `${hostLabel} · ${peerCount}`,
      activatable: true,
    })
    action.add_prefix(new Gtk.Image({ icon_name: 'network-workgroup-symbolic', pixel_size: 22 }))
    action.add_suffix(new Gtk.Image({ icon_name: 'go-next-symbolic', pixel_size: 12 }))
    action.connect('activated', () => this.emit('session-selected', service))
    this._sessions_list.append(action)

    // Adw.ActionRow IS a Gtk.ListBoxRow (via Adw.PreferencesRow) —
    // no Gtk.ListBoxRow wrapper is created on append. The earlier
    // `action.get_parent() instanceof Gtk.ListBoxRow` check returned
    // false for that reason, so the map never got populated and the
    // dedup at the top silently failed — every Avahi resolve event
    // accumulated a fresh row. Store the action directly.
    this._sessionRows.set(service.name, action)
    this._refreshSessionsVisibility()
  }

  /** Remove a row previously added via {@link addDiscoveredService}. */
  removeDiscoveredService(serviceName: string): void {
    const row = this._sessionRows.get(serviceName)
    if (!row) return
    this._sessions_list.remove(row)
    this._sessionRows.delete(serviceName)
    this._refreshSessionsVisibility()
  }

  /** Drop every discovered row — host typically calls this on stopBrowsing. */
  clearDiscoveredServices(): void {
    for (const row of this._sessionRows.values()) this._sessions_list.remove(row)
    this._sessionRows.clear()
    this._refreshSessionsVisibility()
  }

  /**
   * The LAN list is hidden while it is empty instead of carrying a "No
   * sessions found" row: "nobody is hosting right now" is not news a
   * first-time user needs, and the "Join with a code…" row below it
   * keeps the section meaningful either way.
   */
  private _refreshSessionsVisibility(): void {
    this._sessions_list.set_visible(this._sessionRows.size > 0)
  }

  private _appendTidyRow(missingCount: number): void {
    const label = ngettext(
      '%d game could not be found — Tidy up',
      '%d games could not be found — Tidy up',
      missingCount,
    ).replace('%d', String(missingCount))
    const tidy = new Adw.ButtonRow({ title: label })
    tidy.connect('activated', () => {
      forgetMissingRecents()
      this.setRecentProjects(loadRecentProjects())
    })
    this._recents_list.append(tidy)
    this._recentRows.push(tidy)
  }

  private _buildTemplateCards(): void {
    // `Adw.WrapBox` does the row/column math from each card's natural
    // width: two side by side on the desktop, stacked on a phone.
    for (const template of STARTER_TEMPLATES) {
      const card = buildTemplateCard(template, (picked) => {
        if (picked.isBlank === true) this.emit('create-project')
        else this.emit('template-selected', picked.id)
      })
      this._templates_wrap.append(card)
    }
  }
}

GObject.type_ensure(WelcomeView.$gtype)
