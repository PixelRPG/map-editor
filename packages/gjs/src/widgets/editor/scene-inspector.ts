import Adw from '@girs/adw-1'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { GameProjectResource } from '@pixelrpg/engine'
import type { SampleScene, SampleTeleport } from '../../__demo__/world-sample'
import { MapPreview } from './map-preview'
import { MiniMap } from './mini-map'

import Template from './scene-inspector.blp'

GObject.type_ensure(MiniMap.$gtype)
GObject.type_ensure(MapPreview.$gtype)

interface TeleportSummary {
  label: string
  /** Other-scene id (destination when outgoing, source when incoming). */
  otherSceneId: string
  /** Pre-formatted display name of the other scene. */
  otherSceneName: string
  direction: 'in' | 'out'
}

/**
 * Right-pane inspector for the **Atlas (World)** view.
 *
 * Shows the selected scene's preview, name + tile size + music subtitle,
 * a 2×2 stat grid (NPCs / Events / In / Out), the per-direction
 * teleport list, and a primary "Open Scene" action.
 *
 * When no scene is selected, falls back to a centred
 * `Adw.StatusPage` empty state.
 */
export class SceneInspector extends Adw.Bin {
  declare _preview_slot: Adw.Bin
  declare _name_label: Gtk.Label
  declare _subtitle_label: Gtk.Label
  declare _stats_grid: Gtk.Grid
  declare _teleports_group: Adw.PreferencesGroup
  declare _lock_group: Adw.PreferencesGroup
  declare _lock_row: Adw.SwitchRow
  declare _open_button: Gtk.Button
  declare _empty_state: Adw.StatusPage
  declare _body: Gtk.Box

  private _scene: SampleScene | null = null
  private _preview: Gtk.Widget | null = null
  private _projectResource: GameProjectResource | null = null
  private _statRows: Gtk.Widget[] = []
  private _teleportRows: Adw.ActionRow[] = []
  private _collapsed = false
  /** Guards the lock switch against programmatic-update feedback. */
  private _syncingLock = false

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgSceneInspector',
        Template,
        InternalChildren: [
          'preview_slot',
          'name_label',
          'subtitle_label',
          'stats_grid',
          'teleports_group',
          'lock_group',
          'lock_row',
          'open_button',
          'empty_state',
          'body',
        ],
        Signals: {
          // The user flipped the viewport-lock switch — payload
          // `true` = open/pannable. Programmatic `setPreviewLock`
          // updates do NOT re-emit.
          'preview-lock-changed': { param_types: [GObject.TYPE_BOOLEAN] },
        },
        Properties: {
          'scene-name': GObject.ParamSpec.string(
            'scene-name',
            'Scene name',
            'Title shown for the active scene',
            GObject.ParamFlags.READABLE,
            '',
          ),
          'subtitle-text': GObject.ParamSpec.string(
            'subtitle-text',
            'Subtitle',
            'Size + music caption',
            GObject.ParamFlags.READABLE,
            '',
          ),
          empty: GObject.ParamSpec.boolean(
            'empty',
            'Empty',
            'Whether the empty-state should be shown',
            GObject.ParamFlags.READABLE,
            true,
          ),
          'has-teleports': GObject.ParamSpec.boolean(
            'has-teleports',
            'Has teleports',
            'Whether the teleport list group should be visible',
            GObject.ParamFlags.READABLE,
            false,
          ),
          // Mirrors the parent view's `inspector-collapsed` — drives
          // the in-overlay close button. See
          // `docs/concepts/responsive-chrome.md` § "In-overlay close
          // affordance".
          collapsed: GObject.ParamSpec.boolean(
            'collapsed',
            'Collapsed',
            'Whether the inspector is in overlay-drawer mode (narrow widths)',
            GObject.ParamFlags.READWRITE,
            false,
          ),
        },
      },
      SceneInspector,
    )
  }

  /**
   * Set the inspected scene and the full teleport list for the world.
   * Optionally pass the loaded `GameProjectResource` so the preview can
   * render the scene's real tile data via {@link MapPreview} instead
   * of the synthetic mini-map placeholder.
   */
  setScene(
    scene: SampleScene | null,
    allScenes: SampleScene[] = [],
    teleports: SampleTeleport[] = [],
    projectResource: GameProjectResource | null = null,
  ): void {
    this._scene = scene
    this._projectResource = projectResource
    this._refreshPreview()
    this._refreshStats(scene, teleports)
    this._refreshTeleports(scene, allScenes, teleports)
    this._refreshChromeVisibility()
    this.notify('scene-name')
    this.notify('subtitle-text')
    this.notify('empty')
    this.notify('has-teleports')
  }

  get sceneName(): string {
    return this._scene?.name ?? ''
  }

  get subtitleText(): string {
    if (!this._scene) return ''
    const cols = this._scene.rows[0]?.length || this._scene.cols || 0
    const rows = this._scene.rows.length || this._scene.previewRows || 0
    const music = this._scene.music ?? 'no music'
    return `${cols}×${rows} tiles · ${music}`
  }

  get empty(): boolean {
    return this._scene == null
  }

  get hasTeleports(): boolean {
    return (this._teleportRows?.length ?? 0) > 0
  }

  get collapsed(): boolean {
    return this._collapsed
  }

  set collapsed(value: boolean) {
    if (this._collapsed === value) return
    this._collapsed = value
    this.notify('collapsed')
  }

  constructor() {
    super()
    this._lock_row.connect('notify::active', () => {
      if (this._syncingLock) return
      this.emit('preview-lock-changed', this._lock_row.active)
    })
  }

  /**
   * Mirror the selected card's viewport-lock state into the switch.
   * `null` hides the row (scene without a viewport preview / no
   * selection). Programmatic — does not re-emit `preview-lock-changed`.
   */
  setPreviewLock(unlocked: boolean | null): void {
    this._syncingLock = true
    try {
      this._lock_group.set_visible(unlocked !== null && this._scene != null)
      if (unlocked !== null) this._lock_row.set_active(unlocked)
    } finally {
      this._syncingLock = false
    }
  }

  private _refreshPreview(): void {
    if (this._preview) {
      this._preview_slot.set_child(null)
      this._preview = null
    }
    if (!this._scene) return

    const cols = this._scene.rows[0]?.length || this._scene.cols || 1
    const rows = this._scene.rows.length || this._scene.previewRows || 1
    const desiredWidth = 240
    const desiredHeight = 180
    const tilePx = Math.max(1, Math.floor(Math.min(desiredWidth / cols, desiredHeight / rows)))

    // Real-project path: render the scene's tile data via MapPreview.
    if (this._projectResource?.maps.has(this._scene.id)) {
      const preview = new MapPreview()
      preview.accentColor = this._scene.previewColor ?? '#3a3a40'
      preview.set_size_request(desiredWidth, desiredHeight)
      this._preview_slot.set_child(preview)
      this._preview = preview
      void preview.setFromResource(this._projectResource, this._scene.id)
      return
    }

    // Sample-data path: fall back to the existing MiniMap.
    const map = new MiniMap({ tilePx })
    if (this._scene.rows.length) {
      map.setRows(this._scene.rows)
    } else {
      map.setPlaceholder(cols, rows, tilePx, this._scene.previewColor)
    }
    this._preview_slot.set_child(map)
    this._preview = map
  }

  private _refreshStats(scene: SampleScene | null, teleports: SampleTeleport[]): void {
    for (const row of this._statRows) this._stats_grid.remove(row)
    this._statRows = []

    if (!scene) return

    const incoming = teleports.filter((t) => t.to === scene.id).length
    const outgoing = teleports.filter((t) => t.from === scene.id).length

    const stats: { label: string; value: string }[] = [
      { label: 'NPCs', value: String(scene.npcs?.length ?? 0) },
      { label: 'Events', value: String(scene.events) },
      { label: 'In', value: String(incoming) },
      { label: 'Out', value: String(outgoing) },
    ]

    stats.forEach((stat, index) => {
      const card = this._buildStatCard(stat.label, stat.value)
      this._stats_grid.attach(card, index % 2, Math.floor(index / 2), 1, 1)
      this._statRows.push(card)
    })
  }

  private _buildStatCard(label: string, value: string): Gtk.Widget {
    const frame = new Gtk.Frame()
    frame.add_css_class('card')
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      margin_top: 8,
      margin_bottom: 8,
      margin_start: 12,
      margin_end: 12,
      spacing: 0,
    })
    const valueLabel = new Gtk.Label({ label: value, halign: Gtk.Align.START })
    valueLabel.add_css_class('title-2')
    valueLabel.add_css_class('numeric')
    const captionLabel = new Gtk.Label({ label, halign: Gtk.Align.START })
    captionLabel.add_css_class('caption')
    captionLabel.add_css_class('dim-label')
    box.append(valueLabel)
    box.append(captionLabel)
    frame.set_child(box)
    return frame
  }

  private _refreshTeleports(scene: SampleScene | null, allScenes: SampleScene[], teleports: SampleTeleport[]): void {
    for (const row of this._teleportRows) this._teleports_group.remove(row)
    this._teleportRows = []

    if (!scene) return

    const byId = new Map(allScenes.map((s) => [s.id, s]))
    const summaries: TeleportSummary[] = []
    for (const t of teleports) {
      if (t.from === scene.id) {
        summaries.push({
          label: t.label,
          otherSceneId: t.to,
          otherSceneName: byId.get(t.to)?.name ?? t.to,
          direction: 'out',
        })
      } else if (t.to === scene.id) {
        summaries.push({
          label: t.label,
          otherSceneId: t.from,
          otherSceneName: byId.get(t.from)?.name ?? t.from,
          direction: 'in',
        })
      }
    }

    for (const t of summaries) {
      const row = new Adw.ActionRow({
        title: t.label,
        subtitle: t.direction === 'out' ? `→ ${t.otherSceneName}` : `← ${t.otherSceneName}`,
      })
      const icon = new Gtk.Image({
        icon_name: t.direction === 'out' ? 'go-next-symbolic' : 'go-previous-symbolic',
      })
      row.add_prefix(icon)
      this._teleports_group.add(row)
      this._teleportRows.push(row)
    }
  }

  private _refreshChromeVisibility(): void {
    const populated = this._scene != null
    this._preview_slot.set_visible(populated)
    this._name_label.set_visible(populated)
    this._subtitle_label.set_visible(populated)
    this._stats_grid.set_visible(populated)
    this._open_button.set_visible(populated)
    this._empty_state.set_visible(!populated)
    // Re-shown per selection via `setPreviewLock` — default hidden.
    if (!populated) this._lock_group.set_visible(false)
  }
}

GObject.type_ensure(SceneInspector.$gtype)
