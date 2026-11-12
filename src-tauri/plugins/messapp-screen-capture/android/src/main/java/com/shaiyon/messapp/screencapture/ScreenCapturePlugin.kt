package com.shaiyon.messapp.screencapture

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebMessagePortCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import app.tauri.PermissionState
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

private const val MIC = "microphone"

@InvokeArg
class StartArgs {
  /** "high" asks for 1080p60 (kept only if the encoder can), "standard" for 720p30. */
  var quality: String = "standard"
  var audio: Boolean = true
}

/**
 * Screen sharing for Messapp on Tauri Android. Asks for MediaProjection consent and
 * starts ScreenCaptureService, which hardware-encodes the screen to H.264 and records
 * other apps' audio. Both go to JS as binary messages on a WebMessagePort (in-process,
 * so no local socket other apps could read); screenCapture.js decodes them into tracks.
 */
@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = MIC)])
class ScreenCapturePlugin(private val activity: Activity) : Plugin(activity) {
  companion object {
    @Volatile var instance: ScreenCapturePlugin? = null
    private val main = Handler(Looper.getMainLooper())

    /** Called from the capture threads; WebView ports are used on the main thread only. */
    fun send(bytes: ByteArray) {
      val port = instance?.port ?: return
      main.post { port.postMessage(WebMessageCompat(bytes)) }
    }

    fun emitStopped() {
      val plugin = instance ?: return
      main.post {
        plugin.closePort()
        plugin.trigger("stopped", JSObject())
      }
    }
  }

  private var webView: WebView? = null
  private var port: WebMessagePortCompat? = null
  private var args = StartArgs()

  override fun load(webView: WebView) {
    super.load(webView)
    this.webView = webView
    instance = this
  }

  @Command
  fun start(invoke: Invoke) {
    val features = listOf(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER, WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL, WebViewFeature.POST_WEB_MESSAGE)
    if (!features.all { WebViewFeature.isFeatureSupported(it) }) {
      invoke.reject("Update Android System WebView to share your screen", "NotSupportedError")
      return
    }
    args = invoke.parseArgs(StartArgs::class.java)
    // Playback capture needs Android 10 and the mic permission; without them the share has no sound.
    if (args.audio && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState(MIC) != PermissionState.GRANTED) {
      requestPermissionForAlias(MIC, invoke, "micPermissionResult")
    } else {
      askConsent(invoke)
    }
  }

  @PermissionCallback
  private fun micPermissionResult(invoke: Invoke) = askConsent(invoke)

  private fun askConsent(invoke: Invoke) {
    val manager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager?
    if (manager == null) {
      invoke.reject("Android screen capture is unavailable", "NotSupportedError")
      return
    }
    startActivityForResult(invoke, manager.createScreenCaptureIntent(), "capturePermissionResult")
  }

  @ActivityCallback
  private fun capturePermissionResult(invoke: Invoke, result: ActivityResult) {
    val data = result.data
    if (result.resultCode != Activity.RESULT_OK || data == null) {
      invoke.reject("Screen sharing was cancelled", "NotAllowedError")
      return
    }
    val view = webView ?: return invoke.reject("Screen sharing has no page to send to", "NotSupportedError")
    val origin = Uri.parse(view.url ?: "").let { Uri.parse("${it.scheme}://${it.authority}") }

    // A fresh channel per share; the page keeps ports[1] and listens for the frames.
    closePort()
    val ports = WebViewCompat.createWebMessageChannel(view)
    port = ports[0]
    WebViewCompat.postWebMessage(view, WebMessageCompat("messapp-screen-capture", arrayOf(ports[1])), origin)

    val audio = args.audio && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState(MIC) == PermissionState.GRANTED
    val mode = CaptureMode.pick(args.quality)
    val service = Intent(activity, ScreenCaptureService::class.java)
      .setAction(ScreenCaptureService.ACTION_START)
      .putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.resultCode)
      .putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, data)
      .putExtra(ScreenCaptureService.EXTRA_HIGH, mode.high)
      .putExtra(ScreenCaptureService.EXTRA_AUDIO, audio)
    ContextCompat.startForegroundService(activity, service)

    invoke.resolve(JSObject().put("frameRate", mode.frameRate).put("high", mode.high).put("audio", audio))
  }

  @Command
  fun requestKeyframe(invoke: Invoke) {
    ScreenCaptureService.current?.requestKeyframe()
    invoke.resolve()
  }

  @Command
  fun stop(invoke: Invoke) {
    activity.startService(Intent(activity, ScreenCaptureService::class.java).setAction(ScreenCaptureService.ACTION_STOP))
    invoke.resolve()
  }

  private fun closePort() {
    port?.close()
    port = null
  }
}
