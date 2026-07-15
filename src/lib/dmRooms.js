/**
 * Centralizes one-to-one DM creation behind the atomic Supabase RPC. The
 * database derives the current user from auth.uid(); callers supply only the
 * peer profile ID and never construct rooms or membership rows directly.
 */
import { supabase } from '../supabaseClient.js'
import { debug } from './debug.js'

const FRIENDSHIP_ERROR = /accepted friendship|required friendship|not friends/i
const BLOCKED_ERROR = /blocked/i
const PRIVACY_ERROR = /direct messages|dm-disabled|privacy/i

/** Maps backend-safe RPC failures to stable user-facing copy. */
export function getDmRoomErrorMessage(error) {
  const message = error?.message || ''
  if (BLOCKED_ERROR.test(message)) return 'You cannot start a chat because one of you has blocked the other.'
  if (PRIVACY_ERROR.test(message)) return 'This user is not accepting direct messages.'
  if (FRIENDSHIP_ERROR.test(message)) return 'You can only start a chat with an accepted friend.'
  if (error?.code === '42501' || error?.code === 'PGRST301') return 'You do not have permission to start this chat.'
  return 'Could not start this chat. Please try again.'
}

/** Returns the existing or newly created two-person room UUID. */
export async function getOrCreateDmRoom(otherProfileId, client = supabase) {
  if (!otherProfileId) throw new Error('A target profile is required.')
  if (!client) throw new Error('Supabase is not configured.')

  const { data, error } = await client.rpc('create_or_get_dm', {
    peer_id: otherProfileId
  })
  if (error) {
    debug.error('SUPABASE_ERROR', {
      operation: 'create-or-get-dm',
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    })
    throw error
  }
  if (!data?.id || typeof data.id !== 'string') throw new Error('The DM service returned an invalid room.')
  return data.id
}
