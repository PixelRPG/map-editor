import { describe, expect, it } from '@gjsify/unit'
import type { EntityDefinition } from '@pixelrpg/engine'

import { captureEntityDeletion, deletedEntityLabel } from './entity-deletion.ts'

const entity = (id: string, name = id.toUpperCase()): EntityDefinition => ({
  id,
  name,
  components: [{ type: 'transform' }],
})

const library: EntityDefinition[] = [entity('link'), entity('chest'), entity('guard')]

export default async () => {
  await describe('captureEntityDeletion', async () => {
    await it('snapshots the named entity', async () => {
      const deletion = captureEntityDeletion(library, 'chest', 'link')
      expect(deletion?.entity.id).toBe('chest')
      expect(deletion?.wasPlayer).toBe(false)
    })

    await it('flags the entity the player pointer names', async () => {
      expect(captureEntityDeletion(library, 'link', 'link')?.wasPlayer).toBe(true)
    })

    await it('treats a project without a player as nobody being the player', async () => {
      expect(captureEntityDeletion(library, 'link', null)?.wasPlayer).toBe(false)
      expect(captureEntityDeletion(library, 'link', undefined)?.wasPlayer).toBe(false)
    })

    await it('yields null for an unknown id', async () => {
      expect(captureEntityDeletion(library, 'nobody', 'link')).toBe(null)
    })

    await it('yields null for an empty library', async () => {
      expect(captureEntityDeletion([], 'link', 'link')).toBe(null)
    })
  })

  await describe('deletedEntityLabel', async () => {
    await it('prefers the display name', async () => {
      expect(deletedEntityLabel({ entity: entity('link', 'Link'), wasPlayer: false })).toBe('Link')
    })

    await it('falls back to the id for a blank name', async () => {
      expect(deletedEntityLabel({ entity: entity('link', '   '), wasPlayer: false })).toBe('link')
      expect(deletedEntityLabel({ entity: entity('link', ''), wasPlayer: false })).toBe('link')
    })
  })
}
