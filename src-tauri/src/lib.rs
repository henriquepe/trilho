use std::path::Path;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![write_json_file])
        .setup(|app| {
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
        .expect("error while running the Trilho app");
}
