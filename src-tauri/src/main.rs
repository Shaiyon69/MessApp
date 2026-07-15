//! Desktop executable entry point. Keep the release Windows subsystem attribute
//! so packaged builds do not open a second console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  app_lib::run();
}
