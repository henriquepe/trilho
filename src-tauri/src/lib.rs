use notify::{RecursiveMode, Watcher};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// The workspace lives in one JSON file so other local tools (the Trilho MCP server)
/// can read and change it. Default: `<app data dir>/trilho.json`.
const DATA_FILE: &str = "trilho.json";

struct DataFile {
    path: PathBuf,
    /// Hash of the last contents this app read or wrote, so the watcher ignores its own saves.
    last_seen: Mutex<Option<u64>>,
}

fn hash_of(contents: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    contents.hash(&mut hasher);
    hasher.finish()
}

/// Writes through a temporary file and a rename, so readers never see a half-written file.
fn write_atomically(path: &Path, contents: &str) -> std::io::Result<()> {
    let tmp = path.with_extension("json.app-tmp");
    std::fs::write(&tmp, contents)?;
    std::fs::rename(&tmp, path)
}

/// Returns the saved workspace, or `None` before the first save.
#[tauri::command]
fn read_state(data: tauri::State<'_, DataFile>) -> Result<Option<String>, String> {
    match std::fs::read_to_string(&data.path) {
        Ok(contents) => {
            *data.last_seen.lock().map_err(|e| e.to_string())? = Some(hash_of(&contents));
            Ok(Some(contents))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Falha ao ler {}: {error}", data.path.display())),
    }
}

#[tauri::command]
fn write_state(data: tauri::State<'_, DataFile>, contents: String) -> Result<(), String> {
    *data.last_seen.lock().map_err(|e| e.to_string())? = Some(hash_of(&contents));
    write_atomically(&data.path, &contents)
        .map_err(|error| format!("Falha ao salvar {}: {error}", data.path.display()))
}

/// Writes an exported backup. The path comes from the native save dialog;
/// only absolute `.json` paths are accepted so the command cannot write arbitrary files.
#[tauri::command]
fn write_json_file(path: String, contents: String) -> Result<(), String> {
    let target = Path::new(&path);
    let is_json = target
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("json"));
    if !target.is_absolute() || !is_json {
        return Err("Só é possível salvar arquivos .json.".into());
    }
    std::fs::write(target, contents).map_err(|error| format!("Falha ao salvar: {error}"))
}

/// Emits `state-changed` (with the new contents) when another process rewrites the data file.
fn watch_data_file(app: &tauri::AppHandle) -> notify::Result<notify::RecommendedWatcher> {
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        let Ok(event) = event else { return };
        let data = handle.state::<DataFile>();
        if !event.paths.iter().any(|p| p.file_name() == data.path.file_name()) {
            return;
        }
        let Ok(contents) = std::fs::read_to_string(&data.path) else { return };
        let hash = hash_of(&contents);
        {
            let Ok(mut last) = data.last_seen.lock() else { return };
            if *last == Some(hash) {
                return;
            }
            *last = Some(hash);
        }
        let _ = handle.emit("state-changed", contents);
    })?;
    // Watch the folder: atomic saves replace the file, which would end a watch on the file itself.
    if let Some(folder) = app.state::<DataFile>().path.parent() {
        watcher.watch(folder, RecursiveMode::NonRecursive)?;
    }
    Ok(watcher)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_state, write_state, write_json_file])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let path = match std::env::var_os("TRILHO_DATA_FILE") {
                Some(custom) => PathBuf::from(custom),
                None => app.path().app_data_dir()?.join(DATA_FILE),
            };
            if let Some(folder) = path.parent() {
                std::fs::create_dir_all(folder)?;
            }
            app.manage(DataFile { path, last_seen: Mutex::new(None) });
            // Kept in app state so the watcher lives as long as the app.
            let watcher = watch_data_file(app.handle())?;
            app.manage(Mutex::new(watcher));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Trilho app");
}
