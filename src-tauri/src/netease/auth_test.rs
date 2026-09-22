use super::*;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
#[ignore = "需要真实网络"]
fn live_qr_key_returns_unikey_and_svg() {
    let (key, qr_svg) = tauri::async_runtime::block_on(create_qr_key()).unwrap();
    assert!(!key.is_empty());
    assert!(qr_svg.contains("<svg"), "{qr_svg}");
}

#[test]
#[ignore = "需要真实网络"]
fn live_qr_check_with_bogus_key_reports_expired() {
    let dir = std::env::temp_dir().join(format!(
        "ome-netease-auth-test-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let result = tauri::async_runtime::block_on(check_qr("bogus-unikey", &dir)).unwrap();
    assert_eq!(result["code"], 800);
    let _ = std::fs::remove_dir_all(&dir);
}
