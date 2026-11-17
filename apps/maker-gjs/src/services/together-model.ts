import type { CollaboratorEntry } from '@pixelrpg/gjs'

/**
 * What the Together dialog shows, derived from the session state and the
 * live roster (REDESIGN.md § 4.7).
 *
 * Pure (gi-free, node-testable) on purpose: *who is listed, in what
 * order, and which of the three sections apply* is the part of Together
 * worth testing, and it is the part that has to agree with the session
 * state machine. The widget renders this and nothing else, so a new
 * `SessionState` kind cannot quietly leave the dialog on a stale page.
 */
export type TogetherMode =
  /** Nobody else, nothing advertised — Invite offers to start sharing. */
  | 'solo'
  /** Mid-handshake: hosting is starting, or a join is still negotiating. */
  | 'starting'
  /** We are the host: there is a code to hand out, and sharing can stop. */
  | 'sharing'
  /** We joined someone else's session: a code to pass on, no stop-sharing. */
  | 'joined'

/** One row of the People section. */
export interface TogetherPerson {
  readonly peerId: string
  readonly name: string
  /** CSS-style colour token (`#rrggbb`) — the same hue as this peer's cursor. */
  readonly color: string
  readonly isAI: boolean
  /** The local user's own row — listed first, never followable. */
  readonly isSelf: boolean
  /** Where they are ("Kokiri Forest"), or `null` when they are not on a map. */
  readonly location: string | null
  /** Whether the camera is currently following this person. */
  readonly following: boolean
}

export interface TogetherPresentation {
  readonly mode: TogetherMode
  /** The session code to hand out, or `null` while solo. */
  readonly code: string | null
  /** `pixelrpg://join/<code>`, or `null` while solo. */
  readonly shareUrl: string | null
  /** The open project's name, or `null` when none is open. */
  readonly projectName: string | null
  readonly people: readonly TogetherPerson[]
}

/**
 * The parts of `SessionState` the dialog reads.
 *
 * Structural rather than the real union because `SessionState` reaches a
 * live `CollabSession` and so pulls gi in; the mapping lives in one
 * place ({@link togetherSessionSnapshot}) and this module stays runnable
 * under the node target.
 */
export interface TogetherSessionSnapshot {
  readonly kind: string
  readonly roomId?: string
  readonly role?: string
}

/** The live inputs the presentation is derived from. */
export interface TogetherInput {
  readonly session: TogetherSessionSnapshot
  readonly projectName: string | null
  /** The local peer id — the roster never carries it, so self is added here. */
  readonly selfPeerId: string
  readonly selfName: string
  readonly selfColor: string
  /** The roster `buildParticipantRoster` produced: the AI first, then peers. */
  readonly participants: readonly CollaboratorEntry[]
  readonly followedPeerId: string | null
  /** peerId → where that peer is, already resolved to a map name by the caller. */
  readonly locations: ReadonlyMap<string, string>
  /**
   * Render the invite link for a room id, or `null` when the id is not
   * one we can build a link from — a joiner's room id arrived off the
   * wire, and `buildPixelrpgJoinUrl` rejects anything that would not
   * survive a parse round-trip rather than publishing a dead link.
   */
  readonly shareUrlFor: (roomId: string) => string | null
}

/**
 * Map the `SessionState` kinds onto the four modes the dialog has.
 *
 * `connecting` and `awaiting-engine`-as-joiner are both "nearly there" —
 * the user pressed something and the transport has not settled — so they
 * share one mode rather than each getting a page nobody designed. A host
 * in `awaiting-engine` is already advertising a code, so it is `sharing`
 * and not `starting`: the invite is usable before any scene is open.
 */
export function togetherMode(kind: string, role: string | undefined): TogetherMode {
  switch (kind) {
    case 'hosting':
      return 'sharing'
    case 'connecting':
      return 'starting'
    case 'awaiting-engine':
    case 'connected':
      return role === 'host' ? 'sharing' : 'joined'
    default:
      return 'solo'
  }
}

/** Whether this mode has a code worth showing and copying. */
export function hasInviteCode(mode: TogetherMode): boolean {
  return mode === 'sharing' || mode === 'joined'
}

/**
 * Build the dialog's whole state.
 *
 * The local user is listed FIRST and is never followable — "Follow
 * yourself" is not a thing, and seeing your own colour on your own row
 * is what makes the Preferences colour choice legible. The AI and the
 * peers follow in roster order, minus any entry that is us: a joiner's
 * awareness map can carry a relayed frame of our own presence, and a
 * duplicate self row would offer "Follow" on it.
 */
export function buildTogetherPresentation(input: TogetherInput): TogetherPresentation {
  const mode = togetherMode(input.session.kind, input.session.role)
  const roomId = hasInviteCode(mode) ? (input.session.roomId ?? null) : null

  const people: TogetherPerson[] = [
    {
      peerId: input.selfPeerId,
      name: input.selfName,
      color: input.selfColor,
      isAI: false,
      isSelf: true,
      location: input.locations.get(input.selfPeerId) ?? null,
      following: false,
    },
  ]
  for (const participant of input.participants) {
    if (participant.peerId === input.selfPeerId) continue
    people.push({
      peerId: participant.peerId,
      name: participant.name,
      color: participant.color,
      isAI: participant.isAI,
      isSelf: false,
      location: input.locations.get(participant.peerId) ?? null,
      following: participant.peerId === input.followedPeerId,
    })
  }

  return {
    mode,
    code: roomId,
    shareUrl: roomId ? input.shareUrlFor(roomId) : null,
    projectName: input.projectName,
    people,
  }
}
