import type { AwarenessPeerState } from '@pixelrpg/engine'
import type { CollaboratorEntry } from '@pixelrpg/gjs'

/** The local AI assistant's roster entry inputs, or `null` when not present. */
export interface AssistantRosterEntry {
  readonly name: string
  readonly color: string
}

/**
 * Build the collaborators-bar roster from the local AI-assistant presence
 * plus the live session awareness peers. Pure (gi-free, node-testable):
 * the controller resolves the live sources (`AssistantStateService` +
 * `CollabSession.awareness`) into these plain inputs.
 *
 * Rules (behaviour-equivalent to the former `ApplicationWindow.getParticipants`):
 *  - The local assistant, if present, is listed FIRST with `isAI: true`.
 *  - Every awareness peer follows, EXCEPT a peer carrying the assistant's
 *    own peerId while the local assistant is already listed (dedup).
 *  - A relayed AI peer (the assistant peerId) on a joiner — i.e. when the
 *    local assistant is NOT present — is listed and flagged `isAI`.
 *
 * `assistant != null` is exactly the window's old `_assistantState.present`
 * condition: the controller passes `present ? {name,color} : null`.
 */
export function buildParticipantRoster(
  assistant: AssistantRosterEntry | null,
  peers: readonly AwarenessPeerState[],
  assistantPeerId: string,
): CollaboratorEntry[] {
  const participants: CollaboratorEntry[] = []
  if (assistant) {
    participants.push({ peerId: assistantPeerId, name: assistant.name, color: assistant.color, isAI: true })
  }
  for (const peer of peers) {
    if (peer.peerId === assistantPeerId && assistant) continue // already listed locally
    participants.push({
      peerId: peer.peerId,
      name: peer.info.displayName,
      color: peer.info.color,
      isAI: peer.peerId === assistantPeerId,
    })
  }
  return participants
}
