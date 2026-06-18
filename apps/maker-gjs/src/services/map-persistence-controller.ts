import { type MapEditorData, type MapResource, MapFormat } from '@pixelrpg/engine'
import type { SampleScene } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import { writeTextFile } from './file-io.ts'
import { withAtlasPosition, withPreviewViewport } from './map-editor-data.ts'

/**
 * What the controller needs from its host (the {@link ApplicationWindow}),
 * injected as accessors so it always reads the window's live state and
 * stays unit-constructible without a real window.
 */
export interface MapPersistenceHost {
  /** Resolve a loaded map's resource by id, or `null` when not loaded. */
  getMapResource(mapId: string): MapResource | null
  /** The in-memory atlas/preview scene mirror for a map, or `null`. */
  getScene(mapId: string): SampleScene | null
  /** Id of the map currently open in the scene editor, or `null`. */
  getCurrentSceneId(): string | null
  /** Surface a best-effort-failure message to the user (a toast). */
  showError(message: string): void
  /**
   * Broadcast a map's editor-data change to peers in a live session — the
   * `__project/map.editor-data` project-op. No-op when editing solo. The
   * op plumbing stays with the host (collab is its concern); the
   * controller only signals what changed.
   */
  sendMapEditorDataChange(mapId: string, editorData: MapEditorData): void
}

/**
 * Owns the maker's map-file persistence — serialising a `MapData` back to
 * its source JSON and the editor-data (atlas position / preview viewport)
 * writes that ride alongside. Extracted out of the `ApplicationWindow`
 * god-object so the window stays a thin coordinator (ApplicationWindow
 * split, step 2). All writes are best-effort: a failure toasts but the
 * in-memory mutation stays, so the user keeps seeing their change.
 */
export class MapPersistenceController {
  constructor(private readonly host: MapPersistenceHost) {}

  /**
   * Persist the currently-open map. Called after an in-place mutation the
   * scene editor made (layer visibility/lock, object removal, …) and
   * before entering play. No-op when no scene is open.
   */
  persistCurrentMap(): void {
    const mapId = this.host.getCurrentSceneId()
    if (!mapId) return
    this.persistMap(mapId, _('Could not save layer changes'))
  }

  /**
   * Write the atlas-card coordinates the user just dragged back into the
   * map's source JSON. In-memory state always updates so the card position
   * survives the session even if the disk write fails; in a live session
   * the move also rides a `__project/map.editor-data` op (atlas drags
   * happen with no live scene, so the Command/op-log path isn't available
   * — see AGENTS.md transport rule 2's project-op exception).
   */
  persistAtlasPosition(mapId: string, atlasX: number, atlasY: number): void {
    const mapResource = this.host.getMapResource(mapId)
    if (!mapResource?.mapData) return
    mapResource.mapData.editorData = withAtlasPosition(mapResource.mapData.editorData, atlasX, atlasY)
    this.persistMap(mapId, _('Could not save atlas position'))
    this.host.sendMapEditorDataChange(mapId, { atlasX, atlasY })
  }

  /**
   * Persist the preview-viewport centre the user just panned on an atlas
   * card. Same flow as {@link persistAtlasPosition} plus an update to the
   * in-memory `SampleScene` mirror so the viewport stays stable when the
   * atlas re-renders (e.g. after a card move).
   */
  persistPreviewViewport(mapId: string, tileX: number, tileY: number): void {
    const mapResource = this.host.getMapResource(mapId)
    if (!mapResource?.mapData) return
    const editorData = withPreviewViewport(mapResource.mapData.editorData, tileX, tileY)
    mapResource.mapData.editorData = editorData
    const scene = this.host.getScene(mapId)
    if (scene) {
      scene.previewTileX = tileX
      scene.previewTileY = tileY
    }
    this.persistMap(mapId, _('Could not save preview section'))
    this.host.sendMapEditorDataChange(mapId, { preview: editorData.preview })
  }

  /**
   * Write a map's `MapData` back to its source JSON. Best-effort — a
   * failure toasts `errorMessage` but the in-memory mutation stays so the
   * user still sees their change in the editor. No-op for an unknown /
   * unloaded map id.
   */
  persistMap(mapId: string, errorMessage: string): void {
    const mapResource = this.host.getMapResource(mapId)
    if (!mapResource?.mapData) return
    const ok = writeTextFile(mapResource.sourcePath, MapFormat.serialize(mapResource.mapData))
    if (!ok) this.host.showError(errorMessage)
  }
}
