// The commands live in android/ (Kotlin); on mobile, JS invokes reach them directly.
const COMMANDS: &[&str] = &["start_call", "set_speaker_enabled", "get_speaker_state", "end_call", "check_media_permissions", "request_microphone_permission"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
