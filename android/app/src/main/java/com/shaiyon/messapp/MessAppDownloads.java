package com.shaiyon.messapp;

/**
 * Android's WebView ignores the HTML `download` attribute, so every attachment
 * save arrives here as a navigation instead. Remote files are handed to the
 * system DownloadManager; decrypted DM media arrives as a base64 data URL and is
 * written to the public Downloads collection directly. Both carry the file name
 * in the URL fragment, which src/lib/downloadFile.js attaches.
 */

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.net.URLDecoder;

public final class MessAppDownloads {
    private static final int STORAGE_PERMISSION_REQUEST = 4711;

    private MessAppDownloads() {}

    public static void attach(final Activity activity, final WebView webView) {
        if (webView == null) return;
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            save(activity, url, userAgent, contentDisposition, mimeType));
        webView.addJavascriptInterface(new WebBridge(activity), "MessAppDownloads");
    }

    /**
     * Decrypted DM media is a data URL that never touches the network, and the
     * WebView blocks top-level data: navigation, so it can never reach the
     * DownloadListener above. src/lib/downloadFile.js hands it here instead.
     */
    private static final class WebBridge {
        private final Activity activity;

        WebBridge(Activity activity) { this.activity = activity; }

        @JavascriptInterface
        public void save(String url) {
            if (url != null) MessAppDownloads.save(activity, url, null, null, null);
        }
    }

    private static void save(Activity activity, String url, String userAgent, String contentDisposition, String mimeType) {
        // A stored name is whatever the uploader typed; a separator in it makes
        // setDestinationInExternalPublicDir throw.
        String name = fileName(url, contentDisposition, mimeType).replaceAll("[/\\\\]", "_");
        if (!hasLegacyStoragePermission(activity)) {
            activity.runOnUiThread(() -> ActivityCompat.requestPermissions(activity, new String[]{ Manifest.permission.WRITE_EXTERNAL_STORAGE }, STORAGE_PERMISSION_REQUEST));
            toast(activity, "Allow storage access, then tap download again");
            return;
        }
        try {
            if (url.startsWith("data:")) {
                writeDataUrl(activity, url, name);
            } else {
                enqueue(activity, url, userAgent, mimeType, name);
            }
            toast(activity, "Saving " + name);
        } catch (Exception error) {
            toast(activity, "Download failed");
        }
    }

    /** Only API 23-28 needs a runtime grant to write the public Downloads folder. */
    private static boolean hasLegacyStoragePermission(Context context) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            || ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private static void enqueue(Context context, String url, String userAgent, String mimeType, String name) {
        Uri target = Uri.parse(url).buildUpon().fragment(null).build();
        DownloadManager.Request request = new DownloadManager.Request(target);
        if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
        request.setMimeType(mimeType);
        request.setTitle(name);
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
        ((DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(request);
    }

    private static void writeDataUrl(Context context, String url, String name) throws Exception {
        // ponytail: the whole file is decoded in memory; fine for chat attachments,
        // needs streaming if multi-hundred-megabyte uploads ever land.
        int fragment = url.lastIndexOf('#');
        String payload = fragment > -1 ? url.substring(0, fragment) : url;
        byte[] bytes = Base64.decode(payload.substring(payload.indexOf(",") + 1), Base64.DEFAULT);
        String mimeType = mimeFromName(name);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            Uri target = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (target == null) throw new IllegalStateException("No Downloads entry");
            try (OutputStream out = context.getContentResolver().openOutputStream(target)) {
                out.write(bytes);
            }
            return;
        }
        File folder = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        folder.mkdirs();
        try (FileOutputStream out = new FileOutputStream(new File(folder, name))) {
            out.write(bytes);
        }
    }

    /** The web layer appends the stored file name as the fragment. */
    private static String fileName(String url, String contentDisposition, String mimeType) {
        int hash = url.lastIndexOf('#');
        if (hash > -1 && hash < url.length() - 1) {
            try {
                return URLDecoder.decode(url.substring(hash + 1), "UTF-8");
            } catch (Exception ignored) {
                // Fall through to the platform guess below.
            }
        }
        return URLUtil.guessFileName(url, contentDisposition, mimeType);
    }

    private static String mimeFromName(String name) {
        String extension = MimeTypeMap.getFileExtensionFromUrl(name);
        String mimeType = extension == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.toLowerCase());
        return mimeType == null ? "application/octet-stream" : mimeType;
    }

    private static void toast(Activity activity, String message) {
        activity.runOnUiThread(() -> Toast.makeText(activity, message, Toast.LENGTH_SHORT).show());
    }
}
