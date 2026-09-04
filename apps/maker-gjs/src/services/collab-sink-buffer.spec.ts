import { describe, expect, it } from '@gjsify/unit'

import { SinkBuffer } from './collab-sink-buffer.ts'

export default async () => {
  await describe('SinkBuffer', async () => {
    await it('holds values delivered before a sink is registered and drains them in arrival order', async () => {
      // Regression shape: a host editing the cast while a joiner is
      // still pulling its snapshot silently desynced the joiner,
      // because the ops arrived before ProjectStore registered itself.
      const buffer = new SinkBuffer<string>()
      buffer.deliver('a')
      buffer.deliver('b')

      const seen: string[] = []
      buffer.set((v) => seen.push(v))
      expect(seen).toStrictEqual(['a', 'b'])
    })

    await it('passes straight through once a sink is registered', async () => {
      const buffer = new SinkBuffer<string>()
      const seen: string[] = []
      buffer.set((v) => seen.push(v))
      buffer.deliver('a')
      expect(seen).toStrictEqual(['a'])
    })

    await it('drains only once — re-registering a sink replays nothing', async () => {
      const buffer = new SinkBuffer<string>()
      buffer.deliver('a')
      const first: string[] = []
      buffer.set((v) => first.push(v))
      const second: string[] = []
      buffer.set((v) => second.push(v))
      expect(first).toStrictEqual(['a'])
      expect(second).toStrictEqual([])
    })

    await it('keeps buffering after the sink is cleared', async () => {
      // The store detaches its sinks whenever no project is loaded and
      // re-attaches on the next load; traffic in between must survive.
      const buffer = new SinkBuffer<string>()
      buffer.set(() => {
        throw new Error('must not be called after clear')
      })
      buffer.set(null)
      buffer.deliver('a')
      const seen: string[] = []
      buffer.set((v) => seen.push(v))
      expect(seen).toStrictEqual(['a'])
    })

    await it('reports the registered sink via get()', async () => {
      const buffer = new SinkBuffer<string>()
      expect(buffer.get()).toBeNull()
      const sink = () => {}
      buffer.set(sink)
      expect(buffer.get()).toBe(sink)
    })

    await it('clear() discards pending values without touching the sink', async () => {
      const buffer = new SinkBuffer<string>()
      buffer.deliver('a')
      buffer.clear()
      const seen: string[] = []
      buffer.set((v) => seen.push(v))
      expect(seen).toStrictEqual([])
    })
  })
}
