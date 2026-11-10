//! The data folder picked in Messapp Setup. Setup writes its path to a `data-location`
//! file next to the exe; Messapp then keeps its webview storage (sign-in, settings,
//! caches) there. Without the file, Tauri's default folder is used, as before.

use std::path::PathBuf;

pub const FILE: &str = "data-location";

/// The chosen folder, or None for the default.
pub fn override_dir() -> Option<PathBuf> {
  let exe = std::env::current_exe().ok()?;
  parse(&std::fs::read_to_string(exe.parent()?.join(FILE)).ok()?)
}

/// Only an absolute path counts; anything else falls back to the default.
pub fn parse(text: &str) -> Option<PathBuf> {
  let path = PathBuf::from(text.trim());
  path.is_absolute().then_some(path)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_absolute_paths_override() {
    let abs = if cfg!(windows) { r"D:\Apps\Messapp\data" } else { "/apps/messapp/data" };
    assert_eq!(parse(&format!("{abs}\r\n")), Some(PathBuf::from(abs)));
    assert_eq!(parse("data"), None);
    assert_eq!(parse(""), None);
  }
}
