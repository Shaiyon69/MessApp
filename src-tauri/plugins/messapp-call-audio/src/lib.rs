//! Call audio for Messapp on Tauri Android, ported from the Capacitor
//! `CallAudioPlugin`. Everything runs in Kotlin (`android/`): communication
//! mode, speaker or earpiece routing, and the mic and camera permission state.
//! Off Android the plugin registers and does nothing.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("messapp-call-audio")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin("com.shaiyon.messapp.callaudio", "CallAudioPlugin")?;
            Ok(())
        })
        .build()
}
