// The commands live in android/ (Kotlin); on mobile, JS invokes reach them directly.
// register_listener/remove_listener are Tauri's own, used by addPluginListener for the token and action events.
const COMMANDS: &[&str] = &["register", "create_channel", "take_launch_action", "permission_state", "request_permission", "register_listener", "remove_listener"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
