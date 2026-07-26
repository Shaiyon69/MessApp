export const REPORT_REASONS = Object.freeze([
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hateful content' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'violence', label: 'Violence or threats' },
  { value: 'spam', label: 'Spam or scams' },
  { value: 'illegal_activity', label: 'Illegal activity' },
  { value: 'privacy', label: 'Privacy violation' },
  { value: 'other', label: 'Something else' }
])

export const MODERATION_ACTIONS = Object.freeze([
  { value: 'dismiss', label: 'Dismiss report' },
  { value: 'remove_message', label: 'Remove message', messageOnly: true },
  { value: 'escalate', label: 'Escalate for review' }
])

const REASON_VALUES = new Set(REPORT_REASONS.map(reason => reason.value))
const ACTION_VALUES = new Set(MODERATION_ACTIONS.map(action => action.value))
const TARGET_TYPES = new Set(['message', 'user', 'server'])

const optionalTrimmed = (value, maxLength) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized ? normalized.slice(0, maxLength) : null
}

export const buildReportPayload = ({ reporterId, targetType, targetId, reason, details, clientContent }) => {
  if (!reporterId) throw new Error('A signed-in reporter is required.')
  if (!TARGET_TYPES.has(targetType)) throw new Error('This content type cannot be reported.')
  if (!targetId) throw new Error('The reported content is missing an ID.')
  if (!REASON_VALUES.has(reason)) throw new Error('Choose a valid report reason.')

  return {
    reporter_id: reporterId,
    target_type: targetType,
    target_id: targetId,
    reason,
    details: optionalTrimmed(details, 1000),
    client_content: targetType === 'message' ? optionalTrimmed(clientContent, 10000) : null
  }
}

export const submitContentReport = async (client, values) => {
  const payload = buildReportPayload(values)
  const { data, error } = await client
    .from('content_reports')
    .insert(payload)
    .select('id, status, created_at')
    .single()

  if (error) throw error
  return data
}

export const getModeratorRole = async (client, profileId) => {
  if (!profileId) return null
  const { data, error } = await client
    .from('moderator_roles')
    .select('role')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (error) throw error
  return data?.role || null
}

export const fetchModerationQueue = async (client) => {
  const { data, error } = await client
    .from('content_reports')
    .select('id, reporter_id, reported_user_id, target_type, target_id, reason, details, target_snapshot, status, assigned_to, resolution_note, created_at, updated_at')
    .in('status', ['open', 'reviewing'])
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export const moderateContentReport = async (client, { reportId, action, note }) => {
  if (!reportId) throw new Error('Choose a report to moderate.')
  if (!ACTION_VALUES.has(action)) throw new Error('Choose a supported moderation action.')
  const normalizedNote = optionalTrimmed(note, 2000)
  if (!normalizedNote) throw new Error('A moderation note is required.')

  const { error } = await client.rpc('moderate_report', {
    target_report_id: reportId,
    moderation_action: action,
    moderation_note: normalizedNote
  })
  if (error) throw error
}
