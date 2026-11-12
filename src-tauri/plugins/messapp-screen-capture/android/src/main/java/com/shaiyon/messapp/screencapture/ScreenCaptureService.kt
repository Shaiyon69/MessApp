package com.shaiyon.messapp.screencapture

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.SystemClock
import android.util.Base64
import androidx.core.app.NotificationCompat
import java.io.ByteArrayOutputStream

/** Foreground MediaProjection service used by ScreenCapturePlugin (port of the Capacitor one). */
class ScreenCaptureService : Service() {
  companion object {
    const val ACTION_START = "com.shaiyon.messapp.screen_capture.START"
    const val ACTION_STOP = "com.shaiyon.messapp.screen_capture.STOP"
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_RESULT_DATA = "resultData"
    const val EXTRA_WIDTH = "width"
    const val EXTRA_HEIGHT = "height"
    const val EXTRA_DENSITY = "density"
    const val FRAME_RATE = 10

    private const val CHANNEL_ID = "screen_sharing"
    private const val NOTIFICATION_ID = 4207
    private const val FRAME_INTERVAL_MS = 1000L / FRAME_RATE
  }

  private var captureThread: HandlerThread? = null
  private var projection: MediaProjection? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var imageReader: ImageReader? = null
  private var lastFrameAt = 0L
  private var stopping = false

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null) return START_NOT_STICKY
    if (intent.action == ACTION_STOP) {
      stopCapture()
      return START_NOT_STICKY
    }
    if (intent.action != ACTION_START) return START_NOT_STICKY

    createNotificationChannel()
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      // The library has no icon of its own; the app's launcher icon stands in, as in the Capacitor build.
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Sharing your screen")
      .setContentText("MessApp screen sharing is active")
      .setOngoing(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()
    // Android 14 requires the foreground service to start before getMediaProjection.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    val resultData: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_RESULT_DATA)
    }
    if (resultData == null) {
      stopCapture()
      return START_NOT_STICKY
    }

    val width = maxOf(1, intent.getIntExtra(EXTRA_WIDTH, 720))
    val height = maxOf(1, intent.getIntExtra(EXTRA_HEIGHT, 1280))
    val density = maxOf(1, intent.getIntExtra(EXTRA_DENSITY, 320))
    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    val proj = manager.getMediaProjection(intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED), resultData)
    if (proj == null) {
      stopCapture()
      return START_NOT_STICKY
    }
    projection = proj

    val thread = HandlerThread("MessAppScreenCapture").also { it.start() }
    captureThread = thread
    val handler = Handler(thread.looper)
    val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
    imageReader = reader
    proj.registerCallback(object : MediaProjection.Callback() {
      override fun onStop() = stopCapture()
    }, handler)
    reader.setOnImageAvailableListener({ consumeLatestFrame(it, width, height) }, handler)
    virtualDisplay = proj.createVirtualDisplay(
      "MessApp screen share", width, height, density,
      DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.surface, null, handler
    )
    return START_NOT_STICKY
  }

  private fun consumeLatestFrame(reader: ImageReader, width: Int, height: Int) {
    val image = reader.acquireLatestImage() ?: return
    try {
      val now = SystemClock.elapsedRealtime()
      if (now - lastFrameAt < FRAME_INTERVAL_MS) return
      lastFrameAt = now

      val plane = image.planes[0]
      val pixelStride = plane.pixelStride
      val paddedWidth = width + maxOf(0, plane.rowStride - pixelStride * width) / pixelStride
      val padded = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
      padded.copyPixelsFromBuffer(plane.buffer)
      val frame = if (paddedWidth == width) padded else Bitmap.createBitmap(padded, 0, 0, width, height)
      val output = ByteArrayOutputStream()
      frame.compress(Bitmap.CompressFormat.JPEG, 58, output)
      ScreenCapturePlugin.emitFrame("data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP), width, height)
      if (frame !== padded) frame.recycle()
      padded.recycle()
    } finally {
      image.close()
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL_ID, "Screen sharing", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Shown while MessApp shares your screen"
      setSound(null, null)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun stopCapture() {
    if (stopping) return
    stopping = true
    virtualDisplay?.release()
    virtualDisplay = null
    imageReader?.close()
    imageReader = null
    projection?.stop()
    projection = null
    captureThread?.quitSafely()
    captureThread = null
    @Suppress("DEPRECATION")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE) else stopForeground(true)
    stopSelf()
    ScreenCapturePlugin.emitStopped()
  }

  override fun onDestroy() {
    stopCapture()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
