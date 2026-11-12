// The commands live in android/ (Kotlin); on mobile, JS invokes reach them directly.
// register_listener/remove_listener are Tauri's own, used by addPluginListener for the frame and stopped events.
const COMMANDS: &[&str] = &["start", "stop", "register_listener", "remove_listener"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
