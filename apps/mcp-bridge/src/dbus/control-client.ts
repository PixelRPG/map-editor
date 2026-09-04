import GLib from '@girs/glib-2.0'

import { resolve } from '../instance-routing.ts'
import { callBus } from './bus.ts'

const CONTROL_IFACE = 'org.pixelrpg.maker.Control'

/** `() -> (s)` Control methods — every one answers a single JSON document. */
export type JsonMethod = 'GetStatus' | 'GetSessionState' | 'ListRecentProjects' | 'ListTemplates' | 'ListActions'

const str = (value: string) => GLib.Variant.new_string(value)

/**
 * Call a method on one instance's Control interface. Every typed wrapper
 * below goes through here, so this file is the single place the
 * `org.pixelrpg.maker.Control` method names are spelled — the editor-side
 * service and this bridge cannot drift without both being edited.
 */
export function callControl(
  label: string | undefined,
  method: string,
  params: GLib.Variant | null,
  replyType: string | null,
): Promise<GLib.Variant> {
  const { busName, controlPath } = resolve(label)
  return callBus({ busName, objectPath: controlPath, iface: CONTROL_IFACE, method, params, replyType })
}

/** Activate a GTK action. An omitted `value` sends an empty parameter string. */
export function activateAction(
  label: string | undefined,
  scope: string,
  name: string,
  value?: string | number | boolean,
): Promise<GLib.Variant> {
  const json = value === undefined ? '' : JSON.stringify(value)
  return callControl(label, 'ActivateAction', GLib.Variant.new_tuple([str(scope), str(name), str(json)]), null)
}

/** Set a stateful GTK action's state. */
export function changeActionState(
  label: string | undefined,
  scope: string,
  name: string,
  value: string | number | boolean,
): Promise<GLib.Variant> {
  return callControl(
    label,
    'ChangeActionState',
    GLib.Variant.new_tuple([str(scope), str(name), str(JSON.stringify(value))]),
    null,
  )
}

/** Raw (non-pretty) JSON string from a `() -> (s)` Control method. */
export async function readJson(label: string | undefined, method: JsonMethod): Promise<string> {
  const reply = await callControl(label, method, null, '(s)')
  const [json] = reply.recursiveUnpack() as [string]
  return json
}

/** Same as {@link readJson}, re-serialised pretty for an agent to read. */
export async function readJsonPretty(label: string | undefined, method: JsonMethod): Promise<string> {
  return JSON.stringify(JSON.parse(await readJson(label, method)), null, 2)
}

/** PNG bytes of the requested scope, or null/empty when the capture came back blank. */
export async function screenshot(label: string | undefined, scope: string): Promise<Uint8Array | null> {
  const reply = await callControl(label, 'Screenshot', GLib.Variant.new_tuple([str(scope)]), '(ay)')
  return reply.get_child_value(0).deepUnpack() as Uint8Array | null
}

/** Open a project by its `game-project.json` absolute path. */
export function openProject(label: string | undefined, path: string): Promise<GLib.Variant> {
  return callControl(label, 'OpenProject', GLib.Variant.new_tuple([str(path)]), null)
}

/** Agent-oriented JSON projection of one map (raw, not pretty-printed). */
export async function getMapData(label: string | undefined, mapId: string): Promise<string> {
  const reply = await callControl(label, 'GetMapData', GLib.Variant.new_tuple([str(mapId)]), '(s)')
  const [json] = reply.recursiveUnpack() as [string]
  return json
}

/** Host a collaboration session; resolves with the room id joiners need. */
export async function startSession(label: string | undefined): Promise<string> {
  const reply = await callControl(label, 'StartSession', null, '(s)')
  const [roomId] = reply.recursiveUnpack() as [string]
  return roomId
}

/** Join a collaboration session by room id. */
export function joinSession(label: string | undefined, roomId: string): Promise<GLib.Variant> {
  return callControl(label, 'JoinSession', GLib.Variant.new_tuple([str(roomId)]), null)
}

/** Where a tile edit lands. An omitted layer means the active one. */
export interface TileTarget {
  x: number
  y: number
  tileId?: number
  layerId?: string
}

/** Wire encoding shared by PaintTile + FillTile: empty layer = active, tile -1 = active tile. */
const tileParams = (target: TileTarget) =>
  new GLib.Variant('(siii)', [target.layerId ?? '', target.x, target.y, target.tileId ?? -1])

/** Paint or erase one tile. Resolves false when the editor declined to apply it. */
export async function paintTile(label: string | undefined, target: TileTarget): Promise<boolean> {
  const reply = await callControl(label, 'PaintTile', tileParams(target), '(b)')
  const [applied] = reply.recursiveUnpack() as [boolean]
  return applied
}

/** Bucket-fill from one tile. Resolves false when the editor declined to apply it. */
export async function fillTile(label: string | undefined, target: TileTarget): Promise<boolean> {
  const reply = await callControl(label, 'FillTile', tileParams(target), '(b)')
  const [applied] = reply.recursiveUnpack() as [boolean]
  return applied
}

/** Where a library object is placed. */
export interface ObjectPlacementTarget {
  defId: string
  x: number
  y: number
  layerId?: string
}

/** Place a library object. Resolves false when the editor declined to apply it. */
export async function placeObject(label: string | undefined, target: ObjectPlacementTarget): Promise<boolean> {
  const params = new GLib.Variant('(ssii)', [target.defId, target.layerId ?? '', target.x, target.y])
  const reply = await callControl(label, 'PlaceObject', params, '(b)')
  const [applied] = reply.recursiveUnpack() as [boolean]
  return applied
}

/** Set the camera zoom to an absolute value. */
export function setZoom(label: string | undefined, zoom: number): Promise<GLib.Variant> {
  return callControl(label, 'SetZoom', GLib.Variant.new_tuple([GLib.Variant.new_double(zoom)]), null)
}

/** Bring the editor window to the foreground (map + focus). */
export function presentWindow(label: string | undefined): Promise<GLib.Variant> {
  return callControl(label, 'PresentWindow', null, null)
}

/** Resize the window; resolves with the size the compositor actually gave it. */
export async function resizeWindow(
  label: string | undefined,
  width: number,
  height: number,
): Promise<[number, number]> {
  const reply = await callControl(
    label,
    'ResizeWindow',
    GLib.Variant.new_tuple([GLib.Variant.new_int32(width), GLib.Variant.new_int32(height)]),
    '(ii)',
  )
  return reply.recursiveUnpack() as [number, number]
}

/** Show/move the AI collaborator cursor. Resolves false when the editor declined. */
export async function setAssistantCursor(label: string | undefined, x: number, y: number): Promise<boolean> {
  const reply = await callControl(
    label,
    'SetAssistantCursor',
    GLib.Variant.new_tuple([GLib.Variant.new_int32(x), GLib.Variant.new_int32(y)]),
    '(b)',
  )
  const [applied] = reply.recursiveUnpack() as [boolean]
  return applied
}

/** Set the AI collaborator's display name + colour. */
export function setAssistantInfo(label: string | undefined, name: string, color: string): Promise<GLib.Variant> {
  return callControl(label, 'SetAssistantInfo', GLib.Variant.new_tuple([str(name), str(color)]), null)
}

/** Remove the AI collaborator cursor/presence. */
export function hideAssistant(label: string | undefined): Promise<GLib.Variant> {
  return callControl(label, 'HideAssistant', null, null)
}

/** Follow a session participant with the camera; an empty peer id stops following. */
export function followParticipant(label: string | undefined, peerId: string): Promise<GLib.Variant> {
  return callControl(label, 'FollowParticipant', GLib.Variant.new_tuple([str(peerId)]), null)
}
