export const INTERACTION_FEEDBACK_EVENT = 'messapp:interaction-feedback'

const FEEDBACK_PROFILES = Object.freeze({
  'message-sending': { vibration: 6 },
  'message-sent': { vibration: 12 },
  'message-received': { vibration: [8, 22, 8] },
  'reaction-added': { vibration: 9 },
  'reaction-removed': { vibration: 6 },
  'message-deleted': { vibration: [16, 28, 20] },
  error: { vibration: [28, 35, 28] }
})

export const getInteractionFeedbackProfile = type => FEEDBACK_PROFILES[type] || null

export const isTactileFeedbackEnabled = storage => {
  try {
    return (storage || globalThis.localStorage)?.getItem('tactileFeedbackEnabled') !== 'false'
  } catch {
    return true
  }
}

export function triggerInteractionFeedback(type, {
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
  storage = globalThis.localStorage
} = {}) {
  const profile = getInteractionFeedbackProfile(type)
  if (!profile || !isTactileFeedbackEnabled(storage)) return false
  if (documentObject?.visibilityState && documentObject.visibilityState !== 'visible') return false

  try {
    navigatorObject?.vibrate?.(profile.vibration)
  } catch {
    // Sound feedback still works when a platform blocks vibration.
  }

  const CustomEventConstructor = documentObject?.defaultView?.CustomEvent || globalThis.CustomEvent
  if (typeof CustomEventConstructor === 'function') {
    documentObject?.dispatchEvent?.(new CustomEventConstructor(INTERACTION_FEEDBACK_EVENT, {
      detail: { type }
    }))
  }
  return true
}
