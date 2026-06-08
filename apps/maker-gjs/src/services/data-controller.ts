import GLib from '@girs/glib-2.0'
import {
  GameProjectFormat,
  type SpriteSetData,
  SpriteSetFormat,
  type SpriteSetKind,
  type SpriteSetResource,
} from '@pixelrpg/engine'
import { GdkSpriteSetResource } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import type { DataAssetRow, DataView, DataViewModel } from '../widgets/data-view.ts'
import { readBinaryFile, writeTextFile } from './file-io.ts'
import type { LoadedProject } from './project-loader.ts'

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

  constructor(
    private readonly view: DataView,
    private readonly onToast: (message: string) => void,
  ) {}

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
  }

  /** Rename an asset's display name (the `name` in its sprite-set JSON). */
  renameSpriteSet(id: string, name: string): void {
    const resource = this._project?.resource
    const engineSet = resource?.spriteSets.get(id)
    const trimmed = name.trim()
    if (!resource || !engineSet?.data || !trimmed) return
    engineSet.data.name = trimmed
    const projectDir = GLib.path_get_dirname(resource.path)
    const jsonPath = GLib.build_filenamev([projectDir, 'spritesets', `${id}.json`])
    if (!writeTextFile(jsonPath, SpriteSetFormat.serialize(engineSet.data))) {
      this.onToast(_('Could not rename the asset'))
      return
    }
    void this._rebuild()
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

    const charUsers = this._countCharacterUsers(resource)
    const mapUsers = this._countMapUsers(resource)

    const sheets: DataAssetRow[] = []
    const tilesets: DataAssetRow[] = []
    for (const [id, engineSet] of resource.spriteSets) {
      const sd = engineSet.data
      if (!sd) continue
      const usedByChars = charUsers.get(id) ?? 0
      const isCharacter = sd.kind === 'character' || usedByChars > 0
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

  /** spriteSetId → number of characters referencing it. */
  private _countCharacterUsers(resource: LoadedProject['resource']): Map<string, number> {
    const out = new Map<string, number>()
    for (const c of resource.data?.characters ?? []) {
      out.set(c.spriteSetId, (out.get(c.spriteSetId) ?? 0) + 1)
    }
    return out
  }

  /**
   * spriteSetId → number of maps referencing it. Reads each map JSON's
   * `spriteSets[]` directly (maps aren't preloaded). Best-effort: an
   * unreadable/garbled map is skipped, not fatal.
   */
  private _countMapUsers(resource: LoadedProject['resource']): Map<string, number> {
    const out = new Map<string, number>()
    const projectDir = GLib.path_get_dirname(resource.path)
    for (const mapRef of resource.data?.maps ?? []) {
      try {
        const mapPath = GLib.build_filenamev([projectDir, mapRef.path.replace(/^\.\//, '')])
        const bytes = readBinaryFile(mapPath)
        if (!bytes) continue
        const mapData = JSON.parse(new TextDecoder().decode(bytes)) as { spriteSets?: { id: string }[] }
        for (const s of mapData.spriteSets ?? []) {
          out.set(s.id, (out.get(s.id) ?? 0) + 1)
        }
      } catch {
        // skip unreadable/garbled map
      }
    }
    return out
  }
}
