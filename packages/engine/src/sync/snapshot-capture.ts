import type { Engine } from '../engine.ts'
import { bytesToBase64 } from '../utils/base64.ts'
import { loadBinaryFile } from '../utils/file.ts'
import { isAbsoluteOrUrl, joinPaths } from '../utils/url.ts'
import { PROJECT_SNAPSHOT_VERSION, type ProjectSnapshot } from './project-snapshot.ts'

/**
 * Host side of the project-snapshot exchange: read the live project out
 * of a running {@link Engine} into the wire shape a joiner can write to
 * disk.
 *
 * Kept apart from the wire format itself because this is the only half
 * that needs an Engine — the receiving half (parse + apply) must stay
 * usable without one, and unit-testable without one too.
 */

/**
 * Capture the current project state as a {@link ProjectSnapshot}.
 *
 * `null` when no project is loaded — the caller should refuse to host a
 * session in that case, there is nothing to share.
 *
 * Read-only and safe to call mid-edit. The returned object holds
 * references to the engine's in-memory data; copy before mutating.
 */
export async function captureProjectSnapshot(engine: Engine): Promise<ProjectSnapshot | null> {
  const resource = engine.gameProjectResource
  if (!resource) return null
  const project = resource.data
  if (!project) return null

  const maps: ProjectSnapshot['maps'] = []
  for (const ref of project.maps) {
    // The editor lazy-loads maps (only the opened scene's map is in
    // memory), but the snapshot must be complete. Load any map the host
    // hasn't opened yet on demand — `resource.loadMap` only loads the
    // map DATA (no scene switch), so the host's active view is
    // untouched. A freshly-loaded map has no tilemap shadow, so the
    // `syncShadowToMapData` below correctly no-ops for it.
    const mapResource = resource.getMapResource(ref.id) ?? (await resource.loadMap(ref.id))
    // Fold the live editor shadow (MapEditorComponent.sprites) on every
    // tier's tilemap back into mapData.layers[].sprites[]. Paints mutate
    // the shadow only — without this sync the snapshot would ship the
    // load-time state and a late-joining peer would see the map as it
    // was when the host opened it, missing every paint since.
    mapResource.syncShadowToMapData()
    maps.push({ path: ref.path, data: mapResource.mapData })
  }

  const spriteSets: ProjectSnapshot['spriteSets'] = []
  for (const ref of project.spriteSets) {
    spriteSets.push(await captureSpriteSet(resource, ref))
  }

  return {
    version: PROJECT_SNAPSHOT_VERSION,
    projectFilename: 'game-project.json',
    project,
    maps,
    spriteSets,
  }
}

/**
 * One sprite-set entry: the JSON descriptor plus the referenced PNG,
 * base64-encoded inline.
 *
 * Every entry in `project.spriteSets[]` MUST resolve through the
 * resource map — a missing one means the host hasn't loaded its own
 * project (sprite-sets load eagerly at project-open time) and shipping
 * the snapshot would leave the joiner with broken sandbox references.
 *
 * Without the binary, the joiner's sandbox has the descriptor but no
 * pixels — the 2026-06-01 hand-test surfaced this as a hang on the
 * joiner (Excalibur's `ImageSource.load()` plus GdkPixbuf's SVG-fallback
 * path on the 404 body). `data:` / `http(s)://` / `file://` refs are
 * skipped: the bytes are already inside the JSON (the engine-bundled
 * scientist sprite) or reachable over the network from any peer.
 */
async function captureSpriteSet(
  resource: NonNullable<Engine['gameProjectResource']>,
  ref: { id: string; path: string },
): Promise<ProjectSnapshot['spriteSets'][number]> {
  const spriteSetResource = resource.spriteSets.get(ref.id)
  if (!spriteSetResource) {
    throw new Error(
      `captureProjectSnapshot: sprite-set "${ref.id}" referenced by project but not loaded — ` +
        `call engine.loadProject(...) first or check the project file for stale references.`,
    )
  }
  const data = spriteSetResource.data
  const images: Array<{ path: string; base64: string }> = []
  if (data.image && !isAbsoluteOrUrl(data.image.path)) {
    const imageDiskPath = joinPaths(spriteSetResource.imageBasePath, data.image.path)
    try {
      const bytes = await loadBinaryFile(imageDiskPath)
      images.push({ path: data.image.path, base64: bytesToBase64(bytes) })
    } catch (err) {
      // Fatal for the snapshot — the joiner cannot render this sprite-set
      // without the bytes. A typed error lets the host-side
      // `respondToRequest` decline cleanly (timeout on the joiner) rather
      // than ship a half-state snapshot.
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `captureProjectSnapshot: failed to read sprite-set image "${imageDiskPath}" for sprite-set "${ref.id}": ${msg}`,
      )
    }
  }
  return { path: ref.path, data, images }
}
