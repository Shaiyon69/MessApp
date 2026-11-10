package com.shaiyon.messapp.push

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import android.webkit.WebView
import androidx.core.app.NotificationManagerCompat
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.firebase.messaging.FirebaseMessaging

private const val ALIAS = "receive"

@InvokeArg
class ChannelArgs {
  lateinit var id: String
  lateinit var name: String
  var description: String? = null
}

/**
 * FCM for Messapp: hands JS the device token, creates the "messages" channel and
 * passes on the data of a tapped notification (pushNavigation.js routes it).
 * Tokens are credentials: never log them.
 */
@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = ALIAS)])
class PushPlugin(private val activity: Activity) : Plugin(activity) {
  companion object {
    @Volatile var instance: PushPlugin? = null

    /** The data keys of a Messapp push, if the intent came from tapping one. */
    fun pushData(intent: Intent?): JSObject? {
      val extras = intent?.extras ?: return null
      if (extras.getString("type") == null) return null
      val data = JSObject()
      for (key in extras.keySet()) {
        // FCM adds its own google.* and gcm.* keys; the app only sends string values.
        if (key.startsWith("google.") || key.startsWith("gcm.")) continue
        extras.getString(key)?.let { data.put(key, it) }
      }
      return data
    }
  }

  // A tap that cold-started the app arrives before JS listens, so it waits here.
  private var launchAction: JSObject? = null

  override fun load(webView: WebView) {
    super.load(webView)
    instance = this
    launchAction = pushData(activity.intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    pushData(intent)?.let { trigger("action", it) }
  }

  fun onToken(token: String) {
    trigger("token", JSObject().put("token", token))
  }

  private fun state(): String =
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      // Before Android 13 there is no runtime permission, only the app's notification switch.
      if (NotificationManagerCompat.from(activity).areNotificationsEnabled()) "granted" else "denied"
    } else {
      when (getPermissionState(ALIAS)) {
        PermissionState.GRANTED -> "granted"
        PermissionState.DENIED -> "denied"
        else -> "prompt"
      }
    }

  private fun stateResult() = JSObject().put("receive", state())

  @Command
  fun permissionState(invoke: Invoke) {
    invoke.resolve(stateResult())
  }

  @Command
  fun requestPermission(invoke: Invoke) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState(ALIAS) != PermissionState.GRANTED) {
      requestPermissionForAlias(ALIAS, invoke, "permissionCallback")
    } else {
      invoke.resolve(stateResult())
    }
  }

  @PermissionCallback
  private fun permissionCallback(invoke: Invoke) {
    invoke.resolve(stateResult())
  }

  @Command
  fun register(invoke: Invoke) {
    FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
      if (task.isSuccessful && task.result != null) {
        invoke.resolve(JSObject().put("token", task.result))
      } else {
        // The token itself is a credential; only the failure is logged.
        Log.w("MessappPush", "FCM token request failed", task.exception)
        invoke.reject(task.exception?.message ?: "FCM token unavailable")
      }
    }
  }

  @Command
  fun createChannel(invoke: Invoke) {
    val args = invoke.parseArgs(ChannelArgs::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(args.id, args.name, NotificationManager.IMPORTANCE_HIGH).apply {
        description = args.description
        enableVibration(true)
        lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
      }
      (activity.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
    }
    invoke.resolve()
  }

  @Command
  fun takeLaunchAction(invoke: Invoke) {
    val action = launchAction
    launchAction = null
    invoke.resolve(JSObject().put("data", action))
  }
}
