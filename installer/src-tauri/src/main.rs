// No console window behind the setup window on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Setup bootstrapper: reads the app's updater manifest on Skibidevs, downloads the newest
//! Windows installer, checks it against the app's updater key, runs it silently into the
//! folder the user picked, records the data folder, opens the app and closes itself.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// `updates/<APP>/latest.json` on Skibidevs, and the installed exe's name.
const APP: &str = "messapp";
/// The install folder name NSIS uses by default (productName).
const PRODUCT: &str = "messapp";
/// The app's identifier: Tauri's default data folder name.
const IDENTIFIER: &str = "com.shaiyon.messapp";
/// `plugins.updater.pubkey` from the app's tauri.conf.json.
const PUBKEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDhDOTg3ODg5MDk3M0MxQTAKUldTZ3dYTUppWGlZakRKMjBtSmN2Tm5HbE13SUppM0orQk5VNlZMKzNrSEJ4MXFhMk9jSEJTN3MK";
/// Read by the app at startup: holds the data folder when it is not the default.
const DATA_LOCATION_FILE: &str = "data-location";
const RELEASES: &str = "https://github.com/Shaiyon69/Skibidevs/releases/download/";

struct Release {
    version: String,
    url: String,
    signature: String,
}

#[derive(Default)]
struct Latest(Mutex<Option<Release>>);

#[derive(Serialize)]
struct Dirs {
    app: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct Progress {
    done: u64,
    total: u64,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!(env!("CARGO_PKG_NAME"), "/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(err)
}

fn default_app_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join(PRODUCT)
}

fn default_data_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join(IDENTIFIER)
}

#[tauri::command]
fn default_dirs() -> Dirs {
    Dirs { app: default_app_dir().display().to_string(), data: default_data_dir().display().to_string() }
}

/// Fetches the manifest and remembers the Windows build; returns its version.
#[tauri::command]
async fn latest(state: State<'_, Latest>) -> Result<String, String> {
    let url = format!("https://shaiyon69.github.io/Skibidevs/updates/{APP}/latest.json");
    let manifest: serde_json::Value =
        client()?.get(url).send().await.and_then(|r| r.error_for_status()).map_err(err)?.json().await.map_err(err)?;
    let release = parse_manifest(&manifest)?;
    let version = release.version.clone();
    *state.0.lock().map_err(err)? = Some(release);
    Ok(version)
}

fn parse_manifest(manifest: &serde_json::Value) -> Result<Release, String> {
    let windows = &manifest["platforms"]["windows-x86_64"];
    let (Some(version), Some(url), Some(signature)) =
        (manifest["version"].as_str(), windows["url"].as_str(), windows["signature"].as_str())
    else {
        return Err("No Windows build in the release yet".into());
    };
    // Only Skibidevs releases: the manifest is fetched over the network.
    if !url.starts_with(RELEASES) {
        return Err("The release points somewhere other than Skibidevs".into());
    }
    Ok(Release { version: version.into(), url: url.into(), signature: signature.into() })
}

/// Same check as tauri-plugin-updater: base64-wrapped minisign key and signature.
fn verify(data: &[u8], signature: &str) -> Result<(), String> {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD;
    let key = String::from_utf8(b64.decode(PUBKEY).map_err(err)?).map_err(err)?;
    let key = minisign_verify::PublicKey::decode(&key).map_err(err)?;
    let signature = String::from_utf8(b64.decode(signature.trim()).map_err(err)?).map_err(err)?;
    let signature = minisign_verify::Signature::decode(&signature).map_err(err)?;
    key.verify(data, &signature, true).map_err(|_| "The download does not match the signing key. Nothing was installed.".to_string())
}

#[tauri::command]
async fn install(app: AppHandle, state: State<'_, Latest>, app_dir: String, data_dir: String) -> Result<(), String> {
    let (version, url, signature) = {
        let guard = state.0.lock().map_err(err)?;
        let release = guard.as_ref().ok_or("Check for the latest version first")?;
        (release.version.clone(), release.url.clone(), release.signature.clone())
    };
    let app_dir = PathBuf::from(app_dir.trim());
    let data_dir = PathBuf::from(data_dir.trim());
    if !app_dir.is_absolute() || !data_dir.is_absolute() {
        return Err("Pick full folder paths, like C:\\Apps\\Messapp".into());
    }

    let _ = app.emit("step", "downloading");
    let mut response = client()?.get(&url).send().await.and_then(|r| r.error_for_status()).map_err(err)?;
    let total = response.content_length().unwrap_or(0);
    let mut bytes = Vec::with_capacity(total as usize);
    let mut reported = 0u64;
    while let Some(chunk) = response.chunk().await.map_err(err)? {
        bytes.extend_from_slice(&chunk);
        let done = bytes.len() as u64;
        // A few hundred events per download, not one per chunk.
        if done - reported >= 256 * 1024 || done == total {
            reported = done;
            let _ = app.emit("progress", Progress { done, total });
        }
    }

    let _ = app.emit("step", "verifying");
    verify(&bytes, &signature)?;

    let _ = app.emit("step", "installing");
    let setup = std::env::temp_dir().join(format!("{APP}-{version}-setup.exe"));
    std::fs::write(&setup, &bytes).map_err(err)?;
    let (setup_path, dir) = (setup.clone(), app_dir.clone());
    let ran = tauri::async_runtime::spawn_blocking(move || run_installer(&setup_path, &dir)).await.map_err(err)?;
    let _ = std::fs::remove_file(&setup);
    ran?;

    write_data_location(&app_dir, &data_dir)?;
    launch(&app_dir)?;
    let _ = app.emit("step", "done");

    // The app is starting: close Setup. A plain OS thread, not the async runtime,
    // so nothing pending there can hold it open; if the graceful exit has not
    // ended the process shortly after, force it.
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1500));
        app.exit(0);
        std::thread::sleep(Duration::from_secs(2));
        std::process::exit(0);
    });
    Ok(())
}

/// The default data folder needs no file; any other folder is written for the app to read.
fn write_data_location(app_dir: &Path, data_dir: &Path) -> Result<(), String> {
    let file = app_dir.join(DATA_LOCATION_FILE);
    if data_dir == default_data_dir() {
        let _ = std::fs::remove_file(file);
        return Ok(());
    }
    std::fs::create_dir_all(data_dir).map_err(|e| format!("Could not create {}: {e}", data_dir.display()))?;
    std::fs::write(file, data_dir.display().to_string()).map_err(err)
}

#[cfg(windows)]
fn run_installer(setup: &Path, dir: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // NSIS wants /D= last and unquoted, even when the path has spaces.
    let status = std::process::Command::new(setup)
        .arg("/S")
        .raw_arg(format!("/D={}", dir.display()))
        .status()
        .map_err(err)?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("The installer stopped (code {})", status.code().unwrap_or(-1)))
    }
}

#[cfg(not(windows))]
fn run_installer(_setup: &Path, _dir: &Path) -> Result<(), String> {
    Err("This installer is for Windows. On Linux, use the AppImage from Skibidevs.".into())
}

/// The app's exe in the folder: `<APP>.exe` if present, else the one exe that is not the uninstaller.
fn find_exe(dir: &Path) -> Option<PathBuf> {
    let named = dir.join(format!("{APP}.exe"));
    if named.is_file() {
        return Some(named);
    }
    std::fs::read_dir(dir).ok()?.filter_map(|e| e.ok().map(|e| e.path())).find(|p| {
        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_ascii_lowercase();
        name.ends_with(".exe") && !name.starts_with("uninstall")
    })
}

fn launch(dir: &Path) -> Result<(), String> {
    let exe = find_exe(dir).ok_or_else(|| format!("Installed, but no app was found in {}", dir.display()))?;
    std::process::Command::new(&exe).current_dir(dir).spawn().map(|_| ()).map_err(err)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Latest::default())
        .invoke_handler(tauri::generate_handler![default_dirs, latest, install])
        .run(tauri::generate_context!())
        .expect("error while running the setup window");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_needs_a_skibidevs_windows_build() {
        let ok = serde_json::json!({ "version": "2.1.1", "platforms": { "windows-x86_64": { "url": format!("{RELEASES}{APP}-v2.1.1/x.exe"), "signature": "s" } } });
        assert_eq!(parse_manifest(&ok).unwrap().version, "2.1.1");
        let elsewhere = serde_json::json!({ "version": "1", "platforms": { "windows-x86_64": { "url": "https://evil.test/x.exe", "signature": "s" } } });
        assert!(parse_manifest(&elsewhere).is_err());
        assert!(parse_manifest(&serde_json::json!({ "version": "1", "platforms": {} })).is_err());
    }

    #[test]
    fn rejects_unsigned_bytes() {
        assert!(verify(b"not the installer", "bm90IGEgc2lnbmF0dXJl").is_err());
    }

    #[test]
    fn finds_the_app_exe_not_the_uninstaller() {
        let dir = std::env::temp_dir().join(format!("{APP}-setup-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("uninstall.exe"), b"").unwrap();
        assert_eq!(find_exe(&dir), None);
        std::fs::write(dir.join("Other.exe"), b"").unwrap();
        assert_eq!(find_exe(&dir).unwrap().file_name().unwrap(), "Other.exe");
        std::fs::write(dir.join(format!("{APP}.exe")), b"").unwrap();
        assert_eq!(find_exe(&dir).unwrap().file_name().unwrap().to_str().unwrap(), format!("{APP}.exe"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn default_data_folder_writes_no_file() {
        let dir = std::env::temp_dir().join(format!("{APP}-setup-loc-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        write_data_location(&dir, &default_data_dir()).unwrap();
        assert!(!dir.join(DATA_LOCATION_FILE).exists());
        let custom = dir.join("data");
        write_data_location(&dir, &custom).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join(DATA_LOCATION_FILE)).unwrap(), custom.display().to_string());
        assert!(custom.is_dir());
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// `SETUP_EXE=<file> SETUP_SIG=<file.sig> cargo test -- --ignored`: a real release passes.
    #[test]
    #[ignore]
    fn verifies_a_real_release() {
        let exe = std::fs::read(std::env::var("SETUP_EXE").unwrap()).unwrap();
        let sig = std::fs::read_to_string(std::env::var("SETUP_SIG").unwrap()).unwrap();
        verify(&exe, &sig).unwrap();
        let mut tampered = exe.clone();
        tampered[1000] ^= 1;
        assert!(verify(&tampered, &sig).is_err());
    }
}
