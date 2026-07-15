package com.shaiyon.messapp;

/**
 * WebView input bridge that advertises image MIME types to Android keyboards.
 * Committed content is delegated while its temporary URI permission is valid.
 */

import android.content.Context;
import android.os.Bundle;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.webkit.WebView;

import androidx.core.view.inputmethod.EditorInfoCompat;
import androidx.core.view.inputmethod.InputConnectionCompat;
import androidx.core.view.inputmethod.InputContentInfoCompat;

public class MessAppWebView extends WebView {
    public static final String[] COMMIT_CONTENT_MIME_TYPES = new String[] {
        "image/gif",
        "image/png",
        "image/jpeg",
        "image/webp"
    };

    public MessAppWebView(Context context) {
        super(context);
    }

    public MessAppWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public MessAppWebView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection inputConnection = super.onCreateInputConnection(outAttrs);
        if (inputConnection == null) return null;

        EditorInfoCompat.setContentMimeTypes(outAttrs, COMMIT_CONTENT_MIME_TYPES);
        InputConnectionCompat.OnCommitContentListener callback = new InputConnectionCompat.OnCommitContentListener() {
            @Override
            public boolean onCommitContent(InputContentInfoCompat inputContentInfo, int flags, Bundle opts) {
                return KeyboardImagePlugin.handleCommitContent(getContext(), inputContentInfo, flags, opts);
            }
        };
        return InputConnectionCompat.createWrapper(inputConnection, outAttrs, callback);
    }
}
