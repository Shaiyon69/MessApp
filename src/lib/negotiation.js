/**
 * Perfect-negotiation decisions shared by the 1:1 call hook and the voice mesh.
 *
 * Both paths need the same two answers: which side is the polite peer, and
 * whether an inbound offer collides with one we are already making. Keeping
 * them here (pure, no WebRTC objects) means one implementation and one test.
 */

/**
 * True when this peer should yield to the remote peer on an offer collision.
 * The impolite (lower id) side is also the one that opens negotiation.
 * A plain string comparison, not localeCompare: `:` and `-` are variable-weight
 * punctuation under ICU, so two peers on different engines or locales are not
 * guaranteed to agree on the ordering of ids that contain them.
 */
export const isPolite = (localId, remoteId) => String(localId) > String(remoteId)

/** True when an inbound offer arrived while we were mid-offer and we are the impolite peer. */
export const shouldIgnoreOffer = ({ polite, makingOffer, signalingState, settingRemoteAnswer, type }) => {
  if (type !== 'offer') return false
  const readyForOffer = !makingOffer && (signalingState === 'stable' || settingRemoteAnswer)
  return !polite && !readyForOffer
}
