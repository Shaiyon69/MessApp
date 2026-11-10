//! Tauri desktop bootstrap. It owns the native lifecycle and enables
//! informational logging only in debug builds; React remains the UI layer.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();
  // Must be the first plugin: a second launch (a clicked messapp:// link) hands its
  // link to this instance through the deep-link plugin and exits.
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
      let _ = window.unminimize();
      let _ = window.show();
      let _ = window.set_focus();
    }
  }));
  #[cfg(target_os = "android")]
  let builder = builder.plugin(tauri_plugin_messapp_push::init());
  builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_shaiyon::init())
    .plugin(tauri_plugin_notification::init())
    .setup(|app| {
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      // The Windows installer registers messapp:// itself; AppImages and dev builds
      // only get it by registering at runtime.
      #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        app.deep_link().register_all()?;
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
