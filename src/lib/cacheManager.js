const DB_NAME = 'MessAppDB'
const DB_VERSION = 1
const MAX_MESSAGES_PER_ROOM = 300

// 1. Initialize the Database
export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('thumbnails')) {
        db.createObjectStore('thumbnails', { keyPath: 'id' })
      }
    }
    
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// 2. Cache Messages (Handles both single objects and full arrays)
export const cacheMessage = async (roomId, payload) => {
  try {
    const db = await initDB()
    let dataToSave = payload

    if (!Array.isArray(payload)) {
      const existing = await getCachedMessages(roomId)
      dataToSave = [...existing, payload]

      if (dataToSave.length > MAX_MESSAGES_PER_ROOM) {
        dataToSave = dataToSave.slice(-MAX_MESSAGES_PER_ROOM)
      }
    }

    const tx = db.transaction('messages', 'readwrite')
    tx.objectStore('messages').put({ id: roomId, data: dataToSave, timestamp: Date.now() })
  } catch (_e) {
    console.warn('IDB Save Error', _e)
  }
}

// 3. Retrieve Messages
export const getCachedMessages = async (roomId) => {
  try {
    const db = await initDB()
    return new Promise((resolve) => {
      const tx = db.transaction('messages', 'readonly')
      const req = tx.objectStore('messages').get(roomId)
      
      req.onsuccess = () => resolve(req.result ? req.result.data : [])
      req.onerror = () => resolve([])
    })
  } catch (_e) {
    return []
  }
}

// 4. Cache Thumbnails
export const cacheThumbnail = async (roomId, url) => {
  try {
    const db = await initDB()
    const existing = await getThumbnails(roomId)
    const updated = [...existing, { url, createdAt: Date.now() }]
    
    const tx = db.transaction('thumbnails', 'readwrite')
    tx.objectStore('thumbnails').put({ id: roomId, data: updated })
  } catch (_e) {
    console.warn('IDB Save Error', _e)
  }
}

// 5. Retrieve Thumbnails
export const getThumbnails = async (roomId) => {
  try {
    const db = await initDB()
    return new Promise((resolve) => {
      const tx = db.transaction('thumbnails', 'readonly')
      const req = tx.objectStore('thumbnails').get(roomId)
      
      req.onsuccess = () => resolve(req.result ? req.result.data : [])
      req.onerror = () => resolve([])
    })
  } catch (_e) {
    return []
  }
}

// 6. Prune Cache (Stubbed for compatibility)
export const pruneCache = () => {
  return true;
}
