// Simple crash reporting service
class CrashReporter {
  constructor() {
    this.isInitialized = false
    this.crashQueue = []
  }

  init() {
    if (this.isInitialized) return
    
    // Global error handler
    window.onerror = (message, source, lineno, colno, error) => {
      this.reportError({
        type: 'javascript',
        message,
        source,
        lineno,
        colno,
        stack: error?.stack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      })
    }

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.reportError({
        type: 'promise',
        message: event.reason?.message || 'Unhandled promise rejection',
        stack: event.reason?.stack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      })
    })

    this.isInitialized = true
    console.info('[CrashReporter] Initialized')
  }

  reportError(errorData) {
    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('[CrashReporter]', errorData)
    }

    // Add to queue for later reporting
    this.crashQueue.push(errorData)

    // Keep only last 50 errors
    if (this.crashQueue.length > 50) {
      this.crashQueue.shift()
    }

    // In production, you could send this to your server
    this.sendToServer(errorData)
  }

  sendToServer(errorData) {
    // Only send in production
    if (import.meta.env.PROD) return

    // Don't send if we don't have a session
    const session = this.getSession()
    if (!session) return

    // Prepare report
    const report = {
      ...errorData,
      sessionId: session.id,
      userId: session.user?.id,
      appVersion: '1.0.0',
      platform: 'web'
    }

    // Send to Supabase edge function or your own endpoint
    fetch('/api/crash-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(report)
    }).catch(err => {
      console.warn('[CrashReporter] Failed to send report:', err)
    })
  }

  getSession() {
    try {
      return JSON.parse(localStorage.getItem('supabase.auth.token') || '{}')
    } catch {
      return null
    }
  }

  // Manual error reporting
  report(message, error = null) {
    this.reportError({
      type: 'manual',
      message,
      stack: error?.stack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    })
  }

  // Get recent crashes for debugging
  getRecentCrashes() {
    return [...this.crashQueue]
  }

  // Clear crash queue
  clearCrashes() {
    this.crashQueue = []
  }
}

// Export singleton instance
export const crashReporter = new CrashReporter()

// Initialize automatically
if (typeof window !== 'undefined') {
  crashReporter.init()
}

// Export convenience functions
export const reportCrash = (message, error) => crashReporter.report(message, error)
export const getRecentCrashes = () => crashReporter.getRecentCrashes()
export const clearCrashes = () => crashReporter.clearCrashes()
