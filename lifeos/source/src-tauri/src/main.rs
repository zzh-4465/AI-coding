use base64::Engine;
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager, WebviewWindow};

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Cannot resolve app data dir: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("Cannot create app data dir: {error}"))?;
    Ok(dir)
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("state.json"))
}

fn run_cmd_start(target: &str) -> Result<(), String> {
    Command::new("cmd")
        .args(["/C", "start", "", target])
        .spawn()
        .map_err(|error| format!("Cannot open target: {error}"))?;
    Ok(())
}

fn shortcut_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(program_data) = std::env::var("ProgramData") {
        roots.push(PathBuf::from(program_data).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    if let Ok(app_data) = std::env::var("AppData") {
        roots.push(PathBuf::from(app_data).join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        roots.push(PathBuf::from(&user_profile).join("Desktop"));
        roots.push(PathBuf::from(user_profile).join("AppData\\Local\\Microsoft\\WindowsApps"));
    }
    roots
}

fn find_matching_entry(root: &Path, query: &str, depth: usize) -> Option<PathBuf> {
    if depth > 4 || !root.exists() {
        return None;
    }
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_stem()?.to_string_lossy().to_lowercase();
        let extension = path.extension().map(|item| item.to_string_lossy().to_lowercase());
        let is_launchable = matches!(extension.as_deref(), Some("lnk" | "exe" | "appref-ms"));
        if is_launchable && name.contains(query) {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_matching_entry(&path, query, depth + 1) {
                return Some(found);
            }
        }
    }
    None
}

fn find_installed_app(target: &str) -> Option<PathBuf> {
    let query = target.trim().to_lowercase();
    if query.len() < 2 {
        return None;
    }
    shortcut_search_roots()
        .into_iter()
        .find_map(|root| find_matching_entry(&root, &query, 0))
}

fn resolve_app_alias(target: &str) -> String {
    let lower = target.trim().to_lowercase();
    match lower.as_str() {
        "vscode" | "code" => "code".to_string(),
        "cursor" => "cursor".to_string(),
        "chrome" => "chrome".to_string(),
        "edge" => "msedge".to_string(),
        "gpt" | "chatgpt" | "openai" | "chatgpt desktop" | "gpt桌面版" => "ChatGPT".to_string(),
        "copilot" => "Copilot".to_string(),
        "notion" => "Notion".to_string(),
        "wechat" | "weixin" | "微信" => "WeChat".to_string(),
        "pdf" | "reader" => "AcroRd32".to_string(),
        _ => target.trim().to_string(),
    }
}

#[tauri::command]
fn open_target(target: String) -> Result<(), String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("Empty target".to_string());
    }

    let resolved = resolve_app_alias(trimmed);
    let path = Path::new(&resolved);
    if path.exists() {
        return run_cmd_start(path.to_string_lossy().as_ref());
    }

    if let Some(shortcut) = find_installed_app(&resolved) {
        return run_cmd_start(shortcut.to_string_lossy().as_ref());
    }

    run_cmd_start(&resolved)
}

#[tauri::command]
fn save_state(app: AppHandle, state: Value) -> Result<(), String> {
    let path = state_path(&app)?;
    let data = serde_json::to_string_pretty(&state)
        .map_err(|error| format!("Cannot serialize state: {error}"))?;
    fs::write(path, data).map_err(|error| format!("Cannot write state: {error}"))
}

#[tauri::command]
fn load_state(app: AppHandle) -> Result<Option<Value>, String> {
    let path = state_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(path).map_err(|error| format!("Cannot read state: {error}"))?;
    let state = serde_json::from_str(&data).map_err(|error| format!("Cannot parse state: {error}"))?;
    Ok(Some(state))
}

#[tauri::command]
fn set_daily_lock_screen(app: AppHandle, png_data_url: String) -> Result<String, String> {
    let base64_payload = png_data_url
        .split_once(',')
        .map(|(_, payload)| payload)
        .ok_or_else(|| "Invalid image data".to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_payload)
        .map_err(|error| format!("Cannot decode image: {error}"))?;

    let image_path = app_data_dir(&app)?.join("LifeOSDailyBrief.png");
    fs::write(&image_path, bytes).map_err(|error| format!("Cannot write lock image: {error}"))?;

    let escaped = image_path.to_string_lossy().replace('\'', "''");
    let script = format!(
        r#"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.System.UserProfile.LockScreen, Windows.System.UserProfile, ContentType = WindowsRuntime] | Out-Null
$fileOp = [Windows.Storage.StorageFile]::GetFileFromPathAsync('{escaped}')
$file = [System.WindowsRuntimeSystemExtensions]::AsTask($fileOp).Result
$op = [Windows.System.UserProfile.LockScreen]::SetImageFileAsync($file)
[System.WindowsRuntimeSystemExtensions]::AsTask($op).Wait()
"#
    );

    let status = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .status()
        .map_err(|error| format!("Cannot call Windows lock screen API: {error}"))?;

    if !status.success() {
        return Err(format!(
            "Saved image, but Windows rejected lock screen update: {}",
            image_path.display()
        ));
    }

    Ok(image_path.to_string_lossy().to_string())
}

#[tauri::command]
fn lock_workstation() -> Result<(), String> {
    Command::new("rundll32.exe")
        .args(["user32.dll,LockWorkStation"])
        .spawn()
        .map_err(|error| format!("Cannot lock workstation: {error}"))?;
    Ok(())
}

#[tauri::command]
fn minimize_window(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|error| format!("Cannot minimize window: {error}"))
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_fullscreen(true);
                let _ = window.set_decorations(false);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_target,
            save_state,
            load_state,
            set_daily_lock_screen,
            lock_workstation,
            minimize_window,
            exit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running LifeOS");
}
