use super::*;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_dir(tag: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!("ome-netease-test-{tag}-{nanos}"))
}

#[test]
fn cookie_value_finds_keys_in_raw_cookie_string() {
    let cookie = "MUSIC_U=abc123; __csrf=xyz789; os=pc";
    assert_eq!(cookie_value(cookie, "MUSIC_U").as_deref(), Some("abc123"));
    assert_eq!(cookie_value(cookie, "__csrf").as_deref(), Some("xyz789"));
    assert_eq!(cookie_value(cookie, "os").as_deref(), Some("pc"));
    assert_eq!(cookie_value(cookie, "missing"), None);
}

#[test]
fn cookie_value_tolerates_whitespace() {
    let cookie = " MUSIC_U = spaced ;__csrf=tight";
    assert_eq!(cookie_value(cookie, "MUSIC_U").as_deref(), Some("spaced"));
    assert_eq!(cookie_value(cookie, "__csrf").as_deref(), Some("tight"));
}

#[test]
fn set_cookies_strip_attributes_and_join_pairs() {
    let set_cookies = vec![
        "MUSIC_U=abc123; Path=/; Domain=.music.163.com; HttpOnly".to_string(),
        "__csrf=xyz789; Path=/".to_string(),
        "invalid-no-equals".to_string(),
    ];
    assert_eq!(
        set_cookies_to_cookie_string(&set_cookies),
        "MUSIC_U=abc123; __csrf=xyz789"
    );
    assert_eq!(set_cookies_to_cookie_string(&[]), "");
}

#[test]
fn buildver_maps_known_epoch_days() {
    // 期望值经 node `new Date(t*1000).toISOString()` 核对
    assert_eq!(buildver_from_days_since_epoch(19_620), "20230920");
    assert_eq!(buildver_from_days_since_epoch(20_089), "20250101");
    assert_eq!(buildver_from_days_since_epoch(19_675), "20231114");
    // 1970-01-01
    assert_eq!(buildver_from_days_since_epoch(0), "19700101");
}

#[test]
fn today_buildver_has_compact_date_shape() {
    let buildver = today_buildver();
    assert_eq!(buildver.len(), 8);
    assert!(buildver.chars().all(|c| c.is_ascii_digit()), "{buildver}");
}

#[test]
fn eapi_url_maps_api_prefix_to_eapi_path() {
    assert_eq!(
        eapi_url("/api/cloudsearch/pc"),
        "https://interface3.music.163.com/eapi/cloudsearch/pc"
    );
    assert_eq!(
        eapi_url("/api/login/qrcode/unikey"),
        "https://interface3.music.163.com/eapi/login/qrcode/unikey"
    );
}

#[test]
fn weapi_url_maps_api_prefix_to_weapi_path() {
    assert_eq!(
        weapi_url("/api/radio/like"),
        "https://music.163.com/weapi/radio/like"
    );
}

#[test]
fn build_eapi_header_contains_device_fields_and_conditional_login() {
    let header = build_eapi_header(Some("music-u-token"), Some("csrf-token"));
    let get = |key: &str| {
        header
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.clone())
    };
    assert_eq!(
        get("osver").as_deref(),
        Some("Microsoft-Windows-10-Professional-build-19045-64bit")
    );
    assert_eq!(get("os").as_deref(), Some("pc"));
    assert_eq!(get("appver").as_deref(), Some("3.1.17.204416"));
    assert_eq!(get("channel").as_deref(), Some("netease"));
    assert_eq!(get("versioncode").as_deref(), Some("140"));
    assert_eq!(get("resolution").as_deref(), Some("1920x1080"));
    assert_eq!(get("__csrf").as_deref(), Some("csrf-token"));
    assert_eq!(get("MUSIC_U").as_deref(), Some("music-u-token"));
    let request_id = get("requestId").expect("requestId 必须存在");
    let (ms, rand4) = request_id.split_once('_').expect("requestId 形如 ms_rand4");
    assert!(!ms.is_empty() && ms.chars().all(|c| c.is_ascii_digit()));
    assert_eq!(rand4.len(), 4);
    assert!(rand4.chars().all(|c| c.is_ascii_digit()));

    let anonymous = build_eapi_header(None, None);
    assert!(anonymous.iter().all(|(k, _)| k != "MUSIC_U"));
    assert!(anonymous.iter().all(|(k, _)| k != "__csrf"));
}

#[test]
fn header_cookie_string_joins_encoded_pairs() {
    let header = vec![
        ("os".to_string(), "pc".to_string()),
        ("MUSIC_U".to_string(), "a b&c".to_string()),
    ];
    assert_eq!(header_cookie_string(&header), "os=pc; MUSIC_U=a%20b%26c");
}

#[test]
fn cookie_file_round_trips_and_clears() {
    let dir = temp_dir("cookie");
    assert_eq!(load_cookie(&dir), None);
    save_cookie(&dir, "MUSIC_U=u1; __csrf=c1").unwrap();
    assert_eq!(load_cookie(&dir).as_deref(), Some("MUSIC_U=u1; __csrf=c1"));
    save_cookie(&dir, "MUSIC_U=u2").unwrap();
    assert_eq!(load_cookie(&dir).as_deref(), Some("MUSIC_U=u2"));
    clear_login_state(&dir);
    assert_eq!(load_cookie(&dir), None);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn profile_nickname_round_trips_and_clears_with_cookie() {
    let dir = temp_dir("profile");
    assert_eq!(load_profile_nickname(&dir), None);
    save_profile_nickname(&dir, "云村村民").unwrap();
    assert_eq!(load_profile_nickname(&dir).as_deref(), Some("云村村民"));
    clear_login_state(&dir);
    assert_eq!(load_profile_nickname(&dir), None);
    let _ = std::fs::remove_dir_all(&dir);
}
