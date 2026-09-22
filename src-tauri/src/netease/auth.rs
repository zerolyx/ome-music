//! QR 登录三步 + 登录状态 + 登出。
//!
//! 登录态持久化：cookie 原文存 `netease-cookie.txt`，昵称存 `netease-profile.txt`。

use qrcode::render::svg as qr_svg_pixel;
use qrcode::QrCode;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

use super::request;

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("获取数据目录失败: {e}"))
}

async fn create_qr_key() -> Result<(String, String), String> {
    let body = request::eapi_post(
        "/api/login/qrcode/unikey",
        &json!({ "type": 3, "e_r": false }),
        None,
    )
    .await?;
    let key = body["data"]["unikey"]
        .as_str()
        .or_else(|| body["unikey"].as_str())
        .ok_or_else(|| format!("获取登录钥匙失败: {body}"))?;
    // 纠错级别 L：unikey 短时效且由本机渲染，低纠错换更低密度（模块更大更易扫）
    let qr_svg = QrCode::with_error_correction_level(key.as_bytes(), qrcode::EcLevel::L)
        .map_err(|e| format!("生成二维码失败: {e}"))?
        .render::<qr_svg_pixel::Color>()
        .build();
    // 去掉 XML 声明头：innerHTML 解析时它只会变成无意义的 bogus comment
    let qr_svg = qr_svg
        .split_once("?>")
        .map(|(_, rest)| rest.trim_start().to_string())
        .unwrap_or(qr_svg);
    Ok((key.to_string(), qr_svg))
}

/// 800 过期 / 801 等待扫码 / 802 已扫待确认 / 803 登录成功（顺手持久化登录态）。
async fn check_qr(key: &str, data_dir: &Path) -> Result<Value, String> {
    let (body, set_cookies) = request::eapi_post_with_cookies(
        "/api/login/qrcode/client/login",
        &json!({ "key": key, "type": 3, "e_r": false }),
        None,
    )
    .await?;
    let code = body["code"].as_i64().unwrap_or(0);
    if code != 803 {
        return Ok(json!({ "code": code }));
    }
    let cookie = request::set_cookies_to_cookie_string(&set_cookies);
    if request::cookie_value(&cookie, "MUSIC_U").is_none() {
        return Err(format!("登录成功但未取得登录态: {body}"));
    }
    request::save_cookie(data_dir, &cookie)?;
    let mut result = json!({ "code": 803 });
    if let Some(nickname) = body["profile"]["nickname"]
        .as_str()
        .filter(|n| !n.is_empty())
    {
        request::save_profile_nickname(data_dir, nickname)?;
        result["nickname"] = json!(nickname);
    }
    Ok(result)
}

#[tauri::command]
pub async fn netease_status(app: tauri::AppHandle) -> Result<Value, String> {
    let data_dir = app_data_dir(&app)?;
    let logged_in = request::load_cookie(&data_dir)
        .and_then(|cookie| request::cookie_value(&cookie, "MUSIC_U"))
        .is_some();
    let mut status = json!({ "loggedIn": logged_in });
    if logged_in {
        if let Some(nickname) = request::load_profile_nickname(&data_dir).filter(|n| !n.is_empty())
        {
            status["nickname"] = json!(nickname);
        }
    }
    Ok(status)
}

#[tauri::command]
pub async fn netease_qr_key() -> Result<Value, String> {
    let (key, qr_svg) = create_qr_key().await?;
    Ok(json!({ "key": key, "qrSvg": qr_svg }))
}

#[tauri::command]
pub async fn netease_qr_check(app: tauri::AppHandle, key: String) -> Result<Value, String> {
    let data_dir = app_data_dir(&app)?;
    check_qr(&key, &data_dir).await
}

#[tauri::command]
pub async fn netease_logout(app: tauri::AppHandle) -> Result<(), String> {
    let data_dir = app_data_dir(&app)?;
    request::clear_login_state(&data_dir);
    Ok(())
}

#[cfg(test)]
#[path = "auth_test.rs"]
mod auth_test;
