package com.shaiyon.messapp.screencapture

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.webkit.WebView
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * Port of the Capacitor ScreenCapturePlugin: asks for MediaProjection consent,
 * starts ScreenCaptureService and passes its frames to JS, which paints them
 * into a canvas MediaStream so WebRTC treats it like getDisplayMedia().
 */
@TauriPlugin
class ScreenCapturePlugin(private val activity: Activity) : Plugin(activity) {
  companion object {
    @Volatile var instance: ScreenCapturePlugin? = null

    fun emitFrame(dataUrl: String, width: Int, height: Int) {
      val plugin = instance ?: return
      val frame = JSObject().put("dataUrl", dataUrl).put("width", width).put("height", height)
      plugin.activity.runOnUiThread { plugin.trigger("frame", frame) }
    }

    fun emitStopped() {
      val plugin = instance ?: return
      plugin.activity.runOnUiThread { plugin.trigger("stopped", JSObject()) }
    }
  }

  override fun load(webView: WebView) {
    super.load(webView)
    instance = this
  }

  @Command
  fun start(invoke: Invoke) {
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

    val metrics = activity.resources.displayMetrics
    val sourceWidth = maxOf(1, metrics.widthPixels)
    val sourceHeight = maxOf(1, metrics.heightPixels)
    val width = minOf(720, sourceWidth)
    val height = maxOf(1, Math.round(sourceHeight * (width / sourceWidth.toFloat())))

    val service = Intent(activity, ScreenCaptureService::class.java)
      .setAction(ScreenCaptureService.ACTION_START)
      .putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.resultCode)
      .putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, data)
      .putExtra(ScreenCaptureService.EXTRA_WIDTH, width)
      .putExtra(ScreenCaptureService.EXTRA_HEIGHT, height)
      .putExtra(ScreenCaptureService.EXTRA_DENSITY, metrics.densityDpi)
    ContextCompat.startForegroundService(activity, service)

    invoke.resolve(JSObject().put("width", width).put("height", height).put("frameRate", ScreenCaptureService.FRAME_RATE))
  }

  @Command
  fun stop(invoke: Invoke) {
    activity.startService(Intent(activity, ScreenCaptureService::class.java).setAction(ScreenCaptureService.ACTION_STOP))
    invoke.resolve()
  }
}
