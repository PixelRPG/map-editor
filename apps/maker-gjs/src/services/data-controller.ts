import type { SpriteSetData, SpriteSetKind, SpriteSetResource } from '@pixelrpg/engine'
import { GdkSpriteSetResource } from '@pixelrpg/gjs'
import { gettext as _ } from 'gettext'

import type { DataAssetRow, DataView, DataViewModel } from '../widgets/data-view.ts'
import type { ProjectStore } from './project-store.ts'
import { isCharacterSpriteSet } from './sprite-set-classification.ts'
import { countCharacterUsers, countMapUsers } from './sprite-set-usage.ts'
import { TypedEmitter } from './typed-emitter.ts'

/** Thumbnail edge passed to the sheet downscaler (≥ the row size, for sharpness). */
const THUMB_PX = 96

/**
 * Typed event map for {@link DataController.on} — asset actions the
 * host window resolves (dialogs + cross-view navigation; this
 * controller stays dialog-free).
 */
export interface DataControllerEvents {
  /** The user asked to import an asset of `kind` (file-picker dialog). */
  'import-requested': { kind: SpriteSetKind }
  /** The user asked to open an asset in its editor (the Sheets view). */
  'open-requested': { id: string; kind: SpriteSetKind }
  /** The user asked to rename an asset (rename dialog). */
  'rename-requested': { id: string; currentName: string }
  /** The user asked to delete an asset (usage-aware confirm dialog). */
  'delete-requested': { id: string; name: string; usedBy: number }
}

/**
 * Owns the Data view's "Assets and project" model: builds the asset
 * list (sprite sheets + tilesets, each with a thumbnail, metadata and a
 * "used by" count from the reference graph) and routes project-metadata
 * edits into the {@link ProjectStore} — the single owner of project
 * persistence + the `__project/meta.update` collab broadcast. Asset
 * import / delete / rename / "open" need host dialogs, so they surface
 * as typed events the window subscribes to; the resulting mutations
 * land on the store, whose `sprite-sets-changed` /
 * `project-meta-changed` events re-hydrate this view.
 */
export class DataController {
  private readonly _events = new TypedEmitter<DataControllerEvents>()

  constructor(
    private readonly view: DataView,
    private readonly store: ProjectStore,
  ) {
    view.bindCallbacks({
      importAsset: (kind) => this._events.emit('import-requested', { kind }),
      openAsset: (id, kind) => this._events.emit('open-requested', { id, kind }),
      renameAsset: (id, currentName) => this._events.emit('rename-requested', { id, currentName }),
      deleteAsset: (id, name, usedBy) => this._events.emit('delete-requested', { id, name, usedBy }),
      setProjectField: (field, value) => this.setProjectField(field, value),
    })
    store.on('project-changed', (project) => {
      if (!project) {
        this.view.setData(null)
        return
      }
      void this._rebuild()
    })
    // The asset list mirrors the sprite-set library — re-hydrate on any
    // set change; an inbound peer meta update re-renders the metadata
    // rows (local edits don't, by design — no row re-render mid-typing).
    store.on('sprite-sets-changed', () => {
      if (this.store.project) void this._rebuild()
    })
    store.on('project-meta-changed', () => {
      if (this.store.project) void this._rebuild()
    })
  }

  /** Subscribe to a controller event. Returns an unsubscribe closure. */
  on<K extends keyof DataControllerEvents>(event: K, listener: (payload: DataControllerEvents[K]) => void): () => void {
    return this._events.on(event, listener)
  }

  /** Persist a single project-metadata field edit (no row re-render). */
  setProjectField(field: 'name' | 'author' | 'version' | 'description' | 'tileSize', value: string): void {
    const data = this.store.data
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
    // Persist + coarse broadcast (the whole name + properties bag, so
    // the receiver replaces wholesale — idempotent, mirrors entity.upsert).
    this.store.commitProjectMeta()
  }

  /** Rebuild the whole view model: project metadata + asset rows + usage. */
  private async _rebuild(): Promise<void> {
    const resource = this.store.resource
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
