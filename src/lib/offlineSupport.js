// Offline support service for caching messages and handling network status
class OfflineSupport {
  constructor() {
    this.isOnline = navigator.onLine
    this.pendingMessages = []
    this.syncQueue = []
    this.dbName = 'messapp_offline'
    this.dbVersion = 1
    this.db = null
    this.syncInProgress = false
  }

  // Initialize offline support
  async init() {
    await this.initDB()
    this.setupNetworkListeners()
    await this.loadPendingMessages()
    
    // Start sync if we're online
    if (this.isOnline) {
      this.syncPendingMessages()
    }
  }

  // Initialize IndexedDB for offline storage
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result
        
        // Create stores for messages, users, and sync queue
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' })
          messageStore.createIndex('room_id', 'room_id')
          messageStore.createIndex('created_at', 'created_at')
        }
        
        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'id' })
          userStore.createIndex('username', 'username')
        }
        
        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true })
          syncStore.createIndex('timestamp', 'timestamp')
        }
      }
    })
  }

  // Setup network status listeners
  setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true
      this.syncPendingMessages()
      this.showNetworkStatus('online')
    })
    
    window.addEventListener('offline', () => {
      this.isOnline = false
      this.showNetworkStatus('offline')
    })
  }

  // Show network status notification
  showNetworkStatus(status) {
    if (status === 'online') {
      console.info('Network connection restored')
      // You could show a toast notification here
    } else {
      console.warn('Network connection lost')
      // You could show a toast notification here
    }
  }

  // Store message offline
  async storeMessage(message) {
    if (!this.db) return
    
    const transaction = this.db.transaction(['messages'], 'readwrite')
    const store = transaction.objectStore('messages')
    
    return new Promise((resolve, reject) => {
      const request = store.put(message)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  // Get messages from offline storage
  async getMessages(roomId, limit = 50) {
    if (!this.db) return []
    
    const transaction = this.db.transaction(['messages'], 'readonly')
    const store = transaction.objectStore('messages')
    const index = store.index('room_id')
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(roomId)
      request.onsuccess = () => {
        const messages = request.result
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, limit)
        resolve(messages)
      }
      request.onerror = () => reject(request.error)
    })
  }

  // Add message to sync queue
  async addToSyncQueue(action, data) {
    if (!this.db) return
    
    const syncItem = {
      action,
      data,
      timestamp: Date.now(),
      retries: 0
    }
    
    const transaction = this.db.transaction(['sync_queue'], 'readwrite')
    const store = transaction.objectStore('sync_queue')
    
    return new Promise((resolve, reject) => {
      const request = store.add(syncItem)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  // Load pending messages from sync queue
  async loadPendingMessages() {
    if (!this.db) return
    
    const transaction = this.db.transaction(['sync_queue'], 'readonly')
    const store = transaction.objectStore('sync_queue')
    
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => {
        this.syncQueue = request.result
        resolve(this.syncQueue)
      }
      request.onerror = () => reject(request.error)
    })
  }

  // Sync pending messages when online
  async syncPendingMessages() {
    if (!this.isOnline || this.syncInProgress || this.syncQueue.length === 0) {
      return
    }
    
    this.syncInProgress = true
    console.info(`Syncing ${this.syncQueue.length} pending items...`)
    
    try {
      // Process sync queue
      for (const item of this.syncQueue) {
        try {
          await this.processSyncItem(item)
          await this.removeFromSyncQueue(item.id)
        } catch (error) {
          console.error('Failed to sync item:', error)
          item.retries++
          
          // Remove item if it has failed too many times
          if (item.retries > 3) {
            await this.removeFromSyncQueue(item.id)
          } else {
            await this.updateSyncQueueItem(item)
          }
        }
      }
      
      // Reload sync queue
      await this.loadPendingMessages()
    } finally {
      this.syncInProgress = false
    }
  }

  // Process individual sync item
  async processSyncItem(item) {
    const { action, data } = item
    
    switch (action) {
      case 'send_message': {
        // Send message to server
        const response = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        
        if (!response.ok) throw new Error('Failed to send message')
        break
      }
        
      case 'delete_message':
        // Delete message from server
        await fetch(`/api/messages/${data.id}`, { method: 'DELETE' })
        break
        
      case 'update_reaction':
        // Update reaction on server
        await fetch(`/api/messages/${data.id}/reactions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        break
        
      default:
        console.warn('Unknown sync action:', action)
    }
  }

  // Remove item from sync queue
  async removeFromSyncQueue(id) {
    if (!this.db) return
    
    const transaction = this.db.transaction(['sync_queue'], 'readwrite')
    const store = transaction.objectStore('sync_queue')
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  // Update sync queue item
  async updateSyncQueueItem(item) {
    if (!this.db) return
    
    const transaction = this.db.transaction(['sync_queue'], 'readwrite')
    const store = transaction.objectStore('sync_queue')
    
    return new Promise((resolve, reject) => {
      const request = store.put(item)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  // Queue message for sending when online
  async queueMessage(messageData) {
    if (this.isOnline) {
      // Try to send immediately
      try {
        await this.processSyncItem({ action: 'send_message', data: messageData })
        return true
      } catch (error) {
        console.error('Failed to send message, queuing for later:', error)
      }
    }
    
    // Queue for later
    await this.addToSyncQueue('send_message', messageData)
    return false
  }

  // Get offline status
  isOffline() {
    return !this.isOnline
  }

  // Get sync status
  getSyncStatus() {
    return {
      isOnline: this.isOnline,
      pendingItems: this.syncQueue.length,
      syncInProgress: this.syncInProgress
    }
  }

  // Clear all offline data
  async clearOfflineData() {
    if (!this.db) return
    
    const stores = ['messages', 'users', 'sync_queue']
    
    for (const storeName of stores) {
      const transaction = this.db.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(store)
      store.clear()
    }
    
    this.syncQueue = []
  }
}

// Export singleton instance
export const offlineSupport = new OfflineSupport()

// Export convenience functions
export const initOfflineSupport = () => offlineSupport.init()
export const storeMessageOffline = (message) => offlineSupport.storeMessage(message)
export const getMessagesOffline = (roomId, limit) => offlineSupport.getMessages(roomId, limit)
export const queueMessage = (messageData) => offlineSupport.queueMessage(messageData)
export const isOffline = () => offlineSupport.isOffline()
export const getSyncStatus = () => offlineSupport.getSyncStatus()
