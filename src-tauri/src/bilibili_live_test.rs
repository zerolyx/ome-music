//! 真网络冒烟测试（`cargo test -- --ignored` 手动触发）。

use super::*;
#[test]
#[ignore = "live network: real Bilibili search"]
fn live_search_qingtian_returns_results() {
    let songs = tauri::async_runtime::block_on(search_songs("晴天", 12)).expect("search failed");
    assert!(!songs.is_empty());
    let first = &songs[0];
    assert!(first.id.starts_with("bilibili-"));
    assert!(!first.bvid.is_empty());
    assert!(!first.name.is_empty());
    assert!(first.plain);
}

#[test]
#[ignore = "live network: real playurl"]
fn live_stream_url_first_result_is_http() {
    let songs = tauri::async_runtime::block_on(search_songs("晴天", 12)).expect("search failed");
    let stream =
        tauri::async_runtime::block_on(fetch_stream_url(&songs[0].id)).expect("stream url failed");
    assert!(stream.url.starts_with("https://") || stream.url.starts_with("http://"));
    assert_eq!(stream.referer, "https://www.bilibili.com");
}

#[test]
#[ignore = "live network: real danmaku"]
fn live_danmaku_returns_items_within_cap() {
    let songs = tauri::async_runtime::block_on(search_songs("晴天", 12)).expect("search failed");
    let items =
        tauri::async_runtime::block_on(fetch_danmaku(&songs[0].id)).expect("danmaku failed");
    assert!(!items.is_empty());
    assert!(items.len() <= DANMAKU_LIMIT);
    assert!(items.windows(2).all(|w| w[0].time <= w[1].time));
}
