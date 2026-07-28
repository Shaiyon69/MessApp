package com.shaiyon.messapp;

/** Foreground MediaProjection service used by ScreenCapturePlugin. */

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.util.Base64;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

public class ScreenCaptureService extends Service {
    static final String ACTION_START = "com.shaiyon.messapp.screen_capture.START";
    static final String ACTION_STOP = "com.shaiyon.messapp.screen_capture.STOP";
    static final String EXTRA_RESULT_CODE = "resultCode";
    static final String EXTRA_RESULT_DATA = "resultData";
    static final String EXTRA_WIDTH = "width";
    static final String EXTRA_HEIGHT = "height";
    static final String EXTRA_DENSITY = "density";
    static final int FRAME_RATE = 10;

    private static final String CHANNEL_ID = "screen_sharing";
    private static final int NOTIFICATION_ID = 4207;
    private static final long FRAME_INTERVAL_MS = 1000L / FRAME_RATE;

    private HandlerThread captureThread;
    private Handler captureHandler;
    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private long lastFrameAt;
    private boolean stopping;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        if (ACTION_STOP.equals(intent.getAction())) {
            stopCapture();
            return START_NOT_STICKY;
        }
        if (!ACTION_START.equals(intent.getAction())) return START_NOT_STICKY;

        createNotificationChannel();
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Sharing your screen")
            .setContentText("MessApp screen sharing is active")
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        Intent resultData;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent.class);
        } else {
            resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        }
        if (resultData == null) {
            stopCapture();
            return START_NOT_STICKY;
        }

        int width = Math.max(1, intent.getIntExtra(EXTRA_WIDTH, 720));
        int height = Math.max(1, intent.getIntExtra(EXTRA_HEIGHT, 1280));
        int density = Math.max(1, intent.getIntExtra(EXTRA_DENSITY, 320));
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        projection = manager.getMediaProjection(intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED), resultData);
        if (projection == null) {
            stopCapture();
            return START_NOT_STICKY;
        }

        captureThread = new HandlerThread("MessAppScreenCapture");
        captureThread.start();
        captureHandler = new Handler(captureThread.getLooper());
        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        projection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                stopCapture();
            }
        }, captureHandler);
        imageReader.setOnImageAvailableListener(reader -> consumeLatestFrame(reader, width, height), captureHandler);
        virtualDisplay = projection.createVirtualDisplay(
            "MessApp screen share",
            width,
            height,
            density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.getSurface(),
            null,
            captureHandler
        );
        return START_NOT_STICKY;
    }

    private void consumeLatestFrame(ImageReader reader, int width, int height) {
        Image image = reader.acquireLatestImage();
        if (image == null) return;
        try {
            long now = android.os.SystemClock.elapsedRealtime();
            if (now - lastFrameAt < FRAME_INTERVAL_MS) return;
            lastFrameAt = now;

            Image.Plane plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer();
            int pixelStride = plane.getPixelStride();
            int rowStride = plane.getRowStride();
            int paddedWidth = width + Math.max(0, rowStride - pixelStride * width) / pixelStride;
            Bitmap padded = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888);
            padded.copyPixelsFromBuffer(buffer);
            Bitmap frame = paddedWidth == width ? padded : Bitmap.createBitmap(padded, 0, 0, width, height);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            frame.compress(Bitmap.CompressFormat.JPEG, 58, output);
            String dataUrl = "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
            ScreenCapturePlugin.emitFrame(dataUrl, width, height);
            if (frame != padded) frame.recycle();
            padded.recycle();
        } finally {
            image.close();
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Screen sharing", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shown while MessApp shares your screen");
        channel.setSound(null, null);
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
    }

    private void stopCapture() {
        if (stopping) return;
        stopping = true;
        if (virtualDisplay != null) virtualDisplay.release();
        virtualDisplay = null;
        if (imageReader != null) imageReader.close();
        imageReader = null;
        if (projection != null) projection.stop();
        projection = null;
        if (captureThread != null) captureThread.quitSafely();
        captureThread = null;
        captureHandler = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        ScreenCapturePlugin.emitStopped();
    }

    @Override
    public void onDestroy() {
        stopCapture();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
