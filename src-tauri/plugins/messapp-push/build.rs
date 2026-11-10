// The commands live in android/ (Kotlin); on mobile, JS invokes reach them directly.
const COMMANDS: &[&str] = &["register", "create_channel", "take_launch_action", "permission_state", "request_permission"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
