package com.shaiyon.messapp;

/**
 * Requests Android MediaProjection consent and forwards capture frames to the
 * web layer. The web layer paints those frames into a canvas MediaStream so the
 * existing WebRTC publisher can treat native capture like getDisplayMedia().
 */

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.util.DisplayMetrics;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.ref.WeakReference;

@CapacitorPlugin(name = "ScreenCapture")
public class ScreenCapturePlugin extends Plugin {
    private static WeakReference<ScreenCapturePlugin> activePlugin = new WeakReference<>(null);

    @Override
    public void load() {
        activePlugin = new WeakReference<>(this);
    }

    @PluginMethod
    public void start(PluginCall call) {
        MediaProjectionManager manager = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            call.reject("Android screen capture is unavailable", "NotSupportedError");
            return;
        }
        startActivityForResult(call, manager.createScreenCaptureIntent(), "capturePermissionResult");
    }

    @ActivityCallback
    private void capturePermissionResult(PluginCall call, androidx.activity.result.ActivityResult result) {
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            call.reject("Screen sharing was cancelled", "NotAllowedError");
            return;
        }

        DisplayMetrics metrics = getContext().getResources().getDisplayMetrics();
        int sourceWidth = Math.max(1, metrics.widthPixels);
        int sourceHeight = Math.max(1, metrics.heightPixels);
        int width = Math.min(720, sourceWidth);
        int height = Math.max(1, Math.round(sourceHeight * (width / (float) sourceWidth)));

        Intent serviceIntent = new Intent(getContext(), ScreenCaptureService.class);
        serviceIntent.setAction(ScreenCaptureService.ACTION_START);
        serviceIntent.putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.getResultCode());
        serviceIntent.putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, data);
        serviceIntent.putExtra(ScreenCaptureService.EXTRA_WIDTH, width);
        serviceIntent.putExtra(ScreenCaptureService.EXTRA_HEIGHT, height);
        serviceIntent.putExtra(ScreenCaptureService.EXTRA_DENSITY, metrics.densityDpi);
        getContext().startForegroundService(serviceIntent);

        JSObject response = new JSObject();
        response.put("width", width);
        response.put("height", height);
        response.put("frameRate", ScreenCaptureService.FRAME_RATE);
        call.resolve(response);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), ScreenCaptureService.class);
        intent.setAction(ScreenCaptureService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }

    static void emitFrame(String dataUrl, int width, int height) {
        ScreenCapturePlugin plugin = activePlugin.get();
        if (plugin == null || plugin.getActivity() == null) return;
        JSObject frame = new JSObject();
        frame.put("dataUrl", dataUrl);
        frame.put("width", width);
        frame.put("height", height);
        plugin.getActivity().runOnUiThread(() -> plugin.notifyListeners("frame", frame));
    }

    static void emitStopped() {
        ScreenCapturePlugin plugin = activePlugin.get();
        if (plugin == null || plugin.getActivity() == null) return;
        plugin.getActivity().runOnUiThread(() -> plugin.notifyListeners("stopped", new JSObject()));
    }
}
