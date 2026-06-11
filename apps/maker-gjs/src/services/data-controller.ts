import {
  createProjectMetaUpdateOp,
  GameProjectFormat,
  type SpriteSetData,
  type SpriteSetKind,
  type SpriteSetResource,
} from '@pixelrpg/engine'
import { GdkSpriteSetResource } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import type { DataAssetRow, DataView, DataViewModel } from '../widgets/data-view.ts'
import type { CollabSession } from './collab-session.ts'
import { writeTextFile } from './file-io.ts'
import type { LoadedProject } from './project-loader.ts'
import { isCharacterSpriteSet } from './sprite-set-classification.ts'
import { countCharacterUsers, countMapUsers } from './sprite-set-usage.ts'

/** Thumbnail edge passed to the sheet downscaler (≥ the row size, for sharpness). */
const THUMB_PX = 96

/**
 * Owns the Data view's "Assets and project" model: builds the asset
 * list (sprite sheets + tilesets, each with a thumbnail, metadata and a
 * "used by" count from the reference graph), persists project-metadata
 * edits, and renames an asset's display name. Asset import/delete +
 * "open" are routed by the host (application-window) to the shared
 * `CastController` / actions so there's one owner of the files.
 */
export class DataController {
  private _project: LoadedProject | null = null
  /**
   * Active collab session, when one is live. Set by the host window on
   * session start/stop. While set, every metadata edit also broadcasts
   * a `__project/meta.update` so peers stay in sync; inbound ops land
   * via the single applier (`CastController.applyRemoteProjectOp`),
   * which asks the host to re-hydrate this controller. Null in solo
   * editing — then edits only persist locally.
   */
  private _session: CollabSession | null = null

  constructor(
    private readonly view: DataView,
    private readonly onToast: (message: string) => void,
  ) {}

  /**
   * Attach/detach the live collab session. While attached, metadata
   * edits broadcast to peers; detaching (null) returns to local-only
   * editing.
   */
  setCollabSession(session: CollabSession | null): void {
    this._session = session
  }

  setProject(project: LoadedProject | null): void {
    this._project = project
    if (!project) {
      this.view.setData(null)
      return
    }
    void this._rebuild()
  }

  /** Persist a single project-metadata field edit (no row re-render). */
  setProjectField(field: 'name' | 'author' | 'version' | 'description' | 'tileSize', value: string): void {
    const data = this._project?.resource?.data
    if (!data) return
    const props = (data.properties ??= {})
    switch (field) {
      case 'name':
        data.name = value
        props.gameTitle = value
        break
      case 'author':
        props.author = value
        break
      case 'version':
        props.version = value
        break
      case 'description':
        props.description = value
        break
      case 'tileSize': {
        const n = Number.parseInt(value, 10)
        if (Number.isFinite(n) && n > 0) props.defaultTileSize = n
        break
      }
    }
    this._persistProject()
    // Coarse broadcast: the whole name + properties bag, so the
    // receiver replaces wholesale (idempotent, mirrors entity.upsert).
    this._session?.sendProjectOp(({ peerId, seq }) =>
      createProjectMetaUpdateOp({ peerId, seq, name: data.name, properties: props }),
    )
  }

  private _persistProject(): void {
    const resource = this._project?.resource
    if (!resource?.data) return
    try {
      if (!writeTextFile(resource.path, GameProjectFormat.serialize(resource.data))) {
        this.onToast(_('Could not save project'))
      }
    } catch (err) {
      console.warn('[DataController] Failed to persist project:', err)
      this.onToast(_('Could not save project'))
    }
  }

  /** Rebuild the whole view model: project metadata + asset rows + usage. */
  private async _rebuild(): Promise<void> {
    const resource = this._project?.resource
    if (!resource?.data) {
      this.view.setData(null)
      return
    }
    const data = resource.data
    const props = data.properties ?? {}

    const charUsers = countCharacterUsers(resource)
    const mapUsers = countMapUsers(resource)

    const sheets: DataAssetRow[] = []
    const tilesets: DataAssetRow[] = []
    for (const [id, engineSet] of resource.spriteSets) {
      const sd = engineSet.data
      if (!sd) continue
      const usedByChars = charUsers.get(id) ?? 0
      const isCharacter = isCharacterSpriteSet(sd.kind, usedByChars > 0)
      const row = await this._buildRow(
        id,
        engineSet,
        sd,
        isCharacter ? 'character' : 'tileset',
        usedByChars,
        mapUsers.get(id) ?? 0,
      )
      ;(isCharacter ? sheets : tilesets).push(row)
    }
    sheets.sort((a, b) => a.name.localeCompare(b.name))
    tilesets.sort((a, b) => a.name.localeCompare(b.name))

    const model: DataViewModel = {
      name: data.name ?? '',
      author: typeof props.author === 'string' ? props.author : '',
      version: typeof props.version === 'string' ? props.version : '',
      description: typeof props.description === 'string' ? props.description : '',
      tileSize: typeof props.defaultTileSize === 'number' ? props.defaultTileSize : 16,
      path: resource.path,
      sheets,
      tilesets,
    }
    this.view.setData(model)
  }

  private async _buildRow(
    id: string,
    engineSet: SpriteSetResource,
    sd: SpriteSetData,
    kind: SpriteSetKind,
    usedByChars: number,
    usedByMaps: number,
  ): Promise<DataAssetRow> {
    const width = sd.columns * sd.spriteWidth
    const height = sd.rows * sd.spriteHeight
    const count = sd.sprites?.length ?? 0
    const unit =
      kind === 'character' ? (count === 1 ? _('sprite') : _('sprites')) : count === 1 ? _('tile') : _('tiles')
    let paintable = null
    try {
      const gdk = await GdkSpriteSetResource.fromEngineResource(engineSet)
      paintable =
        kind === 'character'
          ? (gdk.getSprite(0)?.createPaintable({ keepAspectRatio: true }) ?? null)
          : gdk.createSheetThumbnail(THUMB_PX)
    } catch (err) {
      console.warn('[DataController] Failed to build asset thumbnail:', err)
    }
    return {
      id,
      name: sd.name || id,
      kind,
      paintable,
      meta: `${width}×${height} · ${count} ${unit}`,
      usedBy: usedByChars + usedByMaps,
    }
  }
}
