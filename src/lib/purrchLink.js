// Mints a one-time Purrch token via the edge function, then hands it to the Rust side (OS keyring).
export async function linkPurrch({ supabase, invoke, uid, url, anonKey }) {
  const { data, error } = await supabase.functions.invoke('purrch-link', { method: 'POST' })
  if (error || !data?.token_hash) throw new Error(data?.error || 'Could not link Purrch')
  await invoke('plugin:shaiyon|store_purrch_link', { uid, tokenHash: data.token_hash, url, anonKey })
}
