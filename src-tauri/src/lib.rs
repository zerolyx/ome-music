mod bilibili;
mod data_backup;
mod db;
mod dj;
mod jellyfin;
mod library;
mod library_ignore;
mod local_video;
mod lyrics_backfill;
mod lyrics_sources;
mod media;
mod metadata_sources;
mod netease;
mod playlists;
mod smb_share;
mod subsonic;
mod webdav;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub(crate) backup_selection: Mutex<Option<(String, PathBuf, String)>>,
    pub(crate) subsonic_session: Mutex<Option<subsonic::SubsonicSession>>,
    pub(crate) jellyfin_session: Mutex<Option<jellyfin::RemoteMediaSession>>,
    pub(crate) emby_session: Mutex<Option<jellyfin::RemoteMediaSession>>,
    pub(crate) webdav_session: Mutex<Option<webdav::WebDavSession>>,
    pub(crate) webdav_generation: AtomicU64,
    pub(crate) smb_session: Mutex<Option<smb_share::SmbSession>>,
    pub(crate) smb_generation: AtomicU64,
    pub(crate) local_video_candidates: Mutex<local_video::LocalVideoRegistry>,
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
                backup_selection: Mutex::new(None),
                subsonic_session: Mutex::new(None),
                jellyfin_session: Mutex::new(None),
                emby_session: Mutex::new(None),
                webdav_session: Mutex::new(None),
                webdav_generation: AtomicU64::new(0),
                smb_session: Mutex::new(None),
                smb_generation: AtomicU64::new(0),
                local_video_candidates: Mutex::new(local_video::LocalVideoRegistry::default()),
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
            library::list_ignored_tracks,
            library::import_music_folder,
            library::rescan_music_folders,
            library::list_authorized_music_directories_command,
            library::library_diagnostics_command,
            library::list_unavailable_local_tracks_command,
            library::list_library_move_candidates_command,
            local_video::list_local_music_video_candidates,
            library::backfill_quick_identity_command,
            library::repair_local_track_path_command,
            library::rescan_music_directory,
            library::revoke_music_directory_authorization,
            library::set_track_liked_command,
            library::update_track_metadata_command,
            library::track_audio_tag_backup_status_command,
            library::read_track_album_audio_tags_command,
            library::read_track_audio_tags_command,
            library::write_track_audio_tags_command,
            library::open_library_album_folder_command,
            library::restore_track_audio_tag_backup_command,
            library::clear_track_audio_tag_backup_command,
            data_backup::export_data_backup_command,
            data_backup::inspect_data_backup_command,
            data_backup::restore_data_backup_command,
            data_backup::has_last_restore_point_command,
            data_backup::restore_last_import_command,
            metadata_sources::track_metadata_candidates,
            lyrics_sources::lyrics_provider_candidates,
            lyrics_sources::lyrics_provider_lyric,
            library::restore_track_metadata_command,
            library::rename_library_artist_command,
            library::rename_library_album_command,
            library::preview_library_artist_merge_command,
            library::merge_library_artist_command,
            library::preview_library_album_merge_command,
            library::merge_library_album_command,
            library::preview_library_artist_split_command,
            library::split_library_artist_command,
            library::preview_library_album_split_command,
            library::split_library_album_command,
            library::remove_local_track_command,
            library::remove_local_tracks_command,
            library::record_playback_event_command,
            library::playback_history_command,
            library::playback_history_entries_command,
            library::local_lyric,
            library::save_track_lyrics_command,
            library::get_saved_track_lyrics_command,
            library::delete_saved_track_lyrics_command,
            lyrics_backfill::start_lyrics_backfill_command,
            lyrics_backfill::get_current_lyrics_backfill_command,
            lyrics_backfill::resume_lyrics_backfill_command,
            lyrics_backfill::next_lyrics_backfill_track_command,
            lyrics_backfill::complete_lyrics_backfill_track_command,
            lyrics_backfill::save_auto_backfilled_track_lyrics_command,
            lyrics_backfill::pause_lyrics_backfill_command,
            lyrics_backfill::cancel_lyrics_backfill_command,
            lyrics_backfill::get_auto_backfilled_track_lyrics_command,
            playlists::playlist_list,
            playlists::playlist_create,
            playlists::playlist_rename,
            playlists::playlist_delete,
            playlists::playlist_tracks_command,
            playlists::playlist_add_command,
            playlists::playlist_remove_command,
            playlists::playlist_import_m3u,
            playlists::playlist_export_m3u,
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
            subsonic::subsonic_connect,
            subsonic::subsonic_status,
            subsonic::subsonic_disconnect,
            subsonic::subsonic_search,
            subsonic::subsonic_playlists,
            subsonic::subsonic_playlist_tracks,
            subsonic::subsonic_albums,
            subsonic::subsonic_album_tracks,
            subsonic::subsonic_lyrics,
            jellyfin::jellyfin_connect,
            jellyfin::jellyfin_status,
            jellyfin::jellyfin_disconnect,
            jellyfin::jellyfin_search,
            jellyfin::jellyfin_lyrics,
            jellyfin::jellyfin_albums,
            jellyfin::jellyfin_album_tracks,
            jellyfin::jellyfin_playlists,
            jellyfin::jellyfin_playlist_tracks,
            jellyfin::emby_connect,
            jellyfin::emby_status,
            jellyfin::emby_disconnect,
            jellyfin::emby_search,
            jellyfin::emby_albums,
            jellyfin::emby_album_tracks,
            jellyfin::emby_playlists,
            jellyfin::emby_playlist_tracks,
            webdav::webdav_connect,
            webdav::webdav_status,
            webdav::webdav_disconnect,
            webdav::webdav_list_directory,
            smb_share::smb_connect,
            smb_share::smb_status,
            smb_share::smb_disconnect,
            smb_share::smb_list_directory,
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
        let has_metadata_overrides_table: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='track_metadata_overrides')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(has_metadata_overrides_table);
        let original_metadata_columns: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('track_metadata_overrides')
                 WHERE name IN ('original_title', 'original_artist', 'original_album')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(original_metadata_columns, 3);
        let album_alias_column: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('albums') WHERE name='aliases_json')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(album_alias_column);
        let quick_identity_columns: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('tracks')
                 WHERE name IN ('quick_hash', 'quick_hash_version')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(quick_identity_columns, 2);
    }
}
