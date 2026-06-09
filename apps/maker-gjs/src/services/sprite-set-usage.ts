import GLib from '@girs/glib-2.0'
import { getComponentData, isCharacterEntity } from '@pixelrpg/engine'

import { readBinaryFile } from './file-io.ts'
import type { LoadedProject } from './project-loader.ts'

type Resource = LoadedProject['resource']

/**
 * Reverse-reference counts for a project's sprite sets — "how many
 * things would break if this set were deleted". Shared by the Data view
 * (per-row "used by N" badge) and the Tiles view's delete confirmation
 * (warn before removing a referenced tileset).
 *
 * Two reference sources: characters point at a sheet by `spriteSetId`;
 * maps list the sets they paint with in their own JSON's `spriteSets[]`.
 * Maps aren't preloaded, so their JSON is read on demand (best-effort —
 * an unreadable map is skipped, never fatal).
 */

/** spriteSetId → number of characters (character-template entities) referencing it. */
export function countCharacterUsers(resource: Resource): Map<string, number> {
  const out = new Map<string, number>()
  for (const def of resource.data?.entityLibrary ?? []) {
    if (!isCharacterEntity(def)) continue
    const spriteSetId = getComponentData(def, 'visual')?.spriteSetId
    if (typeof spriteSetId === 'string') out.set(spriteSetId, (out.get(spriteSetId) ?? 0) + 1)
  }
  return out
}

/**
 * spriteSetId → number of maps referencing it. Reads each map JSON's
 * `spriteSets[]` directly (maps aren't preloaded). Best-effort: an
 * unreadable/garbled map is skipped, not fatal.
 */
export function countMapUsers(resource: Resource): Map<string, number> {
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

/** spriteSetId → total references (characters + maps combined). */
export function countSpriteSetUsers(resource: Resource): Map<string, number> {
  const out = new Map<string, number>()
  for (const [id, n] of countCharacterUsers(resource)) out.set(id, (out.get(id) ?? 0) + n)
  for (const [id, n] of countMapUsers(resource)) out.set(id, (out.get(id) ?? 0) + n)
  return out
}
