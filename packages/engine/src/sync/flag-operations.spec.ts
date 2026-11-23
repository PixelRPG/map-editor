import { describe, expect, it } from '@gjsify/unit'

import type { FlagData, GameProjectData } from '../types/index.ts'
import {
  applyFlagRemove,
  applyFlagUpsert,
  createFlagRemoveOp,
  createFlagUpsertOp,
  FLAG_REMOVE_KIND,
  FLAG_UPSERT_KIND,
  isProjectOp,
} from './project-operations.ts'

const key: FlagData = { id: 'has-key', name: 'Has key', kind: 'yes-no', initial: false, scope: 'game' }

function project(flags?: FlagData[]): GameProjectData {
  return {
    id: 'p',
    name: 'P',
    version: '1',
    spriteSets: [],
    maps: [],
    startup: { initialMapId: 'm' },
    flags,
  } as unknown as GameProjectData
}

export default async () => {
  await describe('flag.upsert / flag.remove', async () => {
    await it('build project ops recognised by isProjectOp', async () => {
      const up = createFlagUpsertOp({ peerId: 'p1', seq: 1, flag: key })
      const rm = createFlagRemoveOp({ peerId: 'p1', seq: 2, flagId: key.id })
      expect(up.kind).toBe(FLAG_UPSERT_KIND)
      expect(up.kind).toBe('__project/flag.upsert')
      expect(rm.kind).toBe(FLAG_REMOVE_KIND)
      expect(rm.kind).toBe('__project/flag.remove')
      expect(isProjectOp(up)).toBe(true)
      expect(isProjectOp(rm)).toBe(true)
    })

    await it('upsert creates, then replaces by id, and survives a JSON wire round-trip', async () => {
      const data = project()
      const wire = JSON.parse(JSON.stringify(createFlagUpsertOp({ peerId: 'p', seq: 1, flag: key }))) as ReturnType<
        typeof createFlagUpsertOp
      >
      applyFlagUpsert(data, wire.payload.flag)
      applyFlagUpsert(data, wire.payload.flag)
      expect(data.flags).toStrictEqual([key])
      applyFlagUpsert(data, { ...key, name: 'Key', kind: 'number', initial: 2 })
      expect(data.flags).toStrictEqual([{ ...key, name: 'Key', kind: 'number', initial: 2 }])
    })

    await it('rejects a malformed flag and changes nothing', async () => {
      const data = project([key])
      for (const bad of [
        null,
        { ...key, id: '' },
        { ...key, id: 'Has Key' },
        { ...key, name: '  ' },
        { ...key, kind: 'color' },
        { ...key, scope: 'world' },
        { ...key, initial: 3 },
      ]) {
        expect(applyFlagUpsert(data, bad)).toBe(null)
      }
      expect(data.flags).toStrictEqual([key])
    })

    await it('remove drops by id, is idempotent, and false for an unknown id', async () => {
      const data = project([key])
      expect(applyFlagRemove(data, 'has-key')).toBe(true)
      expect(data.flags).toStrictEqual([])
      expect(applyFlagRemove(data, 'has-key')).toBe(false)
    })
  })
}
