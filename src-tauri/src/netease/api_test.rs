use super::*;

#[test]
fn parse_song_maps_cloudsearch_fields() {
    let raw = serde_json::json!({
        "id": 186016,
        "name": "晴天",
        "ar": [{ "id": 6452, "name": "周杰伦" }, { "id": 1, "name": "其他" }],
        "al": { "id": 19061, "name": "叶惠美" },
        "dt": 269320,
        "fee": 8
    });
    let song = parse_song(&raw).unwrap();
    assert_eq!(song.id, 186016);
    assert_eq!(song.name, "晴天");
    assert_eq!(song.artists, "周杰伦、其他");
    assert_eq!(song.album, "叶惠美");
    assert_eq!(song.duration_ms, 269320);
    assert_eq!(song.fee, 8);
    assert!(song.plain);
}

#[test]
fn parse_song_marks_only_fee_0_and_8_as_plain() {
    let base = |fee: i64| {
        serde_json::json!({ "id": 1, "name": "x", "ar": [], "al": {}, "dt": 1, "fee": fee })
    };
    assert!(parse_song(&base(0)).unwrap().plain);
    assert!(parse_song(&base(8)).unwrap().plain);
    assert!(!parse_song(&base(1)).unwrap().plain);
    assert!(!parse_song(&base(4)).unwrap().plain);
}

#[test]
fn parse_song_rejects_missing_id() {
    assert!(parse_song(&serde_json::json!({ "name": "no id" })).is_none());
}

#[test]
fn parse_song_defaults_missing_optional_fields() {
    let song = parse_song(&serde_json::json!({ "id": 42 })).unwrap();
    assert_eq!(song.name, "");
    assert_eq!(song.artists, "");
    assert_eq!(song.album, "");
    assert_eq!(song.duration_ms, 0);
    assert_eq!(song.fee, 0);
    assert!(song.plain);
}

#[test]
#[ignore = "需要真实网络"]
fn live_search_returns_songs() {
    let songs = tauri::async_runtime::block_on(search_songs("周杰伦 晴天", 30)).unwrap();
    assert!(!songs.is_empty());
    assert!(songs.first().unwrap().name.contains("晴天"));
}

#[test]
#[ignore = "需要真实网络"]
fn live_stream_url_anonymous_gets_trial_or_error() {
    // 匿名请求：服务端只给 30 秒试听或直接拒绝，两种都算合法响应。
    match tauri::async_runtime::block_on(fetch_stream_url(186_016, None)) {
        Ok(url) => assert!(url.starts_with("http"), "{url}"),
        Err(message) => assert!(
            message.contains("VIP") || message.contains("版权") || message.contains("试听"),
            "{message}"
        ),
    }
}

#[test]
#[ignore = "需要真实网络"]
fn live_lyric_returns_lrc_text() {
    let (lrc, _yrc) = tauri::async_runtime::block_on(fetch_lyric(186_016)).unwrap();
    assert!(lrc.contains('['), "{lrc}");
}
