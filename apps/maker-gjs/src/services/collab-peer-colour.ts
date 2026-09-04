/**
 * Distinct accent palette for collaborators (Adwaita-ish), deliberately
 * excluding the AI assistant's default purple (`#9141ac`) so a human peer
 * and the AI don't collide.
 */
export const PEER_COLOURS = [
  '#3584e4',
  '#33d17a',
  '#f6d32d',
  '#ff7800',
  '#e01b24',
  '#c061cb',
  '#986a44',
  '#33c7de',
] as const

/**
 * Each peer's colour is its peerId hashed into {@link PEER_COLOURS} —
 * stable across reconnects, distinct between peers. Every participant
 * derives the SAME colour for a given peer, which is what makes a
 * remote cursor recognisable without exchanging any colour on the wire.
 */
export function colourForPeer(peerId: string): string {
  let hash = 0
  for (let i = 0; i < peerId.length; i++) hash = (hash * 31 + peerId.charCodeAt(i)) >>> 0
  return PEER_COLOURS[hash % PEER_COLOURS.length]
}
