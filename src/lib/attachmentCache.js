const ENCRYPTED_PREFIX = 'encrypted:'

export function isEncryptedAttachmentStorageReference(attachment) {
  const fileType = String(attachment?.file_type || '').toLowerCase()
  const fileUrl = String(attachment?.file_url || '')
  return fileType.startsWith(ENCRYPTED_PREFIX) || /\.json(?:$|[?#])/i.test(fileUrl)
}

export function normalizeCachedAttachment(attachment) {
  const normalized = { ...attachment }
  if (
    /\.json(?:$|[?#])/i.test(String(normalized.file_url || '')) &&
    !String(normalized.file_type || '').toLowerCase().startsWith(ENCRYPTED_PREFIX)
  ) {
    normalized.file_type = `${ENCRYPTED_PREFIX}${normalized.file_type || 'application/octet-stream'}`
  }
  return normalized
}

export function serializeAttachmentForCache(attachment) {
  const persisted = { ...attachment }
  if (/^(?:blob:|data:)/i.test(persisted.file_url || '') && persisted.storage_file_url) {
    persisted.file_url = persisted.storage_file_url
    persisted.file_type = persisted.storage_file_type || (
      String(persisted.file_type || '').startsWith(ENCRYPTED_PREFIX)
        ? persisted.file_type
        : `${ENCRYPTED_PREFIX}${persisted.file_type || 'application/octet-stream'}`
    )
  }
  delete persisted.storage_file_url
  delete persisted.storage_file_type
  delete persisted.__media_bytes
  return persisted
}

export function isHydratedAttachment(attachment) {
  if (!attachment || attachment.is_unavailable) return false
  const fileUrl = String(attachment.file_url || '')
  if (!/^(?:data:|blob:|https?:)/i.test(fileUrl)) return false
  return !isEncryptedAttachmentStorageReference(attachment)
}
