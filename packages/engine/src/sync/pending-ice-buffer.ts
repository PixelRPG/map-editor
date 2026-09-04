/**
 * Holds ICE candidates that arrived before the remote description was
 * set.
 *
 * `RTCPeerConnection.addIceCandidate` throws (or silently drops) when
 * no remote description is in place yet, and the two arrive in either
 * order on a fast link — host glare, or a joiner that answers quickly.
 * Buffering the early ones and draining after `setRemoteDescription`
 * turns that race into a non-event.
 *
 * Pure container: it decides *whether* a candidate is deliverable now
 * and hands back the ones to replay. The actual `addIceCandidate` call
 * (and the decision to tolerate a single rejected candidate) stays with
 * the session.
 */
export class PendingIceBuffer {
  private remoteDescriptionSet = false
  private readonly buffered: RTCIceCandidateInit[] = []

  /** Whether anything is waiting — callers guard their `await` on this to keep handshake timing. */
  get size(): number {
    return this.buffered.length
  }

  /** Mark the remote description as set; candidates are deliverable from here on. */
  markRemoteDescriptionSet(): void {
    this.remoteDescriptionSet = true
  }

  /**
   * Offer an inbound candidate. `true` means "deliver it now"; `false`
   * means it was buffered until {@link drain}.
   */
  accept(candidate: RTCIceCandidateInit): boolean {
    if (this.remoteDescriptionSet) return true
    this.buffered.push(candidate)
    return false
  }

  /** Take everything buffered so far, emptying the buffer. */
  drain(): RTCIceCandidateInit[] {
    return this.buffered.splice(0)
  }
}
