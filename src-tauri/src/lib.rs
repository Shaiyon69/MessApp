//! Tauri desktop bootstrap. It owns the native lifecycle and enables
//! informational logging only in debug builds; React remains the UI layer.

mod data_location;

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
  #[cfg(target_os = "android")]
  let builder = builder.plugin(tauri_plugin_messapp_call_audio::init());
  #[cfg(target_os = "android")]
  let builder = builder.plugin(tauri_plugin_messapp_screen_capture::init());
  builder
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_shaiyon::init())
    .plugin(tauri_plugin_notification::init())
    .setup(|app| {
      // The main window is created here (tauri.conf.json sets create: false) so its
      // webview storage can follow the data folder picked in Messapp Setup.
      let config = app.config().app.windows.first().cloned().expect("tauri.conf.json defines the main window");
      #[allow(unused_mut)]
      let mut window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?;
      #[cfg(desktop)]
      if let Some(dir) = data_location::override_dir() {
        std::fs::create_dir_all(&dir)?;
        window = window.data_directory(dir.join("webview"));
      }
      window.build()?;
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      // The Windows installer registers messapp:// itself; AppImages and dev builds
      // only get it by registering at runtime.
      #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        // Only messapp:// links depend on this, so a failure must not stop the app.
        if let Err(e) = app.deep_link().register_all() {
          eprintln!("messapp:// registration failed: {e}");
          // In an AppImage, update-desktop-database inherits the bundled (older) glib and
          // fails on newer distros before the plugin sets the default handler. The handler
          // .desktop file is already written, so set it here without the bundled libraries.
          #[cfg(target_os = "linux")]
          if let Some(bin) = tauri::utils::platform::current_exe().ok().and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned())) {
            let _ = std::process::Command::new("xdg-mime")
              .args(["default", &format!("{bin}-handler.desktop"), "x-scheme-handler/messapp"])
              .env_remove("LD_LIBRARY_PATH")
              .status();
          }
        }
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
