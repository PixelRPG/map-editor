/**
 * The agent-facing wording of a failed Control call.
 *
 * These strings ARE the contract: an agent driving the editor reads them to
 * decide whether to launch an instance, ask the user to un-pause the
 * assistant, or give up. The three branches are easy to reorder by accident
 * — a GDBus wrapper around a "not running" error matches both the
 * not-running probe and the remote-message extractor — so the precedence is
 * pinned here rather than left to the reading order of an if-chain.
 */

import { describe, expect, it } from '@gjsify/unit'

import { classifyDbusError, dbusError } from './dbus-error.ts'

export default async () => {
  await describe('classifyDbusError', async () => {
    await it('reports an unowned bus name as not-running', async () => {
      expect(classifyDbusError('GDBus.Error:org.freedesktop.DBus.Error.ServiceUnknown: no owner')).toStrictEqual({
        kind: 'not-running',
      })
    })

    await it('prefers not-running over the remote-message extraction', async () => {
      // Both patterns match this one — the actionable answer must win.
      expect(classifyDbusError('GDBus.Error:x.NameHasNoOwner: nothing here').kind).toBe('not-running')
    })

    await it("unwraps a typed editor rejection to the editor's own message", async () => {
      expect(
        classifyDbusError('GDBus.Error:org.gnome.gjs.JSError.Error: assistant-paused: the user paused the assistant'),
      ).toStrictEqual({ kind: 'rejected', message: 'assistant-paused: the user paused the assistant' })
    })

    await it('treats an unknown remote message as a plain failure, unwrapped', async () => {
      expect(classifyDbusError('GDBus.Error:org.gnome.gjs.JSError.Error: something else broke')).toStrictEqual({
        kind: 'failed',
        message: 'something else broke',
      })
    })

    await it('keeps a non-D-Bus message verbatim', async () => {
      expect(classifyDbusError('Timeout was reached')).toStrictEqual({ kind: 'failed', message: 'Timeout was reached' })
    })
  })

  await describe('dbusError', async () => {
    await it('tells the agent to start the default instance itself', async () => {
      const result = dbusError(new Error('GDBus.Error:…ServiceUnknown: nope'))
      expect(result.isError).toBe(true)
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text.includes('"default"')).toBe(true)
      expect(text.includes('org.pixelrpg.maker')).toBe(true)
      expect(text.includes('gjsify workspace @pixelrpg/maker-gjs start')).toBe(true)
    })

    await it('points a labelled instance at launch_instance and its own bus name', async () => {
      const result = dbusError(new Error('GDBus.Error:…NameHasNoOwner: nope'), 'Alpha')
      const text = result.content[0]?.type === 'text' ? result.content[0].text : ''
      expect(text.includes('"alpha"')).toBe(true)
      expect(text.includes('org.pixelrpg.maker.alpha')).toBe(true)
      expect(text.includes('launch_instance')).toBe(true)
    })

    await it('surfaces a typed rejection with no D-Bus decoration around it', async () => {
      const result = dbusError(new Error('GDBus.Error:x.JSError: no-engine: open a scene first'))
      expect(result.content[0]).toStrictEqual({ type: 'text', text: 'no-engine: open a scene first' })
      expect(result.isError).toBe(true)
    })

    await it('prefixes anything else so the agent can tell a bridge failure from an editor answer', async () => {
      const result = dbusError('plain string throw')
      expect(result.content[0]).toStrictEqual({ type: 'text', text: 'D-Bus call failed: plain string throw' })
    })
  })
}
