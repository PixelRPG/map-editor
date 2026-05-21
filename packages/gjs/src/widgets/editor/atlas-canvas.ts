import Adw from '@girs/adw-1'
import type { GameProjectResource } from '@pixelrpg/engine'
import GObject from '@girs/gobject-2.0'
import Gtk from '@girs/gtk-4.0'
import type { SampleScene, SampleTeleport } from '../../__demo__/world-sample'
import { MapPreview } from './map-preview'
import { SceneCard } from './scene-card'
import { TeleportOverlay } from './teleport-overlay'

import Template from './atlas-canvas.blp'

GObject.type_ensure(SceneCard.$gtype)
GObject.type_ensure(TeleportOverlay.$gtype)
GObject.type_ensure(MapPreview.$gtype)

const SURFACE_PADDING = 180

/**
 * Scrollable atlas surface — the "World" home view.
 *
 * Composition:
 * - `Gtk.ScrolledWindow` provides pan via native scroll / drag.
 * - `Gtk.Fixed` holds the scene cards at absolute atlas-space coords.
 *   `.atlas-surface` CSS paints the dotted backdrop.
 * - `Gtk.Overlay` lays a {@link TeleportOverlay} over the cards so the
 *   bezier teleport connections render on top.
 *
 * Selection: clicking a `SceneCard` updates the active id, emits
 * `scene-selected`, and dims unrelated teleports via the overlay.
 * Double-clicking (or pressing Enter on a focused card) emits
 * `scene-opened`, which the host handles to switch to the scene editor.
 */
export class AtlasCanvas extends Adw.Bin {
  declare _scroller: Gtk.ScrolledWindow
  declare _overlay: Gtk.Overlay
  declare _surface: Gtk.Fixed
  declare _teleports: TeleportOverlay

  private _scenes: SampleScene[] = []
  private _teleportData: SampleTeleport[] = []
  private _cards: Map<string, SceneCard> = new Map()
  private _selectedId: string | null = null
  private _projectResource: GameProjectResource | null = null

  static {
    GObject.registerClass(
      {
        GTypeName: 'PixelRpgAtlasCanvas',
        Template,
        InternalChildren: ['scroller', 'overlay', 'surface', 'teleports'],
        Properties: {
          'selected-id': GObject.ParamSpec.string(
            'selected-id',
            'Selected ID',
            'ID of the currently selected scene, or empty if none',
            GObject.ParamFlags.READWRITE,
            '',
          ),
        },
        Signals: {
          'scene-selected': { param_types: [GObject.TYPE_STRING] },
          'scene-opened': { param_types: [GObject.TYPE_STRING] },
        },
      },
      AtlasCanvas,
    )
  }

  /**
   * Populate the canvas from sample-world descriptors. Pass the loaded
   * `GameProjectResource` to render real `MapPreview`s in each card
   * instead of the synthetic mini-map placeholder.
   */
  setWorld(
    scenes: SampleScene[],
    teleports: SampleTeleport[],
    projectResource: GameProjectResource | null = null,
  ): void {
    this._scenes = scenes
    this._teleportData = teleports
    this._projectResource = projectResource
    this._rebuildCards()
    this._teleports.setWorld(scenes, teleports, 1)
    this._sizeSurface()
  }

  get selectedId(): string {
    return this._selectedId ?? ''
  }

  set selectedId(value: string) {
    const newId = value || null
    if (this._selectedId === newId) return
    this._selectedId = newId
    for (const [id, card] of this._cards) {
      card.selected = id === newId
    }
    this._teleports.setSelected(newId)
    this.notify('selected-id')
  }

  private _rebuildCards(): void {
    for (const [, card] of this._cards) this._surface.remove(card)
    this._cards.clear()

    for (const scene of this._scenes) {
      const card = new SceneCard()
      card.setScene(scene)
      this._injectPreviewIfAvailable(card, scene)
      card.connect('clicked', () => {
        if (card.isDragging) return
        this.selectedId = scene.id
        this.emit('scene-selected', scene.id)
      })
      card.connect('scene-activated', () => {
        this.emit('scene-opened', scene.id)
      })
      this._wireDrag(scene.id, card)
      this._cards.set(scene.id, card)
      this._surface.put(card, scene.x, scene.y)
    }
  }

  /**
   * For real projects (where the host passed us a `GameProjectResource`),
   * swap the card's default mini-map placeholder for a `MapPreview`
   * that paints the scene's actual tile data. Falls through to the
   * default placeholder if the resource has no matching map.
   */
  private _injectPreviewIfAvailable(card: SceneCard, scene: SampleScene): void {
    if (!this._projectResource) return
    if (!this._projectResource.maps.has(scene.id)) return

    const cols = scene.cols ?? 0
    const previewRows = scene.previewRows ?? 0
    if (!cols || !previewRows) return

    const preview = new MapPreview()
    preview.set_size_request(cols * scene.tilePx, previewRows * scene.tilePx)
    card.setPreviewWidget(preview)
    void preview.setFromResource(this._projectResource, scene.id)
  }

  private _wireDrag(sceneId: string, card: SceneCard): void {
    let originX = 0
    let originY = 0
    card.connect('scene-drag-begin', () => {
      const scene = this._scenes.find((s) => s.id === sceneId)
      if (!scene) return
      originX = scene.x
      originY = scene.y
      this.selectedId = sceneId
      this.emit('scene-selected', sceneId)
    })
    card.connect('scene-drag-update', (_c: SceneCard, dx: number, dy: number) => {
      const x = Math.max(0, originX + dx)
      const y = Math.max(0, originY + dy)
      this._surface.move(card, x, y)
      this._refreshTeleportSelection()
    })
    card.connect('scene-drag-end', (_c: SceneCard, dx: number, dy: number) => {
      const scene = this._scenes.find((s) => s.id === sceneId)
      if (!scene) return
      scene.x = Math.max(0, originX + dx)
      scene.y = Math.max(0, originY + dy)
      this._surface.move(card, scene.x, scene.y)
      this._sizeSurface()
      this._teleports.setWorld(this._scenes, this._teleportData, 1)
    })
  }

  private _refreshTeleportSelection(): void {
    // Re-publish the world so the overlay redraws against the moved cards
    // mid-drag. Cheap enough to do on every motion event.
    this._teleports.setWorld(this._scenes, this._teleportData, 1)
  }

  private _sizeSurface(): void {
    let maxX = 0
    let maxY = 0
    for (const s of this._scenes) {
      const w = (s.rows[0]?.length ?? 0) * s.tilePx
      const h = s.rows.length * s.tilePx
      maxX = Math.max(maxX, s.x + w)
      maxY = Math.max(maxY, s.y + h)
    }
    const targetW = maxX + SURFACE_PADDING * 2
    const targetH = maxY + SURFACE_PADDING * 2
    this._surface.set_size_request(targetW, targetH)
    this._teleports.set_size_request(targetW, targetH)
  }
}

GObject.type_ensure(AtlasCanvas.$gtype)
