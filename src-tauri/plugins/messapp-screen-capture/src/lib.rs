//! Screen sharing for Messapp on Tauri Android, ported from the Capacitor
//! `ScreenCapturePlugin`. Kotlin (`android/`) asks for MediaProjection consent,
//! runs the foreground capture service and sends JPEG frames to JS, which paints
//! them into a canvas stream (`src/lib/screenCapture.js`). Off Android the
//! plugin registers and does nothing.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("messapp-screen-capture")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin("com.shaiyon.messapp.screencapture", "ScreenCapturePlugin")?;
            Ok(())
        })
        .build()
}
