#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Injects a click interceptor so <a target="_blank"> links (YouTube, GFG,
        // LeetCode, ...) open in the user's OS browser instead of being trapped
        // inside the app window.
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running DSA Command Center");
}
