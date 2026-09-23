mod bilibili;
mod db;
mod dj;
mod library;
mod media;
mod netease;
mod playlists;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
}

#[tauri::command]
fn get_app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = db::open_db(&data_dir.join("ome-music.db"))
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            db::run_migrations(&conn)
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            app.manage(AppState {
                db: Mutex::new(conn),
            });
            // 兜底：前端启动序列失效时（如 JS 异常），3 秒后强制显示窗口，
            // 避免用户面对"没有任何窗口"的死局。前端正常时 show() 幂等。
            let main_window = app.get_webview_window("main");
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                if let Some(window) = main_window {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });
            Ok(())
        })
        .register_uri_scheme_protocol("ome-media", |context, request| {
            media::handle_with_app(context.app_handle(), request)
        })
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            library::list_tracks,
            library::import_music_folder,
            library::set_track_liked_command,
            library::record_playback_event_command,
            library::playback_history_command,
            library::local_lyric,
            playlists::playlist_list,
            playlists::playlist_create,
            playlists::playlist_rename,
            playlists::playlist_delete,
            playlists::playlist_tracks_command,
            playlists::playlist_add_command,
            playlists::playlist_remove_command,
            dj::dj_config,
            dj::dj_save_config,
            dj::dj_chat,
            dj::dj_greeting,
            dj::dj_intro,
            dj::dj_memory_list,
            dj::dj_memory_delete,
            dj::profile_hour_preferences,
            netease::auth::netease_status,
            netease::auth::netease_qr_key,
            netease::auth::netease_qr_check,
            netease::auth::netease_logout,
            netease::api::netease_search,
            netease::api::netease_stream_url,
            netease::api::netease_lyric,
            netease::api::netease_like,
            bilibili::bilibili_search,
            bilibili::bilibili_stream_url,
            bilibili::bilibili_danmaku,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ome music");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_create_tracks_table_and_are_idempotent() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        db::run_migrations(&conn).unwrap();
        db::run_migrations(&conn).unwrap(); // 幂等
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('tracks','playback_events','mood_entries','playlists')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 4);
    }
}
