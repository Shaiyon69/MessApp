//! Native FCM push for Messapp on Tauri Android. Everything runs in Kotlin
//! (`android/`): the FCM token, the "messages" channel, and the data of a tapped
//! notification. Off Android the plugin registers and does nothing.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("messapp-push")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin("com.shaiyon.messapp.push", "PushPlugin")?;
            Ok(())
        })
        .build()
}
