package com.shaiyon.messapp.push

import android.app.PendingIntent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * In the background, Android shows a push's notification block itself. This
 * runs when the app is open: it shows the same notification, so a message from
 * another conversation still appears, and keeps the data for the tap.
 */
class MessagingService : FirebaseMessagingService() {
  override fun onNewToken(token: String) {
    PushPlugin.instance?.onToken(token)
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val notification = message.notification ?: return
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
    launch.addFlags(android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP)
    for ((key, value) in message.data) launch.putExtra(key, value)
    val id = (message.collapseKey ?: message.messageId ?: "").hashCode()
    val tap = PendingIntent.getActivity(this, id, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val built = NotificationCompat.Builder(this, "messages")
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(notification.title)
      .setContentText(notification.body)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setAutoCancel(true)
      .setContentIntent(tap)
      .build()
    try {
      NotificationManagerCompat.from(this).notify(id, built)
    } catch (_: SecurityException) {
      // Notification permission revoked while the app is open; the in-app UI still shows the message.
    }
  }
}
