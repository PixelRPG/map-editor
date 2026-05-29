import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import { MapPreview, ProjectHeroIcon, SignalScope } from '@pixelrpg/gjs'
import type { DiscoveredService } from '../services/lan-discovery-parse.ts'
import { parsePixelrpgUrl } from '../services/pixelrpg-url.ts'
import type { RecentProject } from '../services/recent-projects.ts'
import { STARTER_TEMPLATES } from '../services/templates.ts'

import Template from './welcome-view.blp'

GObject.type_ensure(ProjectHeroIcon.$gtype)
GObject.type_ensure(MapPreview.$gtype)

/**
 * Welcome / home view.
 *
 * Two columns at desktop width — hero + CTA + template strip on the
 * left, recent projects + tour CTA on the right. Below the
 * `tightening-threshold` of the `Adw.Clamp`, both columns reflow to a
 * single stacked layout.
 *
 * Template cards render a **live map preview** for each
 * `STARTER_TEMPLATES` entry by loading its `game-project.json` and
 * compositing the first map's tiles via {@link MapPreview}. Picking a
 * card emits `template-selected::<id>` so the application window can
 * load that template into the editor — the same code path as "Open
 * Project" with a known starting file.
 */
export class WelcomeView extends Adw.Bin {
  declare _hero_icon: ProjectHeroIcon
  declare _create_button: Gtk.Button
  declare _open_button: Gtk.Button
  declare _browse_button: Gtk.Button
  declare _tour_button: Gtk.Button
  declare _templates_grid: Gtk.FlowBox
  declare _recents_list: Gtk.ListBox
  declare _empty_recents_row: Adw.ActionRow
  declare _sessions_list: Gtk.ListBox
  declare _empty_sessions_row: Adw.ActionRow
  declare _join_link_row: Adw.EntryRow
  declare _join_link_button: Gtk.Button

  private _recentRows: Gtk.Widget[] = []
  /** `name` → row, so `service-gone` events can remove the right entry. */
  private _sessionRows = new Map<string, Gtk.ListBoxRow>()
  private _inspectorCollapsed = false
  private _showInspector = false

  private signals = new SignalScope()

  static {
    GObject.registerClass(
      {
        GTypeName: 'WelcomeView',
        Template,
        InternalChildren: [
          'hero_icon',
          'create_button',
          'open_button',
          'browse_button',
          'tour_button',
          'templates_grid',
          'recents_list',
          'empty_recents_row',
          'sessions_list',
          'empty_sessions_row',
          'join_link_row',
          'join_link_button',
        ],
        Properties: {
          // Mirror SceneEditorView + AtlasView so the same
          // breakpoint setters in application-window.blp apply
          // uniformly across all three views.
          'inspector-collapsed': GObject.ParamSpec.boolean(
            'inspector-collapsed',
            'Inspector Collapsed',
            'Whether the recents sidebar collapses to a drawer (set by the window breakpoint)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
          'show-inspector': GObject.ParamSpec.boolean(
            'show-inspector',
            'Show inspector',
            'Whether the right-side recent-projects panel is visible',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
        Signals: {
          'create-project': {},
          'open-project': {},
          'browse-projects': {},
          'take-tour': {},
          'template-selected': { param_types: [GObject.TYPE_STRING] },
          'recent-selected': { param_types: [GObject.TYPE_STRING] },
          // Emitted when the user picks a discovered LAN session.
          // Param: the same `DiscoveredService` shape the session
          // bus delivered — `SessionService.joinLan(service)` reads
          // every field straight off it.
          'session-selected': { param_types: [GObject.TYPE_JSOBJECT] },
          // Emitted when the user submits the paste-link / room-code
          // entry. Param is the room id extracted from either a bare
          // code or a `pixelrpg://join/<roomid>` URL.
          'join-by-code': { param_types: [GObject.TYPE_STRING] },
        },
      },
      WelcomeView,
    )
  }

  get inspectorCollapsed(): boolean {
    return this._inspectorCollapsed ?? false
  }

  set inspectorCollapsed(value: boolean) {
    if (this._inspectorCollapsed === value) return
    this._inspectorCollapsed = value
    this.notify('inspector-collapsed')
  }

  get showInspector(): boolean {
    return this._showInspector ?? false
  }

  set showInspector(value: boolean) {
    if (this._showInspector === value) return
    this._showInspector = value
    this.notify('show-inspector')
  }

  constructor() {
    super()
    this._buildTemplateGrid()
  }

  vfunc_map(): void {
    super.vfunc_map()
    this.signals.connect(this._create_button, 'clicked', () => this.emit('create-project'))
    this.signals.connect(this._open_button, 'clicked', () => this.emit('open-project'))
    this.signals.connect(this._browse_button, 'clicked', () => this.emit('browse-projects'))
    this.signals.connect(this._tour_button, 'clicked', () => this.emit('take-tour'))
    this.signals.connect(this._join_link_button, 'clicked', () => this._submitJoinLink())
    // Pressing Enter in the entry submits — same path as the button.
    this.signals.connect(this._join_link_row, 'entry-activated', () => this._submitJoinLink())
  }

  vfunc_unmap(): void {
    this.signals.disconnectAll()
    super.vfunc_unmap()
  }

  /**
   * Populate the recent-projects list. Passing an empty array (or
   * never calling this) keeps the built-in "No recent projects"
   * placeholder visible.
   */
  setRecentProjects(recents: RecentProject[]): void {
    for (const row of this._recentRows) this._recents_list.remove(row)
    this._recentRows = []

    if (!recents.length) {
      this._empty_recents_row.set_visible(true)
      return
    }
    this._empty_recents_row.set_visible(false)

    for (const recent of recents) {
      const row = new Adw.ActionRow({
        title: recent.name,
        subtitle: recent.caption || recent.path,
        activatable: true,
      })
      row.add_prefix(new Gtk.Image({ icon_name: 'folder-symbolic', pixel_size: 22 }))
      row.add_suffix(new Gtk.Image({ icon_name: 'go-next-symbolic', pixel_size: 12 }))
      row.connect('activated', () => this.emit('recent-selected', recent.path))
      this._recents_list.append(row)
      this._recentRows.push(row)
    }
  }

  /**
   * Add a row to the "Sessions on this network" list. Idempotent —
   * a second call with the same `service.name` updates the existing
   * row instead of duplicating it (Avahi can re-resolve a service
   * if its TXT or address changes mid-session).
   */
  addDiscoveredService(service: DiscoveredService): void {
    const existing = this._sessionRows.get(service.name)
    if (existing) this._sessions_list.remove(existing)

    this._empty_sessions_row.set_visible(false)

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

    // Adw.ActionRow wraps itself in a Gtk.ListBoxRow when appended
    // to a list; grab the wrapper so service-gone can remove it.
    const wrapper = action.get_parent()
    if (wrapper instanceof Gtk.ListBoxRow) this._sessionRows.set(service.name, wrapper)
  }

  /** Remove a row previously added via {@link addDiscoveredService}. */
  removeDiscoveredService(serviceName: string): void {
    const wrapper = this._sessionRows.get(serviceName)
    if (!wrapper) return
    this._sessions_list.remove(wrapper)
    this._sessionRows.delete(serviceName)
    if (this._sessionRows.size === 0) this._empty_sessions_row.set_visible(true)
  }

  /** Drop every discovered row — host typically calls this on stopBrowsing. */
  clearDiscoveredServices(): void {
    for (const row of this._sessionRows.values()) this._sessions_list.remove(row)
    this._sessionRows.clear()
    this._empty_sessions_row.set_visible(true)
  }

  /**
   * Read the paste-link entry, normalise (`pixelrpg://join/<roomid>`
   * URL or bare room id), and emit `join-by-code` with the room id.
   * No-op + clears the entry on invalid input — the field's
   * "subtitle" position is reserved for the future error message.
   */
  private _submitJoinLink(): void {
    const raw = this._join_link_row.get_text().trim()
    if (!raw) return
    // Either a full pixelrpg:// URL or a bare room id token.
    const intent = parsePixelrpgUrl(raw)
    const roomId = intent?.kind === 'join' ? intent.roomId : raw.replace(/^\W+|\W+$/g, '')
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(roomId)) return
    this._join_link_row.set_text('')
    this.emit('join-by-code', roomId)
  }

  private _buildTemplateGrid(): void {
    // FlowBox handles the row/col math itself — cards reflow per
    // allocated width thanks to the `max-children-per-line: 3` cap
    // (see welcome-view.blp). `append` puts each card at the next
    // flow position; no manual index → (row, col) translation
    // needed.
    for (const template of STARTER_TEMPLATES) {
      const button = this._buildTemplateCard(template)
      this._templates_grid.append(button)
    }
  }

  private _buildTemplateCard(template: { id: string; name: string; caption: string; projectPath: string; accentColor: string }): Gtk.Button {
    const button = new Gtk.Button({ css_classes: ['card'] })
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 8,
      margin_top: 10,
      margin_bottom: 10,
      margin_start: 10,
      margin_end: 10,
    })

    const preview = new MapPreview()
    preview.accentColor = template.accentColor
    preview.set_size_request(150, 88)
    preview.add_css_class('engine-canvas')
    // Defer the load to the next tick so the grid lays out first and
    // the four previews don't all block the main loop in a row.
    void Promise.resolve().then(() => preview.loadProject(template.projectPath))

    const name = new Gtk.Label({ label: template.name, halign: Gtk.Align.START })
    name.add_css_class('heading')
    const caption = new Gtk.Label({ label: template.caption, halign: Gtk.Align.START })
    caption.add_css_class('caption')
    caption.add_css_class('dim-label')

    box.append(preview)
    box.append(name)
    box.append(caption)
    button.set_child(box)
    button.connect('clicked', () => this.emit('template-selected', template.id))
    return button
  }
}

GObject.type_ensure(WelcomeView.$gtype)
